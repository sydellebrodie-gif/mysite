import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatILS } from "@/lib/format";
import { OPEN_STATUSES, ORDER_STATUSES, statusLabel } from "@/lib/order-format";

const TABS = [{ value: "open", label: "פתוחות" }, ...ORDER_STATUSES, { value: "all", label: "הכול" }];
const dateFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.value === sp.status) ? sp.status! : "open";
  const q = (sp.q ?? "").trim().slice(0, 60);
  let query = sb.from("orders").select("id,order_number,status,needs_attention,awaiting_materials,customer_name,customer_phone,delivery_method,total_agorot,created_at")
    .order("created_at", { ascending: false }).limit(200);
  if (tab === "open") query = query.in("status", OPEN_STATUSES);
  else if (tab !== "all") query = query.eq("status", tab);
  if (q) {
    const safe = q.replace(/[,()*%\\]/g, " ");
    query = /^\d+$/.test(safe) ? query.or(`order_number.eq.${safe},customer_phone.ilike.*${safe}*`) : query.or(`customer_name.ilike.*${safe}*,customer_email.ilike.*${safe}*`);
  }
  const { data: orders, error } = await query;
  return (
    <>
      <h1>הזמנות</h1>
      <nav className="tabs" aria-label="סינון לפי סטטוס">
        {TABS.map((t) => (
          <Link key={t.value} href={`/admin?status=${t.value}`} aria-current={tab === t.value ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <form className="search" role="search">
        <input type="hidden" name="status" value={tab} />
        <input name="q" defaultValue={q} placeholder="חיפוש: מספר הזמנה, שם, טלפון או מייל" aria-label="חיפוש הזמנה" />
        <button className="btn small secondary">חיפוש</button>
      </form>
      {error && <p className="error">טעינת ההזמנות נכשלה.</p>}
      {!error && !orders?.length && <p className="muted">אין הזמנות להצגה. {tab === "open" && "הזמנות חדשות יופיעו כאן אחרי תשלום."}</p>}
      {!!orders?.length && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>#</th><th>תאריך</th><th>לקוח</th><th>מסירה</th><th>סה״כ</th><th>סטטוס</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={o.needs_attention ? "attention" : ""}>
                  <td><Link href={`/admin/orders/${o.id}`}>{o.order_number}</Link></td>
                  <td className="ltr">{dateFmt.format(new Date(o.created_at))}</td>
                  <td>{o.customer_name}</td>
                  <td>{o.delivery_method === "courier" ? "שליח" : "איסוף"}</td>
                  <td className="ltr">{formatILS(o.total_agorot)}</td>
                  <td>
                    <span className={`badge st-${o.status}`}>{statusLabel(o.status)}</span>
                    {o.needs_attention && <span className="badge warn">נדרש בירור</span>}
                    {o.awaiting_materials && <span className="badge warn">ממתינה לחומרים</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

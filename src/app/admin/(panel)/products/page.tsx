import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatILS } from "@/lib/format";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const [{ data: products }, { data: costs }] = await Promise.all([
    sb.from("products").select("id,code,name,base_price_agorot,stock_mode,stock_qty,is_active,is_available,images,sort_order").order("sort_order"),
    sb.from("product_costs").select("product_id,base_cost_agorot"),
  ]);
  const cost = new Map((costs ?? []).map((c) => [c.product_id, c.base_cost_agorot]));
  return (
    <>
      <div className="admin-head">
        <h1>מוצרים</h1>
        <Link className="btn small" href="/admin/products/new">+ מוצר חדש</Link>
      </div>
      {sp.deleted && <p className="saved" role="status">✓ המוצר נמחק</p>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>קוד</th><th>מוצר</th><th>מחיר</th><th>עלות</th><th>מלאי</th><th>מצב</th></tr></thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id}>
                <td className="ltr">{p.code}</td>
                <td><Link href={`/admin/products/${p.id}`}>{p.name}</Link>{!p.images?.length && <small className="muted"> (בלי תמונה)</small>}</td>
                <td className="ltr">{formatILS(p.base_price_agorot)}</td>
                <td className="ltr">{cost.has(p.id) ? formatILS(cost.get(p.id)!) : "—"}</td>
                <td className={p.stock_mode === "counted" && (p.stock_qty ?? 0) <= 3 ? "warn-cell" : ""}>
                  {p.stock_mode === "counted" ? p.stock_qty : "ללא ספירה"}</td>
                <td>{!p.is_active ? <span className="badge off">מוסתר</span> : !p.is_available ? <span className="badge warn">בקרוב</span> : <span className="badge on">באתר</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

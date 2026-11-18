import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { formatILS } from "@/lib/format";

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data: bundles } = await sb.from("bundle_templates").select("id,code,name,type,fixed_price_agorot,is_active,sort_order").order("sort_order");
  return (
    <>
      <div className="admin-head">
        <h1>מארזים</h1>
        <Link className="btn small" href="/admin/bundles/new">+ מארז חדש</Link>
      </div>
      {sp.deleted && <p className="saved" role="status">✓ המארז נמחק</p>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>קוד</th><th>מארז</th><th>סוג</th><th>מחיר</th><th>מצב</th></tr></thead>
          <tbody>
            {(bundles ?? []).map((b) => (
              <tr key={b.id}>
                <td className="ltr">{b.code}</td>
                <td><Link href={`/admin/bundles/${b.id}`}>{b.name}</Link></td>
                <td>{b.type === "fixed" ? "קבוע" : b.type === "free" ? "הרכבה חופשית" : b.type}</td>
                <td className="ltr">{b.fixed_price_agorot != null ? formatILS(b.fixed_price_agorot) : "סכום הפריטים"}</td>
                <td>{b.is_active ? <span className="badge on">באתר</span> : <span className="badge off">מוסתר</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

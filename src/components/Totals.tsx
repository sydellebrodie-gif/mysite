import type { Quote } from "@/lib/pricing";
import { formatILS } from "@/lib/format";

export default function Totals({ q, deliveryChosen }: { q: Quote; deliveryChosen: boolean }) {
  return (
    <dl className="totals">
      <div><dt>מוצרים ומארזים</dt><dd className="ltr">{formatILS(q.itemsTotalAgorot)}</dd></div>
      {q.dealDiscountAgorot > 0 && (
        <div><dt>מבצע ({q.dealNotes.join("; ")})</dt><dd className="ltr">−{formatILS(q.dealDiscountAgorot)}</dd></div>
      )}
      {q.packagingAgorot > 0 && (
        <div><dt>אריזה למארזים</dt><dd className="ltr">{formatILS(q.packagingAgorot)}</dd></div>
      )}
      <div><dt>משלוח</dt><dd>{deliveryChosen ? (q.deliveryFeeAgorot ? <span className="ltr">{formatILS(q.deliveryFeeAgorot)}</span> : "חינם") : "יש לבחור"}</dd></div>
      <div className="grand"><dt>סה״כ לתשלום</dt><dd className="ltr">{formatILS(q.totalAgorot)}</dd></div>
    </dl>
  );
}

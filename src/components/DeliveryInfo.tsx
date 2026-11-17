import type { ShopSettings } from "@/lib/types";
import { formatILS } from "@/lib/format";

export default function DeliveryInfo({ s }: { s: ShopSettings }) {
  return (
    <ul className="delivery-info">
      <li>איסוף עצמי מ{s.pickupCity}, בתיאום: עד {s.pickupBusinessDays} ימי עסקים להכנה</li>
      <li>שליח ({formatILS(s.courierFeeAgorot)}): עד {s.courierBusinessDays} ימי עסקים, כולל ההכנה</li>
      <li>הספירה מתחילה מקבלת התמונות. במוצר בלי תמונות: מרגע התשלום</li>
    </ul>
  );
}

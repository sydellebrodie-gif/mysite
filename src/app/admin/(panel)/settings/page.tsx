import AdminForm from "@/components/admin/AdminForm";
import { requireAdmin } from "@/lib/admin/auth";
import { saveDelivery, saveFiles, savePricing } from "../../actions/settings";
import { Check, Money, Num, Text } from "@/components/admin/fields";

export default async function SettingsPage() {
  const { sb } = await requireAdmin();
  const { data: s } = await sb.from("shop_settings").select("*").single();
  if (!s) return <p className="error">לא נמצאו הגדרות.</p>;
  return (
    <>
      <h1>הגדרות</h1>
      <section className="admin-card">
        <h2>מסירה</h2>
        <AdminForm action={saveDelivery}>
          <Check name="pickup_enabled" label="איסוף עצמי" defaultChecked={s.pickup_enabled} />
          <Text name="pickup_city" label="עיר לאיסוף" defaultValue={s.pickup_city} />
          <Num name="pickup_business_days" label="ימי עסקים להכנה (איסוף)" defaultValue={s.pickup_business_days} />
          <Check name="courier_enabled" label="משלוח עם שליח" defaultChecked={s.courier_enabled} />
          <Money name="courier_fee" label="מחיר משלוח" agorot={s.courier_fee_agorot} />
          <Num name="courier_business_days" label="ימי עסקים כולל משלוח" defaultValue={s.courier_business_days} />
        </AdminForm>
      </section>
      <section className="admin-card">
        <h2>אריזה והנחות</h2>
        <AdminForm action={savePricing}>
          <Money name="packaging" label="אריזה לכל מארז" agorot={s.bundle_packaging_agorot} />
          <Num name="discount_percent" label="הנחת כמות (אחוזים, 0 = כבוי)" defaultValue={s.quantity_discount_percent} />
          <Num name="discount_min" label="הנחת הכמות חלה מ־ (מוצרים)" defaultValue={s.quantity_discount_min_units}
            help="נספרים מוצרים בנפרד ופריטים במארז חופשי. מארזים קבועים לא נספרים. אין כפל עם מבצע של מוצר: חלה ההנחה המשתלמת יותר" />
        </AdminForm>
      </section>
      <section className="admin-card">
        <h2>קבצי לקוחות</h2>
        <AdminForm action={saveFiles}>
          <Num name="temp_upload_hours" label="מחיקת תמונות שהועלו ולא הוזמנו, אחרי (שעות)" defaultValue={s.temp_upload_hours} />
          <Num name="reminder_days" label="תזכורת על קבצים שלא הורדו, אחרי (ימים)" defaultValue={s.reminder_undownloaded_days} />
          <Num name="delete_days" label="מחיקת קבצים אחרי מסירה (ימים)" defaultValue={s.delete_after_delivered_days} />
        </AdminForm>
      </section>
    </>
  );
}

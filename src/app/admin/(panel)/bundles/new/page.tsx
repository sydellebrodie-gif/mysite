import AdminForm from "@/components/admin/AdminForm";
import { Money, Select, Text } from "@/components/admin/fields";
import { createBundle } from "../../../actions/bundles";

export default function NewBundlePage() {
  return (
    <>
      <h1>מארז חדש</h1>
      <section className="admin-card">
        <p className="muted">המארז נוצר מוסתר מהאתר. אחרי היצירה מוסיפים פריטים ותמונות, ואז מסמנים &quot;מוצג באתר&quot;.</p>
        <AdminForm action={createBundle} submit="יצירת המארז">
          <Text name="name" label="שם המארז" required />
          <Select name="type" label="סוג" options={[{ value: "fixed", label: "קבוע (תכולה ומחיר קבועים)" }, { value: "free", label: "הרכבה חופשית (הלקוח בוחר)" }]} />
          <Money name="price" label="מחיר (למארז קבוע)" optional />
          <Text name="slug" label="כתובת בדף (באנגלית)" ltr required placeholder="mothers-day" />
        </AdminForm>
      </section>
    </>
  );
}

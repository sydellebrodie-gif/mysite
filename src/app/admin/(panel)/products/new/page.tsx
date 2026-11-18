import AdminForm from "@/components/admin/AdminForm";
import { Money, Text } from "@/components/admin/fields";
import { createProduct } from "../../../actions/products";

export default function NewProductPage() {
  return (
    <>
      <h1>מוצר חדש</h1>
      <section className="admin-card">
        <p className="muted">המוצר נוצר מוסתר מהאתר. אחרי היצירה ממלאים תמונות, מלאי ושדות התאמה, ואז מסמנים &quot;מוצג באתר&quot;.</p>
        <AdminForm action={createProduct} submit="יצירת המוצר">
          <Text name="name" label="שם המוצר" required />
          <Money name="price" label="מחיר" />
          <Text name="slug" label="כתובת בדף (באנגלית)" ltr required placeholder="photo-magnet" help="יופיע בכתובת הדף: /products/photo-magnet" />
        </AdminForm>
      </section>
    </>
  );
}

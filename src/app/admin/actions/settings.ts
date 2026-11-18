"use server";
// הגדרות החנות: כל קבוצה נשמרת בנפרד.
import { adminAction, agorot, bool, check, int, required, FormError } from "@/lib/admin/form";


export const saveDelivery = adminAction(async (db, fd) => {
  const pickup = bool(fd, "pickup_enabled"), courier = bool(fd, "courier_enabled");
  if (!pickup && !courier) throw new FormError("צריך להשאיר לפחות דרך מסירה אחת");
  check(await db.from("shop_settings").update({
    pickup_enabled: pickup, courier_enabled: courier,
    pickup_city: required(fd, "pickup_city", "עיר לאיסוף", 40),
    courier_fee_agorot: agorot(fd, "courier_fee", "מחיר משלוח"),
    pickup_business_days: int(fd, "pickup_business_days", "ימי הכנה לאיסוף", { max: 60 }),
    courier_business_days: int(fd, "courier_business_days", "ימי עסקים למשלוח", { max: 60 }),
  }).eq("id", true));
});

export const savePricing = adminAction(async (db, fd) => {
  check(await db.from("shop_settings").update({
    bundle_packaging_agorot: agorot(fd, "packaging", "מחיר אריזה למארז"),
    quantity_discount_percent: int(fd, "discount_percent", "אחוז הנחת כמות", { max: 50 }),
    quantity_discount_min_units: int(fd, "discount_min", "מכמה מוצרים", { min: 1, max: 100 }),
  }).eq("id", true));
});

export const saveFiles = adminAction(async (db, fd) => {
  check(await db.from("shop_settings").update({
    temp_upload_hours: int(fd, "temp_upload_hours", "מחיקת תמונות שלא הוזמנו", { min: 1, max: 24 * 30 }),
    reminder_undownloaded_days: int(fd, "reminder_days", "תזכורת להורדה", { min: 1, max: 365 }),
    delete_after_delivered_days: int(fd, "delete_days", "מחיקה אחרי מסירה", { min: 1, max: 3650 }),
  }).eq("id", true));
});

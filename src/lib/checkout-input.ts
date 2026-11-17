// בדיקת פרטי הלקוח בקופה. משותף לדפדפן ולשרת.
import type { DeliveryMethod } from "./types";

export interface CheckoutCustomer {
  name: string;
  phone: string;
  email: string;
  note: string;
  city: string;
  street: string;
  addressNotes: string;
}

export const emptyCustomer: CheckoutCustomer = { name: "", phone: "", email: "", note: "", city: "", street: "", addressNotes: "" };

export function validateCustomer(c: CheckoutCustomer, delivery: DeliveryMethod | null, agreed: boolean) {
  const e: Record<string, string> = {};
  if (c.name.trim().length < 2) e.name = "יש למלא שם מלא";
  const digits = c.phone.replace(/[^\d]/g, "");
  if (!/^(0\d{8,9}|972\d{8,9})$/.test(digits)) e.phone = "מספר טלפון לא תקין";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim())) e.email = "כתובת מייל לא תקינה";
  if (delivery === "courier") {
    if (!c.city.trim()) e.city = "יש למלא עיר";
    if (!c.street.trim()) e.street = "יש למלא רחוב ומספר";
  }
  if (!delivery) e.delivery = "יש לבחור אופן מסירה";
  if (!agreed) e.agreed = "יש לאשר כדי להמשיך";
  for (const [k, max] of [["name", 80], ["note", 500], ["city", 60], ["street", 120], ["addressNotes", 200]] as const)
    if (c[k].length > max) e[k] = `עד ${max} תווים`;
  return e;
}

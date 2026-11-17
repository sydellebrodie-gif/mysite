// הקטלוג מתרענן מהמסד כל דקה, כך ששינויים בניהול מופיעים בלי פריסה מחדש
export const revalidate = 60;

import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import CheckoutClient from "./CheckoutClient";

export const metadata: Metadata = { title: "סיום הזמנה | מתנות בעיצוב אישי" };

export default async function CheckoutPage() {
  return <CheckoutClient catalog={await getCatalog()} />;
}

// הקטלוג מתרענן מהמסד כל דקה, כך ששינויים בניהול מופיעים בלי פריסה מחדש
export const revalidate = 60;

import type { Metadata } from "next";
import { getCatalog } from "@/lib/catalog";
import CartClient from "./CartClient";

export const metadata: Metadata = { title: "סל קניות | מתנות בעיצוב אישי" };

export default async function CartPage() {
  return <CartClient catalog={await getCatalog()} />;
}

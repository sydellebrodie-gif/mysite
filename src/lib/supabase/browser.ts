"use client";
// לקוח Supabase בדפדפן, לממשק הניהול בלבד (התחברות, העלאת תמונות מוצרים). הסשן בעוגיות.
import { createBrowserClient } from "@supabase/ssr";

export const browserClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

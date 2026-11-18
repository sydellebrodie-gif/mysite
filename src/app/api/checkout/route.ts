// קופה: השרת מחשב מחדש את המחיר ובודק מלאי והתאמות. הלקוח לא קובע מחיר.
// בשלב הזה (PAYMENT_PROVIDER=mock) לא מתבצע תשלום ולא נוצרת הזמנה: מוחזר "מצב הדגמה".
// יצירת ההזמנה תתבצע רק אחרי אישור תשלום מאומת מהשרת (שלב 4ד, docs/architecture.md).
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { computeQuote } from "@/lib/pricing";
import { validateCustomer, type CheckoutCustomer } from "@/lib/checkout-input";
import type { CartLine, Customization, DeliveryMethod } from "@/lib/types";
import { uploadsEnabled } from "@/lib/server/supabase-admin";
import { checkUploads } from "@/lib/server/uploads";

/** כל התמונות בסל: מזהה העלאה, או null לתמונה שנשארה רק בדפדפן */
function imageRefs(lines: CartLine[]): (string | null)[] {
  const customs: Customization[] = lines.flatMap((l) => (l.kind === "product" ? [l.custom] : l.items.map((i) => i.custom)));
  return customs.flatMap((c) => Object.values(c?.images ?? {}).flat().map((im) => (typeof im?.uploadId === "string" ? im.uploadId : null)));
}

const MAX_BODY = 200_000;

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "הבקשה גדולה מדי" }, { status: 413 });
  let body: { lines?: CartLine[]; delivery?: DeliveryMethod; customer?: CheckoutCustomer; agreed?: boolean };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 }); }

  const lines = Array.isArray(body.lines) ? body.lines.slice(0, 50) : [];
  const delivery = body.delivery === "pickup" || body.delivery === "courier" ? body.delivery : null;
  const customer = { name: "", phone: "", email: "", note: "", city: "", street: "", addressNotes: "", ...(body.customer ?? {}) };
  for (const k of Object.keys(customer) as (keyof CheckoutCustomer)[]) customer[k] = String(customer[k] ?? "");

  const customerErrors = validateCustomer(customer, delivery, body.agreed === true);
  const quote = computeQuote(lines, await getCatalog(), delivery);
  if (Object.keys(customerErrors).length || !quote.ok) {
    return NextResponse.json({ error: "יש לתקן את הפרטים", customerErrors, quoteErrors: [...quote.errors, ...quote.lines.flatMap((l) => l.errors)], quote }, { status: 422 });
  }

  // תמונות: כשההעלאה לשרת פעילה, כל תמונה בסל חייבת להיות קובץ שהועלה ואומת
  if (uploadsEnabled()) {
    const refs = imageRefs(lines);
    const bad = refs.includes(null) ? ["local"] : await checkUploads(refs as string[]);
    if (bad.length) {
      return NextResponse.json({ error: "יש לתקן את הפרטים", customerErrors: {},
        quoteErrors: ["חלק מהתמונות לא הועלו לשרת או שפג תוקפן. יש לפתוח את הפריט בסל (\"עריכה\") ולהעלות אותן שוב."], quote }, { status: 422 });
    }
  }

  const provider = process.env.PAYMENT_PROVIDER ?? "mock";
  if (provider === "mock") {
    return NextResponse.json({ status: "demo", totalAgorot: quote.totalAgorot, quote });
  }
  return NextResponse.json({ error: "הסליקה עדיין לא חוברה" }, { status: 503 });
}

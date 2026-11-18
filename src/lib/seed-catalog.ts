// נתוני הקטלוג ההתחלתיים, לפי הגיליון "Mom_Products_and_Bundles" (18.11.2026) ופרטי ההתאמה שהמשתמשת שלחה.
// משמש: (1) מקור הקטלוג כשאין חיבור ל־Supabase (פיתוח והדגמה), (2) יצירת קובץ ה־SQL של הנתונים ההתחלתיים
// (scripts/gen-seed-sql.ts). אחרי ההזנה ל־Supabase, עורכים מוצרים בממשק הניהול ולא כאן.
// מחירי עלות לא נכללים כאן בכוונה (הנחיה: לא בקוד ציבורי ולא בדפדפן).

import type { Bundle, Catalog, Category, CustomField, DesignOption, Product, ShopSettings } from "./types";

const ILS = (n: number) => Math.round(n * 100);

// ---------- תבניות שדות חוזרות ----------
const designField = (optionKey: string | null, label = "בחירת עיצוב", key = "design"): CustomField => ({
  key, label, type: "design", required: true, optionKey,
  help: "דוגמאות העיצובים יעלו לאתר בקרוב.",
});
const imagesField = (optionKey: string | null, min: number, max: number, label?: string, help?: string): CustomField => ({
  key: optionKey ? `photos_${optionKey}` : "photos",
  label: label ?? (max === 1 ? "תמונה" : `תמונות (עד ${max})`),
  type: "image", required: min > 0, optionKey, minImages: min, maxImages: max, help,
});
const wordsField = (optionKey: string | null, key: string, label: string, maxWords: number, required: boolean): CustomField => ({
  key, label, type: "text", required, optionKey, maxWords, maxLength: maxWords * 15,
  help: `עד ${maxWords} מילים`,
});

const mugOptions: DesignOption[] = [
  { key: "existing", label: "עיצוב קיים" },
  { key: "photo_text", label: "תמונה וכיתוב (עד 5 מילים)" },
  { key: "one_photo", label: "תמונה אחת" },
  { key: "two_photos", label: "2 תמונות" },
];
const mugFields = (): CustomField[] => [
  designField("existing"),
  imagesField("photo_text", 1, 1),
  wordsField("photo_text", "caption", "כיתוב", 5, true),
  imagesField("one_photo", 1, 1),
  imagesField("two_photos", 2, 2, "2 תמונות"),
];

type SeedProduct = Omit<Product, "images" | "designs" | "isAvailable" | "allowedInBundles" | "designOptions" | "fields"> &
  Partial<Pick<Product, "isAvailable" | "allowedInBundles" | "designOptions" | "fields">>;

const raw: SeedProduct[] = [
  {
    id: "20232596-2a6a-406a-8ccb-ebdf0f0f1418", code: "P01", slug: "white-mug", name: "ספל לבן",
    description: "ספל קרמיקה לבן בעיצוב אישי: עיצוב קיים, תמונה וכיתוב, תמונה אחת או 2 תמונות.",
    categorySlug: "cups", priceAgorot: ILS(65), stockMode: "counted", stockQty: 8,
    designOptions: mugOptions, fields: mugFields(),
  },
  {
    id: "c9a1317e-14ec-476f-9c07-b84fef3b7f37", code: "P02", slug: "magic-mug", name: "ספל קסם שחור",
    description: "ספל שחור שהעיצוב נחשף בו כשמוזגים משקה חם. עיצוב קיים, תמונה וכיתוב, תמונה אחת או 2 תמונות.",
    categorySlug: "cups", priceAgorot: ILS(75), stockMode: "counted", stockQty: 11,
    designOptions: mugOptions, fields: mugFields(),
  },
  {
    id: "b612b914-e5a2-458c-81e7-2c0f61f1ee51", code: "P03", slug: "takeaway-cup", name: "כוס טייקאוויי גדולה",
    description: "כוס טייקאוויי גדולה בעיצוב אישי, כולל אפשרות לתבנית קיימת שמשלבת עד 6 תמונות.",
    categorySlug: "cups", priceAgorot: ILS(65), stockMode: "counted", stockQty: 8,
    designOptions: [
      mugOptions[0],
      { key: "template6", label: "תבנית קיימת לשילוב 6 תמונות" },
      ...mugOptions.slice(1),
    ],
    fields: [
      ...mugFields(),
      designField("template6", "בחירת תבנית", "template"),
      imagesField("template6", 1, 6, "תמונות לתבנית (עד 6)"),
    ],
  },
  {
    id: "33206795-20a2-4a56-b54c-94da0374ec3b", code: "P04", slug: "sticker-sheet", name: "דף מדבקות אישי עמיד במים",
    description: "דף מדבקות עמידות במים בעיצוב אישי. 15 ₪ לדף, 2 דפים ב־25 ₪.",
    categorySlug: "stickers", priceAgorot: ILS(15), deal: { qty: 2, priceAgorot: ILS(25) },
    stockMode: "counted", stockQty: 150,
    designOptions: [
      { key: "squares", label: "מדבקות מרובעות", help: "עד 8 תמונות, תמונה לכל ריבוע" },
      { key: "cutout", label: "מדבקות בצורת הדמות שבתמונה", help: "עד 6 תמונות. החיתוך לפי צורת הדמות נעשה אצלנו" },
      { key: "names", label: "שם וצורות", help: "עד 3 שמות" },
      { key: "shapes", label: "צורות קבועות (לבבות, כוכבים ועוד)" },
    ],
    fields: [
      imagesField("squares", 1, 8, "תמונות (עד 8, תמונה לכל ריבוע)"),
      imagesField("cutout", 1, 6, "תמונות (עד 6)"),
      { key: "name1", label: "שם 1", type: "text", required: true, optionKey: "names", maxLength: 20 },
      { key: "name2", label: "שם 2", type: "text", required: false, optionKey: "names", maxLength: 20 },
      { key: "name3", label: "שם 3", type: "text", required: false, optionKey: "names", maxLength: 20 },
      { key: "shape", label: "צורה", type: "select", required: true, optionKey: "shapes", options: ["לבבות", "כוכבים", "אחר (פרטו בהערה)"] },
      imagesField("shapes", 1, 8, "תמונות (עד 8)"),
    ],
  },
  {
    id: "db1255aa-1aee-418a-8498-d7d12f4cc2fe", code: "P05", slug: "chocolates-16", name: "מארז 16 שוקולדים אישיים",
    description: "16 שוקולדים: בצד אחד תמונה אישית ובצד השני \"חג שמח\". אפשר עד 2 תמונות שונות לכל המארז. ללא טקסט אישי.",
    categorySlug: "treats", priceAgorot: ILS(47), stockMode: "counted", stockQty: 20,
    designOptions: [],
    fields: [imagesField(null, 1, 2, "תמונות (1 או 2)")],
  },
  {
    id: "c9d731b1-5673-416b-84fa-df63c9d364ec", code: "P06", slug: "wood-photo-stand", name: "מעמד תמונה על בסיס עץ",
    description: "הדפס אלומיניום על בסיס עץ, בגודל של בערך A5. תמונה אחת, ללא טקסט.",
    categorySlug: "photos", priceAgorot: ILS(65), stockMode: "counted", stockQty: 10,
    fields: [imagesField(null, 1, 1)],
  },
  {
    id: "8ec58f4e-48b9-4a06-9694-70fadb64c99f", code: "P07", slug: "lit-photo-stand", name: "מעמד תמונה מואר",
    description: "מעמד תמונה מואר בגודל של בערך A5. תמונה אחת, ללא טקסט.",
    categorySlug: "photos", priceAgorot: ILS(75), stockMode: "counted", stockQty: 6,
    fields: [imagesField(null, 1, 1)],
  },
  {
    id: "575e57cd-2590-44da-a640-c3cf3525463c", code: "P08", slug: "photo-fan", name: "מניפה עם תמונה",
    description: "מניפה עם תמונה אישית. תמונה אחת, ללא טקסט.",
    categorySlug: "small", priceAgorot: ILS(45), stockMode: "counted", stockQty: 20,
    fields: [imagesField(null, 1, 1)],
  },
  {
    id: "8eb83f72-cbcf-4ae0-9b14-6437f285e074", code: "P09", slug: "lipstick-holder", name: "מחזיק אודם",
    description: "מחזיק אודם בבחירה מתוך עיצובים קבועים.",
    categorySlug: "small", priceAgorot: ILS(20), stockMode: "counted", stockQty: 20,
    fields: [designField(null)],
  },
  {
    id: "eccb8879-458a-4552-bb39-e6b75c0ee288", code: "P10", slug: "keychain", name: "מחזיק מפתחות",
    description: "מחזיק מפתחות עם תמונה בכל צד, ללא טקסט. אם מעלים תמונה אחת, היא תודפס בשני הצדדים.",
    categorySlug: "small", priceAgorot: ILS(20), stockMode: "counted", stockQty: 20,
    fields: [imagesField(null, 1, 2, "תמונות (1 או 2)", "תמונה לכל צד. תמונה אחת תודפס בשני הצדדים.")],
  },
  {
    id: "8cd31be6-8da7-4217-81c8-75b36130b893", code: "P11", slug: "ceramic-coaster", name: "תחתית קרמיקה לכוס",
    description: "תחתית קרמיקה בעיצוב עם שם, עיצוב קבוע עם משפט, או תמונה אישית. 25 ₪ ליחידה, 3 ב־65 ₪.",
    categorySlug: "home", priceAgorot: ILS(25), deal: { qty: 3, priceAgorot: ILS(65) },
    stockMode: "counted", stockQty: 8,
    designOptions: [
      { key: "name", label: "עיצוב עם שם" },
      { key: "sentence", label: "עיצוב קבוע עם משפט" },
      { key: "photo", label: "תמונה אישית" },
    ],
    fields: [
      { key: "name", label: "שם", type: "text", required: true, optionKey: "name", maxLength: 20 },
      designField("sentence", "בחירת משפט"),
      imagesField("photo", 1, 1),
    ],
  },
  {
    id: "2b27166c-a6bb-4a53-a05d-9998f7be5fe0", code: "P12", slug: "wine-gift", name: "בקבוק יין עם תמונה ותיק מעוצב",
    description: "בקבוק יין עם מדבקה אישית (תמונה, ואפשר גם משפט עד 6 מילים), ותיק עם כיתוב מעוצב לבחירה. סוג היין יעודכן בהמשך.",
    categorySlug: "treats", priceAgorot: ILS(65), stockMode: "counted", stockQty: 20,
    fields: [
      imagesField(null, 1, 1, "תמונה למדבקת הבקבוק"),
      wordsField(null, "bottle_text", "משפט על הבקבוק (רשות)", 6, false),
      designField(null, "כיתוב לתיק"),
    ],
  },
  {
    id: "9df197fd-b72e-43e7-910e-52778e902682", code: "P13", slug: "kitchen-towel", name: "מגבת מטבח",
    description: "מגבת מטבח לבנה עם משפט מעוצב לבחירה.",
    categorySlug: "home", priceAgorot: ILS(40), stockMode: "counted", stockQty: 8,
    fields: [designField(null, "בחירת משפט")],
  },
  {
    id: "c6e1b3eb-9797-46a9-a6a0-6023daa12e84", code: "P14", slug: "wood-keychain", name: "מחזיק מפתחות מעץ",
    description: "מחזיק מפתחות מעץ עם תמונה בכל צד, ללא טקסט. אם מעלים תמונה אחת, היא תודפס בשני הצדדים.",
    categorySlug: "small", priceAgorot: ILS(20), stockMode: "counted", stockQty: 10,
    fields: [imagesField(null, 1, 2, "תמונות (1 או 2)", "תמונה לכל צד. תמונה אחת תודפס בשני הצדדים.")],
  },
];

export const seedProducts: Product[] = raw.map((p) => ({
  isAvailable: true,
  allowedInBundles: true,
  designOptions: [],
  fields: [],
  ...p,
  images: [],
  designs: [],
}));

const byCode = (code: string) => {
  const p = seedProducts.find((x) => x.code === code);
  if (!p) throw new Error(`unknown product ${code}`);
  return p.id;
};

export const seedBundles: Bundle[] = [
  {
    id: "67504236-b1fb-4acf-b8e5-bf2374672f39", code: "B01", slug: "grandma-light", name: "האור של סבתא",
    description: "מעמד תמונה מואר, ספל לבן ומחזיק מפתחות.", images: [], type: "fixed", priceAgorot: ILS(145),
    items: [{ productId: byCode("P07"), qty: 1 }, { productId: byCode("P01"), qty: 1 }, { productId: byCode("P10"), qty: 1 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "c94baf67-9709-4e5c-8fd4-548b6acabe21", code: "B02", slug: "mom-deserves", name: "אמא, מגיע לך",
    description: "כוס טייקאוויי גדולה, מחזיק אודם ומחזיק מפתחות.", images: [], type: "fixed", priceAgorot: ILS(95),
    items: [{ productId: byCode("P03"), qty: 1 }, { productId: byCode("P09"), qty: 1 }, { productId: byCode("P10"), qty: 1 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "768c76d9-cbcf-4cb0-975b-e28b00724a94", code: "B03", slug: "hanukkah-light", name: "חנוכה מלא אור",
    description: "מעמד תמונה מואר, מגבת מטבח ומארז 16 שוקולדים אישיים.", images: [], type: "fixed", priceAgorot: ILS(149),
    items: [{ productId: byCode("P07"), qty: 1 }, { productId: byCode("P13"), qty: 1 }, { productId: byCode("P05"), qty: 1 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "355fcb79-2da6-4ddb-8774-649b3eda6a04", code: "B04", slug: "kids-all-mine", name: "כולו שלי (ילדים)",
    description: "ספל קרמיקה לבן, דף מדבקות אישי עמיד במים ומחזיק מפתחות.", images: [], type: "fixed", priceAgorot: ILS(90),
    items: [{ productId: byCode("P01"), qty: 1 }, { productId: byCode("P04"), qty: 1 }, { productId: byCode("P10"), qty: 1 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "ffc7f3de-8145-4bf5-982a-50fd4aff5deb", code: "B05", slug: "sticker-smiles", name: "מדביקים חיוכים",
    description: "10 דפי מדבקות אישיים עמידים במים, בעד 5 עיצובים שונים.", images: [], type: "fixed", priceAgorot: ILS(110),
    items: [{ productId: byCode("P04"), qty: 10, maxDesigns: 5 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "de7f357e-e329-4412-9f86-a5fa105d22c1", code: "B06", slug: "sweet-mine", name: "מתוק שהוא שלי",
    description: "מארז 16 שוקולדים אישיים ודף מדבקות אישי עמיד במים.", images: [], type: "fixed", priceAgorot: ILS(55),
    items: [{ productId: byCode("P05"), qty: 1 }, { productId: byCode("P04"), qty: 1 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "57f3963c-7dc0-4f92-b553-71b0adf36a69", code: "B07", slug: "kids-sweet-hanukkah", name: "חנוכה מתוק לילדים",
    description: "מארז 16 שוקולדים אישיים, דף מדבקות אישי עמיד במים ומניפה עם תמונה.", images: [], type: "fixed", priceAgorot: ILS(95),
    items: [{ productId: byCode("P05"), qty: 1 }, { productId: byCode("P04"), qty: 1 }, { productId: byCode("P08"), qty: 1 }],
    minItems: 0, maxItems: null,
  },
  {
    id: "e900076e-b0d7-4b29-91c3-04556e327776", code: "BFREE", slug: "build", name: "מארז בהרכבה חופשית",
    description: "בוחרים מוצרים וכמויות, גם אותו מוצר עם תמונות שונות, והכול נארז יחד. המחיר הוא סכום המוצרים, ועוד אריזה.",
    images: [], type: "free", priceAgorot: null, items: [], minItems: 3, maxItems: null,
  },
];

export const seedCategories: Category[] = [
  { slug: "cups", name: "כוסות וספלים" },
  { slug: "photos", name: "תמונות ומעמדים" },
  { slug: "stickers", name: "מדבקות" },
  { slug: "treats", name: "מתוקים ויין" },
  { slug: "home", name: "לבית ולמטבח" },
  { slug: "small", name: "מתנות קטנות" },
];

export const seedSettings: ShopSettings = {
  courierFeeAgorot: ILS(40),
  pickupEnabled: true,
  courierEnabled: true,
  pickupBusinessDays: 5,
  courierBusinessDays: 10,
  pickupCity: "נתניה",
  bundlePackagingAgorot: ILS(10),
  quantityDiscountMinUnits: 3,
  quantityDiscountPercent: 10,
};

export const seedCatalog: Catalog = {
  categories: seedCategories,
  products: seedProducts,
  bundles: seedBundles,
  settings: seedSettings,
  source: "seed",
};

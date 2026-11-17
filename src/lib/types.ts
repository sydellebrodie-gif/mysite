// טיפוסי הקטלוג הציבורי. אין כאן מחירי עלות בכוונה: הם לא נשלחים לדפדפן ולא נשמרים במאגר.

export type FieldType = "text" | "textarea" | "image" | "design" | "select";

export interface CustomField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** null = השדה מופיע בכל מסלולי העיצוב */
  optionKey: string | null;
  maxLength?: number;
  maxWords?: number;
  minImages?: number;
  maxImages?: number;
  options?: string[];
  help?: string;
}

export interface DesignOption {
  key: string;
  label: string;
  help?: string;
}

/** עיצוב קבוע לבחירה (משפט מעוצב, עיצוב קיים וכו'). התמונות יעלו בהמשך מממשק הניהול */
export interface ProductDesign {
  id: string;
  name: string;
  image?: string;
}

export interface Deal {
  qty: number;
  priceAgorot: number;
}

export interface Product {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  images: string[];
  priceAgorot: number;
  deal?: Deal;
  /** counted = נספר, stockQty הוא הכמות. plenty = מלאי רב, בלי מעקב כמות */
  stockMode: "counted" | "plenty";
  stockQty: number | null;
  isAvailable: boolean;
  allowedInBundles: boolean;
  designOptions: DesignOption[];
  fields: CustomField[];
  designs: ProductDesign[];
}

export interface BundleItemDef {
  productId: string;
  qty: number;
}

export interface Bundle {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string;
  images: string[];
  type: "fixed" | "free";
  priceAgorot: number | null;
  items: BundleItemDef[];
  minItems: number;
  maxItems: number | null;
}

export interface Category {
  slug: string;
  name: string;
}

export interface ShopSettings {
  courierFeeAgorot: number;
  pickupEnabled: boolean;
  courierEnabled: boolean;
  pickupBusinessDays: number;
  courierBusinessDays: number;
  /** תוספת אריזה לכל מארז (קבוע או חופשי) */
  bundlePackagingAgorot: number;
  pickupCity: string;
}

export interface Catalog {
  categories: Category[];
  products: Product[];
  bundles: Bundle[];
  settings: ShopSettings;
  source: "seed" | "supabase";
}

// ---------- סל ----------
export interface ImageRef {
  name: string;
  width: number;
  height: number;
  /** תמונה ממוזערת קטנה לתצוגה בסל בלבד */
  thumb: string;
  /** מזהה הקובץ בשרת, אחרי העלאה (שלב 4ג) */
  uploadId?: string;
}

export interface Customization {
  option: string | null;
  values: Record<string, string>;
  images: Record<string, ImageRef[]>;
  sendLater: boolean;
  note: string;
}

export interface CartProductLine {
  lineId: string;
  kind: "product";
  productId: string;
  qty: number;
  custom: Customization;
}

export interface CartBundleItem {
  productId: string;
  custom: Customization;
}

export interface CartBundleLine {
  lineId: string;
  kind: "bundle";
  bundleId: string;
  items: CartBundleItem[];
}

export type CartLine = CartProductLine | CartBundleLine;

export type DeliveryMethod = "pickup" | "courier";

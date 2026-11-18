// טעינת הקטלוג בצד השרת. Supabase כשמוגדר, אחרת נתוני ההתחלה (פיתוח והדגמה).
// מחירי עלות לא נקראים כאן בכלל (טבלת product_costs לא נגישה למפתח הציבורי).
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { seedCatalog } from "./seed-catalog";
import type { Bundle, Catalog, CustomField, FieldType, Product } from "./types";

const PRODUCT_IMAGES_BUCKET = "product-images";

function source(): "seed" | "supabase" {
  const forced = process.env.CATALOG_SOURCE;
  if (forced === "seed" || forced === "supabase") return forced;
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "seed";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadFromSupabase(): Promise<Catalog> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const pub = (path: string) => `${url}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${path}`;

  // שאילתות שטוחות (בלי embedding), ומחברים כאן. RLS מחזיר למבקר רק מוצרים ומארזים פעילים.
  const q = await Promise.all([
    sb.from("categories").select("id,slug,name,sort_order").order("sort_order"),
    sb.from("products").select(`id,code,slug,name,description,images,base_price_agorot,deal_qty,deal_price_agorot,
      stock_mode,stock_qty,is_available,allowed_in_bundles,sort_order`).order("sort_order"),
    sb.from("product_categories").select("product_id,category_id"),
    sb.from("product_design_options").select("product_id,key,label,help_text,sort_order"),
    sb.from("customization_fields").select("product_id,key,label,type,required,max_length,max_words,options,help_text,min_images,max_images,design_option_key,sort_order"),
    sb.from("product_designs").select("id,product_id,name,image_path,sort_order"),
    sb.from("bundle_templates").select("id,code,slug,name,description,images,type,fixed_price_agorot,min_items,max_items,sort_order")
      .in("type", ["fixed", "free"]).order("sort_order"),
    sb.from("fixed_bundle_items").select("id,bundle_template_id,product_id,quantity,max_designs,sort_order").order("sort_order").order("id"),
    sb.from("shop_settings").select("*").single(),
  ]);
  for (const r of q) if (r.error) throw new Error(`catalog load failed: ${r.error.message}`);
  const [cats, prods, prodCats, opts, fieldsQ, designsQ, bundles, bundleItems, settings] = q;
  const group = (rows: any[], key: string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
    return m;
  };
  const catById = new Map((cats.data as any[]).map((c) => [c.id, c]));
  const catOf = new Map((prodCats.data as any[]).map((pc) => [pc.product_id, catById.get(pc.category_id)?.slug ?? ""]));
  const optsBy = group(opts.data as any[], "product_id");
  const fieldsBy = group(fieldsQ.data as any[], "product_id");
  const designsBy = group(designsQ.data as any[], "product_id");
  const itemsBy = group(bundleItems.data as any[], "bundle_template_id");

  const bySort = (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0);
  const products: Product[] = (prods.data as any[]).map((p) => ({
    id: p.id, code: p.code ?? p.id.slice(0, 6), slug: p.slug, name: p.name, description: p.description,
    categorySlug: catOf.get(p.id) ?? "",
    images: (p.images ?? []).map(pub),
    priceAgorot: p.base_price_agorot,
    deal: p.deal_qty ? { qty: p.deal_qty, priceAgorot: p.deal_price_agorot } : undefined,
    stockMode: p.stock_mode, stockQty: p.stock_qty, isAvailable: p.is_available,
    allowedInBundles: p.allowed_in_bundles,
    designOptions: [...(optsBy.get(p.id) ?? [])].sort(bySort)
      .map((o: any) => ({ key: o.key, label: o.label, help: o.help_text || undefined })),
    fields: [...(fieldsBy.get(p.id) ?? [])].sort(bySort).map((f: any): CustomField => ({
      key: f.key, label: f.label, type: f.type as FieldType, required: f.required,
      optionKey: f.design_option_key, maxLength: f.max_length ?? undefined, maxWords: f.max_words ?? undefined,
      minImages: f.min_images, maxImages: f.max_images, options: f.options?.length ? f.options : undefined,
      help: f.help_text || undefined,
    })),
    designs: [...(designsBy.get(p.id) ?? [])].sort(bySort)
      .map((d: any) => ({ id: d.id, name: d.name, image: d.image_path ? pub(d.image_path) : undefined })),
  }));

  const bundleList: Bundle[] = (bundles.data as any[]).map((b) => ({
    id: b.id, code: b.code ?? b.id.slice(0, 6), slug: b.slug, name: b.name, description: b.description,
    images: (b.images ?? []).map(pub), type: b.type, priceAgorot: b.fixed_price_agorot,
    items: (itemsBy.get(b.id) ?? []).map((i: any) => ({ productId: i.product_id, qty: i.quantity, maxDesigns: i.max_designs ?? null })),
    minItems: b.min_items, maxItems: b.max_items,
  }));

  const s = settings.data as any;
  return {
    categories: (cats.data as any[]).map((c) => ({ slug: c.slug, name: c.name })),
    products, bundles: bundleList,
    settings: {
      courierFeeAgorot: s.courier_fee_agorot, pickupEnabled: s.pickup_enabled, courierEnabled: s.courier_enabled,
      pickupBusinessDays: s.pickup_business_days ?? 5, courierBusinessDays: s.courier_business_days ?? 10,
      pickupCity: s.pickup_city ?? "נתניה",
      bundlePackagingAgorot: s.bundle_packaging_agorot ?? 1000,
      quantityDiscountMinUnits: s.quantity_discount_min_units ?? 3,
      quantityDiscountPercent: s.quantity_discount_percent ?? 0,
    },
    source: "supabase",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const getCatalog = cache(async (): Promise<Catalog> => {
  return source() === "supabase" ? loadFromSupabase() : seedCatalog;
});

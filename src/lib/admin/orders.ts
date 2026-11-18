// טעינת הזמנה מלאה לממשק הניהול: שורות (כולל פריטי מארז), קבצים, והגדרות המוצרים להצגת ההתאמות.
import "server-only";
import type { AdminDb } from "./auth";
import { asCustomization, downloadName, extOf, type OrderCustomization } from "@/lib/order-format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FileInfo {
  id: string; mime: string; width: number | null; height: number | null; status: string;
  previewUrl: string | null; downloadName: string; downloadedAt: string | null; field: string;
}
export interface LineView {
  id: string; kind: "product" | "bundle"; position: string; name: string; quantity: number;
  unitPrice: number; lineTotal: number; awaitingUpload: boolean; productId: string | null;
  custom: OrderCustomization; files: FileInfo[]; children: LineView[];
}
export interface ProductDef {
  id: string; name: string;
  options: { key: string; label: string }[];
  fields: { key: string; label: string; type: string; options: string[]; design_option_key: string | null; required: boolean; max_images: number }[];
  designs: { id: string; name: string }[];
}

export async function loadOrder(db: AdminDb, orderId: string) {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const [{ data: lines }, { data: history }] = await Promise.all([
    db.from("order_lines").select("*").eq("order_id", orderId).order("sort_order"),
    db.from("order_status_history").select("*").eq("order_id", orderId).order("at", { ascending: false }),
  ]);
  const lineIds = (lines ?? []).map((l: any) => l.id);
  const productIds = [...new Set((lines ?? []).map((l: any) => l.product_id).filter(Boolean))] as string[];
  const [{ data: uploads }, { data: products }, { data: options }, { data: fields }, { data: designs }] = await Promise.all([
    lineIds.length ? db.from("uploads").select("id,mime_type,width_px,height_px,status,preview_path,order_line_id,downloaded_at").in("order_line_id", lineIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("products").select("id,name").in("id", productIds) : Promise.resolve({ data: [] }),
    productIds.length ? db.from("product_design_options").select("product_id,key,label,sort_order").in("product_id", productIds).order("sort_order") : Promise.resolve({ data: [] }),
    productIds.length ? db.from("customization_fields").select("product_id,key,label,type,options,design_option_key,required,max_images,sort_order").in("product_id", productIds).order("sort_order") : Promise.resolve({ data: [] }),
    productIds.length ? db.from("product_designs").select("id,product_id,name").in("product_id", productIds) : Promise.resolve({ data: [] }),
  ]);
  const defs = new Map<string, ProductDef>((products ?? []).map((p: any) => [p.id, {
    id: p.id, name: p.name,
    options: (options ?? []).filter((o: any) => o.product_id === p.id),
    fields: (fields ?? []).filter((f: any) => f.product_id === p.id),
    designs: (designs ?? []).filter((d: any) => d.product_id === p.id),
  }]));

  const uploadById = new Map((uploads ?? []).map((u: any) => [u.id, u]));
  const previews = (uploads ?? []).filter((u: any) => u.preview_path && u.status !== "deleted").map((u: any) => u.preview_path);
  const signed = new Map<string, string>();
  if (previews.length) {
    const { data } = await db.storage.from("customer-uploads").createSignedUrls(previews, 600);
    (data ?? []).forEach((s: any) => s.signedUrl && signed.set(s.path, s.signedUrl));
  }

  const build = (l: any, position: string): LineView => {
    const custom = asCustomization(l.customization);
    const files: FileInfo[] = [];
    for (const [field, imgs] of Object.entries(custom.images)) {
      imgs.forEach((img, k) => {
        const u: any = uploadById.get(img.uploadId);
        if (!u) return;
        files.push({
          id: u.id, mime: u.mime_type, width: u.width_px, height: u.height_px, status: u.status, field,
          previewUrl: u.preview_path ? signed.get(u.preview_path) ?? null : null, downloadedAt: u.downloaded_at,
          downloadName: downloadName(order.order_number, position, l.name_snapshot, k, imgs.length, extOf(u.mime_type)),
        });
      });
    }
    return {
      id: l.id, kind: l.kind, position, name: l.name_snapshot, quantity: l.quantity, unitPrice: l.unit_price_agorot,
      lineTotal: l.line_total_agorot, awaitingUpload: l.awaiting_upload, productId: l.product_id, custom, files, children: [],
    };
  };
  const top = (lines ?? []).filter((l: any) => !l.parent_line_id);
  let bundleNo = 0;
  const view: LineView[] = top.map((l: any, i: number) => {
    if (l.kind !== "bundle") return build(l, String(i + 1));
    bundleNo++;
    const v = build(l, `מארז${bundleNo}`);
    v.children = (lines ?? []).filter((c: any) => c.parent_line_id === l.id)
      .map((c: any, k: number) => build(c, `מארז${bundleNo}-${k + 1}`));
    return v;
  });
  return { order, lines: view, history: history ?? [], defs };
}

export const allFiles = (lines: LineView[]) => lines.flatMap((l) => [...l.files, ...l.children.flatMap((c) => c.files)]);
/* eslint-enable @typescript-eslint/no-explicit-any */

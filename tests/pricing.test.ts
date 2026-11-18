// בדיקות לחישוב המחיר, למבצעים, למארזים ולמלאי המשותף. נתונים מומצאים בלבד.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote, expandFixedBundle, bundleStockLimit } from "../src/lib/pricing.ts";
import { validateCustomization, emptyCustomization, countWords } from "../src/lib/customization.ts";
import { seedCatalog as cat } from "../src/lib/seed-catalog.ts";
import type { CartLine, Customization, ImageRef } from "../src/lib/types.ts";

const P = (code: string) => cat.products.find((p) => p.code === code)!;
const B = (code: string) => cat.bundles.find((b) => b.code === code)!;
const img = (name = "a.jpg"): ImageRef => ({ name, width: 2000, height: 1500, thumb: "" });
const c = (o: Partial<Customization>): Customization => ({ ...emptyCustomization(), ...o });
let n = 0;
const line = (code: string, qty: number, custom: Customization): CartLine =>
  ({ lineId: `l${n++}`, kind: "product", productId: P(code).id, qty, custom });

const standPhoto = c({ images: { photos: [img()] } });
const stickerSq = c({ option: "squares", images: { photos_squares: [img()] } });
const towel = c({ values: { design: "שמח במטבח" } });

test("מוצר רגיל ×2 + שליח", () => {
  const q = computeQuote([line("P06", 2, standPhoto)], cat, "courier");
  assert.equal(q.ok, true, JSON.stringify(q));
  assert.equal(q.totalAgorot, 65_00 * 2 + 40_00);
});

test("מבצע 2 דפי מדבקות ב־25 חל גם על שורות נפרדות עם עיצובים שונים", () => {
  const q = computeQuote([line("P04", 1, stickerSq), line("P04", 1, stickerSq), line("P04", 1, stickerSq)], cat, "pickup");
  assert.equal(q.ok, true);
  assert.equal(q.totalAgorot, 25_00 + 15_00);
  assert.equal(q.dealDiscountAgorot, 5_00);
});

test("מבצע 3 תחתיות ב־65", () => {
  const coaster = c({ option: "name", values: { name: "דנה" } });
  const q = computeQuote([line("P11", 4, coaster)], cat, "pickup");
  assert.equal(q.totalAgorot, 65_00 + 25_00);
});

test("מארז קבוע במחיר המאושר, בלי מבצע על הפריטים שבתוכו", () => {
  const b = B("B05");
  const items = expandFixedBundle(b).map((productId) => ({ productId, custom: stickerSq }));
  assert.equal(items.length, 10);
  const q = computeQuote([{ lineId: "b", kind: "bundle", bundleId: b.id, items }], cat, "pickup");
  assert.equal(q.ok, true, JSON.stringify(q));
  assert.equal(q.totalAgorot, 110_00 + 10_00); // + אריזה
  assert.equal(q.packagingAgorot, 10_00);
  assert.equal(q.lines[0].regularAgorot, 150_00);
});

test("מארז חופשי: סכום הפריטים + אריזה, מינימום 3, אותו מוצר עם תמונות שונות", () => {
  const b = B("BFREE");
  const two = computeQuote([{ lineId: "f", kind: "bundle", bundleId: b.id, items: [
    { productId: P("P06").id, custom: standPhoto }, { productId: P("P13").id, custom: towel }] }], cat, "pickup");
  assert.equal(two.ok, false);
  assert.match(two.lines[0].errors.join(), /לפחות 3/);
  const items = [
    { productId: P("P06").id, custom: c({ images: { photos: [img("a.jpg")] } }) },
    { productId: P("P06").id, custom: c({ images: { photos: [img("b.jpg")] } }) },
    { productId: P("P13").id, custom: towel },
  ];
  const q = computeQuote([{ lineId: "f", kind: "bundle", bundleId: b.id, items }], cat, "pickup");
  assert.equal(q.ok, true, JSON.stringify(q));
  // 3 פריטים במארז חופשי מזכים בהנחת כמות 10%
  assert.equal(q.quantityDiscountAgorot, 17_00);
  assert.equal(q.totalAgorot, 65_00 * 2 + 40_00 - 17_00 + 10_00);
});

test("מלאי משותף: מוצר לבד ובמארז נספרים יחד", () => {
  // מעמד מואר: 6 במלאי. 5 לבד + מארז "האור של סבתא" (כולל 1) + מארז חנוכה (כולל 1) = 7
  const b1 = B("B01"), b3 = B("B03");
  const filled = (b: typeof b1) => expandFixedBundle(b).map((productId) => {
    const p = cat.products.find((x) => x.id === productId)!;
    const custom = p.code === "P01" ? c({ option: "one_photo", images: { photos_one_photo: [img()] } })
      : p.code === "P13" ? towel : c({ images: { photos: [img()] } });
    return { productId, custom };
  });
  const cart: CartLine[] = [
    line("P07", 5, standPhoto),
    { lineId: "x", kind: "bundle", bundleId: b1.id, items: filled(b1) },
  ];
  assert.equal(computeQuote(cart, cat, "pickup").ok, true);
  cart.push({ lineId: "y", kind: "bundle", bundleId: b3.id, items: filled(b3) });
  const q = computeQuote(cart, cat, "pickup");
  assert.equal(q.ok, false);
  assert.match(q.errors.join(), /מעמד תמונה מואר/);
  assert.equal(bundleStockLimit(b1, cat), 6);
});

test("מוצר לא זמין לא נמכר; מחזיק מפתחות מעץ במלאי 10", () => {
  const photo = c({ images: { photos: [img()] } });
  assert.equal(computeQuote([line("P14", 10, photo)], cat, "pickup").ok, true);
  assert.equal(computeQuote([line("P14", 11, photo)], cat, "pickup").ok, false);
  const off = { ...cat, products: cat.products.map((p) => p.code === "P14" ? { ...p, isAvailable: false } : p) };
  assert.equal(computeQuote([line("P14", 1, photo)], off, "pickup").ok, false);
});

test("שתי שורות מארז = פעמיים אריזה; מוצרים בודדים בלי אריזה", () => {
  const items = expandFixedBundle(B("B05")).map((productId) => ({ productId, custom: stickerSq }));
  const q = computeQuote([
    { lineId: "a", kind: "bundle", bundleId: B("B05").id, items },
    { lineId: "b", kind: "bundle", bundleId: B("B05").id, items },
    line("P13", 1, towel),
  ], cat, "courier");
  assert.equal(q.packagingAgorot, 20_00);
  assert.equal(q.totalAgorot, 110_00 * 2 + 20_00 + 40_00 + 40_00);
});

test("ולידציה: מסלול עיצוב, מספר מילים, תמונות ושליחה אחרי התשלום", () => {
  const mug = P("P01");
  assert.ok(validateCustomization(mug, c({}))._option);
  const tooLong = c({ option: "photo_text", images: { photos_photo_text: [img()] }, values: { caption: "אחת שתיים שלוש ארבע חמש שש" } });
  assert.ok(validateCustomization(mug, tooLong).caption);
  assert.equal(countWords("  אמא   הכי טובה "), 3);
  const noImg = c({ option: "two_photos", images: { photos_two_photos: [img()] } });
  assert.ok(validateCustomization(mug, noImg).photos_two_photos);
  assert.deepEqual(validateCustomization(mug, { ...noImg, sendLater: true }), {});
  // מחזיק מפתחות: תמונה אחת מספיקה (תודפס בשני הצדדים)
  assert.deepEqual(validateCustomization(P("P10"), c({ images: { photos: [img()] } })), {});
  // יין: משפט רשות
  assert.deepEqual(validateCustomization(P("P12"), c({ images: { photos: [img()] }, values: { design: "x" } })), {});
});

test("מדביקים חיוכים: 10 דפים בעד 5 עיצובים", async () => {
  const { toGroups, fromGroups } = await import("../src/lib/bundle-designs.ts");
  const b = B("B05");
  const design = (k: number) => c({ option: "squares", images: { photos_squares: [img(`d${k}.jpg`)] } });
  const bundleLine = (designs: number[]): CartLine =>
    ({ lineId: `l${n++}`, kind: "bundle", bundleId: b.id, items: designs.map((k) => ({ productId: P("P04").id, custom: design(k) })) });
  const ok = computeQuote([bundleLine([1, 1, 1, 2, 2, 3, 4, 4, 5, 5])], cat, "pickup");
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.totalAgorot, 110_00 + 10_00);
  const bad = computeQuote([bundleLine([1, 2, 3, 4, 5, 6, 1, 1, 1, 1])], cat, "pickup");
  assert.equal(bad.ok, false);
  assert.match(bad.lines[0].errors.join(), /עד 5 עיצובים/);
  // הקבוצות בטופס: יחידות רצופות זהות מתאחדות, וחזרה לסל משחזרת את כל 10 היחידות
  const items = (bundleLine([1, 1, 1, 2, 2, 3, 4, 4, 5, 5]) as Extract<CartLine, { kind: "bundle" }>).items;
  const groups = toGroups(b, items);
  assert.deepEqual(groups.map((g) => g.count), [3, 2, 1, 2, 2]);
  assert.deepEqual(fromGroups(groups), items);
  // במארז אחר כל יחידה נשארת טופס נפרד, גם אם העיצובים זהים
  const b4 = B("B04");
  const same = expandFixedBundle(b4).map((productId) => ({ productId, custom: emptyCustomization() }));
  assert.equal(toGroups(b4, same).length, 3);
});

test("הנחת כמות 10% מ־3 מוצרים, בלי כפל עם מבצע", () => {
  // 2 מוצרים: אין הנחה, וחסר מוצר אחד
  const two = computeQuote([line("P06", 2, standPhoto)], cat, "pickup");
  assert.equal(two.quantityDiscountAgorot, 0);
  assert.equal(two.unitsToDiscount, 1);
  // 3 מעמדים: 10%
  const three = computeQuote([line("P06", 3, standPhoto)], cat, "pickup");
  assert.equal(three.quantityDiscountAgorot, 19_50);
  assert.equal(three.totalAgorot, 195_00 - 19_50);
  // 2 דפי מדבקות (מבצע 25 ₪, חיסכון 5) + מעמד: המבצע עדיף על 10% (3 ₪) במדבקות, והמעמד מקבל 10%
  const mix = computeQuote([line("P04", 2, stickerSq), line("P06", 1, standPhoto)], cat, "pickup");
  assert.equal(mix.dealDiscountAgorot, 5_00);
  assert.equal(mix.quantityDiscountAgorot, 6_50);
  assert.equal(mix.totalAgorot, 30_00 + 65_00 - 5_00 - 6_50);
  // מארז קבוע לא נספר ולא מקבל הנחה
  const b = B("B05");
  const sheets = expandFixedBundle(b).map((productId) => ({ productId, custom: stickerSq }));
  const withBundle = computeQuote([{ lineId: "x", kind: "bundle", bundleId: b.id, items: sheets }, line("P06", 2, standPhoto)], cat, "pickup");
  assert.equal(withBundle.quantityDiscountAgorot, 0);
  assert.equal(withBundle.unitsToDiscount, 1);
});

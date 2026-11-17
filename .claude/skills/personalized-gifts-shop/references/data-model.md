# מודל נתונים

בבנייה מותאמת מיישמים את המודל כפי שהוא. בפלטפורמה מנוהלת ממפים כל ישות ליכולת המקבילה בה (מוצר, וריאציה, line item properties, metafields, תוסף מארזים), ורושמים את המיפוי ב־`docs/requirements.md`. אם ישות לא ממופה, יש פער שצריך לבדוק.

## קטלוג
- **Category**: id, name, slug, parent_id (עד שתי רמות), sort_order, is_active.
- **Product**: id, name, slug, description, category_ids[], images[], base_price, prep_days, is_active, allowed_in_bundles, print_area_cm {w,h}.
- **ProductVariant**: id, product_id, option_values (למשל {size: "330ml", color: "לבן"}), price_delta או price, is_available. וריאציה מוגדרת רק אם היא משנה מחיר, זמינות או ייצור.
- **CustomizationField** (שייך למוצר): id, product_id, key, label, type (text | textarea | image | select), required, max_length, options[] (בשדה בחירה), help_text, min_images, max_images, sort_order.

## התאמה והעלאה
- **Upload**: id, storage_path (פרטי), original_filename, mime_type, size_bytes, width_px, height_px, dpi_estimate, preview_path, status (temp | attached | deleted), created_at, attached_at.
  - נוצר ברגע ההעלאה במצב temp. עובר למצב attached כשההזמנה משולמת. קובץ שנשאר temp נמחק אחרי X ימים.
- **CustomizationValue**: { field_key: value } לטקסט, או { field_key: [upload_id] } לתמונה. נשמר על שורת הסל ועל שורת ההזמנה.

## מארזים
- **BundleTemplate**: id, name, type (fixed | build_your_own), packaging_options[], min_items, max_items, capacity_units, allowed_product_ids[], pricing_rule {type: sum | percent_off | fixed_off | fixed_price, value}, is_active.
- **FixedBundleItem** (במארז מוכן): bundle_template_id, product_id, variant_id, quantity.
- **Packaging**: id, name, price, capacity_units.
- **Product.capacity_units** (אופציונלי): כמה "מקום" המוצר תופס באריזה.

## סל והזמנה
- **CartLine / OrderLine**: id, parent_line_id (null או מזהה שורת המארז), kind (product | bundle), product_id או bundle_template_id, variant_id, quantity, customization (CustomizationValue), packaging_id (רק בשורת מארז), unit_price_snapshot, line_total_snapshot.
  - **מארז = שורת אב (kind=bundle) עם שורות ילד.** לכל ילד customization משלו.
  - יחידות עם התאמה שונה הן שורות נפרדות. quantity גדול מ־1 רק כשההתאמה זהה.
- **Order**: id, order_number (קריא, רץ), status, needs_attention (bool), internal_note, customer {name, phone, email} (נשמר רק במערכת ולא במאגר הקוד), delivery {method, address, fee}, totals {items, packaging, delivery, discount, total}, payment {provider, provider_ref, status}, created_at, paid_at.
- **OrderStatusHistory**: order_id, from, to, at, by.
- **סטטוסים**: new → awaiting_approval (אופציונלי) → in_production → ready → shipped / picked_up. וגם: cancelled.

## כללים
- המחירים נשמרים כ"צילום מצב" בשורת ההזמנה. שינוי מחיר עתידי לא משנה הזמנות קיימות.
- המחיר מחושב מחדש **בשרת** לפני התשלום. לא סומכים על מחיר שנשלח מהדפדפן.
- יצירת הזמנה מאישור תשלום חייבת לפעול נכון גם כשהאישור מגיע פעמיים (idempotency לפי provider_ref).
- הרשאות: לקוח רואה רק את הסל שלו. רק משתמשת ניהול רואה הזמנות וקבצים. הגישה לאחסון היא דרך קישורים חתומים בלבד.

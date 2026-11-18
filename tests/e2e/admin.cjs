// בדיקות ממשק הניהול מול Postgres מקומי אמיתי (הסכמה וה־RLS של הפרויקט) ושרת Supabase מדומה.
// נתונים מומצאים בלבד. הרצה:
//   tests/e2e/make-db.sh && psql -d giftse2e -f tests/e2e/admin-seed.sql
//   TEST_USERS="owner@example.test,Test-pass-123,11111111-1111-4111-8111-111111111111;stranger@example.test,Test-pass-456,55555555-5555-4555-8555-555555555555" node tests/e2e/pg-supabase.mjs 54330 giftse2e
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54330 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key SUPABASE_SERVICE_ROLE_KEY=test-service-key npm run build && npx next start -p 3100
//   node tests/e2e/admin.cjs [base] [supabase] [screenshots-dir]     (רשות: HEIC=<קובץ heic> לבדיקת ההמרה ל־JPG)
const { chromium } = require('playwright');
const fs = require('node:fs');
const { makeFixtures } = require('./fixtures.cjs');
const BASE = process.argv[2] || 'http://localhost:3100';
const SB = process.argv[3] || 'http://localhost:54330';
const SHOTS = process.argv[4] || null;
const ORDER = '22222222-2222-4222-8222-222222222222';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${ok ? '' : extra}`);
const sql = async (q) => (await fetch(`${SB}/__sql`, { method: 'POST', body: q })).json();
const objects = async () => (await fetch(`${SB}/__objects`)).json();
const put = (key, buf, type = 'image/jpeg') => fetch(`${SB}/__put?key=${encodeURIComponent(key)}&type=${type}`, { method: 'POST', body: buf });

(async () => {
  const browser = await chromium.launch();
  const FX = await makeFixtures(browser);
  const jpg = fs.readFileSync(`${FX}/big.jpg`);
  await put('customer-uploads/temp/2026-11/a.jpg', jpg);
  await put('customer-uploads/temp/2026-11/a-preview.jpg', jpg);
  await put('customer-uploads/temp/2026-11/b.heic', process.env.HEIC ? fs.readFileSync(process.env.HEIC) : jpg, 'image/heic');
  await put('customer-uploads/temp/2026-11/b-preview.jpg', jpg);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}`, fullPage: true }); };
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  /** שמירת טופס לפי כותרת הכרטיס, ומחכה להודעה */
  const card = (title) => page.locator('section.admin-card', { has: page.getByRole('heading', { name: title, exact: true }) });
  const saveIn = async (scope, label = /^שמירה$|^עדכון סטטוס$/) => {
    const form = scope.locator('form.admin-form', { has: page.getByRole('button', { name: label }) }).first();
    const btn = form.getByRole('button', { name: label });
    const before = await form.locator('[data-at]').getAttribute('data-at', { timeout: 500 }).catch(() => null);
    await btn.click();
    const msg = form.locator(before ? `[data-at]:not([data-at="${before}"])` : '[data-at]');
    await msg.waitFor({ timeout: 10000 });
    return msg.innerText();
  };

  // ---------- כניסה ----------
  await page.goto(BASE + '/admin');
  check('not logged in -> login page', page.url().includes('/admin/login'), page.url());
  check('admin pages are noindex', (await page.locator('meta[name="robots"]').getAttribute('content'))?.includes('noindex'));

  // משתמשת שאינה מנהלת: עוברת אימות, ונחסמת
  await page.getByLabel('מייל').fill('stranger@example.test');
  await page.getByLabel('סיסמה').fill('Test-pass-456');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.getByLabel(/הקוד מהאפליקציה/).fill('123456');
  await page.getByRole('button', { name: 'אישור' }).click();
  await page.waitForURL(/denied=1/);
  check('non-admin is denied', await page.getByText('החשבון הזה לא מורשה').isVisible());
  await page.getByRole('button', { name: 'יציאה' }).click();
  await page.getByLabel('מייל').waitFor();

  // מנהלת: סיסמה שגויה, ואז חיבור אפליקציית אימות, קוד שגוי, קוד נכון
  await page.getByLabel('מייל').fill('owner@example.test');
  await page.getByLabel('סיסמה').fill('wrong-password');
  await page.getByRole('button', { name: 'כניסה' }).click();
  check('wrong password message', await page.getByText('מייל או סיסמה שגויים').waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.getByLabel('סיסמה').fill('Test-pass-123');
  await page.getByRole('button', { name: 'כניסה' }).click();
  await page.getByAltText('קוד לסריקה באפליקציית האימות').waitFor().catch(async (e) => { await shot('login-fail.png'); throw e; });
  check('first login shows QR to connect an authenticator app', true);
  await page.getByLabel(/הקוד מהאפליקציה/).fill('000000');
  await page.getByRole('button', { name: 'אישור' }).click();
  check('wrong code message', await page.getByText(/הקוד שגוי/).waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.getByLabel(/הקוד מהאפליקציה/).fill('123456');
  await page.getByRole('button', { name: 'אישור' }).click();
  await page.waitForURL(BASE + '/admin');

  // ---------- רשימת הזמנות ----------
  check('open orders list shows the new order', await page.getByRole('link', { name: '5001' }).isVisible());
  check('shipped order hidden from open tab', !(await page.getByRole('link', { name: '5000', exact: true }).isVisible()));
  check('orders list no h-scroll (phone)', await noHScroll());
  await shot('admin-orders.png');
  await page.getByRole('link', { name: 'נשלחה' }).click();
  await page.getByRole('link', { name: '5000', exact: true }).waitFor();
  check('status tab filter', !(await page.getByRole('link', { name: '5001' }).isVisible()));
  await page.goto(BASE + '/admin?status=all&q=' + encodeURIComponent('דנה'));
  check('search by name', (await page.locator('.admin-table tbody tr').count()) === 1);

  // ---------- הזמנה ----------
  await page.goto(`${BASE}/admin/orders/${ORDER}`);
  check('order page shows caption', await page.getByText('לאמא באהבה').first().isVisible());
  check('order page shows 2 photo files', (await page.locator('.file-thumb').count()) === 2);
  check('HEIC file offers JPG download', await page.getByRole('button', { name: 'הורדה כ־JPG' }).isVisible());
  check('bundle child awaiting photo flagged', await page.locator('.custom-summary .warn').first().isVisible());
  check('order page no h-scroll (phone)', await noHScroll());
  await shot('admin-order.png');

  // סטטוס
  await card('סטטוס').getByLabel('סטטוס ההזמנה').selectOption('in_production');
  check('status saved', (await saveIn(card('סטטוס'), 'עדכון סטטוס')).includes('הסטטוס עודכן'));
  let [o] = await sql(`select status from orders where id='${ORDER}'`);
  const hist = await sql(`select to_status from order_status_history where order_id='${ORDER}' order by at`);
  check('status in DB + history', o.status === 'in_production' && hist.at(-1).to_status === 'in_production', JSON.stringify(hist));

  // עצמאות: שינוי לא שמור בכרטיס אחד לא נשמר כששומרים כרטיס אחר
  await card('פרטי לקוח').getByLabel('שם').fill('שם שלא נשמר');
  await card('מעקב פנימי').getByText('נדרש בירור').click();
  await card('מעקב פנימי').getByLabel(/הערה פנימית/).fill('להתקשר לפני משלוח');
  check('tracking saved', (await saveIn(card('מעקב פנימי'))).includes('נשמר'));
  [o] = await sql(`select needs_attention, internal_note, customer_name from orders where id='${ORDER}'`);
  check('tracking in DB', o.needs_attention === true && o.internal_note === 'להתקשר לפני משלוח');
  check('saving one part does not save another', o.customer_name === 'דנה בדיקה', o.customer_name);

  // פרטי לקוח
  await page.reload();
  await card('פרטי לקוח').getByLabel('מייל').fill('not-an-email');
  check('invalid email rejected', (await saveIn(card('פרטי לקוח'))).includes('מייל לא תקינה'));
  await card('פרטי לקוח').getByLabel('מייל').fill('new@example.test');
  await card('פרטי לקוח').getByLabel('שם').fill('דנה בדיקה-כהן');
  check('customer saved', (await saveIn(card('פרטי לקוח'))).includes('נשמר'));
  [o] = await sql(`select customer_name, customer_email from orders where id='${ORDER}'`);
  check('customer in DB', o.customer_name === 'דנה בדיקה-כהן' && o.customer_email === 'new@example.test');

  // מסירה
  await card('מסירה').getByLabel('דרך מסירה').selectOption('courier');
  await card('מסירה').getByLabel('עיר').fill('');
  check('courier needs address', (await saveIn(card('מסירה'))).includes('חסר: עיר'));
  await card('מסירה').getByLabel('עיר').fill('עיר אחרת');
  await card('מסירה').getByLabel('דירה/כניסה').fill('4');
  check('delivery saved', (await saveIn(card('מסירה'))).includes('נשמר'));
  [o] = await sql(`select delivery_address from orders where id='${ORDER}'`);
  check('address in DB', o.delivery_address.city === 'עיר אחרת' && o.delivery_address.apartment === '4');
  [o] = await sql(`select total_agorot from orders where id='${ORDER}'`);
  check('paid total unchanged', o.total_agorot === 19850);

  // התאמה של פריט: כיתוב
  const mugLine = page.locator('.order-line').first();
  await mugLine.getByText('עריכת ההתאמה של הפריט').click();
  await mugLine.getByLabel('כיתוב').fill('לאמא הכי טובה');
  check('line saved', (await saveIn(mugLine, 'שמירת הפריט')).includes('הפריט עודכן'));
  const [ln] = await sql(`select customization from order_lines where id='33333333-3333-4333-8333-333333333331'`);
  check('line caption in DB, photos kept', ln.customization.values.caption === 'לאמא הכי טובה' && ln.customization.images.photos_photo_text.length === 2);

  // הורדת קובץ מקורי עם שם שמזהה את הפריט
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.file-thumb').first().getByRole('button', { name: 'הורדה' }).click()]);
  check('download name identifies the item', dl.suggestedFilename() === '5001-1-ספל-לבן-1.jpg', dl.suggestedFilename());
  const [u1] = await sql(`select downloaded_at from uploads where id='44444444-4444-4444-8444-444444444441'`);
  const logs = await sql(`select action from access_log where upload_id='44444444-4444-4444-8444-444444444441'`);
  check('download logged', !!u1.downloaded_at && logs.some((l) => l.action === 'download'));

  if (process.env.HEIC) {
    const [dj] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'הורדה כ־JPG' }).click()]);
    const p = await dj.path();
    const head = fs.readFileSync(p).subarray(0, 3);
    check('HEIC downloaded as real JPG', dj.suggestedFilename() === '5001-1-ספל-לבן-2.jpg' && head[0] === 0xff && head[1] === 0xd8, dj.suggestedFilename());
  }

  // העלאת קובץ לפריט במארז (תמונה שהגיעה בוואטסאפ)
  const keychain = page.locator('.bundle-children > li', { hasText: 'מחזיק מפתחות' });
  await keychain.locator('.attach-file input[type=file]').setInputFiles(`${FX}/big2.jpg`);
  await keychain.getByText('✓ הקובץ נוסף לפריט').waitFor({ timeout: 15000 });
  const [kc] = await sql(`select l.awaiting_upload, (select count(*) from uploads u where u.order_line_id=l.id and u.status='attached') n from order_lines l where l.id='33333333-3333-4333-8333-333333333335'`);
  check('admin upload attached to the bundle item', kc.awaiting_upload === false && Number(kc.n) === 1, JSON.stringify(kc));
  check('uploaded file is in private storage', (await objects()).some((k) => k.startsWith(`customer-uploads/orders/${ORDER}/`)));
  await page.locator('.bundle-children > li', { hasText: 'מחזיק מפתחות' }).locator('.file-thumb').waitFor();
  check('bundle file name', (await keychain.locator('.file-thumb small.ltr').innerText()).startsWith('5001-מארז1-3-'));

  // דף ייצור
  const pp = await ctx.newPage();
  await pp.goto(`${BASE}/admin/orders/${ORDER}/print`);
  const printText = await pp.locator('main').innerText();
  check('print page has texts, files and address', printText.includes('לאמא הכי טובה') && printText.includes('5001-1-ספל-לבן-1.jpg') && printText.includes('עיר אחרת') && printText.includes('להתקשר לפני משלוח'));
  await pp.close();

  // מחיקת הקבצים מהענן
  const del = card('מחיקת הקבצים מהענן');
  page.once('dialog', (d) => d.accept());
  check('delete requires confirmation checkbox', (await saveIn(del, /מחיקת \d+ קבצים/)).includes('יש לסמן'));
  await del.getByText('הורדתי ושמרתי').click();
  page.once('dialog', (d) => d.accept());
  await del.getByRole('button', { name: /מחיקת 3 קבצים/ }).click();
  check('after delete: no files left in cloud', await del.getByText('אין קבצים בענן להזמנה הזו').waitFor({ timeout: 10000 }).then(() => true, () => false));
  const left = (await objects()).filter((k) => k.startsWith('customer-uploads/'));
  const ups = await sql(`select status, deleted_reason from uploads where order_line_id in (select id from order_lines where order_id='${ORDER}')`);
  check('storage emptied, uploads marked deleted', left.length === 0 && ups.every((u) => u.status === 'deleted' && u.deleted_reason === 'owner_confirmed'), JSON.stringify(left));

  // ---------- מוצרים ----------
  const [mug] = await sql(`select id from products where code='P01'`);
  await page.goto(`${BASE}/admin/products/${mug.id}`);
  check('product page no h-scroll (phone)', await noHScroll());
  await card('פרטים').getByLabel('שם המוצר').fill('שם שלא נשמר');
  await card('מחיר ומבצע').getByLabel(/מחיר ליחידה/).fill('70');
  check('price saved', (await saveIn(card('מחיר ומבצע'))).includes('נשמר'));
  let [pr] = await sql(`select name, base_price_agorot from products where id='${mug.id}'`);
  check('price in DB, name untouched', pr.base_price_agorot === 7000 && pr.name === 'ספל לבן', JSON.stringify(pr));
  await card('מחיר ומבצע').getByLabel('מבצע: כמות').fill('2');
  check('deal needs both qty and price', (await saveIn(card('מחיר ומבצע'))).includes('גם כמות וגם מחיר'));
  const shop = await ctx.newPage();
  await shop.goto(`${BASE}/products/white-mug`);
  check('shop shows new price', (await shop.locator('.price').first().innerText()).includes('70'));

  await page.reload();
  await card('מלאי וזמינות').getByLabel('כמות במלאי').fill('2');
  check('stock saved', (await saveIn(card('מלאי וזמינות'))).includes('נשמר'));
  await shop.reload();
  check('shop shows low stock', await shop.getByText('נשארו 2 במלאי').isVisible());

  await card(/^עלות/).getByLabel(/עלות ליחידה/).fill('22.5');
  check('cost saved', (await saveIn(card(/^עלות/))).includes('נשמר'));
  await page.reload();
  check('margin shown', await page.getByText('רווח גולמי').isVisible());
  const anonCost = await fetch(`${SB}/rest/v1/product_costs?select=*`, { headers: { apikey: 'test-anon-key' } });
  check('visitors cannot read costs', anonCost.status === 403 || (await anonCost.json()).length === 0);
  check('cost not in shop HTML', !(await shop.content()).includes('2250'));

  // תמונות מוצר
  await card('תמונות').locator('input[type=file]').setInputFiles([`${FX}/big.jpg`, `${FX}/big2.jpg`]);
  await card('תמונות').getByText('✓ התמונה נוספה').waitFor({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.admin-images li').length === 2, null, { timeout: 15000 });
  let [im] = await sql(`select images from products where id='${mug.id}'`);
  check('2 product images saved', im.images.length === 2);
  const second = im.images[1];
  await card('תמונות').locator('.admin-images li').nth(1).getByRole('button', { name: /קדימה/ }).click();
  await card('תמונות').getByText('זו עכשיו התמונה הראשית').waitFor();
  [im] = await sql(`select images from products where id='${mug.id}'`);
  check('image reordered', im.images[0] === second);
  await shop.reload();
  const src = await shop.locator('.gallery img, .product-layout img').first().getAttribute('src');
  check('shop shows product image', !!src && decodeURIComponent(src).includes(second.split('/').pop()), src);
  const pub = await fetch(`${SB}/storage/v1/object/public/product-images/${second}`);
  const pubBuf = Buffer.from(await pub.arrayBuffer());
  check('stored image is a real JPEG', pubBuf[0] === 0xff && pubBuf[1] === 0xd8);
  page.once('dialog', (d) => d.accept());
  await card('תמונות').locator('.admin-images li').first().getByRole('button', { name: 'הסרה' }).click();
  await card('תמונות').getByText('✓ התמונה הוסרה').waitFor();
  [im] = await sql(`select images from products where id='${mug.id}'`);
  check('image removed from DB and storage', im.images.length === 1 && !(await objects()).includes(`product-images/${second}`));

  // שדה התאמה: הוספה, עריכה, מחיקה
  const fields = card('שדות התאמה');
  await fields.getByText('+ שדה חדש').click();
  const addField = fields.locator('details.add-new');
  await addField.getByLabel(/תווית/).fill('הקדשה בגב הספל');
  await addField.getByLabel(/מפתח/).fill('back_text');
  await addField.getByLabel('מקסימום תווים').fill('30');
  await addField.getByLabel('חובה').uncheck();
  check('field added', (await saveIn(addField, 'הוספת השדה')).includes('השדה נוסף'));
  await shop.reload();
  await shop.waitForLoadState('networkidle');
  await shop.getByText('תמונה וכיתוב (עד 5 מילים)').click();
  check('new field appears in shop form', await shop.getByLabel(/הקדשה בגב הספל/).waitFor({ timeout: 8000 }).then(() => true, () => false));
  await page.reload();
  const fieldCard = fields.locator('details.sub-card').last(); // השדה החדש (הסדר הגבוה ביותר)
  await fieldCard.locator('summary').click();
  await fieldCard.getByLabel(/תווית/).fill('הקדשה מאחור');
  check('field edited', (await saveIn(fieldCard, 'שמירת השדה')).includes('נשמר'));
  page.once('dialog', (d) => d.accept());
  check('field label updated in list', await fieldCard.locator('summary').getByText('הקדשה מאחור').isVisible());
  await fieldCard.getByRole('button', { name: 'מחיקת השדה' }).click();
  await fields.locator('details.sub-card', { hasText: 'הקדשה מאחור' }).waitFor({ state: 'detached', timeout: 10000 });
  check('field deleted', (await sql(`select id from customization_fields where key='back_text'`)).length === 0);

  // מסלול עם שדות לא נמחק
  const opts = card('מסלולי עיצוב');
  page.once('dialog', (d) => d.accept());
  check('option with fields cannot be deleted', (await saveIn(opts.locator('.sub-card').first(), 'מחיקת המסלול')).includes('שדות ששייכים'));

  // עיצוב קבוע עם תמונה
  const designs = card('עיצובים קבועים לבחירה');
  await designs.getByText('+ עיצוב חדש').click();
  const addDesign = designs.locator('details.add-new');
  await addDesign.getByLabel('שם העיצוב').fill('לבבות אדומים');
  await addDesign.locator('input[type=file]').setInputFiles(`${FX}/small.jpg`);
  await addDesign.locator('.image-pick img').waitFor({ timeout: 15000 });
  check('design added', (await saveIn(addDesign, 'הוספת העיצוב')).includes('העיצוב נוסף'));
  const [dsg] = await sql(`select image_path from product_designs where name='לבבות אדומים'`);
  check('design image saved', !!dsg?.image_path && (await objects()).includes(`product-images/${dsg.image_path}`));

  // מוצר חדש
  await page.goto(BASE + '/admin/products/new');
  await page.getByLabel('שם המוצר').fill('מגנט תמונה');
  await page.getByLabel(/מחיר/).fill('25');
  await page.getByLabel(/כתובת בדף/).fill('photo-magnet');
  await page.getByRole('button', { name: 'יצירת המוצר' }).click();
  await page.waitForURL(/created=1/);
  const [np] = await sql(`select id, code, is_active from products where slug='photo-magnet'`);
  check('new product created hidden', np && np.is_active === false && /^P\d+$/.test(np.code), JSON.stringify(np));
  const hidden = await shop.goto(`${BASE}/products/photo-magnet`);
  check('hidden product not in shop', hidden.status() === 404);
  await card('פרטים').getByText('מוצג באתר').click();
  await card('פרטים').getByLabel('קטגוריה').selectOption({ index: 1 });
  check('product published', (await saveIn(card('פרטים'))).includes('נשמר'));
  const shown = await shop.goto(`${BASE}/products/photo-magnet`);
  check('published product in shop', shown.status() === 200 && (await shop.getByRole('heading', { name: 'מגנט תמונה' }).isVisible()));
  await page.goto(BASE + '/admin/products/new');
  await page.getByLabel('שם המוצר').fill('כפול');
  await page.getByLabel(/מחיר/).fill('10');
  await page.getByLabel(/כתובת בדף/).fill('photo-magnet');
  await page.getByRole('button', { name: 'יצירת המוצר' }).click();
  check('duplicate slug rejected', await page.getByText(/הערך כבר קיים/).waitFor({ timeout: 10000 }).then(() => true, () => false));
  // מחיקה של מוצר שנמצא במארז נחסמת
  await page.goto(`${BASE}/admin/products/${mug.id}`);
  page.once('dialog', (d) => d.accept());
  check('product in bundles cannot be deleted', (await saveIn(card('מחיקת המוצר'), 'מחיקה לצמיתות')).includes('אפשר להסתיר'));
  await page.goto(`${BASE}/admin/products/${np.id}`);
  page.once('dialog', (d) => d.accept());
  await card('מחיקת המוצר').getByRole('button', { name: 'מחיקה לצמיתות' }).click();
  await page.waitForURL(/deleted=1/);
  check('unused product deleted', (await sql(`select id from products where slug='photo-magnet'`)).length === 0);

  // ---------- מארזים ----------
  const [b05] = await sql(`select id from bundle_templates where code='B05'`);
  await page.goto(`${BASE}/admin/bundles/${b05.id}`);
  await card('מחיר').getByLabel(/מחיר המארז/).fill('115');
  check('bundle price saved', (await saveIn(card('מחיר'))).includes('נשמר'));
  const item = card('פריטים במארז').locator('.sub-card').first();
  await item.getByLabel('עד כמה עיצובים שונים').fill('4');
  check('bundle item saved', (await saveIn(item)).includes('נשמר'));
  const [bi] = await sql(`select max_designs from fixed_bundle_items where bundle_template_id='${b05.id}'`);
  check('max designs in DB', bi.max_designs === 4);
  await shop.goto(`${BASE}/bundles/sticker-smiles`);
  check('shop shows new bundle price and design limit', (await shop.locator('.price.big').innerText()).includes('115') && await shop.getByText(/בעד 4 עיצובים/).first().isVisible());

  // ---------- קטגוריות ----------
  await page.goto(BASE + '/admin/categories');
  const newCat = card('קטגוריה חדשה');
  await newCat.getByLabel('שם').fill('ימי הולדת');
  await newCat.getByLabel(/כתובת/).fill('birthday');
  check('category added', (await saveIn(newCat, 'הוספה')).includes('הקטגוריה נוספה'));
  const used = page.locator('section.admin-card').first();
  page.once('dialog', (d) => d.accept());
  check('category in use cannot be deleted', (await saveIn(used, 'מחיקה')).includes('יש להעביר'));

  // ---------- הגדרות ----------
  await page.goto(BASE + '/admin/settings');
  await card('מסירה').getByLabel(/מחיר משלוח/).fill('45');
  check('settings saved', (await saveIn(card('מסירה'))).includes('נשמר'));
  await card('מסירה').getByText('איסוף עצמי').click();
  await card('מסירה').getByText('משלוח עם שליח').click();
  check('cannot disable all delivery', (await saveIn(card('מסירה'))).includes('לפחות דרך מסירה אחת'));
  await shop.goto(`${BASE}/products/white-mug`);
  check('shop shows new courier fee', (await shop.locator('main').innerText()).includes('45'));
  await card('אריזה והנחות').getByLabel(/הנחת כמות \(אחוזים/).fill('15');
  check('discount saved', (await saveIn(card('אריזה והנחות'))).includes('נשמר'));
  await shop.goto(BASE + '/');
  check('shop shows new discount', await shop.getByText('15% הנחה').isVisible());
  check('settings no h-scroll (phone)', await noHScroll());

  // ---------- יציאה ----------
  await page.getByRole('button', { name: 'יציאה' }).click();
  await page.waitForURL(/\/admin\/login/);
  await page.goto(`${BASE}/admin/orders/${ORDER}`);
  check('after logout admin is locked', page.url().includes('/admin/login'));
  const direct = await fetch(`${BASE}/admin/files/44444444-4444-4444-8444-444444444441`, { redirect: 'manual' });
  check('file route needs login', direct.status === 401);

  check('no page JS errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });

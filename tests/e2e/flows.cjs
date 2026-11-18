// בדיקות זרימה מלאות ברוחב טלפון (מצב פיתוח: בלי Supabase, התמונות נשארות בדפדפן).
// הרצה: npm run build && npx next start -p 3100, ואז: node tests/e2e/flows.cjs [base-url] [screenshots-dir]
const { chromium } = require('playwright');
const { makeFixtures } = require('./fixtures.cjs');
const BASE = process.argv[2] || 'http://localhost:3100';
const SHOTS = process.argv[3] || null;
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
(async () => {
  const browser = await chromium.launch();
  const S = await makeFixtures(browser);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true }); };
  const settled = () => page.waitForFunction(() => !document.querySelector('.thumbs li.is-uploading'));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const noHScroll = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.goto(BASE + '/');
  check('home rtl', await page.evaluate(() => document.documentElement.dir === 'rtl'));
  check('home no h-scroll', await noHScroll());
  check('home shows 7 fixed bundles + builder', (await page.locator('#bundles .card').count()) === 8);
  check('home shows 14 products', (await page.locator('#products .card').count()) === 14);
  await shot('home.png');

  // --- mug: validation, upload, replace, words limit, add & another
  await page.goto(BASE + '/products/white-mug');
  await settled(); await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();
  check('mug requires design option', await page.getByText('יש לבחור סוג עיצוב').isVisible());
  await page.getByText('תמונה וכיתוב (עד 5 מילים)').click();
  check('upload needs rights consent first', await page.locator('.upload-btn.disabled').isVisible());
  await page.getByText('יש לי זכות להשתמש בתמונות').click();
  await page.locator('.upload-btn input').setInputFiles(S + '/big.jpg');
  await page.locator('.thumbs img').first().waitFor();
  await page.locator('.thumb-actions input').first().setInputFiles(S + '/big2.jpg');
  await page.waitForTimeout(300);
  await page.getByLabel(/^כיתוב/).fill('אחת שתיים שלוש ארבע חמש שש');
  await settled(); await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();
  check('caption >5 words blocked', await page.getByText('עד 5 מילים', { exact: true }).last().isVisible());
  await page.getByLabel(/^כיתוב/).fill('לאמא הכי טובה בעולם');
  check('mug page no h-scroll', await noHScroll());
  await shot('mug.png');
  await settled(); await page.getByRole('button', { name: 'הוספה לסל ועוד אחד בעיצוב אחר' }).click();
  check('added & form reset', await page.getByText('נוסף לסל. אפשר לעצב עכשיו עוד אחד.').isVisible() && !(await page.getByLabel(/^כיתוב/).count()));
  await page.getByText('תמונה אחת', { exact: true }).click();
  await page.locator('.upload-btn input').setInputFiles(S + '/small.jpg');
  await page.locator('.thumbs img').first().waitFor();
  check('low-res warning', await page.getByText(/רזולוציה נמוכה/).isVisible());
  await settled(); await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();

  // --- PDF rejected
  await page.goto(BASE + '/products/wood-photo-stand');
  await page.locator('.upload-btn input').setInputFiles(S + '/doc.pdf');
  check('pdf rejected with hebrew msg', await page.getByText(/אפשר להעלות רק תמונות/).isVisible());
  // send-later path
  await page.getByText('אשלח את התמונות אחרי התשלום').click();
  await settled(); await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();
  check('send-later added', await page.getByText('נוסף לסל.').isVisible());

  // --- stickers x3 separate lines (deal)
  for (let k = 0; k < 3; k++) {
    await page.goto(BASE + '/products/sticker-sheet');
    await page.getByText('מדבקות מרובעות', { exact: true }).click();
    await page.locator('.upload-btn input').setInputFiles([S + '/big.jpg', S + '/big2.jpg']);
    await page.locator('.thumbs img').nth(1).waitFor();
    await settled(); await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();
  }

  // --- fixed bundle B01
  await page.goto(BASE + '/bundles/grandma-light');
  await page.getByRole('button', { name: 'הוספת המארז לסל' }).click();
  check('bundle blocks incomplete', await page.locator('.bundle-item.has-error').count() > 0);
  // item 1: lit stand (open by default after error)
  const body = () => page.locator('.bundle-item-body');
  await body().locator('.upload-btn input').setInputFiles(S + '/big.jpg');
  await body().locator('.thumbs img').waitFor();
  await page.locator('.bundle-item-head').nth(1).click();
  await body().getByText('2 תמונות', { exact: true }).click();
  await body().locator('.upload-btn input').setInputFiles([S + '/big.jpg', S + '/big2.jpg']);
  await body().locator('.thumbs img').nth(1).waitFor();
  await page.locator('.bundle-item-head').nth(2).click();
  await body().locator('.upload-btn input').setInputFiles(S + '/big2.jpg');
  await body().locator('.thumbs img').waitFor();
  check('bundle page no h-scroll', await noHScroll());
  await shot('bundle.png');
  await settled(); await page.getByRole('button', { name: 'הוספת המארז לסל' }).click();
  check('fixed bundle added', await page.getByText('המארז נוסף לסל.').isVisible());

  // --- free bundle: min 3 items; 2 stands with different photos + towel
  await page.goto(BASE + '/bundles/build');
  const addBtn = (name) => page.locator('.pick-list li', { hasText: name }).getByRole('button');
  await addBtn('מגבת מטבח').click();
  await body().getByLabel(/בחירת משפט/).fill('המטבח של סבתא');
  await page.getByRole('button', { name: 'הוספת המארז לסל' }).click();
  check('free bundle needs 3 items', await page.getByText('במארז צריכים להיות לפחות 3 פריטים').first().isVisible());
  await addBtn('מעמד תמונה על בסיס עץ').click();
  await body().locator('.upload-btn input').setInputFiles(S + '/big.jpg');
  await body().locator('.thumbs img').waitFor();
  await addBtn('מעמד תמונה על בסיס עץ').click();
  await body().locator('.upload-btn input').setInputFiles(S + '/big2.jpg');
  await body().locator('.thumbs img').waitFor();
  await settled();
  const total = await page.locator('.sticky-total strong').innerText();
  check('free bundle total 163 (170 - 10% + packaging)', total.includes('163'), total);
  check('free bundle labels', await page.getByText('מעמד תמונה על בסיס עץ (2 מתוך 2)').isVisible());
  await settled(); await page.getByRole('button', { name: 'הוספת המארז לסל' }).click();
  check('free bundle added', await page.getByText('המארז נוסף לסל.').isVisible());

  // --- cart
  await page.goto(BASE + '/cart');
  await page.locator('.cart-lines').waitFor();
  const lines = page.locator('.cart-lines > li');
  check('cart has 8 lines', (await lines.count()) === 8, String(await lines.count()));
  check('deal discount shown', await page.getByText(/מבצע \(דף מדבקות/).isVisible());
  // expected: mugs 130 + stand 65 + stickers 3*15=45 + B01 145 + free 170 = 555, sticker deal -5 (better than 10%),
  // 10% quantity discount on the rest outside fixed bundles (130+65+170)=-36.50, packaging 2x10 => 533.50
  const grand = await page.locator('.totals .grand dd').innerText();
  check('cart total 533.50 before delivery', grand.includes('533.50'), grand);
  check('packaging line shown', await page.getByText('אריזה למארזים').isVisible());
  // edit first mug caption
  await lines.first().getByRole('link', { name: 'עריכה' }).click();
  await page.getByLabel(/^כיתוב/).waitFor();
  check('edit loads saved caption', (await page.getByLabel(/^כיתוב/).inputValue()) === 'לאמא הכי טובה בעולם');
  check('edit keeps replaced photo (1 thumb)', (await page.locator('.thumbs img').count()) === 1);
  await page.getByLabel(/^כיתוב/).fill('לסבתא באהבה');
  await page.getByRole('button', { name: 'שמירת השינויים' }).click();
  await page.waitForURL('**/cart');
  await page.reload();
  check('edit saved + survives reload', await page.getByText('כיתוב: לסבתא באהבה').isVisible());
  check('cart no h-scroll', await noHScroll());
  await page.getByText(/שליח עד הבית/).click();
  check('courier adds 40', (await page.locator('.totals .grand dd').innerText()).includes('573.50'));
  await shot('cart.png');

  // --- checkout
  await page.getByRole('link', { name: 'להמשך ההזמנה' }).click();
  await page.getByRole('button', { name: /^לתשלום/ }).click();
  check('checkout validation', await page.getByText('יש למלא שם מלא').isVisible() && await page.getByText('יש למלא עיר').isVisible());
  await page.getByLabel('שם מלא *').fill('דנה בדיקה');
  await page.getByLabel('טלפון *').fill('050-1234567');
  await page.getByLabel(/^מייל/).fill('test@example.com');
  await page.getByLabel('עיר *').fill('חיפה');
  await page.getByLabel('רחוב ומספר בית *').fill('הרצל 1');
  await page.getByText(/אני מאשר\/ת/).click();
  await page.getByRole('button', { name: /^לתשלום/ }).click();
  await page.getByText(/מצב הדגמה/).waitFor({ timeout: 5000 }).catch(() => {});
  const demo = await page.getByText(/מצב הדגמה/).innerText().catch(() => '');
  check('server re-priced 573.50 (demo)', demo.includes('573.50'), demo);
  check('checkout no h-scroll', await noHScroll());
  await shot('checkout.png');

  // --- server rejects tampered/over-stock cart
  const r = await page.evaluate(async () => {
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ lineId: 'x', kind: 'product', productId: '8ec58f4e-48b9-4a06-9694-70fadb64c99f', qty: 50,
        custom: { option: null, values: {}, images: { photos: [{ name: 'a', width: 1, height: 1, thumb: '' }] }, sendLater: false, note: '' } }],
        delivery: 'pickup', customer: { name: 'דנה', phone: '0501234567', email: 'a@example.com' }, agreed: true }) });
    return { status: res.status, body: await res.json() };
  });
  check('server blocks over-stock', r.status === 422 && JSON.stringify(r.body).includes('יש במלאי 6'));

  check('no page JS errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  await browser.close();
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });

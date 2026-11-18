// בדיקות העלאה לשרת מול Supabase מדומה (tests/e2e/fake-supabase.mjs). לא נוגע בשום שירות אמיתי.
// הרצה:
//   node tests/e2e/fake-supabase.mjs 54329 &
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54329 npm run build
//   SUPABASE_SERVICE_ROLE_KEY=test-service-key CRON_SECRET=testcron npx next start -p 3101 &
//   node tests/e2e/uploads.cjs http://localhost:3101 http://localhost:54329
// רשות: HEIC=<קובץ heic> לבדיקת אייפון, ו־CAP=12 כשהשרת הופעל עם UPLOADS_PER_DAY=12
const { chromium } = require('playwright');
const { makeFixtures } = require('./fixtures.cjs');
const BASE = process.argv[2] || 'http://localhost:3101';
const FAKE = process.argv[3] || 'http://localhost:54329';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const state = async () => (await fetch(FAKE + '/__state')).json();

(async () => {
  const browser = await chromium.launch();
  const S = await makeFixtures(browser);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const settled = async () => { await page.locator('.thumbs li').first().waitFor(); await page.waitForFunction(() => !document.querySelector('.thumbs li.is-uploading'), null, { timeout: 15000 }); };
  const api = (path, init) => page.evaluate(async ([path, init]) => {
    const r = await fetch(path, init); let body = null; try { body = await r.json(); } catch {}
    return { status: r.status, body };
  }, [path, init]);

  // --- 1. העלאה מוצלחת: מקור + גרסת תצוגה, אימות בשרת
  await page.goto(BASE + '/products/wood-photo-stand');
  await page.getByText('יש לי זכות להשתמש בתמונות').click();
  await page.locator('.upload-btn input').setInputFiles(S + '/big.jpg');
  await settled();
  let st = await state();
  const u1 = st.uploads[0];
  check('upload row created (temp, verified)', st.uploads.length === 1 && u1.status === 'temp' && !!u1.verified_at, JSON.stringify(u1));
  check('random file name, no customer name in path', /^temp\/\d{4}-\d{2}\/[0-9a-f-]{36}\.jpg$/.test(u1.storage_path), u1.storage_path);
  check('original + preview stored', st.objects.includes(`customer-uploads/${u1.storage_path}`) && st.objects.includes(`customer-uploads/${u1.preview_path}`), st.objects.join());
  check('rights recorded, ip not stored raw', u1.rights_confirmed === true && /^[0-9a-f]{32}$/.test(u1.client_hash));
  check('thumb shows no error', !(await page.locator('.thumbs li.is-failed').count()));

  // --- 2. כשל רשת בהעלאה ← הודעה + ניסיון חוזר
  await page.getByRole('button', { name: 'הסרה' }).click();
  let failOnce = true;
  await page.route(FAKE + '/storage/v1/object/upload/sign/**', (route) => {
    if (failOnce && route.request().method() === 'PUT') { failOnce = false; return route.abort('connectionreset'); }
    return route.continue();
  });
  await page.locator('.upload-btn input').setInputFiles(S + '/big2.jpg');
  await settled();
  check('failed upload marked', await page.locator('.thumbs li.is-failed').isVisible());
  check('failure message in hebrew', await page.getByText(/ההעלאה נקטעה/).isVisible());
  await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();
  check('add-to-cart blocked while failed', await page.getByText(/העלאת תמונה נכשלה/).isVisible());
  await page.getByRole('button', { name: 'ניסיון חוזר' }).click();
  await settled();
  check('retry succeeds', !(await page.locator('.thumbs li.is-failed').count()));
  await page.unroute(FAKE + '/storage/v1/object/upload/sign/**');
  await page.getByRole('button', { name: /^הוספה לסל ·/ }).click();
  check('added to cart', await page.getByText('נוסף לסל.').isVisible());
  const cartRef = await page.evaluate(() => JSON.parse(localStorage.getItem('gifts-cart-v1')).lines[0].custom.images.photos[0]);
  check('cart keeps uploadId (not the file)', /^[0-9a-f-]{36}$/.test(cartRef.uploadId || '') && !cartRef.state, JSON.stringify({ ...cartRef, thumb: cartRef.thumb ? '…' : '' }));

  // --- 2א. HEIC (אייפון): Chromium לא מפענח HEIC, ולכן נבדקת ההמרה בדפדפן. קובץ לבדיקה: HEIC=<path> (רשות)
  if (process.env.HEIC) {
    await page.goto(BASE + '/products/photo-fan');
    await page.locator('.upload-btn input').setInputFiles(process.env.HEIC);
    await settled();
    const heicThumb = await page.locator('.thumbs img').first().getAttribute('src').catch(() => null);
    st = await state();
    const h = st.uploads.find((u) => /^image\/hei[cf]$/.test(u.mime_type));
    check('HEIC: preview converted in browser', !!heicThumb && heicThumb.startsWith('data:image/jpeg'));
    check('HEIC: original uploaded as-is + jpeg preview, verified', !!h && !!h.verified_at && /\.hei[cf]$/.test(h.storage_path)
      && st.objects.includes(`customer-uploads/${h.preview_path}`), JSON.stringify(h));
    check('HEIC: real dimensions read', h && h.width_px === 1800 && h.height_px === 1200);
    await page.goto(BASE + '/products/wood-photo-stand');
  }

  // --- 3. קופה מקבלת תמונות מאומתות
  const customer = { name: 'דנה בדיקה', phone: '0501234567', email: 'test@example.com' };
  const cartLines = await page.evaluate(() => JSON.parse(localStorage.getItem('gifts-cart-v1')).lines);
  const checkout = (lines) => api('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines, delivery: 'pickup', customer, agreed: true }) });
  let r = await checkout(cartLines);
  check('checkout ok with verified uploads', r.status === 200 && r.body.status === 'demo', JSON.stringify(r.body).slice(0, 200));

  // --- 4. תמונה בלי uploadId / מזהה מזויף ← נחסם
  const withRef = (ref) => [{ ...cartLines[0], custom: { ...cartLines[0].custom, images: { photos: [ref] } } }];
  r = await checkout(withRef({ name: 'a.jpg', width: 1, height: 1, thumb: '' }));
  check('checkout blocks image without upload', r.status === 422 && JSON.stringify(r.body).includes('לא הועלו'));
  r = await checkout(withRef({ name: 'a.jpg', width: 1, height: 1, thumb: '', uploadId: '11111111-1111-4111-8111-111111111111' }));
  check('checkout blocks unknown uploadId', r.status === 422);

  // --- 5. השרת בודק תוכן ולא סיומת: טקסט שהוצהר כ־JPEG נמחק
  const fake = await api('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: 'image/jpeg', size: 20, name: 'x.jpg', width: 10, height: 10, rights: true }) });
  await page.evaluate(async (url) => { await fetch(url, { method: 'PUT', body: 'this is not an image', headers: { 'content-type': 'image/jpeg' } }); }, fake.body.uploadUrl);
  r = await api(`/api/uploads/${fake.body.uploadId}/complete`, { method: 'POST' });
  st = await state();
  const bad = st.uploads.find((u) => u.id === fake.body.uploadId);
  check('non-image content rejected', r.status === 400 && r.body.error.includes('אינו תמונה'), JSON.stringify(r.body));
  check('rejected file deleted', bad.status === 'deleted' && bad.deleted_reason === 'invalid_file' && !st.objects.some((o) => o.includes(fake.body.uploadId)));
  r = await checkout(withRef({ name: 'x.jpg', width: 1, height: 1, thumb: '', uploadId: fake.body.uploadId }));
  check('checkout blocks deleted upload', r.status === 422);

  // --- 5א. גרסת תצוגה שאינה JPEG נמחקת, המקור נשאר
  const pv = await api('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: 'image/jpeg', size: 100, name: 'p.jpg', width: 10, height: 10, rights: true }) });
  const jpegBytes = require('node:fs').readFileSync(S + '/small.jpg').toString('base64');
  await page.evaluate(async ([u, p, b64]) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await fetch(u, { method: 'PUT', body: bin, headers: { 'content-type': 'image/jpeg' } });
    await fetch(p, { method: 'PUT', body: '<svg onload=alert(1)>', headers: { 'content-type': 'image/jpeg' } });
  }, [pv.body.uploadUrl, pv.body.previewUrl, jpegBytes]);
  r = await api(`/api/uploads/${pv.body.uploadId}/complete`, { method: 'POST' });
  st = await state();
  const pvRow = st.uploads.find((u) => u.id === pv.body.uploadId);
  check('bad preview dropped, original kept', r.status === 200 && pvRow.verified_at && pvRow.preview_path === null
    && st.objects.some((o) => o.endsWith(pvRow.storage_path)) && !st.objects.some((o) => o.includes(pv.body.uploadId + '-preview')));

  // --- 6. בקשות לא תקינות
  r = await api('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: 'image/jpeg', size: 100, name: 'a.jpg', rights: false }) });
  check('server requires rights consent', r.status === 400);
  r = await api('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: 'application/pdf', size: 100, name: 'a.pdf', rights: true }) });
  check('server rejects pdf mime', r.status === 400);
  r = await api('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mime: 'image/jpeg', size: 30 * 1024 * 1024, name: 'a.jpg', rights: true }) });
  check('server rejects >25MB', r.status === 400);
  r = await api('/api/uploads/not-a-uuid/complete', { method: 'POST' });
  check('complete rejects bad id', r.status === 404);

  // --- 7. ניקוי תמונות זמניות
  r = await api('/api/cron/cleanup-uploads', {});
  check('cleanup needs secret', r.status === 401);
  r = await api('/api/cron/cleanup-uploads', { headers: { authorization: 'Bearer wrong' } });
  check('cleanup rejects wrong secret', r.status === 401);
  r = await api('/api/cron/cleanup-uploads', { headers: { authorization: 'Bearer testcron' } });
  check('cleanup keeps fresh uploads', r.status === 200 && r.body.deleted === 0, JSON.stringify(r.body));
  await fetch(FAKE + '/__age?hours=49', { method: 'POST' });
  r = await api('/api/cron/cleanup-uploads', { headers: { authorization: 'Bearer testcron' } });
  st = await state();
  check('cleanup deletes uploads older than 48h', r.body.deleted >= 2 && st.objects.length === 0 && st.uploads.every((u) => u.status === 'deleted'), JSON.stringify(r.body));
  r = await checkout(cartLines);
  check('checkout blocks expired upload', r.status === 422 && JSON.stringify(r.body).includes('פג תוקפן'));

  // --- 8. תקרה יומית (השרת הופעל עם UPLOADS_PER_DAY נמוך; CAP=<אותו מספר>)
  if (process.env.CAP) {
    let capped = null;
    for (let i = 0; i < Number(process.env.CAP) + 2 && !capped; i++) {
      const x = await api('/api/uploads', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mime: 'image/jpeg', size: 100, name: 'c.jpg', rights: true }) });
      if (x.status !== 200) capped = x;
    }
    check('daily cap stops uploads with a clear message', capped && capped.status === 503 && capped.body.error.includes('אחרי התשלום'), JSON.stringify(capped));
  }

  check('no page JS errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  console.log(`${results.filter((x) => x.startsWith('PASS')).length}/${results.length} passed`);
  await browser.close();
  if (results.some((x) => x.startsWith('FAIL'))) process.exitCode = 1;
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });

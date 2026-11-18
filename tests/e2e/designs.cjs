// מארז "מדביקים חיוכים": 10 דפים בעד 5 עיצובים. מצב פיתוח, ברוחב טלפון. שמות מומצאים.
// הרצה: npm run build && npx next start -p 3100, ואז: node tests/e2e/designs.cjs [base-url] [screenshot]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100';
const SHOT = process.argv[3] || null;
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const heads = () => page.locator('.bundle-item-head > span:first-child').allInnerTexts();
  const counts = async () => (await heads()).map((t) => { const m = t.match(/(\d+) יחידות/); return m ? +m[1] : 1; });
  const addBtn = page.getByRole('button', { name: /עיצוב נוסף/ });
  const fillName = async (name) => {
    const body = page.locator('.bundle-item-body');
    await body.getByText('שם וצורות').click();
    await body.getByLabel(/^שם 1/).fill(name);
  };

  await page.goto(BASE + '/bundles/sticker-smiles');
  check('one design covering 10 sheets', JSON.stringify(await counts()) === '[10]', JSON.stringify(await heads()));
  check('note explains up to 5 designs', await page.getByText(/בעד 5 עיצובים שונים/).first().isVisible());
  await fillName('דנה'); // the first design is open by default
  await addBtn.click();
  check('add design takes one sheet', JSON.stringify(await counts()) === '[9,1]');
  await fillName('יואב');
  await page.getByRole('button', { name: 'יותר' }).click();
  await page.getByRole('button', { name: 'יותר' }).click();
  check('stepper moves sheets, total stays 10', JSON.stringify(await counts()) === '[7,3]');
  for (const n of ['נועה', 'עמית', 'שירה']) { await addBtn.click(); await fillName(n); }
  check('five designs, new ones take from the largest', JSON.stringify(await counts()) === '[4,3,1,1,1]', JSON.stringify(await counts()));
  check('sixth design blocked', await addBtn.isDisabled());
  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });

  // remove design 2 (יואב, 3 sheets) -> goes back to design 1
  await page.locator('.bundle-item-head').nth(1).click();
  await page.getByRole('button', { name: /הסרת העיצוב/ }).click();
  check('removed design returns its sheets', JSON.stringify(await counts()) === '[7,1,1,1]', JSON.stringify(await counts()));
  check('add enabled again', await addBtn.isEnabled());

  await page.getByRole('button', { name: 'הוספת המארז לסל' }).click();
  check('added to cart', await page.getByText('המארז נוסף לסל').isVisible());
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  const names = ['דנה', 'נועה', 'עמית', 'שירה'].map((n) => (stored.match(new RegExp(n, 'g')) || []).length);
  check('cart keeps all 10 sheets', names.reduce((a, b) => a + b) === 10, JSON.stringify(names));

  await page.goto(BASE + '/cart');
  check('cart total 120 (110 + packaging)', (await page.locator('.totals').innerText()).includes('120'));
  check('cart groups identical sheets', (await page.locator('.cart-children > li').count()) === 4 && (await page.locator('.cart-children').innerText()).includes('× 7'));
  await page.getByRole('link', { name: 'עריכת המארז' }).first().click();
  await page.waitForURL(/edit=/);
  await page.waitForTimeout(300);
  check('edit restores the 4 designs', (await counts()).length === 4 && (await counts()).reduce((a, b) => a + b) === 10, JSON.stringify(await counts()));
  check('no page errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  console.log(results.every((r) => r.startsWith('PASS')) ? 'ALL PASS' : 'SOME FAILED');
  await browser.close();
})();

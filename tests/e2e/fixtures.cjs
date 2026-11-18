// יוצר תמונות בדיקה מומצאות (צבעים בלבד) בתיקייה זמנית, בעזרת הדפדפן. אין כאן תמונות אמיתיות.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

async function makeFixtures(browser) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gifts-e2e-'));
  const page = await browser.newPage();
  const jpg = async (w, h, color) => Buffer.from(await page.evaluate(async ([w, h, color]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(w / 4, h / 4, w / 2, h / 2);
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s);
  }, [w, h, color]), 'base64');
  fs.writeFileSync(path.join(dir, 'big.jpg'), await jpg(2000, 1500, '#c2185b'));
  fs.writeFileSync(path.join(dir, 'big2.jpg'), await jpg(1600, 2000, '#1976d2'));
  fs.writeFileSync(path.join(dir, 'small.jpg'), await jpg(600, 400, '#388e3c'));
  fs.writeFileSync(path.join(dir, 'doc.pdf'), '%PDF-1.4\n% test file, not an image\n');
  await page.close();
  return dir;
}
module.exports = { makeFixtures };

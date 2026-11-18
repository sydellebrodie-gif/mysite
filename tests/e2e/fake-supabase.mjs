// שרת Supabase מדומה לבדיקות מקומיות בלבד: רק הקריאות שהאתר משתמש בהן (טבלת uploads, shop_settings, אחסון).
// לא מתחבר לשום שירות אמיתי. נתונים בזיכרון. הפעלה: node tests/e2e/fake-supabase.mjs <port>
import http from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.argv[2] ?? 54329);
const KEY = "test-service-key";
const tables = { uploads: [], shop_settings: [{ id: true, temp_upload_hours: 48 }] };
const objects = new Map(); // "bucket/path" -> Buffer
const tokens = new Map();  // token -> "bucket/path"
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "content-range",
};

function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "limit", "order"].includes(k)) continue;
    const [op, ...rest] = v.split(".");
    const val = rest.join(".");
    out = out.filter((r) => {
      const x = r[k];
      if (op === "eq") return String(x) === val;
      if (op === "gte") return String(x) >= val;
      if (op === "lt") return String(x) < val;
      if (op === "in") return val.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, "")).includes(String(x));
      throw new Error(`unsupported filter ${k}=${v}`);
    });
  }
  if (params.get("limit")) out = out.slice(0, Number(params.get("limit")));
  return out;
}

const pick = (r, sel) => (!sel || sel === "*" ? r : Object.fromEntries(sel.split(",").map((c) => [c, r[c] ?? null])));
const body = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
const json = (res, status, data, extra = {}) => { res.writeHead(status, { ...cors, "content-type": "application/json", ...extra }); res.end(data === undefined ? "" : JSON.stringify(data)); };
const authed = (req) => req.headers.authorization === `Bearer ${KEY}` || req.headers.apikey === KEY;

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }

    // בקרה לבדיקות
    if (p === "/__state") return json(res, 200, { uploads: tables.uploads, objects: [...objects.keys()] });
    if (p === "/__age" && req.method === "POST") { // מזקין את כל ההעלאות ב־N שעות
      const h = Number(url.searchParams.get("hours") ?? 49);
      for (const r of tables.uploads) r.created_at = new Date(Date.parse(r.created_at) - h * 3600_000).toISOString();
      return json(res, 200, { ok: true });
    }

    // העלאה עם קישור חתום (בלי מפתח, רק token)
    let m = p.match(/^\/storage\/v1\/object\/upload\/sign\/(.+)$/);
    if (m && req.method === "PUT") {
      const key = tokens.get(url.searchParams.get("token"));
      if (key !== m[1]) return json(res, 400, { error: "invalid token" });
      if (objects.has(key)) return json(res, 400, { error: "Duplicate" });
      tokens.delete(url.searchParams.get("token"));
      objects.set(key, await body(req));
      return json(res, 200, { Key: key });
    }

    if (!authed(req)) return json(res, 401, { message: "no key" });

    if (m && req.method === "POST") {
      const token = randomUUID();
      tokens.set(token, m[1]);
      return json(res, 200, { url: `/object/upload/sign/${m[1]}?token=${token}` });
    }
    m = p.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (m && req.method === "DELETE") {
      const { prefixes } = JSON.parse((await body(req)).toString());
      const gone = prefixes.filter((x) => objects.delete(`${m[1]}/${x}`));
      return json(res, 200, gone.map((name) => ({ name })));
    }
    m = p.match(/^\/storage\/v1\/object\/(.+)$/);
    if (m && req.method === "GET") {
      const buf = objects.get(m[1]);
      if (!buf) return json(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      const r = (req.headers.range ?? "").match(/bytes=(\d+)-(\d+)/);
      const part = r ? buf.subarray(Number(r[1]), Number(r[2]) + 1) : buf;
      res.writeHead(r ? 206 : 200, { ...cors, "content-type": "application/octet-stream" });
      return res.end(part);
    }

    m = p.match(/^\/rest\/v1\/(\w+)$/);
    if (m && tables[m[1]]) {
      const rows = tables[m[1]];
      const sel = url.searchParams.get("select");
      if (req.method === "GET" || req.method === "HEAD") {
        const found = filterRows(rows, url.searchParams);
        const extra = { "content-range": `0-${Math.max(0, found.length - 1)}/${found.length}` };
        if (req.method === "HEAD") { res.writeHead(200, { ...cors, ...extra }); return res.end(); }
        return json(res, 200, found.map((r) => pick(r, sel)), extra);
      }
      if (req.method === "POST") {
        const data = JSON.parse((await body(req)).toString());
        for (const row of Array.isArray(data) ? data : [data]) {
          if (m[1] === "uploads") {
            if (!row.rights_confirmed) return json(res, 400, { message: "check rights_confirmed" });
            row.created_at ??= new Date().toISOString();
            row.verified_at ??= null; row.deleted_at ??= null; row.deleted_reason ??= null;
          }
          rows.push(row);
        }
        return json(res, 201, undefined);
      }
      if (req.method === "PATCH") {
        const data = JSON.parse((await body(req)).toString());
        for (const r of filterRows(rows, url.searchParams)) Object.assign(r, data);
        return json(res, 204, undefined);
      }
    }
    json(res, 404, { message: `fake: no route ${req.method} ${p}` });
  } catch (e) {
    json(res, 500, { message: String(e) });
  }
}).listen(port, () => console.log(`fake supabase on ${port}`));

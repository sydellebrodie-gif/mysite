// שרת Supabase לבדיקות מקומיות בלבד, מעל Postgres מקומי אמיתי (עם הסכמה, האילוצים וה־RLS של הפרויקט).
// מממש רק את מה שהאתר משתמש בו: תת־קבוצה של PostgREST, התחברות עם אימות דו־שלבי (מדומה), ואחסון בזיכרון.
// לא מתחבר לשום שירות חיצוני. משתמשים ונתונים מומצאים בלבד.
// הפעלה: node tests/e2e/pg-supabase.mjs <port> <database>
import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";

const port = Number(process.argv[2] ?? 54330);
const database = process.argv[3] ?? "giftse2e";
export const ANON_KEY = "test-anon-key";
export const SERVICE_KEY = "test-service-key";
export const TOTP_CODE = "123456";
// מתחבר כמשתמש המערכת הנוכחי (peer). צריך תפקיד Postgres באותו שם, עם הרשאת superuser (מסד בדיקה מקומי בלבד)
const pool = new pg.Pool({ host: "/var/run/postgresql", user: process.env.PGUSER ?? (await import("node:os")).userInfo().username, database, max: 8 });

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "content-range,x-supabase-api-version",
};
const readBody = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
const send = (res, status, data, extra = {}) => {
  res.writeHead(status, { ...cors, "content-type": "application/json", ...extra });
  res.end(data === undefined ? "" : JSON.stringify(data));
};

// ---------- JWT (לא חתום: רק לבדיקות) ----------
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const makeJwt = (payload) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(payload)}.test-signature`;
function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); } catch { return null; }
}
/** role + claims לפי הכותרות. מפתח שירות עוקף RLS, מפתח ציבורי הוא anon */
function identity(req) {
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const token = bearer || req.headers.apikey || "";
  if (token === SERVICE_KEY) return { role: "service_role", claims: { role: "service_role" } };
  if (token === ANON_KEY || !token) return { role: "anon", claims: { role: "anon" } };
  const c = decodeJwt(token);
  if (!c || !sessions.has(c.session_id) || c.exp * 1000 < Date.now()) return { role: "anon", claims: { role: "anon" }, invalid: true };
  return { role: "authenticated", claims: c };
}

// ---------- Auth ----------
const users = new Map();     // email -> { id, email, password, factors: [] }
const sessions = new Map();  // session_id -> { userId, aal, refresh }
const refreshTokens = new Map(); // refresh -> session_id
for (const spec of (process.env.TEST_USERS ?? "").split(";").filter(Boolean)) {
  const [email, password, id] = spec.split(",");
  users.set(email, { id: id ?? randomUUID(), email, password, factors: [] });
}
const userById = (id) => [...users.values()].find((u) => u.id === id);
const publicUser = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {},
  created_at: "2026-11-01T00:00:00Z", factors: u.factors.map((f) => ({ ...f })),
});
function issue(u, aal, sessionId = randomUUID()) {
  const refresh = randomUUID();
  sessions.set(sessionId, { userId: u.id, aal, refresh });
  refreshTokens.set(refresh, sessionId);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const amr = [{ method: "password", timestamp: exp - 3600 }, ...(aal === "aal2" ? [{ method: "totp", timestamp: exp - 3600 }] : [])];
  const access = makeJwt({ sub: u.id, role: "authenticated", aud: "authenticated", email: u.email, aal, amr, session_id: sessionId, exp });
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(u) };
}
const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, message: msg });

async function auth(req, res, url) {
  const path = url.pathname.replace("/auth/v1", "");
  const raw = await readBody(req);
  const b = raw.length ? JSON.parse(raw.toString()) : {};
  const id = identity(req);
  const me = id.role === "authenticated" ? userById(id.claims.sub) : null;
  if (path === "/token" && url.searchParams.get("grant_type") === "password") {
    const u = users.get(b.email);
    if (!u || u.password !== b.password) return authErr(res, 400, "invalid_credentials", "Invalid login credentials");
    return send(res, 200, issue(u, "aal1"));
  }
  if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const sid = refreshTokens.get(b.refresh_token);
    if (!sid) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token");
    refreshTokens.delete(b.refresh_token);
    const s = sessions.get(sid);
    return send(res, 200, issue(userById(s.userId), s.aal, sid));
  }
  if (!me) return authErr(res, 401, "bad_jwt", "invalid JWT");
  if (path === "/user" && req.method === "GET") return send(res, 200, publicUser(me));
  if (path === "/logout") { sessions.delete(id.claims.session_id); res.writeHead(204, cors); return res.end(); }
  if (path === "/factors" && req.method === "POST") {
    const f = { id: randomUUID(), factor_type: "totp", friendly_name: b.friendly_name ?? "", status: "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    me.factors.push(f);
    return send(res, 200, { id: f.id, type: "totp", friendly_name: f.friendly_name,
      totp: { qr_code: "<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret: "TESTSECRETBASE32", uri: "otpauth://totp/test" } });
  }
  const m = path.match(/^\/factors\/([^/]+)(\/challenge|\/verify)?$/);
  if (m) {
    const f = me.factors.find((x) => x.id === m[1]);
    if (!f) return authErr(res, 404, "mfa_factor_not_found", "Factor not found");
    if (m[2] === "/challenge") return send(res, 200, { id: randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (m[2] === "/verify") {
      if (b.code !== TOTP_CODE) return authErr(res, 422, "mfa_verification_failed", "Invalid TOTP code entered");
      f.status = "verified";
      sessions.delete(id.claims.session_id);
      return send(res, 200, issue(me, "aal2", id.claims.session_id));
    }
    if (req.method === "DELETE") { me.factors = me.factors.filter((x) => x !== f); return send(res, 200, { id: f.id }); }
  }
  return authErr(res, 404, "not_found", `unsupported auth path ${path}`);
}

// ---------- PostgREST (תת־קבוצה) ----------
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400 });
  return `"${s}"`;
};
function parseValue(op, val, params) {
  if (op === "in") {
    const items = val.replace(/^\(|\)$/g, "").match(/("([^"]|\\")*"|[^,]+)/g) ?? [];
    return items.map((s) => s.replace(/^"|"$/g, ""));
  }
  params.push(val);
  return `$${params.length}`;
}
const OPS = { eq: "=", neq: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=", like: "like", ilike: "ilike" };
function where(search, params) {
  const conds = [];
  for (const [k, v] of search) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or") {
      const parts = v.replace(/^\(|\)$/g, "").split(",").map((p) => {
        const [col, op, ...rest] = p.split(".");
        params.push(rest.join(".").replace(/\*/g, "%"));
        return `${ident(col)}::text ${OPS[op]} $${params.length}`;
      });
      conds.push(`(${parts.join(" or ")})`);
      continue;
    }
    let [op, ...rest] = v.split(".");
    let not = false;
    if (op === "not") { not = true; op = rest.shift(); }
    const val = rest.join(".");
    let c;
    if (op === "is") c = `${ident(k)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
    else if (op === "in") {
      const items = parseValue("in", val, params);
      if (!items.length) c = "false";
      else c = `${ident(k)}::text in (${items.map((x) => { params.push(x); return `$${params.length}`; }).join(",")})`;
    } else if (OPS[op]) {
      params.push(op.endsWith("like") ? val.replace(/\*/g, "%") : val);
      c = `${ident(k)}::text ${OPS[op]} $${params.length}::text`;
      if (["lt", "lte", "gt", "gte"].includes(op)) c = `${ident(k)} ${OPS[op]} $${params.length}`;
    } else throw Object.assign(new Error(`unsupported filter ${k}=${v}`), { status: 400 });
    conds.push(not ? `not (${c})` : c);
  }
  return conds.length ? ` where ${conds.join(" and ")}` : "";
}
function selectList(sel) {
  if (!sel || sel === "*") return "*";
  return sel.split(",").map((c) => c.trim()).filter(Boolean).map((c) => {
    if (c.includes("(")) throw Object.assign(new Error(`embedded selects are not supported by the test server: ${c}`), { status: 400 });
    const [alias, col] = c.includes(":") ? c.split(":") : [null, c];
    return alias ? `${ident(col)} as ${ident(alias)}` : ident(col);
  }).join(",");
}
function orderBy(order) {
  if (!order) return "";
  return " order by " + order.split(",").map((o) => {
    const [col, dir, nulls] = o.split(".");
    return `${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
  }).join(",");
}

async function rest(req, res, url) {
  const id = identity(req);
  if (id.invalid) return send(res, 401, { code: "PGRST301", message: "JWT expired or invalid" });
  const table = url.pathname.replace("/rest/v1/", "");
  const prefer = req.headers.prefer ?? "";
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const s = url.searchParams;
  const params = [];
  const raw = await readBody(req);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${id.role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(id.claims)]);
    let sql;
    const returning = prefer.includes("return=representation") ? ` returning ${selectList(s.get("select"))}` : "";
    if (table.startsWith("rpc/")) {
      const body = raw.length ? JSON.parse(raw.toString()) : {};
      const names = Object.keys(body);
      names.forEach((n) => params.push(body[n]));
      sql = `select * from public.${ident(table.slice(4))}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(",")})`;
    } else if (req.method === "GET" || req.method === "HEAD") {
      sql = `select ${selectList(s.get("select"))} from public.${ident(table)}${where(s, params)}${orderBy(s.get("order"))}`;
      if (s.get("limit")) sql += ` limit ${Number(s.get("limit"))}`;
      if (s.get("offset")) sql += ` offset ${Number(s.get("offset"))}`;
    } else if (req.method === "POST") {
      let rows = JSON.parse(raw.toString());
      if (!Array.isArray(rows)) rows = [rows];
      const cols = s.get("columns") ? s.get("columns").replace(/"/g, "").split(",") : [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const values = rows.map((r) => `(${cols.map((c) => {
        if (!(c in r)) return "default";
        const v = r[c];
        params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
        return `$${params.length}`;
      }).join(",")})`).join(",");
      sql = `insert into public.${ident(table)} (${cols.map(ident).join(",")}) values ${values}`;
      if (prefer.includes("resolution=merge-duplicates")) {
        const conflict = (s.get("on_conflict") ?? "id").split(",");
        const upd = cols.filter((c) => !conflict.includes(c));
        sql += ` on conflict (${conflict.map(ident).join(",")}) do ${upd.length ? `update set ${upd.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(",")}` : "nothing"}`;
      } else if (prefer.includes("resolution=ignore-duplicates")) sql += " on conflict do nothing";
      sql += returning;
    } else if (req.method === "PATCH") {
      const body = JSON.parse(raw.toString());
      const sets = Object.entries(body).map(([k, v]) => {
        params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
        return `${ident(k)} = $${params.length}`;
      });
      sql = `update public.${ident(table)} set ${sets.join(",")}${where(s, params)}${returning}`;
    } else if (req.method === "DELETE") {
      sql = `delete from public.${ident(table)}${where(s, params)}${returning}`;
    } else throw Object.assign(new Error("method"), { status: 405 });

    const r = await client.query(sql, params);
    await client.query("commit");
    const rows = r.rows ?? [];
    const extra = {};
    if (prefer.includes("count=exact")) extra["content-range"] = `0-${Math.max(0, rows.length - 1)}/${req.method === "GET" || req.method === "HEAD" ? rows.length : r.rowCount}`;
    if (req.method === "HEAD") { res.writeHead(200, { ...cors, ...extra }); return res.end(); }
    if (single) {
      if (rows.length !== 1) return send(res, 406, { code: "PGRST116", message: `JSON object requested, multiple (or no) rows returned`, details: `The result contains ${rows.length} rows` });
      return send(res, 200, rows[0], extra);
    }
    if (req.method !== "GET" && !returning && !table.startsWith("rpc/")) { res.writeHead(prefer.includes("count=exact") ? 204 : 201, { ...cors, ...extra }); return res.end(); }
    return send(res, 200, rows, extra);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    const status = e.status ?? (e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400);
    return send(res, status, { code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  } finally {
    client.release();
  }
}

// ---------- Storage (בזיכרון) ----------
const objects = new Map(); // "bucket/path" -> { data, type }
const signed = new Map();  // token -> { key, download, exp }
const uploadTokens = new Map();
const PUBLIC_BUCKETS = new Set(["product-images"]);
async function isAdmin(id) {
  if (id.role === "service_role") return true;
  if (id.role !== "authenticated" || id.claims.aal !== "aal2") return false;
  const r = await pool.query("select 1 from public.admins where user_id = $1", [id.claims.sub]);
  return r.rowCount === 1;
}
/** storage-js שולח Blob כ־multipart/form-data. מחלצים את חלק הקובץ */
function fileFromBody(req, buf) {
  const ct = req.headers["content-type"] ?? "";
  const m = ct.match(/^multipart\/form-data;\s*boundary=(.+)$/);
  if (!m) return { data: buf, type: ct || "application/octet-stream" };
  const boundary = Buffer.from(`--${m[1]}`);
  let at = 0;
  while ((at = buf.indexOf(boundary, at)) !== -1) {
    const headEnd = buf.indexOf("\r\n\r\n", at);
    if (headEnd === -1) break;
    const head = buf.subarray(at, headEnd).toString();
    const next = buf.indexOf(boundary, headEnd);
    const type = head.match(/content-type:\s*([^\r\n]+)/i)?.[1];
    if (type && next !== -1) return { data: buf.subarray(headEnd + 4, next - 2), type };
    at = headEnd;
  }
  return { data: buf, type: "application/octet-stream" };
}

async function storage(req, res, url) {
  const id = identity(req);
  const p = decodeURIComponent(url.pathname.replace("/storage/v1", ""));
  let m;
  if ((m = p.match(/^\/object\/public\/([^/]+)\/(.+)$/)) && req.method === "GET") {
    const o = PUBLIC_BUCKETS.has(m[1]) && objects.get(`${m[1]}/${m[2]}`);
    if (!o) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { ...cors, "content-type": o.type }); return res.end(o.data);
  }
  if ((m = p.match(/^\/object\/sign\/([^/]+)$/)) && req.method === "POST") {
    if (!(await isAdmin(id))) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "not allowed" });
    const b = JSON.parse((await readBody(req)).toString() || "{}");
    return send(res, 200, (b.paths ?? []).map((path) => {
      if (!objects.has(`${m[1]}/${path}`)) return { path, error: "Either the object does not exist or you do not have access to it", signedURL: null };
      const token = randomUUID();
      signed.set(token, { key: `${m[1]}/${path}`, exp: Date.now() + (b.expiresIn ?? 60) * 1000 });
      return { path, error: null, signedURL: `/object/sign/${m[1]}/${encodeURIComponent(path)}?token=${token}` };
    }));
  }
  if ((m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/))) {
    if (req.method === "POST") {
      if (!(await isAdmin(id))) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      const b = JSON.parse((await readBody(req)).toString() || "{}");
      if (!objects.has(`${m[1]}/${m[2]}`)) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      const token = randomUUID();
      signed.set(token, { key: `${m[1]}/${m[2]}`, exp: Date.now() + (b.expiresIn ?? 60) * 1000 });
      return send(res, 200, { signedURL: `/object/sign/${m[1]}/${encodeURIComponent(m[2])}?token=${token}` });
    }
    const t = signed.get(url.searchParams.get("token") ?? "");
    const o = t && t.exp > Date.now() && objects.get(t.key);
    if (!o) return send(res, 400, { statusCode: "400", error: "InvalidJWT", message: "invalid signature" });
    const headers = { ...cors, "content-type": o.type };
    const dl = url.searchParams.get("download");
    if (dl !== null) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(dl)}`;
    res.writeHead(200, headers); return res.end(o.data);
  }
  if ((m = p.match(/^\/object\/upload\/sign\/([^/]+)\/(.+)$/))) {
    if (req.method === "POST") {
      if (id.role !== "service_role") return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "service role required" });
      const token = randomUUID();
      uploadTokens.set(token, `${m[1]}/${m[2]}`);
      return send(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=${token}`, token });
    }
    const key = uploadTokens.get(url.searchParams.get("token") ?? "");
    if (!key || objects.has(key)) return send(res, 400, { statusCode: "400", error: "invalid", message: "bad token" });
    uploadTokens.delete(url.searchParams.get("token"));
    objects.set(key, { data: await readBody(req), type: req.headers["content-type"] ?? "application/octet-stream" });
    return send(res, 200, { Key: key });
  }
  if ((m = p.match(/^\/object\/([^/]+)\/(.+)$/)) && (req.method === "POST" || req.method === "PUT")) {
    const bucket = m[1];
    if (!(await isAdmin(id))) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    if (objects.has(`${bucket}/${m[2]}`) && req.headers["x-upsert"] !== "true") return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    objects.set(`${bucket}/${m[2]}`, fileFromBody(req, await readBody(req)));
    return send(res, 200, { Key: `${bucket}/${m[2]}`, Id: randomUUID() });
  }
  if ((m = p.match(/^\/object\/([^/]+)\/(.+)$/)) && req.method === "GET") {
    if (!(await isAdmin(id))) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "not allowed" });
    const o = objects.get(`${m[1]}/${m[2]}`);
    if (!o) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    const range = req.headers.range?.match(/bytes=(\d+)-(\d+)/);
    if (range) {
      const part = o.data.subarray(Number(range[1]), Number(range[2]) + 1);
      res.writeHead(206, { ...cors, "content-type": o.type, "content-range": `bytes ${range[1]}-${range[1] + part.length - 1}/${o.data.length}` });
      return res.end(part);
    }
    res.writeHead(200, { ...cors, "content-type": o.type }); return res.end(o.data);
  }
  if ((m = p.match(/^\/object\/([^/]+)$/)) && req.method === "DELETE") {
    if (!(await isAdmin(id))) return send(res, 400, { statusCode: "403", error: "Unauthorized", message: "not allowed" });
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || "{}");
    const gone = prefixes.filter((x) => objects.delete(`${m[1]}/${x}`));
    return send(res, 200, gone.map((name) => ({ name, bucket_id: m[1] })));
  }
  return send(res, 400, { statusCode: "404", error: "not_found", message: `unsupported storage path ${req.method} ${p}` });
}

// ---------- עזרי בדיקה ----------
async function testHooks(req, res, url) {
  if (url.pathname === "/__objects") return send(res, 200, [...objects.keys()]);
  if (url.pathname === "/__put" && req.method === "POST") {
    objects.set(url.searchParams.get("key"), { data: await readBody(req), type: url.searchParams.get("type") ?? "image/jpeg" });
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__sql" && req.method === "POST") {
    const r = await pool.query((await readBody(req)).toString());
    return send(res, 200, r.rows ?? []);
  }
  return send(res, 404, { error: "unknown hook" });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url);
    if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url);
    if (url.pathname.startsWith("/storage/v1")) return await storage(req, res, url);
    if (url.pathname.startsWith("/__")) return await testHooks(req, res, url);
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e);
    send(res, 500, { message: String(e.message ?? e) });
  }
}).listen(port, () => console.log(`pg-supabase on ${port} (db ${database})`));

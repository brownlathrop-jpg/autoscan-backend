// АвтоСкан — бэкенд v4 (следует редиректам + само-диагностика)
const http = require("http");
const https = require("https");

const GIBDD_HOST = "xn--90adear.xn--p1ai";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": "https://" + GIBDD_HOST,
  "Referer": "https://" + GIBDD_HOST + "/check/auto/",
  "Accept-Language": "ru-RU,ru;q=0.9"
};

function asArray(x) { return Array.isArray(x) ? x : (x && x.records) || []; }

function postJson(urlStr, depth, meta) {
  return new Promise(function (resolve) {
    try {
      const u = new URL(urlStr);
      const req = https.request({ host: u.hostname, path: u.pathname + u.search, method: "POST", headers: Object.assign({}, HEADERS, { "Content-Length": 2 }), timeout: 15000 }, function (res) {
        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location && depth < 3) {
          let next = res.headers.location;
          if (next.charAt(0) === "/") next = u.origin + next;
          meta.last = res.statusCode + " -> " + next;
          res.resume();
          postJson(next, depth + 1, meta).then(resolve);
          return;
        }
        meta.last = "status " + res.statusCode;
        let body = "";
        res.on("data", function (c) { body += c; });
        res.on("end", function () {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch (e) { meta.raw = body.slice(0, 120); }
          resolve({ data: parsed, meta: meta });
        });
      });
      req.on("timeout", function () { req.destroy(); meta.last = "timeout"; resolve({ data: null, meta: meta }); });
      req.on("error", function (e) { meta.last = "err " + e.message; resolve({ data: null, meta: meta }); });
      req.end("{}");
    } catch (e) { meta.last = "err " + e.message; resolve({ data: null, meta: meta }); }
  });
}

function gibdd(path) { return postJson("https://" + GIBDD_HOST + path, 0, {}); }

const cache = new Map();

async function doCheck(vin) {
  const cached = cache.get(vin);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) return cached.data;
  const out = { vin: vin, source: "live", dtp: { count: 0, items: [] }, wanted: false, restrictions: [], pledge: null, mileage: [], owners: 0, taxi: false, osago: { active: false }, utilization: false, warnings: [] };

  const g1 = await gibdd("/proxy/check/auto/" + vin);
  if (g1.data) {
    const g = g1.data;
    const acc = asArray(g.Accidents || g.accidents);
    out.dtp.count = acc.length;
    out.dtp.items = acc.map(function (a) { return { date: a.AccidentDateTime || a.date || "", type: a.AccidentType || a.type || "ДТП", region: a.RegionName || a.region || "" }; });
    const restr = asArray(g.Restrictions || g.restrictions);
    if (restr.length) out.restrictions = restr.map(function (x) { return x.ogrk || "ограничение"; });
    if (g.captcha || g.Captcha) out.warnings.push("ГИБДД запросила капчу — попробуйте позже");
  } else {
    out.warnings.push("ГИБДД (ДТП): " + (g1.meta.last || "нет ответа") + (g1.meta.raw ? " | " + g1.meta.raw : ""));
  }

  const w1 = await gibdd("/proxy/check/auto/" + vin + "/wanted");
  if (w1.data && asArray(w1.data).length) out.wanted = true;

  const r1 = await gibdd("/proxy/check/auto/" + vin + "/restricted");
  if (r1.data) { const list = asArray(r1.data); if (list.length) out.restrictions = list.map(function (x) { return x.ogrk || "ограничение"; }); }

  let score = 100;
  score -= Math.min(36, out.dtp.count * 12);
  if (out.wanted) score -= 40;
  if (out.restrictions.length) score -= 15;
  out.score = Math.max(0, Math.min(100, score));

  cache.set(vin, { time: Date.now(), data: out });
  return out;
}

function json(res, obj, code) {
  res.writeHead(code || 200, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
  res.end(JSON.stringify(obj));
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

const server = http.createServer(function (req, res) {
  let url;
  try { url = new URL(req.url, "http://localhost"); } catch (e) { json(res, { error: "bad url" }, 400); return; }
  if (req.method === "OPTIONS") { json(res, { ok: true }); return; }
  if (url.pathname === "/health") { json(res, { ok: true }); return; }
  if (url.pathname === "/api/check") {
    if (req.method === "GET") {
      const vin = (url.searchParams.get("vin") || "").toUpperCase().trim();
      if (!VIN_RE.test(vin)) { json(res, { error: "bad vin" }, 400); return; }
      doCheck(vin).then(function (d) { json(res, d); });
      return;
    }
    let body = "";
    req.on("data", function (c) { body += c; });
    req.on("end", function () {
      let vin = "";
      try { vin = (JSON.parse(body).vin || "").toUpperCase().trim(); } catch (e) {}
      if (!VIN_RE.test(vin)) { json(res, { error: "bad vin" }, 400); return; }
      doCheck(vin).then(function (d) { json(res, d); });
    });
    return;
  }
  json(res, { error: "not found" }, 404);
});

const port = process.env.PORT || 3100;
server.listen(port, function () { console.log("Autoscan backend v4 listening on " + port); });

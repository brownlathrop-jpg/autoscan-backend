// АвтоСкан — бэкенд v3 (без npm-зависимостей)
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

function gibdd(path) {
  return new Promise(function (resolve) {
    try {
      const req = https.request({ host: GIBDD_HOST, path: path, method: "POST", headers: Object.assign({}, HEADERS, { "Content-Length": 2 }), timeout: 15000 }, function (res) {
        let body = "";
        res.on("data", function (c) { body += c; });
        res.on("end", function () {
          try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
        });
      });
      req.on("timeout", function () { req.destroy(); resolve(null); });
      req.on("error", function () { resolve(null); });
      req.end("{}");
    } catch (e) { resolve(null); }
  });
}

const cache = new Map();

async function doCheck(vin) {
  const cached = cache.get(vin);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) return cached.data;
  const out = { vin: vin, source: "live", dtp: { count: 0, items: [] }, wanted: false, restrictions: [], pledge: null, mileage: [], owners: 0, taxi: false, osago: { active: false }, utilization: false, warnings: [] };

  const g = await gibdd("/proxy/check/auto/" + vin);
  if (g) {
    const acc = asArray(g.Accidents || g.accidents);
    out.dtp.count = acc.length;
    out.dtp.items = acc.map(function (a) { return { date: a.AccidentDateTime || a.date || "", type: a.AccidentType || a.type || "ДТП", region: a.RegionName || a.region || "" }; });
    const restr = asArray(g.Restrictions || g.restrictions);
    if (restr.length) out.restrictions = restr.map(function (x) { return x.ogrk || "ограничение"; });
    if (g.captcha || g.Captcha) out.warnings.push("ГИБДД запросила капчу — попробуйте позже");
  } else out.warnings.push("ГИБДД (ДТП) не ответила");

  const w = await gibdd("/proxy/check/auto/" + vin + "/wanted");
  if (w && asArray(w).length) out.wanted = true;

  const r = await gibdd("/proxy/check/auto/" + vin + "/restricted");
  if (r) { const list = asArray(r); if (list.length) out.restrictions = list.map(function (x) { return x.ogrk || "ограничение"; }); }

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
server.listen(port, function () { console.log("Autoscan backend v3 listening on " + port); });

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
    const restr = asArray(g

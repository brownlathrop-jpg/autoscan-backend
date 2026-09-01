// АвтоСкан — бэкенд v2 (реальные запросы к ГИБДД)
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const GIBDD = "https://xn--90adear.xn--p1ai";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "Origin": GIBDD,
  "Referer": GIBDD + "/check/auto/",
  "Accept-Language": "ru-RU,ru;q=0.9"
};

// кэш на 10 минут, чтобы не дёргать источники по 100 раз
const cache = new Map();

function asArray(x) { return Array.isArray(x) ? x : (x && x.records) || []; }

async function gibdd(path) {
  const r = await axios.post(GIBDD + path, {}, {
    headers: HEADERS, timeout: 15000, validateStatus: () => true
  });
  return r.data;
}

async function doCheck(vin) {
  const cached = cache.get(vin);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) return cached.data;

  const out = {
    vin: vin, source: "live",
    dtp: { count: 0, items: [] },
    wanted: false, restrictions: [], pledge: null,
    mileage: [], owners: 0, taxi: false,
    osago: { active: false }, utilization: false,
    warnings: []
  };

  // 1) Авто + ДТП
  try {
    const g = await gibdd("/proxy/check/auto/" + vin);
    const acc = asArray(g && (g.Accidents || g.accidents));
    out.dtp.count = acc.length;
    out.dtp.items = acc.map(a => ({
      date: a.AccidentDateTime || a.date || "",
      type: a.AccidentType || a.type || "ДТП",
      region: a.RegionName || a.region || ""
    }));
    const restr = asArray(g && (g.Restrictions || g.restrictions));
    if (restr.length) out.restrictions = restr.map(x => x.ogrk || "ограничение");
    if (g && (g.captcha || g.Captcha)) out.warnings.push("ГИБДД запросила капчу — попробуйте позже");
  } catch (e) { out.warnings.push("ГИБДД (ДТП): " + e.message); }

  // 2) Розыск
  try {
    const w = await gibdd("/proxy/check/auto/" + vin + "/wanted");
    if (asArray(w).length) out.wanted = true;
  } catch (e) { out.warnings.push("ГИБДД (розыск): " + e.message); }

  // 3) Ограничения
  try {
    const r = await gibdd("/proxy/check/auto/" + vin + "/restricted");
    const list = asArray(r);
    if (list.length) out.restrictions = list.map(x => x.ogrk || "ограничение");
  } catch (e) { out.warnings.push("ГИБДД (ограничения): " + e.message); }

  // индекс надёжности
  let score = 100;
  score -= Math.min(36, out.dtp.count * 12);
  if (out.wanted) score -= 40;
  if (out.restrictions.length) score -= 15;
  out.score = Math.max(0, Math.min(100, score));

  cache.set(vin, { time: Date.now(), data: out });
  return out;
}

app.get("/health", (req, res) => res.json({ ok: true }));

// удобно смотреть в браузере: /api/check?vin=...
app.get("/api/check", async (req, res) => {
  const vin = String(req.query.vin || "").toUpperCase().trim();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return res.status(400).json({ error: "bad vin" });
  res.json(await doCheck(vin));
});

app.post("/api/check", async (req, res) => {
  const vin = String(req.body.vin || "").toUpperCase().trim();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return res.status(400).json({ error: "bad vin" });
  res.json(await doCheck(vin));
});

const port = process.env.PORT || 3100;
app.listen(port, () => console.log("Autoscan backend v2 listening on " + port));

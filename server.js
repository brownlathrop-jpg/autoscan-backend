const express = require("express");
const cors = require("cors");

const app = express();

// Разрешаем запросы с фронтенда
app.use(cors());
app.use(express.json());

// 1) Проверка живости
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// 2) Основная проверка авто
app.post("/api/check", (req, res) => {
  const vin = (req.body.vin || "").toUpperCase();
  const plate = req.body.plate || "";

  // Пока заглушка — потом подключим реальные источники
  res.json({
    vin: vin || null,
    plate: plate || null,
    source: "live",
    dtp: { count: 0, items: [] },
    wanted: false,
    restrictions: [],
    pledge: null,
    mileage: [],
    owners: 0,
    taxi: false,
    osago: { active: false },
    utilization: false,
    score: 100
  });
});

// ВАЖНО: Railway сам назначает порт через переменную PORT
const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log("АвтоСкан-бэкенд запущен на порту " + port);
});
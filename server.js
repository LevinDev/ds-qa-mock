const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "mocks.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "{}");
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  console.log(`${req.method} ${req.path}`);
  next();
});

// ─── 1. iOS App endpoint ──────────────────────────────────────────────────────
// GET /notifications/:id/app-data
app.get("/notifications/:id/app-data", (req, res) => {
  const { id } = req.params;
  const db = readDB();

  if (!db[id]) {
    return res.status(404).json({
      error: "No mock found",
      notification_id: id,
      hint: "Create a mock via POST /mocks",
    });
  }

  // Log hit
  db[id].hits = db[id].hits || [];
  db[id].hits.unshift({ ts: new Date().toISOString() });
  db[id].hits = db[id].hits.slice(0, 50); // keep last 50
  writeDB(db);

  return res.status(200).json(db[id].response);
});

// ─── 2. List all mocks ────────────────────────────────────────────────────────
// GET /mocks
app.get("/mocks", (req, res) => {
  const db = readDB();
  const mocks = Object.entries(db).map(([id, val]) => ({ notificationId: id, ...val }));
  res.json(mocks);
});

// ─── 3. Create / Update mock ──────────────────────────────────────────────────
// POST /mocks
// Body: { notificationId, label, notifTitle, notifBody, response: {} }
app.post("/mocks", (req, res) => {
  const { notificationId, label, notifTitle, notifBody, response } = req.body;

  if (!notificationId || !response) {
    return res.status(400).json({ error: "notificationId and response are required" });
  }

  const db = readDB();
  db[notificationId] = {
    notificationId,
    label: label || "",
    notifTitle: notifTitle || "QA Test Push",
    notifBody: notifBody || "Tap to open",
    response,
    updatedAt: new Date().toISOString(),
    hits: db[notificationId]?.hits || [],
  };
  writeDB(db);

  res.json({ ok: true, notificationId });
});

// ─── 4. Delete mock ───────────────────────────────────────────────────────────
// DELETE /mocks/:id
app.delete("/mocks/:id", (req, res) => {
  const db = readDB();
  if (!db[req.params.id]) return res.status(404).json({ error: "Not found" });
  delete db[req.params.id];
  writeDB(db);
  res.json({ ok: true, deleted: req.params.id });
});

// ─── 5. Hit log ───────────────────────────────────────────────────────────────
// GET /mocks/:id/hits
app.get("/mocks/:id/hits", (req, res) => {
  const db = readDB();
  if (!db[req.params.id]) return res.status(404).json({ error: "Not found" });
  res.json(db[req.params.id].hits || []);
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", mocks: Object.keys(readDB()).length }));

app.listen(PORT, () => console.log(`DS QA Mock Server running on port ${PORT}`));

const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "ds-qa-mock";
const COLLECTION = "mocks";

let db;
async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(DB_NAME);
  console.log("✅ MongoDB connected");
}

const col = () => db.collection(COLLECTION);

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  console.log(`${req.method} ${req.path}`);
  next();
});

// GET /notifications/:id/app-data  ← iOS app calls this
app.get("/notifications/:id/app-data", async (req, res) => {
  const { id } = req.params;
  const mock = await col().findOne({ notificationId: id });
  if (!mock) {
    return res.status(404).json({ error: "No mock found", notification_id: id, hint: "Create a mock via POST /mocks" });
  }
  await col().updateOne(
    { notificationId: id },
    { $push: { hits: { $each: [{ ts: new Date().toISOString() }], $position: 0, $slice: 50 } } }
  );
  return res.status(200).json(mock.response);
});

// GET /mocks
app.get("/mocks", async (req, res) => {
  const mocks = await col().find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray();
  res.json(mocks);
});

// POST /mocks
app.post("/mocks", async (req, res) => {
  const { notificationId, label, notifTitle, notifBody, response } = req.body;
  if (!notificationId || !response) {
    return res.status(400).json({ error: "notificationId and response are required" });
  }
  await col().updateOne(
    { notificationId },
    {
      $set: { notificationId, label: label || "", notifTitle: notifTitle || "QA Test Push", notifBody: notifBody || "Tap to open", response, updatedAt: new Date().toISOString() },
      $setOnInsert: { hits: [] },
    },
    { upsert: true }
  );
  res.json({ ok: true, notificationId });
});

// DELETE /mocks/:id
app.delete("/mocks/:id", async (req, res) => {
  const result = await col().deleteOne({ notificationId: req.params.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, deleted: req.params.id });
});

// GET /mocks/:id/hits
app.get("/mocks/:id/hits", async (req, res) => {
  const mock = await col().findOne({ notificationId: req.params.id }, { projection: { hits: 1 } });
  if (!mock) return res.status(404).json({ error: "Not found" });
  res.json(mock.hits || []);
});

// GET /
app.get("/", async (req, res) => {
  const count = await col().countDocuments();
  res.json({ status: "ok", mocks: count });
});

connectDB()
  .then(() => app.listen(PORT, () => console.log(`DS QA Mock Server running on port ${PORT}`)))
  .catch((err) => { console.error("MongoDB connection failed:", err); process.exit(1); });

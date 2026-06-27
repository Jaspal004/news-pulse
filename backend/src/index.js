require("dotenv").config();
const express = require("express");
const cors = require("cors");

const clustersRouter = require("./routes/clusters");
const timelineRouter = require("./routes/timeline");
const ingestRouter  = require("./routes/ingest");

const app  = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
}));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/clusters", clustersRouter);
app.use("/timeline", timelineRouter);
app.use("/ingest",   ingestRouter);

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ─── 404 & Error handlers ─────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: "Internal server error", detail: err.message });
});

app.listen(PORT, () => {
  console.log(`News Pulse API running on port ${PORT}`);
});

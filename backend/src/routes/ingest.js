const express       = require("express");
const router        = express.Router();
const { spawn }     = require("child_process");
const { v4: uuidv4} = require("uuid");
const path          = require("path");

/**
 * In-memory job store.
 * For production you'd use Redis or a DB table — this is fine for the assessment.
 * Jobs are pruned when they exceed JOB_TTL_MS age.
 */
const jobs   = new Map();
const JOB_TTL_MS = 10 * 60 * 1000;  // 10 minutes

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.startedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

/**
 * POST /ingest/trigger
 * Kicks off the Python scraper as a subprocess.
 * Returns { jobId } immediately; frontend polls /ingest/status/:jobId.
 */
router.post("/trigger", (req, res) => {
  pruneJobs();

  const jobId = uuidv4();
  const scraperPath = path.resolve(
    process.env.SCRAPER_PATH || path.join(__dirname, "../../../scraper/main.py")
  );
  const pythonBin = process.env.PYTHON_BIN || "python3";

  const job = {
    id:        jobId,
    status:    "running",
    startedAt: Date.now(),
    logs:      [],
    exitCode:  null,
  };
  jobs.set(jobId, job);

  console.log(`[INGEST] Job ${jobId} — spawning: ${pythonBin} ${scraperPath}`);

  const proc = spawn(pythonBin, [scraperPath], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (d) => {
    const line = d.toString().trim();
    job.logs.push(line);
    console.log(`[SCRAPER] ${line}`);
  });

  proc.stderr.on("data", (d) => {
    const line = d.toString().trim();
    job.logs.push(`ERR: ${line}`);
    console.error(`[SCRAPER ERR] ${line}`);
  });

  proc.on("close", (code) => {
    job.exitCode  = code;
    job.status    = code === 0 ? "done" : "error";
    job.finishedAt = Date.now();
    console.log(`[INGEST] Job ${jobId} finished with exit code ${code}`);
  });

  proc.on("error", (err) => {
    job.status = "error";
    job.logs.push(`Process error: ${err.message}`);
    console.error(`[INGEST] Job ${jobId} process error:`, err.message);
  });

  res.status(202).json({ jobId });
});

/**
 * GET /ingest/status/:jobId
 * Returns current job status: running | done | error
 */
router.get("/status/:jobId", (req, res) => {
  const { jobId } = req.params;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(jobId)) {
    return res.status(400).json({ error: "Invalid job ID format" });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found or expired" });
  }

  res.json({
    jobId:      job.id,
    status:     job.status,
    startedAt:  new Date(job.startedAt).toISOString(),
    finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
    exitCode:   job.exitCode,
    logs:       job.logs.slice(-20),   // last 20 log lines
  });
});

module.exports = router;

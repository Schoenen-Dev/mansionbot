const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

let botProcess = null;
let logs = [];
const MAX_LOGS = 500;

function addLog(line) {
  const entry = { ts: new Date().toISOString(), msg: line.trim() };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
}

// --- GET /status ---
app.get("/status", (req, res) => {
  res.json({ running: botProcess !== null, logCount: logs.length });
});

// --- POST /start ---
app.post("/start", (req, res) => {
  if (botProcess) {
    return res.json({ ok: false, message: "Bot is already running" });
  }

  logs = [];
  addLog("🚀 Starting bot...");

  botProcess = spawn("node", [path.join(__dirname, "bot.js")], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  botProcess.stdout.on("data", (data) => {
    data.toString().split("\n").filter(Boolean).forEach(addLog);
  });

  botProcess.stderr.on("data", (data) => {
    data.toString().split("\n").filter(Boolean).forEach((l) => addLog("⚠️ " + l));
  });

  botProcess.on("exit", (code) => {
    addLog(`🛑 Bot stopped (exit code: ${code ?? "?"})`);
    botProcess = null;
  });

  botProcess.on("error", (err) => {
    addLog(`❌ Failed to start bot: ${err.message}`);
    botProcess = null;
  });

  res.json({ ok: true, message: "Bot started" });
});

// --- POST /stop ---
app.post("/stop", (req, res) => {
  if (!botProcess) {
    return res.json({ ok: false, message: "Bot is not running" });
  }
  addLog("🛑 Stop requested by user...");
  botProcess.kill("SIGTERM");
  setTimeout(() => {
    if (botProcess) {
      botProcess.kill("SIGKILL");
    }
  }, 4000);
  res.json({ ok: true, message: "Stop signal sent" });
});

// --- GET /logs?since=N --- returns logs array, optionally filtered by index
app.get("/logs", (req, res) => {
  const since = parseInt(req.query.since || "0", 10);
  res.json({ logs: logs.slice(since), total: logs.length });
});

// --- GET /logs/stream --- SSE live log stream ---
app.get("/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let sent = 0;

  // send existing logs first
  const existing = logs.slice(0);
  existing.forEach((entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });
  sent = logs.length;

  const interval = setInterval(() => {
    if (logs.length > sent) {
      const newEntries = logs.slice(sent);
      newEntries.forEach((entry) => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      });
      sent = logs.length;
    }
    // heartbeat
    res.write(": heartbeat\n\n");
  }, 1000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend API listening on port ${PORT}`);
});

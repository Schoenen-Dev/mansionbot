import { useState, useEffect, useRef, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const [status, setStatus] = useState({ running: false, logCount: 0 });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const logsEndRef = useRef(null);
  const eventSourceRef = useRef(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (autoScrollRef.current && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Poll status every 5s
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/status`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
          setConnected(true);
        }
      } catch (e) {
        setConnected(false);
      }
    };
    pollStatus();
    const id = setInterval(pollStatus, 5000);
    return () => clearInterval(id);
  }, []);

  // SSE log streaming
  const startLogStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    const es = new EventSource(`${API_URL}/logs/stream`);
    es.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.slice(-500); // keep last 500
        });
      } catch (_) {}
    };
    es.onerror = () => {
      setConnected(false);
    };
    eventSourceRef.current = es;
  }, []);

  useEffect(() => {
    startLogStream();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [startLogStream]);

  const handleStart = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/start`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) setError(data.message);
      else {
        setLogs([]);
        startLogStream();
      }
    } catch (e) {
      setError("Failed to connect to backend: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/stop`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) setError(data.message);
    } catch (e) {
      setError("Failed to connect to backend: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = () => setLogs([]);

  const getLogColor = (msg) => {
    if (msg.includes("❌") || msg.includes("Fatal") || msg.includes("error")) return "#ff6b6b";
    if (msg.includes("✅") || msg.includes("successful") || msg.includes("ACCEPTED")) return "#51cf66";
    if (msg.includes("⚡") || msg.includes("CLICKED")) return "#74c0fc";
    if (msg.includes("⚠️")) return "#ffd43b";
    if (msg.includes("🔄") || msg.includes("refreshed")) return "#a9e34b";
    if (msg.includes("🔐") || msg.includes("login")) return "#da77f2";
    if (msg.includes("🚀") || msg.includes("Starting")) return "#ff922b";
    if (msg.includes("🛑") || msg.includes("stopped")) return "#ff8787";
    return "#c9d1d9";
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      color: "#c9d1d9",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: "24px",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: "linear-gradient(135deg, #1971c2, #74c0fc)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>🤖</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#e6edf3" }}>
              Mansion Bot Control Panel
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "#8b949e" }}>
              ValueNet Order Automation
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: connected ? (status.running ? "#51cf66" : "#ffd43b") : "#ff6b6b",
              boxShadow: connected ? (status.running ? "0 0 8px #51cf66" : "0 0 8px #ffd43b") : "0 0 8px #ff6b6b",
            }} />
            <span style={{ fontSize: 12, color: "#8b949e" }}>
              {!connected ? "Disconnected" : status.running ? "Bot Running" : "Bot Stopped"}
            </span>
          </div>
        </div>

        {/* Status Card */}
        <div style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <Stat label="Status" value={status.running ? "🟢 Running" : "🔴 Stopped"} />
            <Stat label="Logs Captured" value={logs.length} />
            <Stat label="Backend" value={connected ? "✅ Connected" : "❌ Offline"} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={handleStart}
              disabled={loading || status.running || !connected}
              style={btnStyle("#1971c2", "#1c7ed6", loading || status.running || !connected)}
            >
              {loading && !status.running ? "Starting..." : "▶ Start Bot"}
            </button>
            <button
              onClick={handleStop}
              disabled={loading || !status.running || !connected}
              style={btnStyle("#c92a2a", "#e03131", loading || !status.running || !connected)}
            >
              {loading && status.running ? "Stopping..." : "⏹ Stop Bot"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "#2d1515", border: "1px solid #c92a2a",
            borderRadius: 8, padding: "12px 16px", marginBottom: 16,
            color: "#ff6b6b", fontSize: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Log Panel */}
        <div style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #30363d",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#e6edf3" }}>
              📋 Live Logs
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: "#8b949e", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  defaultChecked
                  onChange={(e) => { autoScrollRef.current = e.target.checked; }}
                  style={{ accentColor: "#1971c2" }}
                />
                Auto-scroll
              </label>
              <button
                onClick={clearLogs}
                style={{
                  background: "transparent", border: "1px solid #30363d",
                  borderRadius: 6, color: "#8b949e", padding: "4px 10px",
                  cursor: "pointer", fontSize: 12,
                }}
              >
                Clear
              </button>
            </div>
          </div>

          <div style={{
            height: 500,
            overflowY: "auto",
            padding: "12px 16px",
            fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            fontSize: 12,
            lineHeight: 1.7,
            background: "#0d1117",
          }}>
            {logs.length === 0 ? (
              <div style={{ color: "#484f58", textAlign: "center", marginTop: 80, fontSize: 14 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                <div>No logs yet. Start the bot to see activity here.</div>
              </div>
            ) : (
              logs.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 2 }}>
                  <span style={{ color: "#484f58", flexShrink: 0, fontSize: 11 }}>
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <span style={{ color: getLogColor(entry.msg), wordBreak: "break-word" }}>
                    {entry.msg}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 11, color: "#484f58" }}>
          Backend: <code style={{ color: "#8b949e" }}>{API_URL}</code>
          {" · "}
          Logs stream via SSE · Bot runs on Render
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3" }}>{value}</div>
    </div>
  );
}

function btnStyle(bg, hoverBg, disabled) {
  return {
    background: disabled ? "#21262d" : bg,
    color: disabled ? "#484f58" : "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: 14,
    transition: "background 0.15s",
  };
}

# Mansion Bot — Full Deployment Guide

## Architecture

```
[Vercel Frontend]  ──HTTP/SSE──►  [Render Backend]
  React UI                          Express API
  Start / Stop                      bot.js (Puppeteer)
  Live Logs                         Headless Chrome
```

- **Frontend** (Vercel): React app with Start/Stop buttons + live log viewer
- **Backend** (Render): Express server that runs the bot in a child process, exposes REST API

---

## PART 1 — Deploy Backend to Render

### Step 1: Prepare your GitHub repo
1. Create a new GitHub repository (e.g. `mansion-bot-backend`)
2. Upload everything inside the `backend/` folder to the root of that repo:
   - `server.js`
   - `bot.js`
   - `package.json`
   - `render.yaml`

### Step 2: Deploy on Render
1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo (`mansion-bot-backend`)
3. Set these settings:
   | Field | Value |
   |-------|-------|
   | Runtime | **Node** |
   | Build Command | `npm install` |
   | Start Command | `node server.js` |
   | Plan | **Free** (or Starter for always-on) |

4. Click **Create Web Service**
5. Wait for deploy to finish (~3–5 min, Puppeteer downloads Chromium)
6. Copy your Render URL — looks like: `https://mansion-bot-backend.onrender.com`

> ⚠️ **Free tier note:** Render free services spin down after 15 min of inactivity.
> Upgrade to Starter ($7/mo) for always-on, or the bot will cold-start when you click Start.

---

## PART 2 — Deploy Frontend to Vercel

### Step 1: Prepare your GitHub repo
1. Create a new GitHub repository (e.g. `mansion-bot-frontend`)
2. Upload everything inside the `frontend/` folder to the root of that repo:
   - `src/App.jsx`
   - `src/main.jsx`
   - `index.html`
   - `package.json`
   - `vite.config.js`
   - `vercel.json`

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo (`mansion-bot-frontend`)
3. Framework will auto-detect as **Vite** ✅
4. **IMPORTANT** — Add environment variable:
   | Name | Value |
   |------|-------|
   | `VITE_API_URL` | `https://mansion-bot-backend.onrender.com` ← your Render URL |
5. Click **Deploy**
6. Done! Your UI is live at `https://mansion-bot-frontend.vercel.app`

---

## How It Works

1. Open the Vercel URL in your browser
2. Click **▶ Start Bot** → backend starts the bot on Render's server
3. Logs appear live in the panel (Server-Sent Events streaming)
4. Click **⏹ Stop Bot** → gracefully stops the bot
5. Logs are color-coded: green = success, red = error, yellow = warning, blue = clicks

---

## Local Development

### Run backend locally:
```bash
cd backend
npm install
node server.js
# API available at http://localhost:3001
```

### Run frontend locally:
```bash
cd frontend
cp .env.example .env.local
# Edit .env.local: set VITE_API_URL=http://localhost:3001
npm install
npm run dev
# UI available at http://localhost:5173
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Disconnected" in UI | Backend not running or CORS issue — check Render logs |
| Bot won't start | Check Render logs for Puppeteer/Chrome errors |
| Logs not streaming | Check browser console for SSE errors; ensure Render URL is HTTPS |
| "Invalid credentials" | Update username/password in `bot.js` lines with `rjimenez` |
| Render cold start slow | Upgrade to Render Starter plan for always-on |
| CORS error | Make sure VITE_API_URL matches your exact Render URL (no trailing slash) |

---

## Files Reference

```
backend/
  server.js      ← Express API (start/stop/logs endpoints)
  bot.js         ← Puppeteer headless bot (converted from mansion.js)
  package.json   ← Dependencies: express, cors, puppeteer
  render.yaml    ← Render deploy config

frontend/
  src/App.jsx    ← React UI with Start/Stop and log panel
  src/main.jsx   ← React entry point
  index.html     ← HTML shell
  package.json   ← Dependencies: react, vite
  vite.config.js ← Vite config
  vercel.json    ← Vercel deploy config
  .env.example   ← Environment variable template
```

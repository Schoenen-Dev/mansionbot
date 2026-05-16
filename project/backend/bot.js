// bot.js — Headless Puppeteer version of mansion.js
// Designed to run on Render with Chromium (headless)

const puppeteer = require("puppeteer-core");
const fs = require("fs");

function getTimestamp() {
  return new Date().toLocaleString();
}
function minutesSince(date) {
  return (Date.now() - date) / (1000 * 60);
}
function log(msg) {
  console.log(`[${getTimestamp()}] ${msg}`);
}

// Append to log file too (optional)
function logFile(msg) {
  try {
    fs.appendFileSync("valuenet_log.txt", `[${getTimestamp()}] ${msg}\n`);
  } catch (e) {}
}

const NETWORK_SNIFFER_SCRIPT = `
  if (!window.__VN_SNIFER_INSTALLED__) {
    window.__VN_SNIFER_INSTALLED__ = true;
    window.__vn_ws_messages = window.__vn_ws_messages || [];

    (function(){
      const NativeWS = window.WebSocket;
      function WrappedWebSocket(url, protocols) {
        const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
        try {
          ws.addEventListener('message', function(e) {
            try { window.__vn_ws_messages.push({type:'ws', url: url, data: e.data, ts: Date.now()}); } catch(err) {}
          });
        } catch(err){}
        return ws;
      }
      WrappedWebSocket.prototype = NativeWS.prototype;
      WrappedWebSocket.CONNECTING = NativeWS.CONNECTING;
      WrappedWebSocket.OPEN = NativeWS.OPEN;
      WrappedWebSocket.CLOSING = NativeWS.CLOSING;
      WrappedWebSocket.CLOSED = NativeWS.CLOSED;
      window.WebSocket = WrappedWebSocket;
    })();

    (function(){
      if (!window.EventSource) return;
      const NativeES = window.EventSource;
      function WrappedEventSource(url, options) {
        const es = new NativeES(url, options);
        try {
          es.addEventListener('message', function(e){
            try { window.__vn_ws_messages.push({type:'es', url: url, data: e.data, ts: Date.now()}); } catch(err){}
          });
        } catch(err){}
        return es;
      }
      WrappedEventSource.prototype = NativeES.prototype;
      window.EventSource = WrappedEventSource;
    })();

    (function(){
      if (!window.fetch) return;
      const nativeFetch = window.fetch;
      window.fetch = function(){
        return nativeFetch.apply(this, arguments).then(async function(response){
          try {
            const clone = response.clone();
            const contentType = clone.headers.get && clone.headers.get('content-type') || '';
            if (contentType.includes('json') || contentType.includes('text')) {
              const txt = await clone.text().catch(()=>null);
              if (txt && txt.length < 10000) {
                window.__vn_ws_messages.push({type:'fetch', url: arguments[0], data: txt, ts: Date.now()});
              }
            }
          } catch(e){}
          return response;
        });
      };
    })();

    if (!window.__VN_OBSERVER_ACTIVE__) {
      window.__VN_OBSERVER_ACTIVE__ = true;
      const obs = new MutationObserver(muts => {
        for (const m of muts) {
          if (m.addedNodes && m.addedNodes.length) {
            m.addedNodes.forEach(n => {
              try {
                if (n.querySelectorAll) {
                  const btns = n.querySelectorAll("#grabItBoardOrdersWidget a#lnkAcceptOrder, #newOrdersWidget a#lnkAcceptOrder");
                  if (btns && btns.length) {
                    window.__vn_ws_messages.push({type:'dom_detect', note:'dom_btn', ts:Date.now()});
                  }
                }
              } catch(e){}
            });
          }
        }
      });
      obs.observe(document.body, { childList:true, subtree:true });
    }
    console.log("VN network sniffer installed.");
  }
  return true;
`;

function looksLikeOrderMessage(raw) {
  if (!raw) return false;
  let txt = raw.data ? raw.data.toString() : raw.toString();
  const l = txt.toLowerCase();
  const keywords = [
    "neworder","new order","order_created","orderid","order_id","lnkacceptorder",
    "grabit","grab it","notifyorder","order_added","orders","order"
  ];
  try {
    const j = JSON.parse(txt);
    if (typeof j === "object") {
      const s = JSON.stringify(j).toLowerCase();
      for (const kw of keywords) if (s.includes(kw)) return true;
    }
  } catch(e) {
    for (const kw of keywords) if (l.includes(kw)) return true;
  }
  return false;
}

(async function run() {
  log("🚀 Launching headless browser...");

  // Find Chrome on Render's Linux environment
  const fs_sync = require("fs");
  const chromePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const executablePath = chromePaths.find((p) => fs_sync.existsSync(p));
  if (!executablePath) {
    log("❌ No Chrome/Chromium found. Set PUPPETEER_EXECUTABLE_PATH env var on Render.");
    process.exit(1);
  }
  log(`🌐 Using browser: ${executablePath}`);

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(30000);

  let lastLoginTime = Date.now();
  let lastRefresh = Date.now();

  // ----------- LOGIN -----------
  async function login() {
    log("🔐 Attempting login...");
    await page.goto("https://orders.valuenet.com/Collaterals/", { waitUntil: "domcontentloaded" });

    try {
      await page.waitForSelector("#ctl00_ContentPlaceHolder1_txtLogin", { timeout: 10000 });
      await page.type("#ctl00_ContentPlaceHolder1_txtLogin", "rjimenez");
      await page.type("#ctl00_ContentPlaceHolder1_txtPassword", "@@Exp+MansionTeam$1$1");
      await page.click("#ctl00_ContentPlaceHolder1_btnsubmit");

      try {
        await page.waitForFunction(() => window.location.href.includes("Dashboard"), { timeout: 6000 });
        log("✅ Login successful");
        lastLoginTime = Date.now();
      } catch {
        // check for invalid credentials text
        const bodyText = await page.evaluate(() => document.body.innerText);
        if (bodyText.toLowerCase().includes("invalid") || bodyText.toLowerCase().includes("incorrect")) {
          log("❌ Invalid credentials — check username/password");
          await browser.close();
          process.exit(1);
        }
        // check verification challenge
        const hasChallenge = await page.$('#ctl00_ContentPlaceHolder1_txtChallenge');
        if (hasChallenge) {
          log("🚨 Verification/challenge required — cannot proceed headlessly");
          await browser.close();
          process.exit(1);
        }
        log("⚠️ Login result unclear — proceeding");
        lastLoginTime = Date.now();
      }
    } catch (err) {
      log(`❌ Login error: ${err.message}`);
      await browser.close();
      process.exit(1);
    }
  }

  // ----------- LOGOUT -----------
  async function logout() {
    try {
      await page.click("#ctl00_userLogged");
      await page.waitForTimeout(300);
      await page.click("#ctl00_btnSignout");
      await page.waitForSelector("#ctl00_ContentPlaceHolder1_txtLogin", { timeout: 8000 });
      log("✅ Logged out");
    } catch (err) {
      log(`❌ Logout failed: ${err.message}`);
    }
  }

  // ----------- INJECT SNIFFERS -----------
  async function injectNetworkSniffer() {
    try {
      await page.evaluate(NETWORK_SNIFFER_SCRIPT);
      log("🧩 Network + DOM hooks injected");
    } catch (err) {
      log(`❌ Injection failed: ${err.message}`);
    }
  }

  // ----------- CLICK ACCEPT -----------
  async function tryClickAccept() {
    const selectors = [
      "#grabItBoardOrdersWidget a#lnkAcceptOrder",
      "#grabItBoardDisplay a#lnkAcceptOrder",
      "#newOrdersWidget a#lnkAcceptOrder",
      "#newOrdersDisplay a#lnkAcceptOrder",
    ];
    for (const sel of selectors) {
      try {
        const elem = await page.$(sel);
        if (elem) {
          await elem.evaluate((el) => {
            el.scrollIntoView(true);
            el.click();
          });
          log(`⚡ CLICKED accept button (${sel})`);

          // try logging row info
          try {
            const rowText = await elem.evaluate((el) => {
              const row = el.closest("tr");
              return row ? row.innerText : "N/A";
            });
            logFile(`ACCEPTED - Websocket\n${rowText}\n-----------------`);
            log(`📋 Order info: ${rowText.replace(/\n/g, " | ")}`);
          } catch (e) {
            logFile("ACCEPTED — row info not readable\n-----------------");
          }

          await new Promise((r) => setTimeout(r, 350));
          return true;
        }
      } catch (err) {
        log(`⚠️ Click attempt failed on ${sel}: ${err.message}`);
      }
    }
    return false;
  }

  // ----------- MAIN -----------
  try {
    await login();
    await page.goto(
      "https://orders.valuenet.com/Collaterals/Site/VendorServices/DataCollectorDashboard",
      { waitUntil: "domcontentloaded" }
    );
    await injectNetworkSniffer();
    lastRefresh = Date.now();
    log("📄 Dashboard loaded — sniffer active. Monitoring for orders...");

    while (true) {
      // Refresh every 8 seconds
      if (Date.now() - lastRefresh >= 8000) {
        try {
          await page.goto(
            "https://orders.valuenet.com/Collaterals/Site/VendorServices/DataCollectorDashboard",
            { waitUntil: "domcontentloaded" }
          );
          await injectNetworkSniffer();
          lastRefresh = Date.now();
          log("🔄 Dashboard refreshed");
        } catch (rerr) {
          log(`⚠️ Refresh failed: ${rerr.message}`);
        }
      }

      // Re-login every 30 minutes
      if (minutesSince(lastLoginTime) >= 30) {
        await logout();
        await login();
        await page.goto(
          "https://orders.valuenet.com/Collaterals/Site/VendorServices/DataCollectorDashboard",
          { waitUntil: "domcontentloaded" }
        );
        await injectNetworkSniffer();
        lastRefresh = Date.now();
      }

      // 1) Check WebSocket/network message queue
      try {
        const queued = await page.evaluate(() => {
          try {
            if (!window.__vn_ws_messages) return [];
            return window.__vn_ws_messages.splice(0, 50);
          } catch (e) { return []; }
        });

        if (queued && queued.length) {
          let foundOrder = false;
          for (const q of queued) {
            try {
              if (looksLikeOrderMessage(q) || (q && q.type === "dom_detect")) {
                foundOrder = true;
                break;
              }
            } catch (e) {}
          }

          if (foundOrder) {
            const clicked = await tryClickAccept();
            if (!clicked) {
              // fallback DOM scan
              try {
                const hasBtn = await page.$(
                  "#grabItBoardOrdersWidget a#lnkAcceptOrder, #newOrdersWidget a#lnkAcceptOrder"
                );
                if (hasBtn) {
                  await hasBtn.evaluate((el) => el.click());
                  log("⚡ Clicked accept via fallback DOM scan");
                }
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        log(`⚠️ Error reading queue: ${err.message}`);
      }

      // 2) Safety net DOM scan
      try {
        const hasBtn = await page.$(
          "#grabItBoardOrdersWidget a#lnkAcceptOrder, #newOrdersWidget a#lnkAcceptOrder"
        );
        if (hasBtn) {
          await tryClickAccept();
        }
      } catch (e) {}

      await new Promise((r) => setTimeout(r, 25));
    }
  } catch (fatal) {
    log(`❌ Fatal error: ${fatal.message || fatal}`);
  } finally {
    try { await browser.close(); } catch (e) {}
  }
})();

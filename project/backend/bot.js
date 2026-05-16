// bot.js - Headless Selenium bot for Render deployment
// Uses system Chrome/Chromium - no Puppeteer needed

const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
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
function logFile(msg) {
  try { fs.appendFileSync("valuenet_log.txt", `[${getTimestamp()}] ${msg}\n`); } catch (e) {}
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
            try { window.__vn_ws_messages.push({type:'ws', url:url, data:e.data, ts:Date.now()}); } catch(err){}
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
            try { window.__vn_ws_messages.push({type:'es', url:url, data:e.data, ts:Date.now()}); } catch(err){}
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
            const ct = clone.headers.get && clone.headers.get('content-type') || '';
            if (ct.includes('json') || ct.includes('text')) {
              const txt = await clone.text().catch(()=>null);
              if (txt && txt.length < 10000) {
                window.__vn_ws_messages.push({type:'fetch', url:arguments[0], data:txt, ts:Date.now()});
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
    console.log("VN sniffer installed.");
  }
  return true;
`;

function looksLikeOrderMessage(raw) {
  if (!raw) return false;
  let txt = raw.data ? raw.data.toString() : raw.toString();
  const l = txt.toLowerCase();
  const keywords = ["neworder","new order","order_created","orderid","order_id","lnkacceptorder","grabit","grab it","notifyorder","order_added","orders","order"];
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
  log("🚀 Launching headless Chrome...");

  const options = new chrome.Options();
  options.addArguments("--headless=new");
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-setuid-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--window-size=1280,800");
  options.addArguments("--disable-extensions");
  options.addArguments("--single-process");

  // Use system chromium on Render
  const chromiumPath = process.env.CHROME_BIN || "/usr/bin/chromium-browser";
  if (require("fs").existsSync(chromiumPath)) {
    options.setChromeBinaryPath(chromiumPath);
    log(`🌐 Using Chrome at: ${chromiumPath}`);
  } else {
    log("⚠️ Using default Chrome path");
  }

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  let lastLoginTime = Date.now();
  let lastRefresh = Date.now();

  async function login() {
    log("🔐 Attempting login...");
    await driver.get("https://orders.valuenet.com/Collaterals/");
    try {
      await driver.wait(until.elementLocated(By.id("ctl00_ContentPlaceHolder1_txtLogin")), 10000);
      await driver.findElement(By.id("ctl00_ContentPlaceHolder1_txtLogin")).sendKeys("rjimenez");
      await driver.findElement(By.id("ctl00_ContentPlaceHolder1_txtPassword")).sendKeys("@@Exp+MansionTeam$1$1");
      await driver.findElement(By.id("ctl00_ContentPlaceHolder1_btnsubmit")).click();
      try {
        await driver.wait(until.urlContains("Dashboard"), 6000);
        log("✅ Login successful");
      } catch {
        try {
          await driver.wait(until.elementLocated(By.xpath("//*[contains(text(),'Invalid') or contains(text(),'incorrect')]")), 3000);
          log("❌ Invalid credentials — exiting");
          await driver.quit();
          process.exit(1);
        } catch {}
        try {
          await driver.wait(until.elementLocated(By.id("ctl00_ContentPlaceHolder1_txtChallenge")), 3000);
          log("🚨 Verification required — cannot proceed headlessly");
          await driver.quit();
          process.exit(1);
        } catch {}
      }
      lastLoginTime = Date.now();
    } catch (err) {
      log(`❌ Login error: ${err.message}`);
      await driver.quit();
      process.exit(1);
    }
  }

  async function logout() {
    try {
      await driver.findElement(By.id("ctl00_userLogged")).click();
      await driver.sleep(300);
      await driver.findElement(By.id("ctl00_btnSignout")).click();
      await driver.wait(until.elementLocated(By.id("ctl00_ContentPlaceHolder1_txtLogin")), 8000);
      log("✅ Logged out");
    } catch (err) {
      log(`❌ Logout failed: ${err.message}`);
    }
  }

  async function injectNetworkSniffer() {
    try {
      await driver.executeScript(NETWORK_SNIFFER_SCRIPT);
      log("🧩 Network + DOM hooks injected");
    } catch (err) {
      log(`❌ Injection failed: ${err.message}`);
    }
  }

  async function tryClickAcceptImmediate() {
    const selectors = [
      "#grabItBoardOrdersWidget a#lnkAcceptOrder",
      "#grabItBoardDisplay a#lnkAcceptOrder",
      "#newOrdersWidget a#lnkAcceptOrder",
      "#newOrdersDisplay a#lnkAcceptOrder",
    ];
    for (const sel of selectors) {
      const elems = await driver.findElements(By.css(sel));
      if (elems.length > 0) {
        const btn = elems[0];
        try {
          await driver.executeScript("arguments[0].scrollIntoView(true);", btn);
          await driver.executeScript("arguments[0].click();", btn);
          log(`⚡ CLICKED accept button (${sel})`);
          try {
            const row = await btn.findElement(By.xpath("./ancestor::tr"));
            const txt = await row.getText();
            logFile(`ACCEPTED\n${txt}\n-----------------`);
            log(`📋 Order: ${txt.replace(/\n/g, " | ")}`);
          } catch (e) {
            logFile("ACCEPTED — row not readable\n-----------------");
          }
          await new Promise(r => setTimeout(r, 350));
          return true;
        } catch (clickErr) {
          log(`⚠️ Click failed: ${clickErr.message}`);
        }
      }
    }
    return false;
  }

  try {
    await login();
    await driver.get("https://orders.valuenet.com/Collaterals/Site/VendorServices/DataCollectorDashboard");
    await injectNetworkSniffer();
    lastRefresh = Date.now();
    log("📄 Dashboard loaded — monitoring for orders...");

    while (true) {
      if (Date.now() - lastRefresh >= 8000) {
        try {
          await driver.get("https://orders.valuenet.com/Collaterals/Site/VendorServices/DataCollectorDashboard");
          await injectNetworkSniffer();
          lastRefresh = Date.now();
          log("🔄 Dashboard refreshed");
        } catch (rerr) {
          log(`⚠️ Refresh failed: ${rerr.message}`);
        }
      }

      if (minutesSince(lastLoginTime) >= 30) {
        await logout();
        await login();
        await driver.get("https://orders.valuenet.com/Collaterals/Site/VendorServices/DataCollectorDashboard");
        await injectNetworkSniffer();
        lastRefresh = Date.now();
      }

      try {
        const queued = await driver.executeScript(`
          try {
            if (!window.__vn_ws_messages) return [];
            return window.__vn_ws_messages.splice(0, 50);
          } catch(e) { return []; }
        `);

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
            const clicked = await tryClickAcceptImmediate();
            if (!clicked) {
              try {
                const btns = await driver.findElements(By.css("#grabItBoardOrdersWidget a#lnkAcceptOrder, #newOrdersWidget a#lnkAcceptOrder"));
                if (btns.length > 0) {
                  await driver.executeScript("arguments[0].click();", btns[0]);
                  log("⚡ Clicked accept via fallback");
                }
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        log(`⚠️ Queue error: ${err.message}`);
      }

      try {
        const hasBtn = await driver.findElements(By.css("#grabItBoardOrdersWidget a#lnkAcceptOrder, #newOrdersWidget a#lnkAcceptOrder"));
        if (hasBtn.length > 0) await tryClickAcceptImmediate();
      } catch (e) {}

      await new Promise(r => setTimeout(r, 25));
    }
  } catch (fatal) {
    log(`❌ Fatal error: ${fatal.message || fatal}`);
  } finally {
    try { await driver.quit(); } catch (e) {}
  }
})();

#!/usr/bin/env node
/**
 * Habla con el Chrome de launch.sh por CDP.
 * Uso: node scribe.mjs <status|pages|open|start|complete|stop> [url]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { saveFocus, restoreFocus, demote } from "./wm.mjs";

const CDP = process.env.SCRIBEHOW_CDP || "http://127.0.0.1:9333";
const STORE_ID = "okfkdaglfjjjfefdcppliegebpoegaii";
const SHOT = `${process.env.HOME}/.local/share/scribehow-playwright/last-extensions.png`;

async function cdpTargets() {
  const r = await fetch(`${CDP}/json/list`);
  if (!r.ok) throw new Error(`CDP list ${r.status}`);
  return r.json();
}

/** Unpacked load-extension gets a path-hash ID, not the Web Store ID. */
async function detectExtId() {
  if (process.env.SCRIBEHOW_EXT_ID) return process.env.SCRIBEHOW_EXT_ID;
  const tabs = await cdpTargets();
  const sw = tabs.find((t) => String(t.url || "").startsWith("chrome-extension://"));
  if (sw) return sw.url.split("/")[2];
  return STORE_ID;
}

const cmd = process.argv[2] || "status";
const arg = process.argv[3];

async function connect() {
  try {
    return await chromium.connectOverCDP(CDP);
  } catch (e) {
    console.error(`no hay CDP en ${CDP}. corré scripts/launch.sh`);
    console.error(String(e.message || e));
    process.exit(1);
  }
}

function pagesOf(browser) {
  return browser.contexts().flatMap((c) => c.pages());
}

async function status() {
  const r = await fetch(`${CDP}/json/version`);
  if (!r.ok) throw new Error(`CDP ${r.status}`);
  const j = await r.json();
  const extId = await detectExtId();
  const tabs = await cdpTargets();
  const extTargets = tabs.filter((t) => String(t.url || "").includes("chrome-extension://"));
  console.log(
    JSON.stringify(
      {
        cdp: CDP,
        browser: j.Browser,
        webSocket: j.webSocketDebuggerUrl,
        extensionId: extId,
        storeId: STORE_ID,
        unpacked: extId !== STORE_ID,
        extensionTargets: extTargets.map((t) => ({ type: t.type, url: t.url })),
      },
      null,
      2,
    ),
  );
}

async function showExt(browser) {
  const extId = await detectExtId();
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const mgr = document.querySelector("extensions-manager");
    if (!mgr?.shadowRoot) return { err: "no manager" };
    const toolbar = mgr.shadowRoot.querySelector("extensions-toolbar");
    const dev = toolbar?.shadowRoot?.querySelector("#devMode");
    if (dev && !dev.checked) dev.click();
    const list = mgr.shadowRoot.querySelector("extensions-item-list");
    const items = [...(list?.shadowRoot?.querySelectorAll("extensions-item") || [])];
    return {
      names: items.map((it) => ({
        id: it.getAttribute("id"),
        name: it.shadowRoot?.querySelector("#name")?.textContent?.trim(),
        version:
          it.shadowRoot?.querySelector("#version-and-type")?.textContent?.trim() ||
          it.shadowRoot?.querySelector("#version")?.textContent?.trim(),
      })),
    };
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT, fullPage: true });
  console.log(`extensionId=${extId}`);
  console.log(`screenshot=${SHOT}`);
  console.log(JSON.stringify(info, null, 2));
  const hit = (info.names || []).some((n) => /scribe/i.test(n.name || ""));
  if (!hit) {
    console.error("chrome://extensions no muestra Scribe. la extensión no está cargada.");
    process.exit(2);
  }
}

async function listPages(browser) {
  const pages = pagesOf(browser);
  for (const p of pages) {
    console.log(`${p.url()}\t${await p.title().catch(() => "")}`);
  }
}

async function openUrl(browser, url) {
  if (!url) {
    console.error("falta url");
    process.exit(1);
  }
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log(page.url());
}

async function sidepanel(browser) {
  const extId = await detectExtId();
  const ctx = browser.contexts()[0];
  let page = pagesOf(browser).find((p) => /\/sidepanel\//.test(p.url()));
  if (!page) {
    page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
  }
  return page;
}

async function startCapture(browser) {
  const page = await sidepanel(browser);
  const root = page.frameLocator("#scribe-sidepanel-iframe");
  const btn = root.getByRole("button", { name: /start capture/i }).first();
  try {
    await btn.click({ timeout: 8000 });
    console.log("Start Capture clickeado");
  } catch {
    console.error("no encontré Start Capture. ¿sesión de Scribehow logueada en ESTE Chromium?");
    console.error("entrà en https://scribehow.com en la ventana de launch.sh.");
    process.exit(2);
  }
}

async function completeCapture(browser) {
  const page = pagesOf(browser).find((p) => /\/sidepanel\//.test(p.url())) || (await sidepanel(browser));
  const root = page.frameLocator("#scribe-sidepanel-iframe");
  const btn = root.getByRole("button", { name: /complete capture/i }).first();
  try {
    await btn.click({ timeout: 8000 });
    console.log("Complete Capture clickeado");
  } catch {
    console.error("no encontré Complete Capture en el iframe del sidepanel.");
    process.exit(2);
  }
}

const prev = cmd === "status" || cmd === "stop" ? null : saveFocus();
const browser = cmd === "status" || cmd === "stop" ? null : await connect();
const pidFile = `${process.env.HOME}/.local/share/scribehow-playwright/chrome.pid`;
try {
  if (cmd === "status") await status();
  else if (cmd === "pages") await listPages(browser);
  else if (cmd === "ext") await showExt(browser);
  else if (cmd === "open") await openUrl(browser, arg);
  else if (cmd === "start") await startCapture(browser);
  else if (cmd === "complete") await completeCapture(browser);
  else if (cmd === "stop") {
    console.log("cerrá el Chromium de Scribehow: kill $(cat " + pidFile + ")");
  } else {
    console.error("uso: scribe.mjs status|pages|ext|open <url>|start|complete|stop");
    process.exit(1);
  }
} finally {
  if (fs.existsSync(pidFile)) demote(fs.readFileSync(pidFile, "utf8").trim());
  if (prev) restoreFocus(prev);
}

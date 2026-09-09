#!/usr/bin/env node
/**
 * Habla con el Chrome de launch.sh por CDP.
 * Uso: node scribe.mjs <status|pages|ext|open|start|complete|discard|stop> [url|titulo]
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
  const home = await sidepanelHome(browser);
  const tabId = await home.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    const isWeb = (t) => /^https?:/.test(t.url || "") && !/scribe(how)?\.com/.test(t.url || "");
    let t = tabs.find((x) => x.active && isWeb(x)) || tabs.filter(isWeb).pop();
    if (t) await chrome.tabs.update(t.id, { url: u, active: true });
    else t = await chrome.tabs.create({ url: u, active: true });
    return t.id;
  }, url);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const p = pagesOf(browser).find((pg) => pg.url().startsWith(url.replace(/\/$/, "")));
    if (p) {
      await p.waitForLoadState("domcontentloaded").catch(() => {});
      console.log(p.url());
      return;
    }
    await home.waitForTimeout(300);
  }
  console.log(`tab ${tabId} navegando a ${url}`);
}

/** Extensión ≥104: la home del sidepanel (sin iframe) tiene Start Capture. */
async function sidepanelHome(browser) {
  const extId = await detectExtId();
  const ctx = browser.contexts()[0];
  let page = pagesOf(browser).find((p) => /\/sidepanel\/sidepanel-home\.html/.test(p.url()));
  if (!page) {
    page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel-home.html`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
  }
  return page;
}

/** Durante la captura, sidepanel.html carga scribehow.com/sidebar/recorder en un iframe
 *  (OOPIF: Playwright por CDP reporta url "" → se detecta por contenido). */
async function findRecorder(browser) {
  for (const p of pagesOf(browser)) {
    if (!/\/sidepanel\/sidepanel\.html/.test(p.url())) continue;
    for (const fr of p.frames()) {
      if (fr === p.mainFrame()) continue;
      const hit = await fr
        .evaluate(() => /complete capture|discard capture/i.test(document.body?.innerText || ""))
        .catch(() => false);
      if (hit) return { page: p, frame: fr };
    }
  }
  return null;
}

async function recorderFrame(browser, timeout = 20000) {
  const extId = await detectExtId();
  const ctx = browser.contexts()[0];
  const deadline = Date.now() + timeout;
  let opened = false;
  while (Date.now() < deadline) {
    const r = await findRecorder(browser);
    if (r) return r;
    if (!opened && !pagesOf(browser).some((p) => /\/sidepanel\/sidepanel\.html/.test(p.url()))) {
      opened = true;
      const page = await ctx.newPage();
      await page
        .goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`, { waitUntil: "domcontentloaded", timeout: 15000 })
        .catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { page: null, frame: null };
}

async function startCapture(browser, tabTitle) {
  if (await findRecorder(browser)) {
    console.error("ya hay una captura activa. usá `complete` o `discard` antes de `start`.");
    process.exit(4);
  }
  const home = await sidepanelHome(browser);
  const logged = await home
    .getByRole("button", { name: /start capture/i })
    .first()
    .isVisible({ timeout: 15000 })
    .catch(() => false);
  if (!logged) {
    const body = await home.locator("body").innerText({ timeout: 2000 }).catch(() => "");
    console.error("el sidepanel no muestra Start Capture. ¿sesión de Scribehow logueada en ESTE Chromium?");
    console.error("entrá en https://scribehow.com en la ventana de launch.sh.");
    if (body) console.error(body.slice(0, 500));
    process.exit(2);
  }
  // El botón usa chrome.action.openPopup(), que Chrome solo permite con la ventana enfocada.
  // Abrimos el selector como pestaña (misma ruta que el mensaje openTabSelector) y el host del recorder.
  await recorderHost(browser);
  await home.evaluate(async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/scripts/tab-selector/index.html"), active: true });
  });
  let selector = null;
  for (let i = 0; i < 40 && !selector; i++) {
    selector = pagesOf(browser).find((p) => /\/tab-selector\//.test(p.url()));
    if (!selector) await home.waitForTimeout(250);
  }
  if (!selector) {
    console.error("no apareció el selector de pestaña (tab-selector).");
    process.exit(2);
  }
  await selector.waitForTimeout(800);
  const choice = tabTitle
    ? selector.getByRole("button", { name: new RegExp(tabTitle, "i") }).first()
    : selector.getByRole("button", { name: /^new tab$/i }).first();
  try {
    await choice.click({ timeout: 10000 });
  } catch {
    console.error("no encontré la opción en el selector. opciones:", await selector.getByRole("button").allInnerTexts());
    process.exit(2);
  }
  console.log(tabTitle ? `pestaña elegida: ${tabTitle}` : "pestaña: New Tab");

  const { frame } = await recorderFrame(browser, 30000);
  if (!frame) {
    console.error("el recorder no cargó en el sidepanel en 30s.");
    process.exit(2);
  }
  console.log("captura activa. usá `open <url>` y clics en ese Chromium; `complete` al terminar.");
}

/** Página sidepanel.html: sin ella abierta el service worker no tiene a quién avisar (Receiving end does not exist). */
async function recorderHost(browser) {
  const extId = await detectExtId();
  let page = pagesOf(browser).find((p) => /\/sidepanel\/sidepanel\.html/.test(p.url()));
  if (!page) {
    page = await browser.contexts()[0].newPage();
    await page.goto(`chrome-extension://${extId}/src/sidepanel/sidepanel.html`, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1000);
  }
  return page;
}

async function discardCapture(browser) {
  const { frame } = await recorderFrame(browser, 5000);
  if (!frame) {
    console.error("no hay captura activa (sin recorder en el sidepanel).");
    process.exit(2);
  }
  await frame.getByRole("button", { name: /discard capture/i }).first().click({ timeout: 8000 });
  const confirm = frame.getByRole("button", { name: /^(discard|delete|yes|confirm)/i }).first();
  await confirm.click({ timeout: 4000 }).catch(() => {});
  console.log("captura descartada");
}

async function completeCapture(browser) {
  const { frame } = await recorderFrame(browser, 8000);
  if (!frame) {
    console.error("no hay captura activa: el sidepanel no muestra el recorder. corré `start` primero.");
    process.exit(2);
  }
  const btn = frame.getByRole("button", { name: /complete capture/i }).first();
  if (await btn.isDisabled().catch(() => false)) {
    console.error("Complete Capture está deshabilitado: la captura no tiene pasos todavía (hacé clics en la pestaña grabada).");
    process.exit(2);
  }
  const seen = new Set(pagesOf(browser).map((p) => p.url()));
  try {
    await btn.click({ timeout: 8000 });
    console.log("Complete Capture clickeado");
  } catch {
    console.error("no encontré Complete Capture en el recorder.");
    process.exit(2);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    for (const p of pagesOf(browser)) {
      const u = p.url();
      if (!seen.has(u) && /scribehow\.com\/(?:o\/[^/]+\/)?(shared|viewer|workspace-preview)\//i.test(u)) {
        console.log(u.split("?")[0]);
        return;
      }
    }
    const body = await frame.locator("body").innerText({ timeout: 1000 }).catch(() => "");
    if (/problem connecting to the extension/i.test(body)) {
      console.error("Scribe: Problem connecting to the extension. ID unpacked ≠ store.");
      process.exit(3);
    }
    await sleep(1500);
  }
  console.error("Complete no abrió URL shared/viewer en 45s (no loop).");
  process.exit(3);
}

const prev = cmd === "status" || cmd === "stop" ? null : saveFocus();
const browser = cmd === "status" || cmd === "stop" ? null : await connect();
const pidFile = `${process.env.HOME}/.local/share/scribehow-playwright/chrome.pid`;
try {
  if (cmd === "status") await status();
  else if (cmd === "pages") await listPages(browser);
  else if (cmd === "ext") await showExt(browser);
  else if (cmd === "open") await openUrl(browser, arg);
  else if (cmd === "start") await startCapture(browser, arg);
  else if (cmd === "complete") await completeCapture(browser);
  else if (cmd === "discard") await discardCapture(browser);
  else if (cmd === "stop") {
    console.log("cerrá el Chromium de Scribehow: kill $(cat " + pidFile + ")");
  } else {
    console.error("uso: scribe.mjs status|pages|ext|open <url>|start [titulo-pestaña]|complete|discard|stop");
    process.exit(1);
  }
} finally {
  if (fs.existsSync(pidFile)) demote(fs.readFileSync(pidFile, "utf8").trim());
  if (prev) restoreFocus(prev);
}
process.exit(0);

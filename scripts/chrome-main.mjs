#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA = process.env.SCRIBEHOW_DATA_DIR || path.join(os.homedir(), ".local/share/scribehow-playwright");
const EXT = path.join(DATA, "extension");
const PROFILE = path.join(DATA, "profile-chromium");
const PORT = process.env.SCRIBEHOW_CDP_PORT || "9333";

fs.mkdirSync(PROFILE, { recursive: true });

const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: [
    `--remote-debugging-port=${PORT}`,
    `--remote-debugging-address=127.0.0.1`,
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--window-position=80,80`,
    `--disable-renderer-backgrounding`,
    `--disable-backgrounding-occluded-windows`,
    `--disable-background-timer-throttling`,
    `--noerrdialogs`,
  ],
});

const page = context.pages()[0] || (await context.newPage());
await page.goto("https://scribehow.com/", { waitUntil: "domcontentloaded" }).catch(() => {});

await new Promise(() => {});

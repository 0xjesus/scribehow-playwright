#!/usr/bin/env node
/**
 * Chromium headed (no Google Chrome 146: ignora --load-extension).
 * Deja CDP en 127.0.0.1:9333 y la extensión Scribe unpacked.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = process.env.SCRIBEHOW_DATA_DIR || path.join(os.homedir(), ".local/share/scribehow-playwright");
const EXT = path.join(DATA, "extension");
const PROFILE = path.join(DATA, "profile-chromium");
const PORT = process.env.SCRIBEHOW_CDP_PORT || "9333";
const PIDFILE = path.join(DATA, "chrome.pid");
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!fs.existsSync(path.join(EXT, "manifest.json"))) {
  console.error(`falta ${EXT}/manifest.json — corré scripts/setup.sh`);
  process.exit(1);
}

try {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  if (r.ok) {
    console.log(`ya está arriba CDP http://127.0.0.1:${PORT}`);
    console.log(await r.text());
    process.exit(0);
  }
} catch {
  /* launch */
}

fs.mkdirSync(PROFILE, { recursive: true });

const child = spawn(
  process.execPath,
  [path.join(SKILL, "scripts", "chrome-main.mjs")],
  {
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      SCRIBEHOW_DATA_DIR: DATA,
      SCRIBEHOW_CDP_PORT: String(PORT),
    },
  },
);
child.unref();
fs.writeFileSync(PIDFILE, String(child.pid));

for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) {
      console.log(`CDP http://127.0.0.1:${PORT}`);
      console.log(`PID ${child.pid}`);
      console.log(`perfil ${PROFILE}`);
      console.log(await r.text());
      process.exit(0);
    }
  } catch {
    /* wait */
  }
}
console.error("Chromium no abrió CDP");
process.exit(1);

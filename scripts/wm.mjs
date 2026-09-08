#!/usr/bin/env node
/** X11: ventana visible, sin robar el foco. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DATA = process.env.SCRIBEHOW_DATA_DIR || path.join(os.homedir(), ".local/share/scribehow-playwright");
const FOCUS_FILE = path.join(DATA, "prev-focus");

function sh(bin, args) {
  return execFileSync(bin, args, { encoding: "utf8" }).trim();
}

export function activeWindow() {
  try {
    const out = sh("xprop", ["-root", "_NET_ACTIVE_WINDOW"]);
    const m = out.match(/0x[0-9a-fA-F]+/);
    if (!m || m[0] === "0x0") return null;
    return m[0];
  } catch {
    return null;
  }
}

export function saveFocus() {
  const id = activeWindow();
  fs.mkdirSync(DATA, { recursive: true });
  if (id) fs.writeFileSync(FOCUS_FILE, id);
  return id;
}

export function restoreFocus(id = null) {
  const wid = id || (fs.existsSync(FOCUS_FILE) ? fs.readFileSync(FOCUS_FILE, "utf8").trim() : "");
  if (!wid) return;
  try {
    sh("wmctrl", ["-i", "-a", wid]);
  } catch {
    /* la ventana anterior ya no existe */
  }
}

function pidsOf(root) {
  const pids = new Set([String(root)]);
  try {
    const tree = sh("pstree", ["-p", String(root)]);
    for (const m of tree.matchAll(/\((\d+)\)/g)) pids.add(m[1]);
  } catch {
    /* pstree opcional */
  }
  return pids;
}

export function demote(rootPid) {
  if (!rootPid) return;
  const pids = pidsOf(rootPid);
  let list = "";
  try {
    list = sh("wmctrl", ["-lp"]);
  } catch {
    return;
  }
  for (const line of list.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [wid, , pid] = parts;
    if (!pids.has(pid)) continue;
    try {
      sh("wmctrl", ["-i", "-r", wid, "-b", "remove,demands_attention"]);
    } catch {
      /* ignore */
    }
    try {
      sh("xprop", ["-id", wid, "-f", "_NET_WM_USER_TIME", "32c", "-set", "_NET_WM_USER_TIME", "0"]);
    } catch {
      /* ignore */
    }
  }
}

const cmd = process.argv[2];
const pid = process.argv[3] || (fs.existsSync(path.join(DATA, "chrome.pid")) ? fs.readFileSync(path.join(DATA, "chrome.pid"), "utf8").trim() : "");
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (cmd === "save") console.log(saveFocus() || "");
  else if (cmd === "restore") restoreFocus();
  else if (cmd === "demote") demote(pid);
  else if (cmd === "release") {
    demote(pid);
    restoreFocus();
  }
}

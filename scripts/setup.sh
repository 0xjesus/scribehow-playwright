#!/usr/bin/env bash
# Download and unpack the Scribehow Chrome extension; install Playwright (no browsers).
set -euo pipefail

EXT_ID="${SCRIBEHOW_EXT_ID:-okfkdaglfjjjfefdcppliegebpoegaii}"
DATA_DIR="${SCRIBEHOW_DATA_DIR:-$HOME/.local/share/scribehow-playwright}"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$DATA_DIR/extension"
CHROME_VER="$(google-chrome --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo 131)"
CRX_URL="https://clients2.google.com/service/update2/crx?response=redirect&os=linux&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromiumcrx&prodchannel=&prodversion=${CHROME_VER}.0.0.0&lang=en&acceptformat=crx3&x=id%3D${EXT_ID}%26installsource%3Dondemand%26uc"

mkdir -p "$DATA_DIR" "$EXT_DIR"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "descargando Scribehow ($EXT_ID)…"
curl -fsSL -A 'Mozilla/5.0' -o "$tmp/scribehow.crx" "$CRX_URL"
python3 - "$tmp/scribehow.crx" "$EXT_DIR" <<'PY'
import sys, zipfile
from pathlib import Path
src, dest = Path(sys.argv[1]), Path(sys.argv[2])
data = src.read_bytes()
if data[:4] == b"Cr24":
    header = int.from_bytes(data[8:12], "little")
    data = data[12 + header :]
elif data[:2] != b"PK":
    sys.exit(f"CRX desconocido: magic={data[:8]!r}")
import shutil
if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)
zipfile.ZipFile(__import__("io").BytesIO(data)).extractall(dest)
mf = dest / "manifest.json"
if not mf.exists():
    sys.exit("extract falló: no hay manifest.json")
print("extension", mf.parent, "ok")
PY

if [[ ! -d "$SKILL_DIR/node_modules/playwright" ]]; then
  echo "npm install playwright…"
  (cd "$SKILL_DIR" && npm install --omit=dev --no-fund --no-audit)
fi
if [[ ! -d "$HOME/.cache/ms-playwright" ]] || ! ls "$HOME/.cache/ms-playwright"/chromium-* >/dev/null 2>&1; then
  echo "playwright install chromium…"
  (cd "$SKILL_DIR" && npx playwright install chromium)
fi

echo "DATA_DIR=$DATA_DIR"
echo "EXT_DIR=$EXT_DIR"
echo "EXT_ID=$EXT_ID"
echo "listo. siguiente: $SKILL_DIR/scripts/launch.sh"

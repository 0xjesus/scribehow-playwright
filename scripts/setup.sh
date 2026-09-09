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
python3 - "$tmp/scribehow.crx" "$EXT_DIR" "$EXT_ID" <<'PY'
import base64, hashlib, json, shutil, sys, zipfile
from io import BytesIO
from pathlib import Path

src, dest, want_id = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
raw = src.read_bytes()
zip_bytes = raw
header = b""
if raw[:4] == b"Cr24":
    header_size = int.from_bytes(raw[8:12], "little")
    header = raw[12 : 12 + header_size]
    zip_bytes = raw[12 + header_size :]
elif raw[:2] != b"PK":
    sys.exit(f"CRX desconocido: magic={raw[:8]!r}")

if dest.exists():
    shutil.rmtree(dest)
dest.mkdir(parents=True)
zipfile.ZipFile(BytesIO(zip_bytes)).extractall(dest)
mf = dest / "manifest.json"
if not mf.exists():
    sys.exit("extract falló: no hay manifest.json")


def read_varint(buf, i):
    n = shift = 0
    while True:
        b = buf[i]
        i += 1
        n |= (b & 0x7F) << shift
        if not (b & 0x80):
            return n, i
        shift += 7


def iter_fields(buf):
    i = 0
    while i < len(buf):
        tag, i = read_varint(buf, i)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            val, i = read_varint(buf, i)
            yield field, wire, val
        elif wire == 1:
            yield field, wire, buf[i : i + 8]
            i += 8
        elif wire == 2:
            ln, i = read_varint(buf, i)
            yield field, wire, buf[i : i + ln]
            i += ln
        elif wire == 5:
            yield field, wire, buf[i : i + 4]
            i += 4
        else:
            raise RuntimeError(f"wire {wire}")


def ext_id_from_der(der: bytes) -> str:
    h = hashlib.sha256(der).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in h)


keys = []
if header:
    for field, wire, val in iter_fields(header):
        if field == 2 and wire == 2:
            for f2, w2, v2 in iter_fields(val):
                if f2 == 1 and w2 == 2:
                    keys.append(v2)

chosen = next((k for k in keys if ext_id_from_der(k) == want_id), keys[0] if keys else None)
if chosen:
    key_b64 = base64.b64encode(chosen).decode("ascii")
    manifest = json.loads(mf.read_text())
    ordered = {"key": key_b64}
    for k, v in manifest.items():
        if k != "key":
            ordered[k] = v
    mf.write_text(json.dumps(ordered, indent=2) + "\n")
    print("extension", mf.parent, "ok id", ext_id_from_der(chosen))
else:
    print("extension", mf.parent, "ok (sin key CRX; ID será path-hash)")
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

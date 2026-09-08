#!/usr/bin/env bash
# Chromium de Playwright (Google Chrome 146 ignora --load-extension).
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$SKILL_DIR/scripts/launch.mjs"

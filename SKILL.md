---
name: scribehow-playwright
description: >
  Arranca un Chrome headed con la extensión Scribehow y graba tutoriales
  clic a clic vía Playwright/CDP. Use when the user runs /scribehow-playwright,
  pide un tutorial o manual Scribehow, guías SOP con la extensión de Scribe,
  o grabar un walkthrough con Playwright + Scribehow.
---

# Scribehow + Playwright

Scribehow **solo** graba si la extensión está en el Chromium que hace los clics.
Google Chrome 146 **ignora** `--load-extension` (el worker que ves puede ser
uno built-in, no Scribe). Por eso `launch.sh` usa Chromium de Playwright.
`claude-in-chrome` y el Playwright MCP default **no** sirven.

Perfil dedicado: `~/.local/share/scribehow-playwright/`
CDP: `http://127.0.0.1:9333` (no 9222: ese lo usa el Chrome del usuario).
Web Store ID: `okfkdaglfjjjfefdcppliegebpoegaii`. Cargada unpacked el ID lo da Chrome (path-hash); `scribe.mjs status` / `ext` lo detectan. No asumas el ID de la store.

```bash
SKILL=~/.grok/skills/scribehow-playwright
"$SKILL/scripts/setup.sh"     # una vez (baja el CRX + npm playwright)
"$SKILL/scripts/launch.sh"    # Chrome headed + extensión + CDP
node "$SKILL/scripts/scribe.mjs" status
```

## Flujo

1. `setup.sh` si no existe `~/.local/share/scribehow-playwright/extension/manifest.json`.
2. `launch.sh`. Si es la **primera vez**, el usuario entra a Scribehow **en esa ventana** (no en su Chrome de siempre).
3. `node scripts/scribe.mjs start` — pulsa **Start Capture**. Si sale código 2: no hay login en este perfil.
4. Recorré el producto **con este CDP**, no con claude-in-chrome:

```bash
node "$SKILL/scripts/scribe.mjs" open 'https://sava.portal.corp.cr/Account/Login'
node "$SKILL/scripts/scribe.mjs" pages
```

Clicks reales (`page.click`, `getByRole`, login, menú). Cada clic es un paso de Scribe.
5. `node scripts/scribe.mjs complete` — **Complete Capture**. Imprime la URL `scribehow.com/shared/…` si Scribe la abrió.
6. Una guía = un capture. Para un manual de 19, repetí 3–6 por flujo y agrupá en una Page de Scribehow.

## Qué no hacer

| Excuse | Reality |
|---|---|
| "uso claude-in-chrome, es Chrome" | Otro perfil. Scribehow no ve esos clics. |
| "Playwright MCP default" | Chromium limpio, sin extensión. |
| "headless" | Scribehow necesita UI headed. |
| "grabo las 19 de una" | Un capture = un flujo. Completá y arrancá de nuevo. |

## Errores

- CDP caído → `launch.sh`
- Start Capture no aparece → login en **esta** ventana (`open https://scribehow.com`)
- Clics no salen en la guía → estabas en claude-in-chrome
- `--load-extension` ignorado → el launch ya pasa `DisableLoadExtensionCommandLineSwitch`

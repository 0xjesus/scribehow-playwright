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
El Chromium **se ve**, pero no debe robar el foco: `launch.sh` y `scribe.mjs` guardan la ventana activa, demotean la de Scribe (`_NET_WM_USER_TIME=0`) y restauran. Nunca `bringToFront`. Clicks van por CDP en segundo plano.
Web Store ID: `okfkdaglfjjjfefdcppliegebpoegaii`. `setup.sh` inyecta la `key` del CRX en el manifest para que unpacked use ese ID (si no, Chrome pone un path-hash y Complete se cuelga con “Problem connecting to the extension”). `scribe.mjs status` / `ext` lo detectan. `complete` espera máx. 45s una pestaña **nueva** `scribehow.com/o/<org>/viewer/…` (o `shared`) y corta; no loop.

**Extensión ≥ 104 (sep 2026):** el botón Start Capture vive en `sidepanel-home.html` (sin iframe) y llama a `chrome.action.openPopup()`, que Chrome solo permite con la ventana **enfocada** → con la ventana demoteada no hace nada. `scribe.mjs start` no clickea ese botón: abre el selector `tab-selector/index.html` con `chrome.tabs.create` (misma ruta que el mensaje `openTabSelector`), elige la pestaña (`New Tab` o `start "<título>"`) y espera el recorder, que carga en el iframe de `sidepanel.html` (`scribehow.com/sidebar/recorder`, OOPIF con url vacía por CDP: se detecta por texto). `sidepanel.html` tiene que estar abierta o el service worker tira `Receiving end does not exist`. **Complete Capture está deshabilitado hasta que haya ≥1 paso.**

```bash
SKILL=~/.grok/skills/scribehow-playwright
"$SKILL/scripts/setup.sh"     # una vez (baja el CRX + npm playwright)
"$SKILL/scripts/launch.sh"    # Chrome headed + extensión + CDP
node "$SKILL/scripts/scribe.mjs" status
```

## Flujo

1. `setup.sh` si no existe `~/.local/share/scribehow-playwright/extension/manifest.json`.
2. `launch.sh`. Si es la **primera vez**, el usuario entra a Scribehow **en esa ventana** (no en su Chrome de siempre).
3. `node scripts/scribe.mjs start` — abre el selector y arranca la captura en `New Tab` (o `start "Titulo de pestaña"` para una existente). Código 2: no hay login en este perfil. Código 4: ya hay captura activa (`complete` o `discard` primero).
4. Recorré el producto **con este CDP**, no con claude-in-chrome:

```bash
node "$SKILL/scripts/scribe.mjs" open 'https://sava.portal.corp.cr/Account/Login'
node "$SKILL/scripts/scribe.mjs" pages
```

Clicks reales (`page.click`, `getByRole`, login, menú). Cada clic es un paso de Scribe.
5. `node scripts/scribe.mjs complete` — **Complete Capture**. Imprime la URL `scribehow.com/o/…/viewer/…` de la guía nueva. `discard` tira la captura sin guardar.
6. Una guía = un capture. Para un manual de 19, repetí 3–6 por flujo y agrupá en una Page de Scribehow.

## Qué no hacer

| Excuse | Reality |
|---|---|
| "uso claude-in-chrome, es Chrome" | Otro perfil. Scribehow no ve esos clics. |
| "Playwright MCP default" | Chromium limpio, sin extensión. |
| "headless" | Scribehow necesita UI headed, pero **sin foco**. |
| "bringToFront / windowactivate" | Te saca de tu ventana. Prohibido. |
| "grabo las 19 de una" | Un capture = un flujo. Completá y arrancá de nuevo. |

## Errores

- CDP caído → `launch.sh`
- Start Capture no aparece → login en **esta** ventana (`open https://scribehow.com`)
- `start` dice “ya hay una captura activa” → `complete` o `discard`
- `complete` dice deshabilitado → todavía no hay pasos; hacé clics en la pestaña grabada
- Clics no salen en la guía → estabas en claude-in-chrome
- `--load-extension` ignorado → el launch ya pasa `DisableLoadExtensionCommandLineSwitch`

# scribehow-playwright

Chrome/Chromium headed con la extensión **Scribe** cargada. Playwright se conecta por CDP (`127.0.0.1:9333`) y graba tutoriales clic a clic.

Google Chrome 146 **no** carga `--load-extension`. El launcher usa Chromium de Playwright.

## Uso

```bash
./scripts/setup.sh
./scripts/launch.sh
node scripts/scribe.mjs status   # tiene que listar Scribe, no un worker built-in
node scripts/scribe.mjs ext      # chrome://extensions con la tarjeta Scribe
```

Primera vez: login a Scribehow **en esa ventana**.

```bash
node scripts/scribe.mjs start      # abre el selector y graba en New Tab (start "Titulo" para una pestaña)
node scripts/scribe.mjs open URL   # el producto
# clics en ESE Chromium
node scripts/scribe.mjs complete   # imprime la URL de la guía (discard = descartar)
```

Skill Grok: copiá esto a `~/.grok/skills/scribehow-playwright/` o clona ahí. Slash: `/scribehow-playwright`.
Claude Code: `ln -s ~/.grok/skills/scribehow-playwright ~/.claude/skills/scribehow-playwright`.

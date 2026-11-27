# 278 — proba de browser a persistenței live

Generată de `npm run save:live:probe`; Chrome 157.0.8103.51, backend WEBGL2,
viewport 1024x640, tick 6751.

- Fișier: `self-driving-academy-live-20261127T202316707Z.sdasave` (70758 bytes), checksum `2350daabd267f042d6cd2ca4a596a113ab5c29a47bbdc4c0faaab76ff4a51496`.
- Generație: 9, tick 6749, corp 225 69812 bytes.
- Autosave: tick simulat 6751, ultimul tick salvat 6747,
  cost commit 0.8000001907348633 ms.
- XP: 1.83485 → 2.001516 → 1.83485 (fingerprint
  `fnv1a32:15e819ec` → `fnv1a32:15e819ec`).
- KPI: zile 1, fingerprint `670840908c394a9971b137cef6b6c6d3`; păstrat în slot după import/reload:
  true.
- Companie: revenue 540 → 540
  (fingerprint `0315fbb4025bd0a2558b6f95841883e4` → `0315fbb4025bd0a2558b6f95841883e4`);
  modificată înainte de import: true.
- Reload: true, XP 1.83485, companie 0315fbb4025bd0a2558b6f95841883e4, launch
  PAUSED_AUTO, offline income 0.
- Al doilea import: ΔXP 0, Δ daily 0, companie
  neschimbată true.
- Refuzuri: checksum `CHECKSUM_MISMATCH`, confirmare `null`.
- Panou: Salvează/Încarcă Confirmă înlocuirea, Anulează, Închide; 23 listeneri în shell,
  0 globali.

Capturi: [screenshots/01-live-before-save.png](screenshots/01-live-before-save.png), [screenshots/02-load-preview.png](screenshots/02-load-preview.png), [screenshots/03-after-import.png](screenshots/03-after-import.png), [screenshots/04-after-reload.png](screenshots/04-after-reload.png).

- `export accepted`: PASS — 2350daabd267f042d6cd2ca4a596a113ab5c29a47bbdc4c0faaab76ff4a51496
- `checksum length`: PASS — 2350daabd267f042d6cd2ca4a596a113ab5c29a47bbdc4c0faaab76ff4a51496
- `file bytes`: PASS — 70758 bytes
- `XP before`: PASS — 1.83485
- `KPI days`: PASS — 1
- `company revenue before`: PASS — 540
- `invalid checksum refused`: PASS — CHECKSUM_MISMATCH: The savefile was modified or is corrupted; the game was not loaded
- `preview accepted`: PASS — preview accepted, no implicit import
- `XP mutated before import`: PASS — 1.83485 -> 2.001516
- `company mutated before import`: PASS — 540 -> 1417
- `import committed`: PASS — 2350daabd267f042d6cd2ca4a596a113ab5c29a47bbdc4c0faaab76ff4a51496
- `XP restored`: PASS — 1.83485
- `company restored`: PASS — 540
- `KPI slot preserved`: PASS — 670840908c394a9971b137cef6b6c6d3
- `launch after import`: PASS — PAUSED_AUTO
- `second import XP delta`: PASS — 0
- `second preview accepted`: PASS — Fișier verificat. Confirmă înlocuirea sesiunii curente.
- `second import daily delta`: PASS — 0
- `second import company stable`: PASS — 0315fbb4025bd0a2558b6f95841883e4
- `reload restored`: PASS — 2350daabd267f042d6cd2ca4a596a113ab5c29a47bbdc4c0faaab76ff4a51496
- `reload XP`: PASS — 1.83485
- `reload company`: PASS — 540
- `reload KPI slot`: PASS — 670840908c394a9971b137cef6b6c6d3
- `reload paused launch`: PASS — PAUSED_AUTO
- `reload no offline income`: PASS — 0
- `shell listeners`: PASS — 23

Limite: proba este Chrome headless/WEBGL2 și nu înlocuiește un playtest uman. KPI-ul 209 este un slot
read-only: fișierul îl păstrează și îl verifică prin fingerprint, dar ledgerul live 209 nu este
rehidratat (owner-ul 266 nu expune restore); compania 268/269 este reconstruită prin replay real.

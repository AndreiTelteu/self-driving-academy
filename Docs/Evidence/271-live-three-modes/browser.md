# 271 — proba de browser a celor trei moduri live

Generată de `npm run modes:live:probe`; Chromium Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36, viewport 1440x900.

Flux real: start → panoul `Flotă` → selectarea unui taxi → preluare `M` → tastele reale `L`/`M`
pentru toate cele șase tranziții. Proba citește numai read model-ul live al segmentelor 069,
scaunul `PLAYER` și textele HUD.

- `panel-open`: PASS — fleet panel opens over the live frame
- `auto-to-manual-segment`: PASS — active MANUAL start 30 at 33
- `one-player-seat`: PASS — exactly one PLAYER seat
- `manual-to-learning-same-tick`: PASS — LEARNING start 62, MANUAL closed 62
- `learning-hud-label`: PASS — Conduci · orașul învață / Learning · L / Eligibil pentru învățare
- `learning-exposed-not-published`: PASS — TELEMETRY_272, publications 0
- `learning-to-manual`: PASS — closed LEARNING/MODE_CHANGE
- `manual-to-auto`: PASS — closed MANUAL/RETURN_TO_AUTO
- `auto-hud-label`: PASS — Conduce AI-ul
- `hud-learning-button`: PASS — active LEARNING eligible true
- `learning-to-auto`: PASS — closed LEARNING/RETURN_TO_AUTO; exposed 2

## Limitări

- Proba este un scurt drum local, nu un playtest complet și nu o măsurare FPS/GPU/hardware.
- Segmentul LEARNING este expus pentru 272; nicio versiune de profil nu este publicată aici.

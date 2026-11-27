# 275 — proba de browser a misiunilor live

Generată de `npm run missions:live:probe`; Chromium Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36, backend WEBGL2,
viewport 1024x640, tick 16–6925.

Secvența reală: start → tutorial selectat prin preluarea unui taxi revendicat → MANUAL → LEARNING
eligibil oprit de tutorial → AUTO → pickup/dropoff 032 reale conduse de actorul 058 → etapa 1 `COMPLETED` cu
recompensa 125 o singură dată → „Oraș proaspăt” real → etapa 2 `FAILED` cu motivul
`SCENARIO_RESET` → panoul arată etapa 1 completă, etapa 2 eșuată, reluarea disponibilă.

- Taxi: `id-v1:7:vehicle13:v3:city:fleet4:TAXI4:0012`; cursă: `id-v1:4:ride13:v3:city:rides50:id-v1:12:ride-request13:v3:city:rides4:w0005:r0005`; pickup `sz:1-1` → dropoff
  `sz:1-0`; boarding 2002, completion 6800.
- Etapa 1: COMPLETED; XP 100; recompense acordate 2.
- Etapa 2: AVAILABLE / SCENARIO_RESET; XP după eșec 100; amprenta
  profilului identică.
- Panou: 8 misiuni, etapa 1 `data-state="COMPLETED"`, etapa 2
  `data-attempt-state="FAILED"`, `data-failure="SCENARIO_RESET"`,
  `data-replay="true"`.

Capturi: [screenshots/01-manual.png](screenshots/01-manual.png), [screenshots/02-learning.png](screenshots/02-learning.png), [screenshots/03-pickup.png](screenshots/03-pickup.png), [screenshots/04-dropoff.png](screenshots/04-dropoff.png), [screenshots/05-completed.png](screenshots/05-completed.png), [screenshots/06-stage-1-complete.png](screenshots/06-stage-1-complete.png), [screenshots/07-panel-stage-1.png](screenshots/07-panel-stage-1.png), [screenshots/08-failed.png](screenshots/08-failed.png), [screenshots/09-panel-failure.png](screenshots/09-panel-failure.png).

- `missions-port-present`: PASS — the shell mounts the 275 missions port
- `campaign-starts-stage-1`: PASS — active campaign-1-first-taxi
- `tutorial-starts`: PASS — SELECT_TAXI/TUTORIAL_BLOCKS_LEARNING
- `tutorial-select-and-manual`: PASS — step 2
- `tutorial-learning-ineligible`: PASS — step 3 SATISFIED, jobs 0
- `tutorial-auto-and-ride-step`: PASS — step 4
- `tutorial-completed-by-play`: PASS — PLAY/5
- `stage-1-completed`: PASS — stage 1 is COMPLETED in the real 125 progress
- `stage-1-reward-once`: PASS — XP 100, granted 2
- `stage-2-started`: PASS — active campaign-2-first-demonstration
- `tutorial-no-learning`: PASS — zero jobs, versions and profile writes
- `learning-gate-skipped-segment`: PASS — ineligible 1, versions 0, jobs 0
- `panel-stage-1-completed`: PASS — COMPLETED/COMPLETED
- `panel-replay-policy`: PASS — replay true
- `failure-reason-scenario-reset`: PASS — stage 2 carries the closed failure reason
- `failure-preserves-xp`: PASS — XP 100 -> 100
- `failure-preserves-profile`: PASS — the learned style fingerprint is identical before and after the failure
- `failure-no-profile-write`: PASS — zero profile writes and zero XP delta
- `panel-failure-reason`: PASS — FAILED/SCENARIO_RESET
- `panel-replay-available`: PASS — replay true
- `panel-focus-and-no-global-listener`: PASS — global 0, surface 3
- `page-errors-zero`: PASS — 0 page, 0 console

Limite: proba conduce cu input real și poziția autoritară a compunerii, dar nu înlocuiește un
playtest uman și nu măsoară FPS/GPU. Eșecul este produs de resetul real de scenariu al shell-ului,
nu de un eveniment fabricat.

---
id: "266"
title: "Economia live: revenue, review-uri, KPI și ceasul economic"
status: "Done"
release: "V1"
module: "Economie"
depends_on: ["265"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-266"
started_at: "2026-11-26T17:35:32.357Z"
completed_at: "2026-11-26T20:21:03.694Z"
---

# 266 Economia live: revenue, review-uri, KPI și ceasul economic

## Obiectiv

Fiecare cursă terminală produce exact o decontare și un review când experiența este evaluabilă, iar KPI-urile se agregă pe ziua și luna simulată.

## Starea actuală și ce lipsește

- `createFleetEconomy` nu este instanțiat în compunerea live.
- Nu există ceas economic, zi/lună simulată sau expunere care să hrănească KPI-urile.
- Nu există review-uri reale din cursele jucătorului sau din taxiurile AI.
- Nu există legătura dintre incidente/confomfort și rating.
- Nu există idempotență vizibilă între reload, reluare și dubla livrare.
- Nu există o probă de browser cu revenue și rating după o cursă.

## Context și plan

- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Indicatorii de serviciu](../../Docs/metric-service.md)
- [Indicatorii de comportament](../../Docs/behavior-metrics.md)
- [Indicatorii de confort](../../Docs/comfort-metrics.md)
- [Savefile și integritate](../../Docs/29-savefile-si-integritate.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 265 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] COMPLETED încasează tariful complet o singură dată; FAILED/CANCELLED respectă regulile versionate.
- [x] Civilii nu ajung niciodată în revenue, curse sau review-uri.
- [x] Un review există cel mult o dată per cursă evaluabilă, cu motiv din vocabularul închis.
- [x] Bucketurile de zi și lună păstrează revenue, curse, review-uri, `ratingSum`, histogramă și expunere.
- [x] Pauza și focusul suspendă ceasul economic; offline nu produce revenue.
- [x] `historyScans` rămâne `0`, iar un eveniment duplicat nu schimbă nimic.

## Verificare

- Raport determinist pe curse mixte, anulări, review-uri și reload.
- Probă în browser: o cursă produce revenue și rating vizibil.
- Verifică idempotența și `historyScans` înainte/după panou.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-economy-composition.ts` compune economia 209 peste cursele terminale 061/265, cu un singur settle-uri per `rideId`, review 209 și bucketuri KPI. `src/economy/live-economy.ts` expune read model-ul `266-live-economy-v1`: tick economic, epoch, revenue, curse, review-uri, `ratingSum`, histogramă, expunere, proiecție și `historyScans: 0`. Portul `economy` rulează după `rides`; sesiunile au ledger separat, iar resetul pornește un epoch nou fără să rescrie istoricul. Review-ul consumă confortul real 139, coliziunile 028 și secunde blocate 137; ferestrele 088 sunt aplicate trace-ului de confort, iar incidentul rămâne în review. HUD-ul live afișează revenue/rating/zi/lună la 10 Hz, fără listeneri.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (462 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run economy:live -- --check` — PASS. Teste țintă 15/15 PASS. `npm test` integrat: 3.640 teste, 3.626 pass, 0 fail, 14 skip-uri istorice. Raport determinist 63/63: COMPLETED 553 SDA, un settle și un review rating 5; FAILED cu refund 544 SDA și 0 revenue; CANCELLED înainte de boarding 0; CANCELLED cu pasager 165 SDA; coliziune reală 028 (impuls 4.400 N·s) → rating 5→4, motiv `COLLISION`, `penalties.incident=1`; fereastra 088 exclude 4 eșantioane (14→10 intervale) fără să șteargă incidentul; 137 blocked 90 s → `BLOCKED_ROUTE`, penalizare 0,5, rating 5→4; civilii `CIVILIAN_NOT_BILLABLE`; duplicate/replay neschimbate; 600 citiri păstrează revenue 553 și `historyScans: 0`; epoch 1→2 păstrează istoricul și următoarea cursă ridică totalul la 1.047 SDA. Browser probe 19/19 PASS, Chrome 157/WEBGL2/1440×900: revenue 9.335 SDA, 18 settle-uri/review-uri, target 1 settle/1 review rating 5, `historyScans: 0` înainte/după panou; capturi în `Docs/Evidence/266-live-economy/screenshots/`.

Fișiere și documente actualizate: `src/app/live-economy-composition.ts`, `src/economy/live-economy.ts`, `src/economy/index.ts`, `src/main.ts`, `src/ui/live-economy-format.ts`, `src/ui/live-economy-hud.ts`, `src/ui/index.ts`, `src/app/index.ts`, tests economy/UI/fixture/report/telemetry, `scripts/run-live-economy-report.mjs`, `scripts/run-live-economy-probe.mjs`, `package.json`, `Docs/07`, `Docs/21`, `Docs/22`, `Docs/31`, `Docs/README.md`, `Docs/live-economy.md`, `Docs/Evidence/266-live-economy/`.

Limitări sau follow-up: Scenariile live de coliziune/blocked/088 în browser sunt `NOT_RUN` pentru că 028 nu are încă adaptorul live (282), iar 088/137 nu au proprietarii live (272); porturile sunt cablate și dovedite determinist cu proprietarii reali. Persistarea/reload-ul economiei rămâne 278. Cursele închise direct de resetul 265 cu `SCENARIO_RESET` nu sunt decontate de economie; resetul pornește un epoch nou fără să rescrie istoricul. HUD-ul este read model-ul compact 266, nu popup-ul KPI 267. Proba de browser a folosit Chrome instalat prin `PLAYWRIGHT_MODULE`; Node local 24.19.0, sub 24.21.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '266'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-266`; repair incident/blocked/088 de `loop-pbi/deepseek-266-repair`; integrat, verificat și mutat în Done.

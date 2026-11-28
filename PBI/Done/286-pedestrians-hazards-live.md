---
id: "286"
title: "Pietoni, treceri și pericole V2 în lumea live"
status: "Done"
release: "V2"
module: "Pietoni și pericole"
depends_on: ["282","283"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-286"
started_at: "2026-11-28T13:06:31.249Z"
completed_at: "2026-11-28T14:23:29.623Z"
---

# 286 Pietoni, treceri și pericole V2 în lumea live

## Obiectiv

Pietonii traversează, mașinile cedează, pericolele produc reacție reală, iar contexte pentru learning și provocări sunt observabile.

## Starea actuală și ce lipsește

- Nu există pietoni în lumea live.
- Nu există treceri active, faze de traversare sau yield observabil.
- Nu există obstacole/pericole cu reacție și evitare.
- Nu există contexte V2 pentru estimatoare și provocări.
- Nu există o probă de browser cu pieton, yield și obstacol.
- Nu există costul pentru 96 de pietoni/obstacole.

## Context și plan

- [Extensii și mers pe jos](../../Docs/20-extensii-si-mers-pe-jos.md)
- [Autonomie și trafic](../../Docs/06-autonomie-si-trafic.md)
- [Zonele de trecere](../../Docs/crosswalk-zones.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 282 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Pietonii apar pe treceri reale și traversează cu o fază observabilă.
- [x] Un vehicul care cedează este dovedit prin ordinea reală a tick-urilor, nu printr-un text.
- [x] Un pieton neobservat nu produce o dovadă de yield.
- [x] Obstacolele/pericolele produc reacție și evitare în aceeași fizică, fără un al doilea solver.
- [x] Contextul V2 este disponibil estimatoarelor și provocărilor.
- [x] Costul pentru 96 de pietoni/obstacole este raportat.

## Verificare

- Probe pentru traversare, yield, obstacol și context.
- Probă în browser: pieton, frânare, obstacol, ocolire.
- Măsurare și cleanup.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-pedestrian-hazards.ts` (`286-live-pedestrian-hazards-v1`) compune 164 de pietoni, 165 de pericole, obstacolele/incidentele 282, comanda de hazard și frame-urile V2 live, cu contoare de cost mărginite. `walking-composition.ts` aplică comanda de hazard înainte de singurul pas fizic și returnează frame-ul exact post-fizică; `main.ts` creează compunerea pe harta reală, seedează un obstacol numit pe banda taxiului, montează portul `pedestrians` și dispune la reset. `live-pedestrian-scene.ts` afișează snapshot-urile autoritare fără să dețină stare sau fizică. Pietonii apar pe treceri reale și parcurg `ON_SIDEWALK → WAITING → CROSSING → CROSSED → WITHDRAWN`; yield-ul este dovedit de ordinea reală a tick-urilor, nu de text; un pieton neobservat nu produce yield; pericolele produc reacție și evitare în același solver 282; contextul V2 este disponibil estimatoarelor și provocărilor.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (494 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run pedestrians:live -- --check`, `npm run pedestrians:live:cost` — PASS. Teste țintă 6/6 (grupul 286). `npm test` integrat: 3.851 teste, 3.837 pass, 0 fail, 14 skip-uri istorice. Raport 9/9: 80 treceri autorate, 48 legături live, 96 pietoni; faze observabile; conflict tick **197**, oprire fizică tick **284**, oprire în traversare la 9,68 m, 0,17 m/s, `YIELDED`, yield observat 1,0 (2/2); 92 traversări `UNOBSERVED` cu 0 opriri/0 yield și `YIELD_RATE = MISSING`; hazard 1/1 cutii 282 numite, reacție `BRAKE` cu latență reală, `PASSED_CLEAR`, fără contact, distanță minimă 4,03 m, 0 incidente; 900 frame-uri V2 cu `PEDESTRIAN`, `OBSTACLE`, `BRAKE_INPUT`, `LONGITUDINAL_ACCEL` și chei observabile; cost 96 pietoni + 96 pericole, 600 pași, 53.985/103.664 evaluări, p95 **0,137 ms** (0,140 ms la re-rulare), sub buget. Browser probe 7/7 PASS, Chrome 157: traversare la tick 89, yield la 181, obstacol abordat/evitat; capturi în `Docs/Evidence/286-live-pedestrians/screenshots/`.

Fișiere și documente actualizate: `src/app/live-pedestrian-hazards.ts`, `src/app/index.ts`, `src/app/walking-composition.ts`, `src/main.ts`, `src/rendering/babylon/live-pedestrian-scene.ts`, `src/rendering/babylon/index.ts`, `src/rendering/babylon/v3-browser-composition.ts`, tests app/browser, `scripts/run-live-pedestrians-report.mjs`, `scripts/run-live-pedestrians-cost.mjs`, `scripts/run-live-pedestrians-probe.mjs`, `package.json`, `Docs/20`, `Docs/31`, `Docs/Evidence/286-live-pedestrians/`.

Limitări sau follow-up: 32 din 80 de treceri nu au trotuar la ambele capete; 164 le refuză cu `NO_SIDEWALK`, iar raportul păstrează golul. Pietonii nu au collider Rapier nativ în 282, deci nu se inventează dovezi de impact vehicul–pieton; canalul de contact 164 rămâne disponibil owner-ului de coliziuni. Doar sloturile libere de cutii numite 028 devin fizice; proba de cost 96 pericole folosește obstacole de date, fără 96 de corpuri native. Proba de browser este un fixture al aceleiași compuneri/fizici, nu shell-ul complet; nu pretinde FPS/GPU/heap. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '286'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-286`; integrat, verificat și mutat în Done.

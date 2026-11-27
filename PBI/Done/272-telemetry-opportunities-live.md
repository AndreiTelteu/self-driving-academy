---
id: "272"
title: "Telemetrie, oportunități și eligibilitate din condusul live"
status: "Done"
release: "V1"
module: "Moduri și learning"
depends_on: ["271"]
performance_checks: ["simulation","memory"]
owner: "loop-pbi/deepseek-272"
started_at: "2026-11-27T02:07:43.902Z"
completed_at: "2026-11-27T04:21:35.976Z"
---

# 272 Telemetrie, oportunități și eligibilitate din condusul live

## Obiectiv

Fiecare segment live produce eșantioane 085, oportunități 086, ferestre 087 și artefacte 088, cu deduplicare și fără muncă pe hot path.

## Starea actuală și ce lipsește

- Nu există writer de telemetrie conectat la condusul jucătorului.
- Nu există oportunități STOP/semnal/urmărire/bandă din contextul real al lumii live.
- Nu există ferestre de eligibilitate și nici excluderea pauzelor, focusului și teleportărilor.
- Nu există deduplicare pe `opportunity.id + occurrence`.
- Nu există includerea taxiurilor și civililor din afara camerei.
- Nu există un cost măsurat pentru înregistrare și nici un buffer mărginit.

## Context și plan

- [Telemetrie și oportunități](../../Docs/09-telemetrie-si-oportunitati.md)
- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Eșantioanele la tick](../../Docs/telemetry-samples.md)
- [Dovezile de learning](../../Docs/learning-evidence.md)
- [Indicatorii de comportament](../../Docs/behavior-metrics.md)
- [Regresiile de intervenție](../../Docs/learning-edgecases.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Un segment live produce eșantioane la 60 Hz, cu input brut, comandă filtrată, viteză, bandă, semnal și clasă.
- [x] Oportunitățile vin din contextul real și sunt deduplicate pe identitate și ocurență, nu pe cadre.
- [x] Pauza, focusul pierdut și teleportarea produc artefacte și nu devin dovezi de stil.
- [x] MANUAL rămâne în metrici, dar nu devine demonstrație eligibilă.
- [x] Toate taxiurile și civilii contribuie, indiferent de cameră sau selecție.
- [x] Bufferul este mărginit, hot path-ul nu serializează JSON per tick, iar costul este raportat.

## Verificare

- Teste pe fixture-ul real 044/036/025/023 și pe segmente închise.
- Verifică deduplicarea, artefactele și numitorii.
- Măsoară costul p95 per tick și memoria bufferului.

## Dovezi de finalizare

Rezultat implementare: `src/telemetry/live-telemetry.ts` (`272-live-telemetry-v1`) și adaptorul `src/app/live-telemetry.ts` leagă 085–088 de tick-ul autoritar al compunerii V3 și de segmentele 069 ale 271. Segmentele MANUAL/LEARNING scriu eșantioane la 60 Hz cu input brut, comandă filtrată, viteză, bandă, semnal și clasă. Toate taxiurile și civiliile scriu într-un inel world mărginit, indiferent de cameră sau selecție. Oportunitățile 086 provin din linia STOP reală, mișcarea semnalului 036 și schimbarea benzii vecine; ferestrele 087 acoperă suspensia, liderul/coada, semnalul, verdele blocat, cererea mecanică și impactul. Pauza, focusul pierdut și teleportarea produc artefacte 088 cu prefix utilizabil. Deduplicarea este pe `opportunity.id + occurrence`. MANUAL rămâne în metrici fără demonstrație eligibilă; `readClosedSegment`/`readWorldSamples` expun datele pentru 273 fără job, estimator, profil sau XP.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (471 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run telemetry:live -- --check`, `npm run telemetry:live:cost` — PASS. Teste țintă 9/9. `npm test` integrat: 3.713 teste, 3.699 pass, 0 fail, 14 skip-uri istorice. Raport 12/12: 58/58 vehicule, 10.440 rânduri world pe 180 tick-uri, 0 pierdute; MANUAL 90 eșantioane/0 demonstrații; LEARNING 60 eșantioane, 1 segment închis eligibil, 61 eșantioane citibile; STOP 1 oportunitate `RESOLVED/STOPPED`, ocurența 0, 1 ocurență unică, 5 cadre duplicate, fereastră `ELIGIBLE/FREE_TRAFFIC`, 4 observații, `eligibleOccurrences=1`; semnal real `GREEN`; 1 episod follower deduplicat; artefacte `SUSPENSION_FOCUS_LOST` + `RECOVERY_TELEPORT`, prefix utilizabil 39 tick-uri, completitudine `PARTIAL`, 0 ferestre eligibile suprimate; buffer mărginit 1.024/1.024 reținute, 176 eliminate, 86.030 B; dedupe 1 unică/5 duplicate/0 eliminări. Cost AMD Ryzen 7 7735U, Node 24.19.0, 58 vehicule, 300 tick-uri: writer p50 0,3968 ms, p95 0,7067 ms, p99 0,934 ms, max 1,1991 ms; compunere p95 4,741 ms separat; memorie 1.882.706 B din 33.554.432 B, `withinBudget: true`. Amprenta XP/profil `4ec212b3…e518`: 0 publicări, 0 joburi, 0 schimbări XP, 0 demonstrații.

Fișiere și documente actualizate: `src/telemetry/live-telemetry.ts`, `src/telemetry/index.ts`, `src/app/live-telemetry.ts`, `src/app/index.ts`, `src/app/walking-composition.ts`, `src/main.ts`, tests telemetry/app, `scripts/run-live-telemetry-report.mjs`, `scripts/run-live-telemetry-cost.mjs`, `package.json`, `Docs/09`, `Docs/21`, `Docs/31`, `Docs/README.md`, `Docs/live-telemetry.md`, `Docs/Evidence/272-live-telemetry/`.

Limitări sau follow-up: Regulile live de trafic (283) nu opresc încă vehiculele la semnal; starea semnalului este reală, obediența nu. Nu există owner live de ocluzie, deci conul camerei este conservator, iar ultimii 4 m dinaintea liniei STOP nu sunt reevaluați ca `NOT_OBSERVABLE`. Teleportarea este dovedită cu un fapt 030 injectat de host; producătorul live rămâne 282. Rândurile AI `raw`/`command` sunt normalizate din accelerația/yaw rate autoritară, fiindcă 058 nu expune un cadru de input brut. Consumul 273 este expus, dar neexercitat aici. Browser probe `NOT_RUN`: `PLAYWRIGHT_MODULE` nu este setat și Playwright nu este instalat în checkout. Costul este software, pe un laptop, fără pretenție FPS/GPU/hardware.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '272'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

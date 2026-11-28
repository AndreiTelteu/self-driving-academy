---
id: "284"
title: "Traficul civil complet autonom și preluarea oricărei mașini"
status: "Done"
release: "V1"
module: "Trafic"
depends_on: ["262","283"]
performance_checks: ["simulation"]
owner: "loop-pbi/deepseek-284"
started_at: "2026-11-28T08:59:54.576Z"
completed_at: "2026-11-28T11:02:04.841Z"
---

# 284 Traficul civil complet autonom și preluarea oricărei mașini

## Obiectiv

Civilii folosesc întregul lanț de context/politică, respectă regulile, iar jucătorul poate prelua orice mașină fără teleport sau rută pierdută.

## Starea actuală și ce lipsește

- Traficul civil live are context incomplet (`signals: []`, fără obstacole/zone).
- Nu folosește semafoare, STOP, prioritate, yield, benzi sau recuperare.
- Nu poate fi preluat de jucător; `requestEntry` îl refuză.
- Nu există reconcilierea rutei la preluare și nici reluarea ei la ieșire.
- Nu există paritate taxi/civil pentru profilul comun și pentru moduri.
- Nu există o probă de browser cu preluarea unui civil AI.

## Context și plan

- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Traficul civil](../../Docs/civil-traffic.md)
- [Traficul AI din browser](../../Docs/browser-ai-traffic.md)
- [Schimbarea vehiculului](../../Docs/vehicle-switch.md)
- [Cursa completă și intervenția](../../Docs/manual-trip.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 262 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Toți civilii folosesc contextul complet și politicile de semafor, STOP, prioritate, yield și bandă.
- [x] Un civil poate fi preluat de jucător; ruta lui este suspendată, nu duplicată.
- [x] La ieșire, civilul revine în AUTO și își reia ruta fără teleport.
- [x] Profilul comun se aplică identic taxiurilor și civililor, iar un vehicul ascuns continuă simularea.
- [x] Un vehicul nou creat nu dublează un ID și nu apare peste jucător.
- [x] Costul pentru 24–40 de civili rămâne în buget.

## Verificare

- Teste pentru preluare, suspendare de rută, reluare și paritate.
- Probă în browser: oprește un civil AI, intră în el, condu-l, ieși, verifică reluarea.
- Verifică semafoarele și costul.

## Dovezi de finalizare

Rezultat implementare: Toți civilii primesc același cadru 044 și aceleași comenzi 283 ca taxiurile; contextul publică semnalele 036 și zonele reale 032. `holdCommand` predă acum cererea 054 executorului 058, deci recuperarea din blocaj nu mai rămâne doar un contor. `requestEntry` (G) și `requestTakeover` (M) pot prelua orice mașină AI: ruta este suspendată la poza curentă, poza condusă este reconciliată pe 033, iar ieșirea revine în AUTO la aceeași rută/destinație, fără teleport; dacă poza este off-graph, actorul revine totuși în AUTO la ultima poziție reconciliată, cu motivul în `EXIT_ACCEPTED`. `addVehicle` acceptă o constrângere de spawn, iar achiziția 269 evită jucătorul și mașinile existente fără un al doilea router. Profilul comun este același pentru taxiuri și civili, inclusiv mașinile noi.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (490 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run civil:autonomy -- --check`, `npm run civil:autonomy:cost -- --check`, `npm run civil:traffic -- --check`, `npm run fleet:live -- --check` — PASS. Teste țintă 22/22. `npm test` integrat: 3.833 teste, 3.819 pass, 0 fail, 14 skip-uri istorice. Raport 31/31 pe 24 taxiuri + 40 civili/9.000 tick-uri: 126 semnale, 64/64 actori comandați, hold-uri 167.875 semnal / 40.714 STOP / 43.186 yield, 4 schimbări de bandă, 69 opriri la roșu, 35 abordări STOP/32 opriri complete; 64/64 actori mișcați, 62/62 actori aflați inițial la >80 m mișcați; 1 episod blocat, 2 cereri de reroute, 1 aplicată; takeover rută neschimbată (9 benzi), drift înghețat 0 m, condus 8 m, salt la ieșire 0,000009 m, reluare 2,098 m, aceeași destinație `lane:43S0`, 56→56 actori; 42/42 ID-uri unice, un actor per mașină adăugată, clearance ≥6 m. Cost 20 taxiuri + 24/32/40 civili p95 **6,06/7,60/6,80 ms** sub bugetul de 8 ms; rândul 30 taxiuri + 40 civili este `STRESS` separat la p95 **9,11 ms**, nu ascuns în gate-ul normal. Browser probe 13/13 PASS, Chrome: civil AI oprit 30 tick-uri → preluat → rută suspendată cu drift **0 m** → condus **11,49 m** → ieșire AUTO → prima poziție AUTO la **0,725 m** de poza condusă → aceeași rută de 5 benzi/destinație → reluare **2,02 m**; 44→44 actori, un rând de frame, 0 erori; capturi în `Docs/Evidence/284-civil-autonomy/screenshots/`.

Fișiere și documente actualizate: `src/fleet/civil-traffic.ts`, `src/app/ambient-traffic.ts`, `src/app/walking-composition.ts`, `src/autonomy/live-traffic-rules.ts`, `src/main.ts`, tests app/autonomy/fleet/browser, `scripts/run-civil-autonomy-report.mjs`, `scripts/run-civil-autonomy-probe.mjs`, `package.json`, `Docs/06`, `Docs/07`, `Docs/20`, `Docs/21`, `Docs/31`, `Docs/browser-ai-traffic.md`, `Docs/civil-traffic.md`, `Docs/live-traffic-rules.md`, `Docs/Evidence/284-civil-autonomy/`, `Docs/Evidence/058-civil-traffic/`.

Limitări sau follow-up: Proba de browser este un fixture Chromium peste compunerea reală 032/033/058/283 cu canvas 2D, nu shell-ul Babylon complet randat; nu este un gate hardware/FPS/GPU. Ieșirea off-graph revine la ultima bandă reconciliată și poate repoziționa mașina pe bandă, cu motivul în `EXIT_ACCEPTED`; ieșirea normală on-graph nu are teleport. Mașinile AI nepreluate rămân proxy-uri cinematice 058; 284 nu mută toată flota pe Rapier. Rândul 30 taxiuri + 40 civili depășește 8 ms în cost.json-ul commitat, dar rândurile de acceptare 24–40 civili trec. 285 destructibilele și 286 pietonii rămân în afara scope-ului. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '284'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-284`; integrat, verificat și mutat în Done.

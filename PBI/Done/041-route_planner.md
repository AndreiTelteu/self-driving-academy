---
id: "041"
title: "Rutare A star și rute valide"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["033","038","040","219"]
performance_checks: ["simulation"]
owner: "opencode deepseek-v4.1-flash medium route-planner-01"
started_at: "2026-10-18T21:58:36.429Z"
completed_at: "2026-10-19T01:20:20+03:00"
---

# 041 Rutare A star și rute valide

## Obiectiv

Creează costuri de bază și trasee prin graf.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 033 trebuie să existe în Done înainte de începere.
- PBI 038 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Rutele respectă sensul benzilor și ajung la punctele de serviciu.
- [x] Lipsa unei rute produce rezultat explicit, fără buclă infinită.

- [x] Cache-ul este plafonat și invalidat după graf/blocaje/costuri; joburile de rutare au coadă ordonată și cost măsurat.

## Verificare

Testează drum blocat, sens unic și origine în afara grafului.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/world/route-planner.ts` (`createRoutePlanner`): model de cost explicit și versionat (`ROUTE_COST_MODEL`, `route-cost-v1` — metri/limită de viteză plus penalizări documentate `TURN`/`CONTINUATION`) peste graful 033 și harta 032, A* pe muchii directionate filtrate după acces TAXI/CIVIL (numai `getConnections`, fără vecini laterali ca muchii și fără muchii inverse), destinații de tip bandă sau `serviceZone` (rezultat explicit `SERVICE_ACCESS_MISMATCH` când zona nu permite accesul cerut), statusuri închise (`READY`, `BLOCKED`, `UNREACHABLE`, `ORIGIN_UNKNOWN`, `DESTINATION_UNKNOWN`, `SERVICE_ACCESS_MISMATCH`, `BUDGET_EXHAUSTED`) cu plafon de expansiuni (16384) și terminare garantată, cache plafonat la 64 de intrări invalidat la schimbarea grafului/costului/blocajelor/greutăților de trafic, și portul `createRouteTask` pentru schedulerul 219 (coada ordonată și cache-ul de scheduler rămân ale lui 219). Exportat prin `src/world/index.ts`; fără dependențe noi și fără schimbarea engine-ului.

Verificări executate și rezultat: implementarea a fost livrată de un subagent în worktree izolat (ramura `t3/pbi041-astar-route-planner`, commituri `7f350e51` și `1a20c758`) și integrată pe `main` prin fast-forward; verificările de mai jos au fost re-rulate independent de orchestrator pe starea integrată: `npm run typecheck` EXIT 0; `npm run lint` EXIT 0; `npm run format:check` EXIT 0; `npm run check:architecture` EXIT 0 (137 fișiere TypeScript + sonde negative); `npm test` EXIT 0 — 805 teste, 805 pass, 0 fail, inclusiv cele 13 teste noi din `tests/world/route-planner.test.ts` și testele 219 păstrate (`cooperative synthetic route jobs…`, `routework admission…`, `routecache…`). Proba locală de cost `node scripts/benchmark-route-planner.mjs` a rulat pe ramura de implementare (commit `7f350e51`): median p95 — referința sintetică 0.01905 ms vs planner direct 0.06325 ms (cost adăugat +0.04420 ms), admitere coadă 16 joburi 0.09570 ms, procesare 4 tick-uri 0.13980 ms. Bugetul `authoritativeTickP95Ms` 5.5 ms rămâne PROVISIONAL_UNCALIBRATED; sonda a rulat pe laptopul AMD Ryzen 7 7735U (16 CPU logice, 14.70 GB, win32 10.0.26300, Node v24.19.0), nu pe desktopul de referință 7950X3D, secvențial și singură, și nu închide un gate hardware/FPS. Acoperirea criteriilor: sens unic + acces (paritate cu `syntheticRouteSearch` păstrat și oracle independent de optimalitate a costului), drum blocat → rezultat explicit fără rută inventată, origine/destinație necunoscută, destinație de tip zonă de serviciu, plafon + invalidare cache pe graf/cost/blocaje, terminare la buget de expansiuni, integrare reală cu coada 219 (ordine `urgent` înainte de `normal`, `CACHED`, `BLOCKED`). `Docs/Evidence/219-simulation-scheduling/route-cost.json` nu a fost modificat sau regenerat.

Fișiere și documente actualizate: `src/world/route-planner.ts` (nou), `src/world/index.ts` (exporturi), `tests/world/route-planner.test.ts` (nou, 13 teste), `tests/world/route-planner-fixture.ts` (nou), `scripts/benchmark-route-planner.mjs` (nou), `Docs/route-planner.md` (nou), `Docs/04-oras-si-retea-rutiera.md` (paragraf PBI041), `Docs/README.md` (link în „Stare și istoric”), `Docs/Evidence/041-route-planner/` (README, `route-planner-cost.json`, stdout/stderr, logurile verificărilor, arhive de sursă). Logurile de dovezi au fost re-codificate din UTF-16 în UTF-8, fără rerularea probelor; fișierul PBI a revenit la terminatori de linie LF (CLI-ul de board îi scrisese ca CRLF).

Limitări sau follow-up: gate-ul de performanță al jocului integrat rămâne deschis; sonda CPU este diagnostică (laptop, graf sintetic de 9 benzi), nu certifică FPS, tick complet sau hardware. Modelul de cost este geometric și nu observă trafic/semafoare/STOP/priorități/obstacole live; un `TURN` static nu acordă trecere pe RED. Semnăturile de cache pentru blocaje și trafic folosesc un hash FNV-1a pe 32 de biți (coliziune teoretică, nedetectată în probe). `createRouteTask` acceptă doar destinații de tip id de bandă, deoarece contractul 219 cere ca ultimul id al traseului să fie `request.destination`; un dispecer rezolvă întâi zona de serviciu cu `resolveDestination`. Orice schimbare de blocaje trebuie însoțită de o nouă `costVersion`. Calibrarea pe harta reală și integrarea cu dispecerul 045 rămân în afara scope-ului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '041' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-19: Ordonatorul `loop-pbi` a revendicat PBI-ul (owner `opencode deepseek-v4.1-flash medium route-planner-01`) și l-a mutat fizic To Do → In Progress; `Validate-Board.ps1` a trecut.

- 2026-10-19: Subagentul a livrat `route-planner.ts` (A\*, cost versionat, destinații bandă/zonă, rezultat explicit, cache plafonat, port `createRouteTask`), testele și proba de cost în worktree izolat; commituri `7f350e51`, `1a20c758`. Integrat pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările pe starea integrată (typecheck/lint/format/architecture EXIT 0; `npm test` 805/805 EXIT 0), a normalizat codificarea logurilor de dovezi în UTF-8, a completat dovezile și a mutat fizic fișierul In Progress → Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

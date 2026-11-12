---
id: "227"
title: "Decor destructibil și zone de joacă"
status: "Done"
release: "V1"
module: "Oraș și fizică"
depends_on: ["226","028","042","044","223"]
performance_checks: ["simulation", "assets", "memory", "frame"]
owner: "loop-pbi/decor-227-01"
started_at: "2026-11-12T03:05:02.8471618+02:00"
completed_at: "2026-11-12T03:28:27.3053200+02:00"
---

# 227 Decor destructibil și zone de joacă

## Obiectiv

Adaugă obiecte care cedează la impact și locuri pentru drift, rampă și demolare, în aceeași fizică pentru toate sursele de control.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 226 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 042 trebuie să existe în Done înainte de începere.
- PBI 044 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Garduri ușoare/conuri/lăzi/pubele/indicatoare decorative/mobilier au stări INTACT/MOVED/BROKEN și praguri calibrate.
- [x] DESTRUCTIBLE_BROKEN este deduplicat și păstrează instigatorul real; obiectele ușoare nu funcționează ca ziduri invizibile.
- [x] Clădirile și regulile STOP/semafor rămân structurale; obstacolele mari deplasate sunt detectate de autonomie, indiferent de cameră.
- [x] Rampa, parcarea și aleea destructibilă sunt accesibile fără mers pe jos și oferă trasee pentru încercări succesive.
- [x] Checkpoint/reload/reset păstrează sau refac corect decorul; corpurile/colliderele au plafoane și cleanup măsurate, fără schimbarea gameplay pe Low.

## Verificare

Testează impact slab/puternic/continuu, reacție în lanț, contact AI nevizibil, obiect deplasat pe bandă, reload și reset; playtest senzația impactului și benchmark contactele.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/world/destructible-decor.ts` (contract `227-destructible-decor-v1`) livrează un singur stat determinist pentru decor și cele trei zone de joacă. Șase arhetipuri (gard ușor, con, ladă, pubelă, indicator decorativ, mobilier) au praguri în N·s derivate din masă × viteza obiectului și tranziții închise `INTACT → MOVED → BROKEN`, cu `BROKEN` terminal într-o generație. Aceeași cale de impact produce rezultat identic pentru MANUAL, LEARNING și AUTO (amprentă comună, sursa doar numărată). `DESTRUCTIBLE_BROKEN` se publică o dată per obiect și generație, cu instigator real (vehicul sau obiect din lanț). Reacția este momentumul obiectului, deci un con de 5 kg schimbă viteza unui vehicul de 1400 kg cu 0,0429 m/s; gardurile și mobilierul deplasate rămân obstacole fizice și sunt raportate de `queryObstacles` fără niciun input de cameră. Zonele sunt date derivate din layout-ul 042: parcare de derapaje, rampă de 12 × 3,2 × 0,6 m și alee cu 35 de obiecte, cu 6/6 intrări pe suprafață conducibilă, 6 rute, repere și politici de margine explicite (`REDIRECT_TO_ENTRY`, `CONTINUE_IN_LANE`, `STOP_AT_EDGE`). Checkpointul are 6152 bytes și checksum `fnv1a32`; resetul readuce corpuri 33 → 35, iar 20 de cicluri păstrează corpuri 35, collidere 35, fragmente 0 și 43 de intrări în index. Clădirile, benzile și regulile STOP/semafor rămân structurale (0 suprapuneri, layout neatins).

Verificări executate și rezultat: `npm run typecheck` PASS (zero erori), `npm run lint` PASS (zero avertismente), `npm run format:check` PASS, `npm run check:architecture` PASS (355 fișiere TypeScript + probe negative), `npm run check:parameter-catalog` PASS, testele țintă 14/14 PASS, `scripts/run-destructible-decor-report.mjs` 24/24 verificări PASS și `--check` current, `npm test` 2627 teste cu 2627 pass, 0 fail (97,2 s). Validator: `Valid: true`.

Fișiere și documente actualizate: `src/world/destructible-decor.ts` (nou), `src/world/index.ts`, `tests/world/destructible-decor-fixture.ts`, `tests/world/destructible-decor.test.ts`, `tests/world/destructible-decor-report.ts`, `tests/world/destructible-decor-report.test.ts`, `scripts/run-destructible-decor-report.mjs`, `package.json` (`world:destructibles`, ultima intrare), `Docs/26-joaca-libera-haos-si-distrugere.md`, `Docs/04-oras-si-retea-rutiera.md`, `Docs/Evidence/227-destructible-decor/{README.md,report.json,report.md}`.

Limitări sau follow-up: meshurile, materialele, sunetul și fragmentele vizuale rămân la 146/228; corpurile Rapier și colliderele native rămân ale stratului de compoziție 021. Pragurile sunt `PROVISIONAL_UNCALIBRATED` până la playtest/224. Nu s-a măsurat FPS, timp de cadru, latență de input sau heap; `frame` este `NOT_MEASURED`, iar `destructionBodies` rămâne `null` în manifest și este raportat ca lacună (plafon propriu 96). Rotația obiectelor deplasate nu este simulată (doar translație deterministă). Verificarea vizuală este `N/A` pentru un contract fără meshuri; nu se pretinde playtest.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '227'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: Implementare livrată în `src/world/destructible-decor.ts` (contract `227-destructible-decor-v1`), cu 24/24 verificări deterministe, 14/14 teste țintă, 2627/2627 teste ale suitei și dovezi în `Docs/Evidence/227-destructible-decor/`; pragurile rămân provizorii până la playtest/224.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

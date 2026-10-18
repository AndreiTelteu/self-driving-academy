---
id: "054"
title: "Blocaje rerutare și reintrare după manual"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["045","041","030"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium blocked-recovery-01"
started_at: "2026-10-19T02:20:15+03:00"
completed_at: "2026-10-19T02:57:38+03:00"
---

# 054 Blocaje rerutare și reintrare după manual

## Obiectiv

Detectează lipsa progresului și reintrarea fezabilă în graf.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 045 trebuie să existe în Done înainte de începere.
- PBI 041 trebuie să existe în Done înainte de începere.
- PBI 030 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Starea BLOCKED are motiv și politică de recuperare explicită.
- [x] Revenirea la AUTO din afara benzii nu teleportează implicit vehiculul.

## Verificare

Testează drum blocat, deviație manuală și reintrare imposibilă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/autonomy/blocked-recovery.ts`: detecția lipsei de progres folosește viteza longitudinală autoritativă plus localizarea reală 033 și alimentează starea BLOCKED a 045 prin `BehaviorFacts.routeBlocked` (un singur deținător al stării), cu motiv enumerat (`NO_PROGRESS_OFF_GRAPH`, `NO_PROGRESS_BLOCKED_LANE_AHEAD`, `NO_PROGRESS_NO_FEASIBLE_SUCCESSOR`, `NO_PROGRESS_ROUTE_BLOCKED`, `NO_PROGRESS_LEADER_STANDSTILL`, `NO_PROGRESS_UNEXPLAINED`) și tabel de decizie explicit: `WAIT` mărginit, `REQUEST_REROUTE` prin plannerul real 041 (set de benzi blocate plus `costVersion` derivat, consumat prin portul real 219), `REQUEST_RECOVERY` a cărui dovadă de drum este exact `RecoveryRoadProof` al 030, sau `STAY_BLOCKED` cu limitarea numită. Escaladarea într-un episod este monotonă, eliberarea cere un prag de progres, iar cererile sunt plafonate. Reintrarea după MANUAL folosește `evaluateAuthorityReentry`: MANUAL/LEARNING raportează `MANUAL_AUTHORITY`, AUTO aliniat raportează `ON_LANE`, cel off-centru produce `DRIVE_TO_LANE` cu geometria reală 033, iar off-coridor produce fie o cerere explicită 030, fie `REENTRY_IMPOSSIBLE` mărginit. Modulul nu are nicio cale de scriere a pozei autoritative (importă doar tipul `Vector3`), deci nu poate teleporta; exportat prin `src/autonomy/index.ts`.

Verificări executate și rezultat: pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (typecheck + lint + format:check + check:architecture + `npm test` 840 teste / 840 pass / 0 fail, din care 7 teste izolate 054 și 1 test de lanț real 219/044/045/033/041) și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent** ambele brațe ale sondei (`node --expose-gc --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 054 --before|--after`) și a reprodus concluzia în marjă de zgomot: BEFORE p95 0,0413 ms (raportat 0,0353), AFTER p95 0,0623 ms (raportat 0,0502), cost adăugat p95 +0,0233 ms/decizie (raportat +0,0148), adică ordinul de mărime și concluzia de buget se susțin. Proba raportată (commit sursă măsurat `9038013e`, runtime v24.21.0, același fixture 033/044/045/041 și aceeași cadență 219, secvențial și singură): BEFORE p50/p95/p99 0,0171/0,0353/0,0593 ms/decizie, AFTER 0,0351/0,0502/0,1484, cost adăugat +0,0179/+0,0148/+0,0759; 20 de cicluri de memorie cu contoare zero după `dispose` (`retainedActors`/`retainedEpisodes`/`retainedHistory`). Scenariile cerute sunt acoperite: drum blocat (standstill în coadă peste prag latching, bandă blocată înainte cu alternativă legală acceptată, drum schimbat efectiv), deviație manuală (plan `DRIVE_TO_LANE` cu poza autoritativă neschimbată, observație profund congelată) și reintrare imposibilă (eșec explicit, determinist pe 100 de repetări, mărginit, fără buclă și fără succes mut).

Fișiere și documente actualizate: `src/autonomy/blocked-recovery.ts` (nou), `src/autonomy/index.ts`, `tests/autonomy/blocked-recovery.test.ts` (nou), `tests/autonomy/policy-decision-path.test.ts` (test de lanț real), `tests/autonomy/policy-probe-fixture.ts`, `scripts/benchmark-autonomy-policies.mjs` (brațul 054), `Docs/blocked-recovery.md` (nou), `Docs/06-autonomie-si-trafic.md`, `Docs/README.md`, `Docs/Evidence/054-blocked-recovery/` (README, before/after JSON și transcripturi, checks, tests).

Limitări sau follow-up: pragurile de standstill, așteptare, cooldown, eliberare și toleranța laterală de reintrare sunt constante înghețate provizorii, necalibrate pe harta reală; setul de benzi blocate al unei cereri este plafonat, iar ponderile de trafic 041 nu sunt modificate (o coadă de congestie este doar re-interogată). Plasarea fizică 030 (care cere un scaun MANUAL/LEARNING explicit) nu este exercitată aici pe o lume Rapier reală, iar actuația rămâne a lanțului 046–049/024. Proba este Node CPU-only pe o mașină de tip laptop, fără browser, GPU, FPS sau soak, cu etichete de calibrare provizorii. Modulele de autonomie 045–053 nu au încă wiring în composition root, deci nici 054 nu are.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '054' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia de autonomie 044–053. Owner `opencode deepseek-v4.1-flash medium blocked-recovery-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat detecția de blocaj, politica de recuperare per motiv, rerutarea prin plannerul real 041, contractul de reintrare după MANUAL și testele în worktree izolat (commituri `9038013e`, `dd69021c`, `f2a8a2c9`, `3ce8f00e`); integrate pe `main` prin fast-forward.

- 2026-10-19: Orchestratorul a re-rulat independent verificările (`npm run check` EXIT 0, 840/840; catalog sincronizat) și ambele brațe ale sondei 054, cu concluzie reprodusă în marjă de zgomot; criterii bifate, dovezi completate, mutare fizică In Progress → Done.

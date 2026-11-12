---
id: "232"
title: "Director de provocări random și curse speciale"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["231","225","061","063","064","219"]
performance_checks: ["simulation", "memory", "storage"]
owner: "loop-pbi/director-232-01"
started_at: "2026-11-12T04:32:29+02:00"
completed_at: "2026-11-12T04:52:12+02:00"
---

# 232 Director de provocări random și curse speciale

## Obiectiv

Oferă provocări opționale variate fără întreruperea cursei existente și urmărește lifecycle-ul cu seed salvat.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 231 trebuie să existe în Done înainte de începere.
- PBI 225 trebuie să existe în Done înainte de începere.
- PBI 061 trebuie să existe în Done înainte de începere.
- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 064 trebuie să existe în Done înainte de începere.
- PBI 219 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] O singură ofertă/provocare, cooldown și istoric anti-repetiție plafonat; toggle oprește ofertele, iar refuzul este fără penalizare.
- [x] Preflight verifică sesiunea, taxiul liber, ruta/zonele/evaluatorii și deadline fezabil înainte de ofertă; catalog mic are fallback stabil.
- [x] Acceptarea rezervă taxiul, suspendă dispatchul lui și folosește pickup/dropoff comun; pasagerul existent nu este abandonat.
- [x] Instanța salvează obiective/seed/timp/cursor/sessionId/worldEpoch; pauza, reload, schimbarea mașinii, R/reset și duplicatele au rezultate explicite.
- [x] Interogările și generarea respectă schedulerul/bugetele fără rerandomizare per frame sau rularea unor lumi suplimentare.

## Verificare

Testează refuz/expirare, pause/deadline, reload, pasager existent, traseu inaccesibil, catalog mic, R/reset, schimbare mașină și istoric lung.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/director.ts` livrează `232-challenge-director-v1` (snapshot
`232-challenge-director-state-v1`): o singură ofertă și o singură instanță, preflight real pe sesiune,
taxi, zone, rută și deadline, cooldown de 10 800 tick-uri active și istoric anti-repetiție plafonat la
24 de intrări / 4 096 unități de cod, seed salvat per ofertă și instanță, lifecycle închis
`OFFERED → ACCEPTED → ACTIVE → COMPLETED/FAILED/CANCELLED` plus `DECLINED/EXPIRED`, toggle, refuz fără
penalizare, pauză, reload identic, R/reset/schimbare mașină/duplicate cu rezultate explicite.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run
format:check` exit 0; `npm run check:architecture` PASS (360 fișiere); `npm run
check:parameter-catalog` sincronizat; testele țintă 29/29 pass; `npm test` 2 720/2 720 pass, 0 fail;
`npm run missions:challenge-director` 56/56 verificări PASS; `--check` raportează raportul curent.

Fișiere și documente actualizate: `src/missions/director.ts`, `src/missions/index.ts`,
`tests/missions/challenge-director-fixture.ts`, `tests/missions/challenge-director.test.ts`,
`tests/missions/challenge-director-report.ts`, `tests/missions/challenge-director-report.test.ts`,
`scripts/run-challenge-director-report.mjs`, `package.json`,
`Docs/28-provocari-random-si-revenire.md`, `Docs/Evidence/232-challenge-director/{README.md,report.json,report.md}`.

Limitări sau follow-up: costul este structural (`NOT_MEASURED` pentru ceasul de perete); portul de
rută este un contract, nu plannerul 041 real; aplicarea rezervării pe dispecerul 060 real aparține
stratului de compoziție (PBI-ul nu are voie să modifice `src/fleet/`); `challengeHistoryEntries`
rămâne `null` în manifest, deci plafonul este o admitere provizorie; creditul XP, recordurile, panoul
și conectarea la daily rămân la 233; fără playtest uman.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '232'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: Implementat directorul de provocări (ofertă unică, cooldown, istoric plafonat, seed
  salvat, reload identic, lifecycle închis, toggle și refuz fără penalizare); 29 teste țintă, 2 720
  teste în suită, raport 56/56; mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

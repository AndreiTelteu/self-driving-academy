---
id: "206"
title: "Checkpoint complet și reluare coerentă a lumii"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["127","128","129","065","008","010","221"]
performance_checks: ["storage", "memory", "frame"]
owner: "loop-pbi/checkpoint-206-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T20:22:13.864+03:00"
completed_at: "2026-10-22T21:01:29.091+03:00"
---

# 206 Checkpoint complet și reluare coerentă a lumii

## Obiectiv

Persistă SessionCheckpoint complet cu lumea fizică și stările proprii, fără a confunda salvarea progresului cu continuarea lumii.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)
- [02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 127 trebuie să existe în Done înainte de începere.
- PBI 128 trebuie să existe în Done înainte de începere.
- PBI 129 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Pozițiile, cursele, pasagerii, FSM/controller, oportunitățile, RNG și learningEpoch sunt restaurate la ultimul commit coerent.
- [x] Reload pornește în pauză/AUTO; inputul este eliberat, iar segmentele devin incomplete și joburile se reiau idempotent.
- [x] Salvarea are un singur writer; pierderea GPU folosește RAM și poate salva checkpointul durabil după integrare.

- [x] Captura fizică și de stare păstrează același tick; costul sincron este măsurat separat de encode/commit și nu este ascuns sub eticheta async.

## Verificare

Roundtrip în viraj/pickup, crash înainte/după commit, două taburi, job pending, device loss și versiune incompatibilă.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/world-snapshot.ts` (contract `206-world-snapshot-v1`) și `src/persistence/world-checkpoint.ts` (contract `206-world-checkpoint-v1`) persistă un checkpoint complet al lumii, separat de salvarea progresului. Captura este o copie simplă, înghețată, refuzată dacă fixed-tick loop este în interiorul unui pas (`TICK_NOT_BOUNDARY`) sau dacă orice subsistem nu este exact la tickul capturat (`SUBSYSTEM_TICK_MISMATCH`); integritatea refolosește `SDA-CJSON-1` + `SHA-256` peste payload-ul fără `checksum`. RNG-ul este un cursor keyed (`advanceWorldRng`), deci lumea restaurată continuă exact șirul original, iar `restoreWorldState` produce planul `206-world-resume-v1`: `PAUSED_AUTO`, input eliberat, toate vehiculele `AUTO`, segmentele `OPEN` devin `INCOMPLETE`/`RELOAD`, joburile sunt `RELAUNCH` numai cu `profileId` și `learningEpoch` potrivite (altfel `INVALIDATED` cu motivul exact), observațiile LEARNING se reiau idempotent cu cheia `segmentId:observationId`, iar `rewardsReapplied` este `0`. Writer-ul unic ține o generație în pregătire și una în commit, coalescează cererile identice, refuză tokenul străin (`WRITER_MISMATCH`) și scrie envelope + snapshot într-o singură tranzacție. La `deviceLoss`, captura din heap este păstrată și etichetată `RAM`, commitul este refuzat `DEVICE_LOST`, iar `commitDeferred` publică după `integrateRecovery()`. `loadLatestWorldCheckpoint` verifică checksumul, coerența envelope/snapshot și versiunile engine/fizică/hartă, întorcând `INCOMPATIBLE` explicit.

Verificări executate și rezultat: în worktree-ul `.worktrees/checkpoint-206-01`, branch `loop-pbi/checkpoint-206-01`, peste commit-ul `74931102`:

- `npm run typecheck` — PASS, fără erori în ambele configurații tsconfig.
- `npm run lint` — PASS, `eslint . --max-warnings 0`, fără avertismente.
- `npm run format:check` — PASS, `All matched files use Prettier code style!`.
- `npm run check:architecture` — PASS: `Architecture imports: PASS (301 TypeScript files)`, `Architecture negative probes: PASS (6 forbidden dependencies rejected)`, `Inspector exception negative probes: PASS (4 forbidden imports rejected)`, `Rapier adapter negative probes: PASS (3 forbidden imports rejected)`, `Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS`.
- `npm run check:parameter-catalog` — PASS, `Parameter catalog is synchronized.`.
- `npm test` — PASS, `tests 2089`, `pass 2089`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 71098.9548`.
- `node --import ./scripts/register-typescript.mjs --test tests/persistence/world-checkpoint.test.ts` — PASS, `tests 15`, `pass 15`, `fail 0`, `duration_ms 755.599`.
- `npm run world:checkpoint -- --check` — PASS, `SUMMARY checks 98/98, overall PASS`, raport curent.
- `npm run world:checkpoint -- --cost --samples 25` — PASS, cost real scris în `Docs/Evidence/206-world-checkpoint/cost.json` și `cost.md`.

Scenariile cerute, acoperite de transcrierea deterministă: roundtrip `taxi-01` în `PICKUP` pe `ride-01` la tick 60, continuat 60 de tickuri până la `COMPLETED`/`DELIVERED` cu digest canonic identic cu oracolul; `taxi-08` `ONBOARD` cu `passenger-08` la bord, apoi `COMPLETED`; crash înainte de tranzacție (`CRASHED_BEFORE_COMMIT`, 0 rânduri) și după (`CRASHED_AFTER_COMMIT`, rând durabil, reload `RESUMABLE`); al doilea tab `READ_ONLY`/`WRITER_HELD_BY_OTHER_TAB` cu captură `WRITER_REQUIRED`; 3 joburi DISPATCH + 3 LEARNING decise `RELAUNCH`/`INVALIDATED` cu motiv; device loss `LOST`/`GPU_DEVICE_LOST` urmat de `INTEGRATED` și commit amânat `COMMITTED` din `RAM`; versiune incompatibilă `INCOMPATIBLE` cu detaliul `physicsVersion: stored rapier-0.21.0, current rapier-0.22.0`.

Cost real (25 de eșantioane, lume de 70 de vehicule la tick 60, dublu IndexedDB în memorie, `performance.now`): captură sincronă 0.035/0.044/0.141 ms (min/median/max), validare și checksum 5.864/6.942/12.555 ms, commit durabil 7.802/11.853/16.995 ms, total 15.145/18.478/26.907 ms. Snapshotul are 64 378 bytes din bugetul de 262 144 (24.558%), checksum `c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5`. Captura sincronă rămâne sub 0,15 ms chiar și la maxim, deci costul nu este ascuns sub eticheta async.

Fișiere și documente actualizate: `src/persistence/world-snapshot.ts` (nou), `src/persistence/world-checkpoint.ts` (nou), `src/persistence/index.ts` (exporturi append-only), `tests/persistence/world-checkpoint-fixtures.ts` (nou), `tests/persistence/world-checkpoint-harness.ts` (nou), `tests/persistence/world-checkpoint.test.ts` (nou), `tests/persistence/world-checkpoint-report.ts` (nou), `scripts/run-world-checkpoint-report.mjs` (nou), `package.json` (script `world:checkpoint`, ultimul din blocul `scripts`), `Docs/15-salvare-si-import-export.md` (versiune 0.10 + contractul 206), `Docs/Evidence/206-world-checkpoint/` (`README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`).

Limitări sau follow-up: verificarea rulează pe dublul în memorie IndexedDB, iar dovada de browser rămâne PBI 235; nu există încă un consumator în joc care să apeleze periodic checkpointul (integrarea rămâne în planul de salvare din Docs/15); costul este al acestei mașini, nu al browserului sau al hardware-ului țintă; snapshotul este complet, nu incremental sau comprimat, iar o lume peste 262 144 bytes este refuzată explicit, nu trunchiată; `learningEpoch` și `profileId` sunt singurele criterii de reluare a joburilor, deci o schimbare de configurație fără schimbare de epoch relansează jobul în loc să îl invalideze.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '206'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare începută în worktree-ul `checkpoint-206-01` (branch `loop-pbi/checkpoint-206-01`); `world-snapshot.ts` și `world-checkpoint.ts` livrate cu teste țintă și transcriere deterministă.

- 2026-10-22: Finalizat. `npm test` 2089/2089, teste țintă 15/15, raport 98/98, typecheck/lint/format/architecture/parameter-catalog PASS; cost real măsurat separat (median 18.478 ms total, captură sincronă 0.044 ms). Dovezi în `Docs/Evidence/206-world-checkpoint/`.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

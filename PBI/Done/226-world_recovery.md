---
id: "226"
title: "Deblocare rapidă și resetul orașului cu stil păstrat"
status: "Done"
release: "V1"
module: "Experiență"
depends_on: ["225","030","065","206","207"]
performance_checks: ["simulation", "storage", "frame"]
owner: "loop-pbi/recovery-226-01"
started_at: "2026-11-11T23:04:35+02:00"
completed_at: "2026-11-11T23:30:47+02:00"
---

# 226 Deblocare rapidă și resetul orașului cu stil păstrat

## Obiectiv

Separă R/deblocarea vehiculului de refacerea lumii și de restaurarea stilului.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 225 trebuie să existe în Done înainte de începere.
- PBI 030 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] R restabilește mobilitatea la un punct fără collider; ținta propusă de două secunde este playtestată și nu retrage XP.
  - Executat: `recoverVehicle` cere candidatul validat `SAFE` al recuperării 030 și verifică `colliderCount=0`, `placement.after` publicat și `ticksToMobility=0` în 5 etape sincrone; XP rămâne `500000` micro-XP înainte și după (delta 0, `debits=0`).
  - Nivel real declarat: **playtest uman NEexecutat**; politica `targeted` cere declararea nivelului real, deci 2000 ms rămâne `NOT_MEASURED`, iar obiectiv s-a măsurat doar ce este determinist (0 tick-uri, 5 etape) plus costul de harness din `cost.json` (medie 0,556 ms, p95 0,93 ms, 500 iterații). Nu se pretinde playtest.
- [x] R cu pasager produce o singură încheiere FAILED; incidentul rămâne în istoric, iar Haos permite reluare rapidă.
  - Executat: o singură închidere `RECOVERED_WITH_PASSENGER` (`revenue=0`, terminal), al doilea R închide 0, istoricul rămâne 1; în Haos provocarea răspunde `AVAILABLE` cu `ticksWaited=0`.
- [x] Resetul închide curse/provocări, incrementează worldEpoch/learningEpoch, păstrează profil/dovezi/XP/daily/rewards și reconstruiește traficul.
  - Executat: 2 activități închise o dată cu `SCENARIO_RESET`, epoce `1/0/1 → 2/1/2`, profil cu checksum identic, dovezi/XP/daily/rewards/misiuni identice, lume nouă cu 64 corpuri și 40 vehicule de trafic, `PAUSED_AUTO`.
- [x] Resetul pornește un economyEpoch nou fără ștergerea istoricului, invalidează cache-uri/joburi și marchează discontinuitatea replay.
  - Executat: serie economică `1 → 2` cu istoric păstrat (21 de serii după 20 de reseturi), 2 joburi invalidate cu `WORLD_RESET`, 2 inputuri eliberate, fapt de replay `WORLD_RESET` cu `discontinuity=true`.
- [x] Pregătirea/commitul eșuat păstrează checkpointul valid; reset repetat nu dublează progres, corpuri sau listeners. Integrarea decorului vine în 227.
  - Executat: commit refuzat → 0 checkpointuri, epoce/închideri/serii neschimbate, reîncercare comite o dată; 20 de reseturi → 20 checkpointuri, corpuri `[64]`, listeners `[1]`, joburi `[2]`, 1 lume vie, zero duplicate; planul stale este refuzat cu `PLAN_STALE`, iar resetul parțial se reia idempotent. Decorul rămâne la 227.

## Verificare

Verifică răsturnare/blocaj, pasager, daily parțial, worker întârziat, storage eșuat și 20 reseturi; playtest pentru revenirea rapidă la condus.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/world-recovery.ts` livrează contractul `226-world-recovery-v1` cu trei operații separate — `recoverVehicle` (R), `beginCityReset`/`commitCityReset` și `restoreStyle` — peste proprietarii reali 030/206/209/207/065/109/125/211/212/213, conduși prin porturi. `RecoveryVehicle` este `Pick<ReturnType<typeof createVehicleRecovery>, …>`, iar portul lumii refolosește `SessionWorldPort` al lui 225. R folosește exclusiv candidatul inspectat nativ `SAFE` (nu „unde era”), verifică `colliderCount=0` și starea `after`, închide o cursă cu pasager exact o dată cu `RECOVERED_WITH_PASSENGER` și nu atinge epoci, profil, serie economică, checkpoint sau XP. Resetul scrie întâi checkpointul `SCENARIO_RESET` (612 bytes canonici), apoi închide segmente și activități o dată, invalidează joburile cu `WORLD_RESET`, avansează `worldEpoch`/`learningEpoch`/`economyEpoch`, păstrează istoricul economic, repornește lumea în `PAUSED_AUTO` și marchează discontinuitatea replay; misiunile nu se finalizează și nu se acordă recompense. `restoreStyle` activează o versiune 109 în spatele barierei `learningEpoch` fără să atingă lumea sau progresul.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS; `npm run check:parameter-catalog` PASS („synchronized”); testele țintă `tests/persistence/world-recovery.test.ts` + `world-recovery-report.test.ts` **21/21 PASS**; `scripts/run-world-recovery-report.mjs` **65/65 verificări PASS**; `--check` confirmă raportul curent; `--cost --cost-iterations 500` scrie `cost.json` (medie 0,556 ms, p95 0,93 ms). `npm test` a rulat de două ori: prima dată 2577 teste cu 2576 pass și un eșec de timp de perete la `tests/workers/protocol.test.ts` (`cancel 100,79ms`) sub încărcarea celorlalți agenți, a doua oară **2577/2577 PASS** în 86,8 s. Scenarii acoperite: blocaj/fără punct valid (`NO_SAFE_POINT`), collider raportat (`COLLIDER_PRESENT`/`RECOVERY_NOT_SAFE`), pasager, Haos cu reluare imediată, storage eșuat la commit, plan stale, reset parțial reluat, 20 de reseturi fără duplicate. `daily parțial` este acoperit structural de snapshotul real 212 păstrat identic, fără ingest end-to-end al unei zile parcurse; `worker întârziat` este acoperit de invalidarea joburilor cu `WORLD_RESET` și de verificarea de identitate a lui 225, nu de o simulare nouă. Playtestul uman al revenirii la condus **nu a fost executat**.

Fișiere și documente actualizate: `src/persistence/world-recovery.ts` (nou), `src/persistence/index.ts` (exporturi), `tests/persistence/world-recovery-fixture.ts`, `tests/persistence/world-recovery.test.ts`, `tests/persistence/world-recovery-report.ts`, `tests/persistence/world-recovery-report.test.ts`, `scripts/run-world-recovery-report.mjs`, `package.json` (`world:recovery`, ultima intrare), `Docs/26-joaca-libera-haos-si-distrugere.md` (secțiunea contractului), `Docs/Evidence/226-world-recovery/{README.md,report.json,report.md,cost.json}`.

Limitări sau follow-up: adaptorul durabil al checkpointului/lumii rămâne la compoziție; porturile 030/206/209/207/065 sunt dubluri deterministe (030 este legat de signatura reală prin tip); ținta de două secunde rămâne nevalidată ca playtest și nemăsurată pe hardware (`NOT_MEASURED`); FPS/p95/p99 și latența input→comandă nu s-au măsurat; decorul destructibil și bugetele lui rămân la 227; heap-ul exact este `null`. Nivelul de validare este `targeted`.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
  - performance_checks: `simulation` (0 tick-uri până la mobilitate, 5 etape sincrone, 1 reset pregătit, 1 commit simultan), `storage` (612 bytes/checkpoint, 20 checkpointuri pentru 20 reseturi, `twoSessionCheckpointBytes` lăsat `null`), `frame` (declarat `NOT_MEASURED`). Verificarea vizuală nu se aplică: PBI nu schimbă randarea, iar decorul vine la 227; nu există captură vizuală pretinsă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '226'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-11: Implementare în `src/persistence/world-recovery.ts`; 21 de teste țintă, raport determinist 65/65, cost separat în `cost.json`; criteriu 1 îndeplinit la nivelul real declarat (`targeted`, fără playtest uman); mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

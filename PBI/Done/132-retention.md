---
id: "132"
title: "Retenția datelor și cote locale"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["131","207"]
performance_checks: ["storage", "memory"]
owner: "loop-pbi/retention-132-01"
started_at: "2026-11-11T18:36:35+02:00"
completed_at: "2026-11-11T19:02:44+02:00"
---

# 132 Retenția datelor și cote locale

## Obiectiv

Gestionează separat retenția telemetriei intervențiilor și recorderului lumii, cu cote și segmente/chunkuri fixate.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 131 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cota plină oferă export și curățare selectivă; clipurile parțiale sunt declarate.
- [x] Profilul, progresul, checkpointul activ și ledger-ele necesare deduplicării nu sunt șterse automat.

- [x] Limitele RAM/DB și retenția sunt în bytes, nu doar durate; la capacitate sunt protejate cauzele/ledger-ele și replay-ul parțial este declarat.

## Verificare

Simulează quota exceeded și segmente protejate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/data-retention.ts` (contract `132-data-retention-v1`) gestionează două domenii separate, `INTERVENTION_TELEMETRY` și `WORLD_RECORDER`, fiecare cu cotă RAM și DB în bytes. Cotele vin din contracte livrate: `proposedCapacities.recorderRamBytes` (33 554 432 B), `proposedCapacities.optionalReplayStorageBytes` (134 217 728 B), `resourceAdmissionContracts.workers.persistenceIngressBytes` (16 777 216 B) și limita 069 `INTERVENTION_LIMITS.recordStoreBytes` (33 554 432 B); lacuna `interventionTelemetryDbBytes` este declarată în `retentionBudgetGaps`, iar un buget lipsă este refuzat cu `QUOTA_MISSING`. Cota plină oferă `exportDomain` (document versionat cu `SHA-256` peste `SDA-CJSON-1`), iar `planCleanup` nu există fără digestul exportului (`EXPORT_REQUIRED`/`EXPORT_MISMATCH`). Curățarea selectivă are criterii explicite (`OLDEST_FIRST`, `LARGEST_FIRST`, `WHOLE_DOMAIN`), ținte în bytes și `maxEvictions`. `PROFILE`, `PROGRESS`, `ACTIVE_CHECKPOINT` și `DEDUP_LEDGER` consumă cotă dar nu sunt niciodată candidați; la `PROTECTED_OVERFLOW` aplicarea răspunde `NOTHING_TO_EVICT`. Un clip atins parțial este re-declarat `PARTIAL` cu motivul `RETENTION_EVICTED` și `missingSequences`. Evicția este deterministă (comparator peste `sequence` și puncte de cod, fără ceas, timer, `Math.random` sau ordinea unui `Map`).

Verificări executate și rezultat:
- `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0; `npm run check:architecture` exit 0 (337 fișiere TS, probe negative PASS); `npm run check:parameter-catalog` exit 0.
- `npm test` exit 0: 2 419 teste, 2 419 pass, 0 fail (72,9 s).
- `node --import ./scripts/register-typescript.mjs --test tests/persistence/data-retention.test.ts`: 12 teste, 12 pass, 0 fail.
- `npm run retention:data`: 19/19 verificări PASS; `npm run retention:data -- --check` exit 0 („Data retention report is current").
- Numere reale: recorderul lumii 33 771 520 B RAM din 33 554 432 B (depășire 217 088 B), export 13 artefacte, plan `OLDEST_FIRST` cu 3 rânduri evacuate (4 325 376 B), după 29 446 144 B și 4 clipuri `PARTIAL`; telemetria 22 061 056 B DB din 16 777 216 B (depășire 5 283 840 B), plan `LARGEST_FIRST` cu 3 segmente, după 14 196 736 B; cu țintă 4 194 304 B rămân 2 chunkuri `PARTIAL` cu `missingSequences: [0, 1]`; doar protejate → `PROTECTED_OVERFLOW` + `NOTHING_TO_EVICT`, cele 5 rânduri intacte; inventar inversat → aceleași digests de export/plan/rezultat.

Fișiere și documente actualizate: `src/persistence/data-retention.ts` (nou), `src/persistence/index.ts` (exporturi la final), `tests/persistence/data-retention-fixtures.ts`, `tests/persistence/data-retention.test.ts`, `tests/persistence/data-retention-report.ts`, `scripts/run-data-retention-report.mjs`, `package.json` (`retention:data`), `Docs/15-salvare-si-import-export.md` (secțiune nouă), `Docs/Evidence/132-data-retention/` (README, `report.json`, `report.md`).

Limitări sau follow-up: inventarul raportului este o fixture declarată (25 de rânduri cu bytes declarați), nu o sesiune reală; legarea la producătorii reali 207/090/129 rămâne pas de integrare, iar bytes sunt contoare de ownership, nu heap. Cota durabilă a telemetriei folosește `persistenceIngressBytes` pentru că manifestul nu fixează o cotă totală dedicată, iar `totalHeapBytes` rămâne indisponibil. Exportul către fișier și meniul UI rămân în afara scope-ului. Nu s-a rulat soak 159/224; nu se pretinde performanță hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '132' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-11: Implementat în worktree `retention-132-01` (contract `132-data-retention-v1`): două domenii cu cote în bytes, export obligatoriu înainte de ștergere, curățare selectivă pe criteriu, date protejate intacte, clipuri parțiale declarate, evicție deterministă. `npm test` 2 419/2 419 PASS; raport 19/19 PASS.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

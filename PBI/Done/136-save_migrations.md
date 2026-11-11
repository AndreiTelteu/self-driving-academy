---
id: "136"
title: "Migrare și restaurare după restart"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["135","132","206"]
owner: "loop-pbi/migration-136-01"
started_at: "2026-11-11T19:17:40+02:00"
completed_at: "2026-11-11T21:05:06+02:00"
---

# 136 Migrare și restaurare după restart

## Obiectiv

Implementează migrarea schemelor și continuarea sesiunii.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 135 trebuie să existe în Done înainte de începere.
- PBI 132 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Restartul reia pozițiile, cursele, pasagerii și ledger-ele din ultimul checkpoint valid; pornește în pauză/AUTO.
- [x] Segmentele active devin incomplete, inputul este eliberat și joburile sunt reluate numai în learningEpoch valid.
- [x] Migrarea eșuată oferă export și recuperare fără corupere.

## Verificare

Testează versiune veche, migrare eșuată și startup nou.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat în `src/persistence/save-migration.ts` (contract `136-save-migration-v1`) și `src/persistence/session-restore.ts` (contract `136-session-restore-v1`). Migrarea are versiuni explicite (`1 → 2`, `2 → 2`), descoperă versiunea reală, refuză o bază mai nouă cu `SCHEMA_TOO_NEW`, exportă starea pre-migrare (`self-driving-academy-save-migration-export`, `SDA-CJSON-1` + `SHA-256` + digest de rânduri) și oferă recuperare verificată în aceeași tranzacție; o migrare eșuată lasă versiunea și rândurile identice (`untouched = true`). Restartul citește toate generațiile sesiunii, sare peste cea mai nouă generație cu checksum stricat (`CHECKSUM_MISMATCH`) și reia ultimul checkpoint valid (tick 60, generația 1), pornește `PAUSED_AUTO` cu 70 vehicule AUTO, 0 MANUAL și input eliberat, marchează segmentul `OPEN` ca `INCOMPLETE`/`RELOAD`, relansează 2 joburi și anulează 4 cu motiv, reia idempotent 2 observații și digerează ledgerul 130 (2 rânduri), fără nicio rescriere (`rewardsReapplied = 0`). `listCheckpoints` a fost adăugat repository-ului, iar `decodeWorldCheckpoint` a fost extras din 206 ca aceleași reguli să decidă fiecare generație.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (340 fișiere TypeScript, plus probele negative); `npm run check:parameter-catalog` PASS; `npm test` PASS — 2462 teste, 2462 pass, 0 fail, 77802.0623 ms; testele țintă `tests/persistence/session-restore.test.ts` 18/18 și `tests/persistence/save-migration.test.ts` 11/11; `scripts/run-session-restore-report.mjs` — 65/65 verificări, 8 scenarii, PASS; `--check` confirmă raportul curent.

Fișiere și documente actualizate: create `src/persistence/save-migration.ts`, `src/persistence/session-restore.ts`, `tests/persistence/save-migration.test.ts`, `tests/persistence/session-restore.test.ts`, `tests/persistence/session-restore-fixture.ts`, `tests/persistence/session-restore-report.ts`, `scripts/run-session-restore-report.mjs`, `Docs/Evidence/136-session-restore/{README.md,report.json,report.md}`; modificate `src/persistence/repository.ts`, `src/persistence/world-checkpoint.ts`, `src/persistence/index.ts`, `package.json`, `Docs/15-salvare-si-import-export.md`.

Limitări sau follow-up: Nivel `targeted` — fără browser real, IndexedDB real, GPU, FPS sau hardware; un upgrade real blocat de alt tab rămâne `BLOCKED_UPGRADE`/`retryBlockedUpgrade()` la repository. Exportul pre-migrare este întors apelantului, nu scris automat pe disc (plafon 8 388 608 code units / 32 768 rânduri). Marcajul `meta.schema` rămâne cel al pasului 127 și nu este folosit ca sursă de versiune. Aplicarea planului de reluare în scene și pornirea efectivă a joburilor în worker aparțin compoziției `src/app`/`src/ui`, read-only pentru acest PBI.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '136' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-11: Implementat în worktree-ul `migration-136-01` (branch `loop-pbi/migration-136-01`): migrare versionată cu export pre-migrare și recuperare verificată, alegerea ultimului checkpoint valid cu raportarea celor sărite, pornire `PAUSED_AUTO` cu input eliberat, segmente `INCOMPLETE` și joburi filtrate de `learningEpoch`/`profileId`. Verificări: `npm test` 2462/2462, raport determinist 65/65; dovezi în `Docs/Evidence/136-session-restore/`.

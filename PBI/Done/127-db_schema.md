---
id: "127"
title: "Schema IndexedDB și repository local"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["005","109","116"]
owner: "loop-pbi/persistence-127-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T09:06:30+03:00"
completed_at: "2026-10-22T14:56:00+03:00"
---

# 127 Schema IndexedDB și repository local

## Obiectiv

Creează stores pentru profile, segmente, scenarii, progres și setări.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere. — `PBI/Done/005-contracts.md` ✅
- PBI 109 trebuie să existe în Done înainte de începere. — `PBI/Done/109-profile_store.md` ✅
- PBI 116 trebuie să existe în Done înainte de începere. — `PBI/Done/116-mission_schema.md` ✅

## Criterii de acceptare

- [x] Schema include stores de stil/progres și checkpointuri, cu tranzacții coerente și migrare explicită.
- [x] Un singur tab deține dreptul de scriere; al doilea tab și DB upgrade blocat au stări explicite.

## Verificare

Testează DB nouă, upgrade, două taburi, transfer de writer și eroare de deschidere.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Nu declara verificări trecute fără execuție.

## Dovezi de finalizare

**Rezultat implementare:** PASS. Modulul `src/persistence` este implementat ca o familie de porturi (`DatabasePort`, `FactoryPort`, `TransactionPort`, `SchemaUpgrader`, `LockManagerPort`) cu două adaptoare: `indexeddb.ts` pentru IndexedDB-ul real și `memory-idb.ts`, un dublu în memorie folosit de testele deterministe din Node. Schema are 8 store-uri la versiunea curentă `2`: `meta` (`key`), `profiles` (`versionId`, index `byProfile`), `profileActivations` (`profileId`), `segments` (`recordId`, indexuri `bySession` + `byStatus`), `scenarios` (`recordId`, index `bySession`), `progress` (`recordId`, indexuri `bySession` + `byStatus`), `settings` (`playerId`) și `checkpoints` (`checkpointId`, indexuri `bySession` + `byGeneration`). Migrarea este declarată explicit în `PERSISTENCE_SCHEMA_STEPS` (pasul `127-v1-base-layout` creează 7 store-uri; pasul `127-v2-checkpoints-and-lifecycle-indexes` creează `checkpoints` și adaugă `segments.byStatus` + `progress.byStatus` fără rescriere de rânduri); `planUpgrade` este continuu și refuză explicit o bază mai nouă decât build-ul cu `SCHEMA_TOO_NEW`. Upgrade-ul 1 → 2 a păstrat rândurile (1 înainte, 1 după) și indexul nou returnează acel rând. Tranzacțiile multi-store sunt atomice: o eroare la mijloc lasă baza exact cum era (rollback: `segments` = 0, `progress` = 0), iar o activare fără versiunea sa este `REFERENCE_MISSING` și nu lasă activare orfană. Dreptul de scriere este un lock exclusiv Web Locks (`self-driving-academy-persistence-writer`): primul tab este `WRITER`, al doilea este `READ_ONLY` cu `WRITER_HELD_BY_OTHER_TAB` și scrierea lui este `REJECTED` (`WRITER_REQUIRED`, fără fallback nesigur), `wait()` îl pune în `WAITING` și transferul (`release()` + așteptare în coadă) îl face `WRITER` cu scriere `COMMITTED`, în timp ce fostul scriitor devine `RELEASED` și nu mai scrie. Upgrade blocat = `BLOCKED_UPGRADE` / `UPGRADE_BLOCKED` cu rol `NONE` și reluare prin `retryBlockedUpgrade()`; eroare de deschidere = `FAILED` / `OPEN_FAILED`; bază prea nouă = `SCHEMA_TOO_NEW`; `versionchange` de la alt tab = `RELEASED_FOR_UPGRADE` / `VERSION_CHANGE` (eliberează lock-ul, închide conexiunea, scrierile ulterioare sunt `REJECTED`). Fără Web Locks rolul rămâne `READ_ONLY` / `WEB_LOCKS_UNAVAILABLE`. Limitele sunt aplicate: corp JSON simplu, cel mult 262 144 de octeți corp / 1 048 576 de octeți înregistrare / adâncime 24 / 20 000 de intrări / cel mult 512 de rânduri pe listă (`LIST_LIMIT`), fără istoric nelimitat. Versiunile de profil 109 sunt imutabile (`IMMUTABLE_RECORD`) cu checksum re-verificat la citire (`PROFILE_CHECKSUM_MISMATCH`).

**Verificări executate și rezultat:** toate în worktree-ul `C:\Users\aandr\Sites\self-driving-academy\.worktrees\persistence-127-01`, branch `loop-pbi/persistence-127-01`, Node v24.19.0 / npm 11.17.0.Ieșirea completă în `Docs/Evidence/127-db-schema/checks.txt` și `tests.txt`.

- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm run format:check` → `All matched files use Prettier code style!`, exit 0
- `npm run check:architecture` → `Architecture imports: PASS (271 TypeScript files)` + negative probes 6+4+3, exit 0
- `npm test` → **tests 1920, suites 1, pass 1920, fail 0**, duration_ms 74185.5357, exit 0
- `node --import ./scripts/register-typescript.mjs --test "tests/persistence/*.test.ts"` → **tests 35, pass 35, fail 0**, exit 0
- `npm run db:schema` → `SUMMARY checks 49/49, schema v2, stores 8, overall PASS`, exit 0
- `node --import ./scripts/register-typescript.mjs scripts/run-db-schema-report.mjs --check` → `DB schema report is current: Docs/Evidence/127-db-schema/report.json`, exit 0

**Fișiere și documente actualizate:** create `src/persistence/{contracts,ports,schema,records,indexeddb,memory-idb,writer,repository}.ts`, `tests/persistence/{fixtures,db-schema-report,schema.test,repository.test,writer.test,evidence.test}.ts`, `scripts/run-db-schema-report.mjs`, `Docs/Evidence/127-db-schema/{README.md,report.json,report.md,checks.txt,tests.txt}`; modificate `src/persistence/index.ts`, `Docs/15-salvare-si-import-export.md` (secțiunea „Contract implementat V1 (PBI 127)”, versiunea 0.5 → 0.6) și `package.json` (scriptul `db:schema`); pe board, `PBI/To Do/127-db_schema.md` a fost mutat fizic în `PBI/In Progress/` la început și în `PBI/Done/` la finalizare.

**Limitări sau follow-up:** (1) **IndexedDB real nu a putut fi rulat în Node** — mediul headless nu are `indexedDB` și proiectul nu are dependințe de testare browser; toate probele rulează pe dublul în memorie `memory-idb.ts`, care modelează explicit versiunile pe disc, pașii de upgrade, `versionchange`, upgrade-ul blocat, rollback-ul, structured-clone și coada FIFO a Web Locks; adaptorul real `indexeddb.ts` este scris și type-checkat, dar nu a fost executat în browser (verificarea lui rămâne pentru un PBI de integrare browser). (2) Nu există UI pentru progresul salvării, transferul de scriitor sau starea `BLOCKED_UPGRADE`; legarea la `main.ts` rămâne în PBI-urile de integrare. (3) Nu există autosave periodic (PBI 128–130) și nici export/import `.sdasave` cu SHA-256 (modulul 29). (4) Checkpointul conține identitatea și metadatele generației; snapshotul complet al lumii rămâne în PBI 206. (5) Politica de retenție (ștergerea checkpointurilor vechi, coalescing, latență cu storage lent) rămâne la PBI-urile 221–223. (6) Pragurile de dimensiune sunt propuneri validate prin teste, necalibrate pe hardware. (7) Verificările au rulat pe Node v24.19.0 / npm 11.17.0, sub intervalul cerut de `engines` (>= 24.21.0 / >= 11.19.0); fără erori.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '127' după mutarea fizică și păstrează rezultatul.

Rezultat (executat după mutarea fizică în `PBI/Done/`, cu PowerShell 7): `pwsh -NoProfile -ExecutionPolicy Bypass -File ./PBI/Validate-Board.ps1 -RequireDone '127'` → `{ "Valid": true, "Total": 235, "Columns": { "To Do": 103, "In Progress": 0, "Done": 132 }, "FirstId": "001", "LastId": "235", "RequiredDonePaths": [ "…\PBI\Done\127-db_schema.md" ] }`, exit 0. Ieșirea completă este în `Docs/Evidence/127-db-schema/board.txt`. Sub Windows PowerShell 5.1 validatorul eșuează identic și pe checkout-ul canonic (`Dependență inexistentă 045 041 030 pentru 054`, cauzat de `ConvertFrom-Json` din 5.1), deci validatorul trebuie rulat cu `pwsh`.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
- 2026-10-22: Implementare începută pe branch-ul `loop-pbi/persistence-127-01` (owner anterior: `loop-pbi/persistence-127-01 (cpa/deepseek/deepseek-v4.1-flash)`); fișierul a fost mutat fizic din To Do în In Progress.
- 2026-10-22: Implementare continuată de `loop-pbi/persistence-127-01 (opencode-go/minimax-m3.1-flash-free)`: schema versionată pe 8 store-uri, porturi + adaptor IndexedDB real + dublu în memorie, autoritate de scriitor cu lock exclusiv, repository cu tranzacții și limite, 35 de teste țintă, raport determinist 49/49, secțiune de contract în Docs/15.
- 2026-10-22: Criteriile bifate după verificare reală (`npm test` 1920/1920, testele țintă 35/35, raport 49/49, typecheck/lint/format:check/check:architecture exit 0). Fișierul a fost mutat fizic din `PBI/In Progress/` în `PBI/Done/`.

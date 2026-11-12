---
id: "166"
title: "Activarea schemelor și suportului V2"
status: "Done"
release: "V2"
module: "Extindere V2"
depends_on: ["165","136","092"]
owner: "loop-pbi/v2-migration-166-01"
started_at: 2026-11-12T18:20:05+02:00
completed_at: 2026-11-12T18:35:14+02:00
---

# 166 Activarea schemelor și suportului V2

## Obiectiv

Versionează suportul noilor chei și migrează profilele V1 fără estimări fabricate.

## Context și plan

[12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 165 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un profil V1 rămâne utilizabil cu default pentru cheile noi.
- [x] UI declară suportul și dovezile fiecărei chei.

## Verificare

Testează import V1, migrare și rollback la profil compatibil.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `166-profile-v2-v1` din `src/profiles/profile-v2.ts` versionează schema V2 (`schemaVersion: 2`, `catalogVersion: 092-catalog-1@2026-10-04`) și migrează explicit profilurile V1. `migrateProfileV1ToV2` păstrează neschimbate valoarea, unitatea, proveniența și dovezile fiecărei chei V1 (origine `PLAYER_SET` pentru MANUAL_TUNING/IMPORTED, `INHERITED_V1` pentru BASE/LEARNED) și dă celor 56 de chei R defaultul real din catalogul 092, marcat `DEFAULT`/`CATALOG_DEFAULT`, fără dovezi sau estimări. Cu `reservedKeys: 'UNSET'`, cheile R rămân `null` cu motivul `RESERVED_UNSET`. `migratedFrom` păstrează documentul V1, iar `rollbackProfileV2ToV1` întoarce exact profilul V1, cu checksum-ul original. `readProfileDocument` acceptă documentul curent, migrează V1 și refuză explicit `SCHEMA_TOO_NEW`, `CATALOG_TOO_NEW`, `CATALOG_UNSUPPORTED`, `INVALID_PROFILE`, `UNKNOWN_KEY`, `UNIT_MISMATCH`, `VALUE_OUT_OF_RANGE`, `RESERVED_KEY_IN_V1` și `CHECKSUM_MISMATCH`. `projectProfileV2ForUi` produce 80 de rânduri, câte unul per cheie, cu origine, sursă reală, suport derivat strict din registrul 092 (`SUPPORTED`/`DEFAULT_ONLY`/`RESERVED`), sursa dovezilor, numărul de dovezi, calitatea, incertitudinea, contextele și motivul în text. Un reglaj V2 ulterior migrării nu este pierdut tacit: rollback-ul este refuzat cu `MIGRATION_NOT_REPRESENTABLE`.

Verificări executate și rezultat:
- `npm run typecheck` — 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`).
- `npm run lint` — 0 erori, 0 warnings.
- `npm run format:check` — „All matched files use Prettier code style!".
- `npm run check:architecture` — PASS (369 fișiere TypeScript; toate probele negative PASS).
- `npm run check:parameter-catalog` — „Parameter catalog is synchronized.".
- `npm test` — 2956 teste, 2956 PASS, 0 fail, 0 skipped (103,6 s).
- `node --import ./scripts/register-typescript.mjs --test tests/profiles/profile-v2.test.ts` — 14 teste, 14 PASS.
- `npm run profile:v2` — 15/15 verificări PASS; 80 chei, 5 PLAYER_SET, 4 INHERITED_V1, 71 DEFAULT, 0 UNSET; checksum `fnv1a64:3e31e4d29b287964`; amprenta raportului `094228fac6b9332d5597a8ae9343256f05002d09a9eb2bcfa880b8375c4f80ad`; verdict PASS.
- `npm run profile:v2 -- --check` — `report.json` și `report.md` actuale.

Fișiere și documente actualizate: creat `src/profiles/profile-v2.ts`, `tests/profiles/profile-v2.test.ts`, `tests/profiles/profile-v2-suite.ts`, `scripts/run-profile-v2-report.mjs`, `Docs/Evidence/166-profile-v2/README.md`, `Docs/Evidence/166-profile-v2/report.json`, `Docs/Evidence/166-profile-v2/report.md`; modificat `src/profiles/profile-store.ts` (export `profileContentHash`, aceeași primitivă FNV-1a a lui 109), `src/profiles/index.ts`, `package.json` (scriptul `profile:v2` la finalul blocului `scripts`), `Docs/12-profiluri-si-propagare.md` și `Docs/15-salvare-si-import-export.md` (secțiuni de contract la final).

Limitări sau follow-up: Niciun controler nu consumă încă valorile R; proiecția le declară `RESERVED`, iar 092 rămâne fail-closed. Catalogul livrat nu are nicio cheie estimabilă, deci un profil V1 real nu poate conține LEARNED, iar ramura `V1_LEARNED_VALUE` este acoperită structural. Documentul V2 este un read model derivat; nu s-a adăugat un rând în schema 127, iar rândurile 109 rămân sursa imuabilă. Sursa `v2:MANUAL_TUNING` este acceptată pentru un reglaj ulterior migrării, dar PBI 166 nu livrează un editor V2.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '166' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: implementat contractul `166-profile-v2-v1` (schemă V2, migrare V1 cu defaults, rollback exact, proiecție UI per cheie), raport determinist 15/15 PASS și 14 teste țintă PASS; mutat în Done după validator.

---
id: "200"
title: "Salvarea personajului și migrare V3"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["199","136"]
owner: "loop-pbi/v3-save-200-01"
started_at: "2026-11-15T01:02:20+02:00"
completed_at: "2026-11-15T01:35:20+02:00"
---

# 200 Salvarea personajului și migrare V3

## Obiectiv

Persistă poziția, camera și autoritatea personajului și migrează sesiunile.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 199 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Migrarea păstrează lumea, personajul, KPI-urile, calendarul daily și ledgerul XP.
- [x] Reload pornește în pauză cu autoritate coerentă; nu creează corpuri/autoritate/reward-uri duplicate.

## Verificare

Testează migrare, reload în mers și reload în mașină.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/walking-save.ts` (contract `200-walking-save-v1`) ridică arhiva de sesiune la format version 3 / schema 3 și adaugă un singur slot nou, `character` (`200-walking-character-v1`): poziția și yaw-ul în forma stării 192 (`fleet.character`), snapshot-ul de autoritate 193, snapshot-ul de cameră 194, starea segmentelor 198, starea de flotă 197, tick-ul sesiunii, tick-ul walker-ului și lista de entități vehicul. Sloturile `session` (135) și `economy` (215) rămân neschimbate, cu checksum-urile lor. `upgradeWalkingSave` migrează v1/v2 → v3 copiind cele două sloturi prin referință și comparând digestul canonic al fiecăruia înainte și după (o diferență este `MIGRATION_CORRUPTED`), iar `readWalkingSave` verifică în ordine buget/adâncime → parsare strictă → format → canonic → checksum → schemă → sloturi (fiecare cu cititorul proprietarului) → bilanț de mărime. O sesiune fără slot de personaj primește regula documentată `MIGRATION_DEFAULT`: spawn-ul autorat validat de walker-ul real 192 (`SPAWN_BLOCKED` într-un solid), autoritate `CHARACTER:<id>` fără taste ținute, cameră pe același personaj cu orbita 194 și controlul 009 al sesiunii, țintă 198 din generația de profil a sesiunii, model de segmente gol la tick-ul salvării, un singur corp în flota 197 și vehiculele din snapshotul 206. `walkingSaveReload`/`restoreWalkingSave` descriu lansarea `PAUSED_AUTO` cu input eliberat, taste neutralizate, aceeași autoritate și cameră, set de entități identic cu lumea vie (`ENTITY_SET_MISMATCH` altfel) și zero corpuri create; contoarele XP/daily/decontări sunt citite din slotul 215 purtat, deci al doilea reload raportează exact aceleași valori.

Verificări executate și rezultat: `npm run walking:save` → 160/160 verificări, 4/4 scenarii (V2_WALKING, V2_SEATED, V2_DEFAULT, V1_LEGACY), 18/18 refuzuri închise, overall PASS, digest SHA-256 `dbe3045fa22e35b7a2002d242b58e7dbdf1569c3508b4000b5e672bafd57d650`; `npm run walking:save -- --check` → report.json și report.md actuale, exit 0. `node --import ./scripts/register-typescript.mjs --test "tests/persistence/walking-save.test.ts"` → 13/13 teste; `tests/persistence/walking-save-report.test.ts` → 1/1; `tests/persistence/*.test.ts` → 324/324. `npm run typecheck` → 0 erori; `npm run lint` → 0 erori/0 avertismente; `npm run format:check` → All matched files use Prettier code style; `npm run check:architecture` → PASS (410 fișiere, probe negative PASS); `npm run check:parameter-catalog` → synchronized; `npm test` → 3406 teste, 3406 trecute, 0 eșecuri, 114361 ms. Numere reale: document v3 83190 unități de cod (session 65534 B, economy 14495 B, character 2584 B) pentru mers, 83610/3004 B pentru taxi, 83784/3178 B pentru migrarea implicită; XP 100,5 (100500000 micro-XP), nivel 2, 1 recompensă daily, 3 decontări, identice înainte și după migrare și la al doilea reload.

Fișiere și documente actualizate: `src/persistence/walking-save.ts` (nou), `src/persistence/index.ts` (exporturi la final), `tests/persistence/walking-save-fixture.ts` (nou), `tests/persistence/walking-save.test.ts` (nou), `tests/persistence/walking-save-report.ts` (nou), `tests/persistence/walking-save-report.test.ts` (nou), `scripts/run-v3-walking-save-report.mjs` (nou), `package.json` (o intrare nouă, ultima: `walking:save`), `Docs/29-savefile-si-integritate.md` (secțiunea V3 la final), `Docs/Evidence/200-v3-walking-save/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: Walker-ul 192 nu expune un invers al stării, deci reluarea recreează corpul la poziția salvată (biți identici) și tick-ul walker-ului repornește de la 0, în timp ce tick-ul sesiunii rămâne cel salvat. Cablarea în aplicație (pauză la export, capturare, aplicare la reload) rămâne a consumatorului: contractul nu scrie în IndexedDB și nu creează writer. Camera salvată în mijlocul tranziției de 18 tick-uri se restaurează exact (17 tick-uri rămase), dar continuarea depinde de tick-urile consumatorului. `vehicleIds` este lista de entități a lumii (maximum 128 din 206).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '200' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-15: Implementat în `loop-pbi/v3-save-200-01`: slot `character` în arhiva v3, migrare v1/v2 → v3 care păstrează `session` și `economy` bit-identice, regulă `MIGRATION_DEFAULT` pentru sesiunile fără slot, reload `PAUSED_AUTO` fără duplicate; raport determinist 160/160, 18 refuzuri închise, suita completă 3406/3406.

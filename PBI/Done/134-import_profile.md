---
id: "134"
title: "Import validat și activare de profil"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["133","114","092"]
owner: "loop-pbi/import-134-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T21:00:39+03:00"
completed_at: "2026-11-11T02:39:16+02:00"
---

# 134 Import validat și activare de profil

## Obiectiv

Validează mărime, chei, unități, intervale și compatibilitate înainte de activare.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 133 trebuie să existe în Done înainte de începere.
- PBI 114 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Importul invalid nu modifică profilul activ și nu anulează joburile de learning curente.
- [x] Importul valid folosește bariera learningEpoch și aceeași activare atomică pentru taxiuri și civili; rezultatele vechi sosite ulterior sunt ignorate.
- [x] Importul unui DrivingProfile nu resetează revenue-ul, misiunile zilnice sau XP-ul jucătorului.

## Verificare

Testează NaN, versiune incompatibilă, cheie necunoscută și profil valid, inclusiv cu worker în curs și rezultat întârziat după import.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Import validat livrat în `src/persistence/profile-import.ts` (contract `134-profile-import-v1`) și `src/persistence/profile-import-transaction.ts` (contract `134-profile-import-transaction-v1`). Documentul 133 (`self-driving-academy-profile-export`, `formatVersion=1`, `schemaVersion=1`) este parsat o singură dată și citit cu `readProfileExport`, apoi validat integral (mărime, format, schemă, unități, intervale 092, chei, checksum-uri 109, checksum de document, proveniență, adâncime, profil/motor/jucător) înainte de orice scriere. Importul scrie toate versiunile într-o singură tranzacție `profiles` și nu scrie niciodată activarea (`activated=false`, `activation=null`). Activarea este un pas explicit separat: bariera reală 205 cu motivul `IMPORT`, publicarea comună 110 pentru taxiuri și civili, apoi pointerul durabil 109/110 prin tranzacția 128. Refuzurile sunt coduri închise, inclusiv `SCHEMA_TOO_NEW` și `FORMAT_VERSION_TOO_NEW` pentru un layout mai nou.

Verificări executate și rezultat: `npm run typecheck` fără erori; `npm run lint` fără erori; `npm run format:check` - `All matched files use Prettier code style!`; `npm run check:architecture` - toate cele 5 probe PASS (305 fișiere TypeScript); `npm run check:parameter-catalog` - `Parameter catalog is synchronized.`; `node --import ./scripts/register-typescript.mjs --test tests/persistence/profile-import.test.ts` - 16 teste, 16 pass, 0 fail; `npm test` - 2104 teste, 2104 pass, 0 fail, 0 cancelled, exit 0; `npm run import:profile` - `SUMMARY checks 53/53, contract 134-profile-import-v1, overall PASS`; `--check` - `Import profile report is current` și `Import profile report markdown is current`, exit 0.

Fișiere și documente actualizate: `src/persistence/profile-import.ts` (nou), `src/persistence/profile-import-transaction.ts` (nou), `src/persistence/repository.ts` (`commitProfileImport`), `src/persistence/index.ts` (exportări), `tests/persistence/import-profile-harness.ts` (nou), `tests/persistence/profile-import.test.ts` (nou, 16 teste), `tests/persistence/import-profile-report.ts` (nou), `scripts/run-import-profile-report.mjs` (nou), `package.json` (scriptul `import:profile`), `Docs/15-salvare-si-import-export.md` (contractul 134), `Docs/Evidence/134-import-profile/README.md`, `report.json`, `report.md` (nou).

Limitări sau follow-up: Importul acoperă exclusiv versiunile de profil 109; progresia, economia, misiunile și telemetria brută rămân în afara scope-ului. Compunerea barierei 205 în bucla reală de joc și în UI aparține stratului de aplicație. `repository.ts` a fost atins aditiv pentru că nu există un port public de tranzacție multi-versiune. Testele folosesc dublul în memorie oficial al persistenței, nu un browser real; același `TransactionPort` este exercitat și de adaptorul IndexedDB.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '134' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-11: Implementat importul validat și activarea explicită; 16 teste țintă, suita completă 2104/2104, raport 53/53; fișier mutat în Done.

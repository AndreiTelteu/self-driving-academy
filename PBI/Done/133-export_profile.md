---
id: "133"
title: "Export JSON de profil"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["128"]
owner: "loop-pbi/export-133-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T16:27:09+03:00"
completed_at: "2026-10-22T17:39:05+03:00"
---

# 133 Export JSON de profil

## Obiectiv

Generează export cu schemă, versiuni, valori și dovezi agregate.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 128 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Exportul nu include automat toată telemetria brută.
- [x] Fișierul poate fi validat și reimportat fără pierderea parametrilor.

## Verificare

Testează roundtrip și profil cu chei rezervate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `133-profile-export-v1` este implementat în
`src/persistence/profile-export.ts`, cu `src/persistence/canonical-json.ts` pentru canonicalizarea
`SDA-CJSON-1`, parserul JSON strict și SHA-256. Exportul este un document JSON versionat
(`format="self-driving-academy-profile-export"`, `formatVersion=1`, `schemaVersion=1`,
`units="SI"`) cu patru secțiuni: `profile` (versiuni cu părinte, adâncime, proveniență BASE /
LEARNING / MANUAL_TUNING, checksum 109, parametri cu unitate, versiunea activă și activarea),
`aggregates` (contoare recalculate de cititor, indicatori în forma 138 și dovezi ale parametrilor),
`telemetry` (referințe și, doar la cerere explicită, evenimente brute plafonate la 512) și
`checksum` (`SHA-256` peste forma canonică a documentului fără câmpul `checksum`, conform
modulului 29). Cele 56 de chei rezervate R (`extension`) sunt publicate cu valoarea `null`; o cheie
rezervată cu valoare, o cheie rezervată lipsă sau o cheie utilizabilă în maparea rezervată sunt
refuzate cu cod închis. Exportul nu publică telemetrie brută în mod automat, iar calea din
repository nu o poate publica deloc. Cititorul (`readProfileExport`) reface aceleași valori, chei
rezervate și proveniență și este contractul pe care PBI 134 va construi.

Verificări executate și rezultat:

- `npm run typecheck` — fără erori.
- `npm run lint` — fără erori.
- `npm run format:check` — „All matched files use Prettier code style!”.
- `npm run check:architecture` — „Architecture imports: PASS (293 TypeScript files)”, celelalte
  probe-uri negative PASS.
- `npm run check:parameter-catalog` — „Parameter catalog is synchronized.”.
- `node --import ./scripts/register-typescript.mjs --test tests/persistence/profile-export.test.ts`
  — 27 de teste, 27 trecute, 0 eșuate.
- `npm test` — 2041 de teste, 2041 trecute, 0 eșuate (două rulări consecutive).
- `node --import ./scripts/register-typescript.mjs scripts/run-export-profile-report.mjs` —
  „SUMMARY checks 53/53, contract 133-profile-export-v1, overall PASS”; `--check` confirmă că
  transcriptul și exemplul sunt actuale.
- `pwsh -NoProfile -ExecutionPolicy Bypass -Command "& './PBI/Validate-Board.ps1'"` —
  `{"Valid": true, "Total": 235, ...}` la începutul lucrării (133 în In Progress).

Numere reale: document canonic de 4451 code unități, checksum
`d7597165fa372a82cfbed0b693c331cba3b9bd2def54a29088ad3a34d3bb17e3`, 3 versiuni exportate, 2
parametri efectivi, 56 de chei rezervate, 512 evenimente ca plafon de telemetrie brută.

Fișiere și documente actualizate: `src/persistence/profile-export.ts` (nou),
`src/persistence/canonical-json.ts` (nou), `src/persistence/index.ts`,
`src/profiles/parameter-registry.ts`, `src/profiles/index.ts`,
`tests/persistence/profile-export.test.ts` (nou), `tests/persistence/export-profile-report.ts`
(nou), `scripts/run-export-profile-report.mjs` (nou), `package.json` (scriptul `export:profile`),
`Docs/15-salvare-si-import-export.md` (contractul 133, documentul la versiunea 0.9),
`Docs/Evidence/133-export-profile/README.md`, `report.json`, `report.md`, `sample-export.json`
(nou) și acest fișier PBI.

Limitări sau follow-up: importul propriu-zis rămâne PBI 134; 133 livrează formatul, validatorul și
cititorul. Exportul refuză explicit (`UNKNOWN_PARAMETER`) o versiune cu o cheie din afara
catalogului 092, pentru că nu ar putea fi reimportată fără pierderi. Telemetria brută este plafonată
la 512 de evenimente, iar peste plafon construcția este refuzată, nu trunchiată. Indicatorii și
dovezile din `aggregates` sunt injectate de apelant (de exemplu din snapshoturile 137/138). O singură
rulare a suitei complete a picat în `tests/workers/protocol.test.ts` (test de timp flosca, buget de
200 ms); rulările complete ulterioare au fost 2041/2041 și eșecul nu are legătură cu 133.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '133' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22: Implementarea a început (owner `loop-pbi/export-133-01`, `started_at`
  2026-10-22T16:27:09+03:00); fișierul a fost mutat fizic în In Progress și validatorul a trecut
  (`Valid: true`).
- 2026-10-22: Exportul, validatorul, cititorul și testele sunt implementate; contractul 133 este
  documentat în `Docs/15-salvare-si-import-export.md` (versiunea 0.9) și dovezile sunt în
  `Docs/Evidence/133-export-profile/`. Verificări: typecheck, lint, format:check, check:architecture,
  check:parameter-catalog verzi; 27/27 teste țintă, 2041/2041 suite completă, raport 53/53.
  `completed_at` 2026-10-22T17:39:05+03:00; fișierul a fost mutat fizic în PBI/Done.

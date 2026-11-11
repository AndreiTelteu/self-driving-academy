---
id: "123"
title: "Misiunea schimbarea unui obicei"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["122","114"]
owner: "loop-pbi/habit-123-01"
started_at: "2026-11-11T05:14:53+02:00"
completed_at: "2026-11-11T05:33:00+02:00"
---

# 123 Misiunea schimbarea unui obicei

## Obiectiv

Creează obiectiv de actualizare prin demonstrații repetate.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 122 trebuie să existe în Done înainte de începere.
- PBI 114 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Stilul nou poate înlocui treptat o tendință veche.
- [x] Jucătorul poate inspecta dovezile și versiunile intermediare.

## Verificare

Testează schimbare repetată și o demonstrație contradictorie singulară.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/habit.ts` implementează contractul `123-mission-habit-v1` pentru etapa 7 a campaniei (`campaign-7-changing-a-habit`, obiectivul 116 `distinct-versions` / `DISTINCT_PROFILE_VERSIONS` / țintă 2). Misiunea citește istoricul real 109 (`store.getHistory`) și cheia 092 demonstrată și aplică regula explicită `HABIT_POLICY`: 3 demonstrații consecutive în aceeași direcție stabilesc tendința nouă, 2 contradicții consecutive o răstornă, iar o contradicție singulară este absorbită și raportată. Fiecare pas este o versiune 109 reală cu ordine (`depth`), proveniență, checksum `fnv1a64` verificat și valorile exacte schimbate; `HabitComparison` compară baza cu capul. Intrările inconsistente sunt refuzate cu cod închis (`PROFILE_MISMATCH`, `MISSING_INTERMEDIATE_VERSION`, `DEMONSTRATION_WITHOUT_EVIDENCE`, `INVALID_INPUT`, `HISTORY_LIMIT`, `NO_BASE_VERSION`, `DUPLICATE_VERSION`, `ENGINE_VERSION_MISMATCH`, `VERSION_WITHOUT_KEY`, `CHECKSUM_MISMATCH`, `VALUE_MISMATCH`).

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` `PASS (320 TypeScript files)` + probe negative PASS; `npm run check:parameter-catalog` „Parameter catalog is synchronized.”; `npm test` 2234 teste, 2234 pass, 0 fail, 68,07 s; `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-habit.test.ts"` 9 teste, 9 pass, 0 fail; `npm run missions:habit` `SUMMARY checks 59/59, runs 4, overall PASS`; `node --import ./scripts/register-typescript.mjs scripts/run-mission-habit-report.mjs --check` „Mission habit report is current”, exit 0.

Fișiere și documente actualizate: `src/missions/habit.ts` (nou), `src/missions/index.ts`, `tests/missions/mission-habit-fixture.ts` (nou), `tests/missions/mission-habit.test.ts` (nou), `tests/missions/mission-habit-report.ts` (nou), `scripts/run-mission-habit-report.mjs` (nou), `package.json` (scriptul `missions:habit` la finalul blocului `scripts`), `Docs/13-misiuni-si-progres.md` (secțiunea contractului 123), `Docs/Evidence/123-mission-habit/README.md`, `report.json`, `report.md`, `PBI/Done/123-mission_habit.md`.

Limitări sau follow-up: rulare Node deterministă, fără browser, renderer sau sesiune umană; partea autorată este doar numărul de opriri complete vs treceri din fiecare demonstrație, restul fiind output-ul real 085/086/087/088/093/097/098 și 103/102/109/110. Misiunea nu are HUD/panou sau compoziție în `main.ts`; inspecția este read model-ul `steps` + `HabitComparison`. Pragurile 3/2 sunt o regulă de design documentată, nu o calibrare statistică. Nu se revendică FPS, GPU, Rapier sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '123' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11: Implementare finalizată în `loop-pbi/habit-123-01`: contractul 123 livrat cu 59/59 verificări de raport, 9 teste țintă și suita completă 2234/2234; fișierul mutat fizic în Done.

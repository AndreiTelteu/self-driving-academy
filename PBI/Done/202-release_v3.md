---
id: "202"
title: "Închiderea release-ului complet cu mers pe jos"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["201"]
owner: "loop-pbi/v3-release-202-01"
started_at: "2026-11-15T02:58:06.229+02:00"
completed_at: "2026-11-15T03:17:03.658+02:00"
---

# 202 Închiderea release-ului complet cu mers pe jos

## Obiectiv

Finalizează release-ul cu mers pe jos și toate funcționalitățile planificate.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 201 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Toate dependențele V3 sunt în Done cu dovezi de verificare.
- [x] Documentația reflectă controalele și scope-ul implementat.

## Verificare

Checklist final și demonstrație completă de produs.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Artefact de release V3 derivat, nu scris: `npm run release:v3` generează `capabilities.json/md` (12 capabilități, fiecare cu contractul, numerele reale din raport, dovada și limitarea), `controls.json/md` (cele 15 acțiuni 009 cu tastele reale, 10 cu consumator în 066/067/030, 5 `DECLARED_ONLY`, plus 4 gesturi de pointer implementate și 1 indisponibil) și `release-checklist.json/md` (23 rânduri: 10 `PASS`, 3 `FAIL`, 10 `NOT_RUN`, 13 deschise, fiecare cu owner). Verdictul de release este **`NOT_VALIDATED`**, derivat din rândurile deschise, nu ales. Criteriul 1: tabel 11/11 derivat din disc — fișier în `PBI/Done`, `status: Done`, `completed_at`, README de dovezi fără „De completat", `report.json` comis și comanda raportului prezentă în `package.json`. Criteriul 2: fiecare afirmație din `capabilities`/`controls` este verificată împotriva codului sau a raportului; `src/main.ts` are 0 referințe la contractele V3, deci toate capabilitățile sunt declarate `HEADLESS_CONTRACT`, iar `Docs/20` a fost corectat să nu mai promită XP pentru timpul de mers (`walkingTimeXp = NOT_IMPLEMENTED`, 199). Secțiunea finală din `Docs/20` este generată determinist între marcaje.

Verificări executate și rezultat: `npm run release:v3` exit 0 (6 fișiere, 12/12 verificări `PASS`, dependențe 11/11, checklist 10 PASS / 3 FAIL / 10 NOT_RUN, release `NOT_VALIDATED`, artefact `PASS`); `npm run release:v3 -- --check` exit 0 („Release artifacts V3 are current."); `npm run typecheck` exit 0; `npm run lint` exit 0, 0 erori, 0 warning-uri; `npm run format:check` exit 0; `npm run check:architecture` exit 0, PASS (410 fișiere TypeScript, probe negative 6 + 4 + 3 respinse); `npm run check:parameter-catalog` exit 0; `node --import ./scripts/register-typescript.mjs --test tests/release/v3-release-artifact.test.ts` exit 0, 7/7; `npm test` exit 0, **3 415 teste, 3 415 trecute, 0 eșuate**; `pwsh ./PBI/Validate-Board.ps1 -RequireDone '202'` → `Valid: true`, 235 task-uri (0 To Do, 0 In Progress, 235 Done).

Fișiere și documente actualizate: `scripts/run-v3-release-artifact.mjs` (nou, cu `--check`); `tests/release/v3-release-artifact.test.ts` (nou, poarta de execuție); `package.json` (o intrare nouă, ultima din `scripts`: `release:v3`); `Docs/20-extensii-si-mers-pe-jos.md` (secțiune finală generată + corectura XP-ului de mers); `Docs/Evidence/202-v3-release/` (nou: capabilities, controls, release-checklist, README).

Limitări sau follow-up: Release-ul rămâne `NOT_VALIDATED` și nu poate deveni `PASS` până când rândurile deschise nu se închid: FPS/frame pe hardware real (`hardware-fps-v3`, owner 224/operator), harness V3 cu personaj/pietoni/pericole (`harness-v3-timing`, owner 220/224), cei doi pași de streaming vizual `NOT_MEASURED` (`visual-streaming`, owner 157/223), soak V3 (`soak-v3`, owner 159/224), playtest uman (`playtest-human`, owner 235/216), contractul 25 pe workload-ul V3 (`contract25-v3`, owner 201/224), re-măsurarea dovezii comise 224 (`remeasure-224`), defectele moștenite `qa-ui-153` (8 defecte MEDIUM, owner 153) și `fun-experience-235` (C3 `FAIL`, C5 `NOT_RUN`, owner 235), cele 56 de chei extinse rezervate de etapa de plan, XP-ul de timp de mers `NOT_IMPLEMENTED` (owner 199/213) și compunerea contractelor V3 în `src/main.ts`. Generatorul citește dovezile comise și nu reexecută probele grele (hardware, soak, browser, playtest); un rând `PASS` înseamnă că dovada comisă spune `PASS` și fișierul există.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '202' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-15T02:58:06+02:00: preluat de `loop-pbi/v3-release-202-01`, mutat în In Progress; board valid (`Valid: true`, 1 In Progress, 234 Done).
- 2026-11-15T03:17:03+02:00: implementare finalizată — artefact de release V3 derivat (`release:v3`), 11/11 dependențe dovedite din disc, 12 capabilități și 15 controale reale, checklist 10 PASS / 3 FAIL / 10 NOT_RUN, verdict `NOT_VALIDATED`; suita completă 3 415/3 415; mutat în Done.

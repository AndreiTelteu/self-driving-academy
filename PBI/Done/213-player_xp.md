---
id: "213"
title: "XP din misiuni și timp activ al jucătorului"
status: "Done"
release: "V1"
module: "Progres"
depends_on: ["212","125","008","009","209"]
owner: "loop-pbi/xp-213-01"
started_at: "2026-11-11T18:22:55+02:00"
completed_at: "2026-11-11T19:05:00+02:00"
---

# 213 XP din misiuni și timp activ al jucătorului

## Obiectiv

Implementează PlayerProgress și ledger XP separat de DrivingProfile.

## Context și plan

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 212 trebuie să existe în Done înainte de începere.
- PBI 125 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Misiunile acordă XP o singură dată; minutele reale active păstrează fracțiunile și identitatea creditelor.
- [x] Pauză/background/AFK/replay/experimente/offline nu acordă XP; AUTO activ poate conta.
- [x] Soldul, nivelul și istoricul sunt explicabile; resetul/importul stilului nu resetează XP.

- [x] Creditele sunt nenegative; soldul/nivelul nu scad prin KPI, incident, eșec/refuz sau zi ratată. XP de timp se acordă numai în Academie.

## Verificare

Testează minut fracționar, activitate AUTO, pause/AFK, recompensă duplicată și profil de driving nou.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/player-progress.ts` livrează `213-player-progress-v1`: ledgerul XP
append-only cu intrări `XpEntry` (sursă, moment, identitate, micro-XP, sold după credit), soldul,
nivelul derivat din tabelul monoton `213-xp-levels-v1` și timpul activ exact. Misiunile plătesc prin
identitatea 125 (`missionRewardId`) consumând rezultatul real al ledgerului 125; zilele prin
`dailyRewardId` din 211; timpul prin identitatea ferestrei reale. 30 s = exact 0,5 XP, 160 000 ms =
2 666 666 micro-XP, fără rotunjiri. AUTO contează când fereastra are focus, vizibilitate, fără pauză
și fără AFK; pauza, background-ul, focusul pierdut, AFK, replay-ul, experimentele, Haos și golul
offline nu acordă XP. Nu există debit, penalizare sau reset, iar nivelul este o funcție pură de sold.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0, 0 avertismente;
`npm run format:check` PASS; `npm run check:architecture` PASS (336 fișiere TypeScript, probe negative
PASS); `npm run check:parameter-catalog` sincronizat; `npm test` 2401 teste, 2401 pass, 0 fail, ~65,8 s;
testele țintă `tests/missions/player-xp.test.ts` 14/14 pass; `npm run missions:player-xp` 29/29
verificări, overall PASS; `--check` raportează „Player XP report is current”.

Fișiere și documente actualizate: `src/missions/player-progress.ts` (nou), `src/missions/index.ts`
(exporturi aditive), `tests/missions/player-xp-fixture.ts`, `tests/missions/player-xp.test.ts`,
`tests/missions/player-xp-report.ts`, `scripts/run-player-xp-report.mjs` (nou), `package.json`
(`missions:player-xp`), `Docs/23-misiuni-zilnice-si-experienta.md` (secțiunea 213),
`Docs/Evidence/213-player-xp/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: fără browser real, FPS/GPU sau soak; compoziția trebuie să furnizeze
ferestrele de observare și verdictul AFK; fără UI și fără persistare în savefile (checkpointul este
contract de date); pragurile AFK/fereastră/XP pe minut rămân propuneri de calibrare.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '213'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-11: Implementare completă în `src/missions/player-progress.ts` cu ledger XP separat de
  DrivingProfile, identitate 125/211 pentru misiuni și zile, timp activ exact pe micro-XP, nivel
  derivat și checkpoint verificabil. 14 teste țintă, 29/29 verificări de raport, suita completă 2401
  pass. Task mutat în Done.

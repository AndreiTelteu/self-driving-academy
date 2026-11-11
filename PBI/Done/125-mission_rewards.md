---
id: "125"
title: "Progres recompense și deblocări"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["124"]
owner: "loop-pbi/rewards-125-01"
started_at: "2026-11-11T12:31:40+02:00"
completed_at: "2026-11-11T12:52:14+02:00"
---

# 125 Progres recompense și deblocări

## Obiectiv

Leagă campania de provocări, clase suplimentare și instrumente.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 124 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Vehiculele existente și selectarea taxiurilor rămân accesibile.
- [x] Reluarea nu dublează recompensele și nu șterge profilurile.

## Verificare

Testează recompensă unică, reluare și reset de misiune.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/missions/rewards.ts` (schema `125-mission-rewards-v1`) leagă campania 116, flota 057 și recompensele într-un progres cu trei read modeluri separate: `progress()` (LOCKED/AVAILABLE/COMPLETED plus prerechizite, încercări, următoarea încercare), `unlocks()` (listă monotonă de capabilități, cu accesul de bază mereu prezent) și `rewards()` (acordări o singură dată). Finalizarea consumată este o instanță 116 reală `COMPLETED`, verificată prin identitatea stabilă `missionInstanceId`. Recompensele sunt idempotente prin identitatea 116 `missionRewardId(namespace, missionId, definitionVersion, rewardId)`: aceeași finalizare → `DUPLICATE` (`COMPLETION_ALREADY_SETTLED`), reluare reală → `NO_REWARD` (`REWARD_ALREADY_GRANTED`), versiune nouă de definiție → `GRANTED`. Resetul de misiune readuce doar progresul misiunii (AVAILABLE, attempts 0, nextAttempt 1), păstrând recompensele, deblocările și profilurile (`profileWrites: 0` structural).

Verificări executate și rezultat:
- `npm run typecheck` — exit 0 (src + `tsconfig.tests.json`).
- `npm run lint` — exit 0, 0 warnings.
- `npm run format:check` — „All matched files use Prettier code style!".
- `npm run check:architecture` — PASS, 325 fișiere TypeScript, probe negative PASS.
- `npm run check:parameter-catalog` — „Parameter catalog is synchronized.".
- `npm test` — 2301 teste, 2301 pass, 0 fail, 0 skipped (70,4 s).
- `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-rewards.test.ts"` — 11 teste, 11 pass, 0 fail.
- `node --import ./scripts/register-typescript.mjs scripts/run-mission-rewards-report.mjs` — 41/41 verificări PASS, 3 scenarii, overall PASS.
- `node --import ./scripts/register-typescript.mjs scripts/run-mission-rewards-report.mjs --check` — „Mission rewards report is current".
- Numere reale: 8 misiuni × 2 recompense = 16 acordări, 800 XP, 8 deblocări; reluare `NO_REWARD` (0 acordate, 2 duplicate, 800 XP neschimbat); 9 puncte de control de acces cu 24/24 taxiuri selectabile și 64/64 vehicule conduse, 0 revocări; reset păstrează 10 acordări, 500 XP și 5 deblocări, iar recompletarea rămâne `NO_REWARD`.

Fișiere și documente actualizate: `src/missions/rewards.ts` (nou), `src/missions/index.ts`, `tests/missions/mission-rewards-fixture.ts` (nou), `tests/missions/mission-rewards.test.ts` (nou), `tests/missions/mission-rewards-report.ts` (nou), `scripts/run-mission-rewards-report.mjs` (nou), `package.json`, `Docs/13-misiuni-si-progres.md`, `Docs/Evidence/125-mission-rewards/README.md`, `Docs/Evidence/125-mission-rewards/report.json`, `Docs/Evidence/125-mission-rewards/report.md`.

Limitări sau follow-up: rulare Node deterministă, fără browser/renderer/sesiune umană; persistarea registrului de recompense în savefile rămâne la 127–136; UI-ul de progres/deblocări și aplicarea XP în `PlayerProgress` nu fac parte din contract; nu se revendică FPS, GPU sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '125' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11: implementare finalizată pe `loop-pbi/rewards-125-01`; contract 125 livrat, 11 teste țintă și 41/41 verificări de raport PASS, suita completă 2301/2301; fișier mutat fizic în Done.

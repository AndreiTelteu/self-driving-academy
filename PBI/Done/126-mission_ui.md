---
id: "126"
title: "Panoul misiunilor și obiective live"
status: "Done"
release: "V1"
module: "Misiuni"
depends_on: ["125","084"]
owner: "loop-pbi/missions-ui-126-01"
started_at: "2026-11-11T13:04:04+02:00"
completed_at: "2026-11-11T13:41:12+02:00"
---

# 126 Panoul misiunilor și obiective live

## Obiectiv

Afișează obiective, progres, motive de eșec și opțiuni de reluare.

## Context și plan

[13-misiuni-si-progres.md](../../Docs/13-misiuni-si-progres.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 125 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Textul corespunde evaluării reale și versiunii misiunii.
- [x] Un obiectiv blocat poate fi inspectat fără pierderea progresului.

## Verificare

Parcurge campania și verifică fiecare stare UI.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: panoul livrat în `src/ui/mission-panel-format.ts` (`126-mission-panel-v1`) și `src/ui/mission-panel.ts`, cu exporturi în `src/ui/index.ts`. Panoul este o proiecție read-only peste 116 și 125: `composeMissionPanelSnapshot` copiază campania din `CampaignProgress`, evaluarea din cea mai recentă instanță 116 și textul din versiunea aplicată a definiției, iar `parseMissionPanelSnapshot` refuză orice snapshot care contrazice contractele. `createMissionPanel(host, { read, setSurface? })` montează butonul nativ `<button type="button">Misiuni</button>` și dialogul `role="dialog"`; `selectMission` este o schimbare pur vizuală, iar `refresh()` citește doar cât timp panoul este deschis.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0 (0 warnings); `npm run format:check` exit 0 (All matched files use Prettier code style); `npm run check:architecture` exit 0 (329 fișiere TS, toate probele PASS); `npm run check:parameter-catalog` exit 0 (catalog sincronizat); `npm test` 2336 teste, 2336 pass, 0 fail, 1 suite, ~67 s; `node --import ./scripts/register-typescript.mjs --test "tests/ui/mission-panel.test.ts"` 13 teste, 13 pass, 0 fail; `npm run missions:panel` 23/23 verificări, overall PASS (determinism: 2 rulări, equal=true); `npm run missions:panel -- --check` exit 0, raport curent. Parcurgerea campaniei: 8 misiuni, campania mixtă 8 încercări / 8 instanțe 116 / 14 recompense (7 încheiate, 1 disponibilă cu eșec real), campania completă 8 finalizări / 8 încercări / 16 recompense / 0 reseturi, 8 din 8 obiective evaluate îndeplinite, 4 motive de eșec închise din instanțe reale, 3 misiuni blocate inspectate fără modificarea progresului, 172 elemente / 11 listeners / 0 listeners globali.

Fișiere și documente actualizate: `src/ui/mission-panel-format.ts`, `src/ui/mission-panel.ts`, `src/ui/index.ts`, `tests/ui/mission-panel-fixture.ts`, `tests/ui/mission-panel.test.ts`, `tests/ui/mission-panel-report.ts`, `scripts/run-mission-panel-report.mjs`, `package.json` (`missions:panel`, ultima intrare), `Docs/13-misiuni-si-progres.md` (secțiunea contractului 126), `Docs/08-interfata-camera-si-control.md` (pointer), `Docs/Evidence/126-mission-panel/` (README, `report.json`, `report.md`).

Limitări sau follow-up: nivel `targeted`, dovezi deterministe pe DOM propriu (fără browser real, ceas de perete, FPS/GPU). Butonul nu este montat în HUD-ul din `src/app/` și reluarea nu este pornită de panou: ambele rămân ale hostului, care deține citirea 125 și bindingul de input. Stilurile sunt inline, ca să nu modifice foaia globală.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '126' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-11: Implementare finalizată în `loop-pbi/missions-ui-126-01`: panou read-only peste 116/125, 13 teste țintă și raport determinist 23/23. Mutat fizic în Done.

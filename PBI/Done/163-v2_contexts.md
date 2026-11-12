---
id: "163"
title: "Scenarii și telemetrie pentru parametrii V2"
status: "Done"
release: "V2"
module: "Extindere V2"
depends_on: ["162","140"]
owner: "loop-pbi/v2-contexts-163-01"
started_at: "2026-11-12T16:26:30+02:00"
completed_at: "2026-11-12T16:44:41+02:00"
---

# 163 Scenarii și telemetrie pentru parametrii V2

## Obiectiv

Extinde contextele, etichetele și scenariile pentru cele 56 de chei R.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 162 trebuie să existe în Done înainte de începere.
- PBI 140 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare categorie R are oportunități reprezentabile și date de manual.
- [x] Cheile V1 și dovezile lor păstrează compatibilitatea.

## Verificare

Testează scenarii pentru lateral, rutare, pericole și serviciu.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `163-v2-contexts-v1` din `src/telemetry/v2-contexts.ts` definește câte un context observabil pentru fiecare dintre cele 56 de chei R (10 categorii: 4 chei pe Viteză, Longitudinal, Urmărire, Semafoare, STOP/prioritate, Benzi; 8 chei pe Lateral, Rutare, Pietoni/pericole, Serviciu). Fiecare context are etichetă în română, listă închisă de fapte observabile derivate din contractele reale 085/069, 007, 030, 033/219 și 061, constrângere 087 validată la încărcare, tip de oportunitate 086 doar unde există și date de manual (`setup`, `action`, `evidence`). Cele 10 scenarii reprezentative sunt numărate din cadre, nu afirmate: fiecare scenariu are toate cheile categoriei observabile și toate declanșatoarele numerice observate (22/22 triggeri), iar controlul negativ `control-flat-cruise` produce 0 chei observabile și 0 categorii reprezentative. Compatibilitatea V1: 24 de chei protejate, 0 redenumiri, 0 praguri schimbate, `migration: none`, dovezi V1 (151, 216, 142, 056) prezente și amprentate SHA-256. Rezultat raport: 56/56 chei, 10/10 categorii, 10/10 scenarii, 60 cadre, overall PASS.

Verificări executate și rezultat: `npm run typecheck` PASS exit 0; `npm run lint` PASS 0 erori/0 warning-uri; `npm run format:check` PASS („All matched files use Prettier code style!”); `npm run check:architecture` PASS 366 fișiere TypeScript (probe negative 6+4+3, lifecycle); `npm run check:parameter-catalog` PASS („Parameter catalog is synchronized.”); `npm test` 2909 teste, 2909 trecute, 0 eșuate, 0 sărite, 92 949 ms; `node --import ./scripts/register-typescript.mjs --test "tests/telemetry/v2-contexts.test.ts"` 11 teste, 11 trecute; `npm run v2:contexts` 56/56 chei, 10/10 categorii, 10/10 scenarii reprezentative, 60 cadre, control 0 chei, 24 chei V1, overall PASS; `npm run v2:contexts -- --check` „V2 context report is current” + „V2 context markdown is current”. Amprentă deterministă: `d224cf567f54ac9d0846b78986657ecc320c4712eaf05b8e4c9be96169cf4243`.

Fișiere și documente actualizate: `src/telemetry/v2-contexts.ts` (nou), `src/telemetry/index.ts`, `tests/telemetry/v2-contexts-fixtures.ts` (nou), `tests/telemetry/v2-contexts-suite.ts` (nou), `tests/telemetry/v2-contexts.test.ts` (nou), `scripts/run-v2-context-report.mjs` (nou), `package.json` (intrarea `v2:contexts`, ultima din blocul `scripts`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiune nouă la final), `Docs/Evidence/163-v2-contexts/{README.md,report.json,report.md}` (noi).

Limitări sau follow-up: Nivel determinist în Node, fără browser/GPU/input uman sau fizică live; playtestul vizual rămâne al gate-urilor de release. Claxonul nu are încă un canal live de input („VehicleCommand” expune throttle, brake, steering, handbrake, turnSignal), deci `horn_use_probability` este dovedit exclusiv prin fixture controlat și cere keybinding-ul viitorului canal. Faptele de rutare și serviciu sunt valori măsurate de proprietarul lor (033/219, respectiv 061) sau de fixture controlat, validate ca intervale și vocabulare închise, nu recalculate din geometria hărții. `LEADER_QUEUE` folosește standstill-ul propriu ca proxy declarat (eșantionul nu transportă viteza liderului), cu pragul real `FOLLOWING_LIMITS.standstillMps` = 0,1 m/s. Pragurile numerice ale parametrilor rămân cele din catalogul de proiectare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '163' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare finalizată în `loop-pbi/v2-contexts-163-01`: 56/56 chei R acoperite cu context, etichetă, scenariu reprezentativ și date de manual; 10/10 categorii reprezentative; control negativ cu 0 chei; compatibilitate V1 păstrată (24 chei, 0 redenumiri, 0 praguri); raport determinist `v2:contexts` cu `--check`; 2909/2909 teste trecute. Mutat fizic în Done.

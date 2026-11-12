---
id: "165"
title: "Pericole obstacole și claxon în scenarii"
status: "Done"
release: "V2"
module: "Extindere V2"
depends_on: ["164","024"]
owner: "loop-pbi/hazards-165-01"
started_at: "2026-11-12T17:45:10+02:00"
completed_at: "2026-11-12T18:09:49+02:00"
---

# 165 Pericole obstacole și claxon în scenarii

## Obiectiv

Definește stimuli de pericol, obstacole și oportunități de claxon.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 164 trebuie să existe în Done înainte de începere.
- PBI 024 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Debutul stimulului este observabil pentru măsurarea reacției.
- [x] Evitarea și frânarea folosesc aceeași fizică, fără imunitate.

## Verificare

Testează obstacol brusc, reacție întârziată și manevră evazivă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `165-hazards-v1` din `src/world/hazards.ts` definește stimuli de pericol cu debut observabil (rază 80 m, con frontal 120°), identitate derivată din sesiune, epocă, pericol, vehicul și incarnare (fără tick), reacții măsurate ca front după debut (frână, virare) și rezultate închise `STOPPED`, `PASSED_CLEAR`, `PASSED_CLOSE`, `CONTACT`, `RELEASED`. Obstacolele sunt date (ID, tip închis, poziție, dimensiune, politică de margine `REJECT_OUTSIDE`/`CLIP_TO_BOUNDS`, apariție cu jitter derivat din seed) și expun faptele exacte ale unei cutii denumite pentru canalul comun de coliziuni, deci evitarea și frânarea folosesc același solver, fără imunitate pentru MANUAL sau AUTO. Claxonul este o oportunitate cu condiții observabile (`IMMINENT_HAZARD`, `PEDESTRIAN_IN_PATH`, `OBSTACLE_BLOCKS_PATH`), iar `HAZARD_HORN_CHANNEL` declară că inputul live lipsește. Raportul determinist are 7/7 scenarii PASS, 11 stimuli, 10 reacții (7 frână / 3 virare), 5 oportunități / 1 claxon / 1 refuz, 5 oprite, 3 trecute curat, 1 trecut aproape, 2 contacte, amprentă SHA-256 `cb7be00c54458ef6a338cba30ba411ec33fdeaea79cfcfae18b25ffce1a201cb`. În Rapier real, MANUAL și AUTO au aceeași oprire (z final −19,66814), același contact (tick 242, impuls 14 033,656 N·s) și același clearance evaziv (17,911 m); un perete generic cu aceleași dimensiuni produce exact aceleași numere.

Verificări executate și rezultat: `npm run typecheck` PASS exit 0; `npm run lint` PASS 0 erori 0 warning-uri; `npm run format:check` PASS „All matched files use Prettier code style!”; `npm run check:architecture` PASS 368 fișiere TypeScript, probe negative 6+4+3; `npm run check:parameter-catalog` PASS „Parameter catalog is synchronized.”; `npm test` 2942 teste, 2942 trecute, 0 eșuate, 0 sărite, 102 358 ms; `node --import ./scripts/register-typescript.mjs --test "tests/world/hazards.test.ts"` 18 teste, 18 trecute; `npm run hazards:report` 7/7 PASS cu numerele din dovezi; `npm run hazards:report -- --check` „Hazard report is current” și „Hazard markdown is current”.

Fișiere și documente actualizate: `src/world/hazards.ts` (nou), `src/world/index.ts`, `tests/world/hazards-fixture.ts` (nou), `tests/world/hazards-suite.ts` (nou), `tests/world/hazards.test.ts` (nou), `scripts/run-hazard-report.mjs` (nou), `package.json` (intrarea `hazards:report`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiunea PBI 165), `Docs/Evidence/165-hazards/{README.md,report.json,report.md}` (noi).

Limitări sau follow-up: nivel determinist în Node, fără browser, GPU sau input uman; doar scenariul `physical-same-physics` rulează fizica Rapier reală. Claxonul nu are canal live: `VehicleCommand` nu expune horn, deci pentru live lipsesc keybinding-ul, câmpul/evenimentul de comandă și feedback-ul audio/HUD. Pietonii din scenariul de claxon sunt fapt de fixture; populația reală rămâne a contractului 164. Politica de margine este plană (X/Z). Pragurile numerice sunt candidate de design, nu valori de calibrare în catalog.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '165' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementat în `loop-pbi/hazards-165-01`; contract `165-hazards-v1`, 7/7 scenarii PASS, 18 teste țintă, suita completă 2942/2942, dovezile în `Docs/Evidence/165-hazards/`.

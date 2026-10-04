---
id: "005"
title: "Contracte de date și validatoare de runtime"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["002"]
owner: "Codex /root/pbi005_contracts"
started_at: "2026-10-05T00:09:29.3600665+03:00"
completed_at: "2026-10-05T00:23:20.0106551+03:00"
---

# 005 Contracte de date și validatoare de runtime

## Obiectiv

Implementează VehicleCommand, VehicleState, Ride, InterventionSegment, DrivingProfile și evenimentele cu scheme validate.

## Context și plan

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 002 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Datele valide trec, iar NaN, infinitul și valorile structurale invalide sunt respinse.
- [x] Unitățile SI și versiunile de schemă sunt explicite.

## Verificare

Teste de roundtrip și date invalide pentru contractele publice.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contracte publice schema1/SI pentru VehicleCommand, VehicleState, Ride, InterventionSegment, DrivingProfile, TelemetrySample, ParameterEvidence și 16 SimulationEvent discriminate. Parsere unknown stricte, copii defensive deep-frozen, context sessionId/worldEpoch și invariante tick/mod/surse. Porturile bootstrap sunt păstrate.

Verificări executate și rezultat: npm run check PASS (typecheck, lint, format, arhitectură și 36/36 teste: 32 contracte + 4 harness); npm run build PASS (261 module); git diff --check PASS. Loguri reale în Docs/Evidence/005-contracts/*.txt. Validate-Board.ps1 -RequireDone '005' se rulează după mutare; rezultatul final este în board-final.txt.

Fișiere și documente actualizate: src/vehicles, fleet, simulation, telemetry, profiles, sessions; tests/contracts; Docs/02-arhitectura-si-contracte.md, Docs/data-contracts.md, Docs/Evidence/005-contracts și acest PBI.

Limitări sau follow-up: Validatorul de profil este structural; registry-ul parametrilor/calibrarea controllerului și compatibilitatea motorului aparțin PBI092/serviciilor dedicate. Checksum este șir opac validat structural, fără verificare criptografică. Schemele necunoscute sunt respinse explicit; nu există încă o schemă veche migrabilă. Nu sunt implementate servicii de gameplay.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '005' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T00:23:20.0139019+03:00: Contractele implementate și verificate; npm run check 36/36 PASS, build PASS, diff --check PASS. Tranziție fizică în Done și validare obligatorie consemnată în Docs/Evidence/005-contracts/board-final.txt.

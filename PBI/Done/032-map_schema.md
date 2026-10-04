---
id: "032"
title: "Schema hărții și validator semantic"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["005","006"]
owner: "Codex /root/pbi010_workers"
started_at: "2026-10-05T02:23:08.3212826+03:00"
completed_at: "2026-10-05T02:39:47.8270947+03:00"
---

# 032 Schema hărții și validator semantic

## Obiectiv

Definește benzi, intersecții, semnale, zone de conflict și puncte de serviciu.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Geometria și semantica rutieră sunt date distincte, legate prin IDs.
- [x] Legături inexistente și mișcări contradictorii sunt respinse.

## Verificare

Validează o hartă minimă și fixture-uri cu legături invalide.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: RoadMap schemaVersion1/SI, geometrie nodes/paths/areas separată de reguli; parser unknown exact-shape cu copii defensive readonly înghețate; validator semantic pentru IDs/referințe, endpointuri/direcții/apartenență, mișcări/conflicte GREEN, STOP/crosswalk/service/recovery și reachability orientată per clasă. Diagnostice cu path/ID/poziție validată.

Verificări executate și rezultat: 56/56 teste world PASS; npm run check exit0 (158/158 teste integrate la execuția păstrată); npm run build exit0; Validate-Plan Valid:true. Fixture minimal serializat după parserul real. [Dovezi complete](../../Docs/Evidence/032-map-schema/report.md) și loguri în același folder.

Fișiere și documente actualizate: src/world/**, tests/world/**, Docs/map-schema.md, paragraful de contract implementat în Docs/04-oras-si-retea-rutiera.md și Docs/Evidence/032-map-schema/**.

Limitări sau follow-up: Geometrie limitată la bounds/muchii nenule/arie shoelace/endpoint IDs/bounding boxes; nu este validator polygon robust, lane adjacency fizic sau detectare a conflictelor omise din authoring. Reachability exclude lane-change edges și poziția longitudinală; calibrare/world generation/routing/editor/meshuri rămân viitoare. Parser static fără lucru per tick/frame sau istoric persistent; nu pretinde benchmark FPS pentru harta maximă.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '032' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T02:39:47.8282263+03:00: Parser/validator implementate, 56 teste world și check/build/Validate-Plan trecute; mutare fizică în Done urmată de RequireDone032.




- 2026-10-05T02:45:21.1868648+03:00: Validare integrată de părinte pentru lotul 008/013/032: npm run check PASS (158 teste), npm run build PASS; Validate-Board -RequireDone 008,013,032 și Validate-Plan PASS. Loguri: Docs/Evidence/013-scene-adapter/integration-check.txt și integration-build.txt. Avertismentul Vite pentru bundle >500 kB rămâne documentat.

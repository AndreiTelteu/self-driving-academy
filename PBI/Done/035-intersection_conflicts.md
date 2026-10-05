---
id: "035"
title: "Mișcări și conflicte în intersecții"
status: "Done"
release: "V1"
module: "Oraș"
performance_checks: ["simulation", "memory"]
depends_on: ["033"]
owner: "Codex PBI035"
started_at: "2026-10-05T03:50:13.9078760+03:00"
completed_at: "2026-10-05T04:01:13.7192037+03:00"
---

# 035 Mișcări și conflicte în intersecții

## Obiectiv

Definește zonele de conflict și relația dintre traiectorii.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 033 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Traversări incompatibile sunt detectabile și identificabile.
- [x] Conflictul este geometric și semantic, fără prioritate dedusă din textură.

## Verificare

Verifică intersecție T, cruce și viraje cu conflicte diferite.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Model CPU pur de mișcări, zone și relații canonice incompatibile; geometrie corridor separată de motivele semantice, witness și IDs stabile, priority=null. Query-uri precomputate bounded, geometrii comune reutilizate.

Verificări executate și rezultat:10teste proprii T/cruce/viraje/capacități/readonly PASS; typecheck/lint global PASS, lint/format035+architecture PASS, production build PASS. Prima verificare globală234teste PASS; ultima format global blocată numai de037WIP, consemnat exact. Baseline înainte/final și cost nou CPU/memory executate; [raport și artefacte](../../Docs/Evidence/035-intersection-conflicts/report.md).

Fișiere și documente actualizate: src/world/intersection-conflicts.ts, intersection-conflict-geometry.ts; tests/world/intersection-conflicts-fixture.ts și intersection-conflicts.test.ts; scripts/benchmark-intersection-conflicts.mjs; Docs/intersection-conflicts.md și Docs/Evidence/035-intersection-conflicts. Publicexports/Docs04/README gestionate de parent.

Limitări sau follow-up: Corridor conservator X/Z și height ranges; false positives posibile pe rampe și la lățimi diferite. Nu este narrow-phase3D/CCD, prioritate, controller, temporal conflict sau visual/gameplay integration. Construirea loading poate fi costisitoare și refuză explicit datele pestebuget; nu se execută pe fiecare tick. Probe Node CPU pre203, fără FPS/GPU sau gate220/224; heap V8 nu este totalRAM.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '035' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.


- 2026-10-05T04:01:13.7192037+03:00: Implementat și verificat cu10teste și probeCPU bounded; mutat fizic în Done.

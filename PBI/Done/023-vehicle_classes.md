---
id: "023"
title: "Configurații pentru două clase de mașini"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["022","009"]
owner: "Codex gpt-6.1-sol medium PBI023"
started_at: "2026-10-05T14:24:39.3923405+03:00"
completed_at: "2026-10-05T16:30:11.8423275+03:00"
performance_checks: ["simulation", "frame", "memory"]
---

# 023 Configurații pentru două clase de mașini

## Obiectiv

Definește masă, putere, frâne, roți, aderență și rază de viraj.

## Context și plan

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 022 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Cele două clase au diferențe măsurabile în aceleași scene.
- [x] Caracteristicile mecanice nu sunt salvate ca preferințe ale jucătorului.

## Verificare

Compară accelerația și frânarea pe aceeași suprafață.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Catalog mecanic imuabil023-mechanics-v1 sedan/compact, addClassCar explicit, powerW/forcecap distincte, geometrie roți/masă/grip/brake/direcție aplicate Rapier real. addCar implicit păstrează021. Mecanica este independentă de ControlPreferences/DrivingProfile.

Verificări executate și rezultat: Baseline înainte de modificarea fizicii și after Node5x70cars,14teste021/022/023 PASS, Architecture/typecheck PASS. Diferențe măsurate pe sol identic: accelerație13,5253/16,4113m/s; brake20m/s24,2350/21,5823m; viraj8m/s traiectorii distincte.20cycles110vehicles880subscriptions cleanup PASS. Chrome headed hardware real WebGPU/WebGL2: fiecare10brațe30/120+20cycles, clasevizibile/calibrare/smokePASS; verifiercurent și --historical PASS. Toate bugetele desktop trec, framep95median7ms, zerooverload/longtasks; nicio regresie confirmată față de022; mixedincrementalmain≈0,1ms. Arhive sursă byte-identice hardware+Node, rapoarte invalide distincte păstrate. Globalcheck final: typecheck/lint/format/architecture și364teste PASS, log global-check.txt. [Dovezi și protocol](../../Docs/Evidence/023-vehicle-classes/README.md), [recovery](../../Docs/Evidence/023-vehicle-classes/progress.md).

Fișiere și documente actualizate: src/vehicles/physics.ts,vehicle-classes.ts,rapier/index.ts; tests/vehicles/vehicle-class-fixture.ts,vehicle-classes.test.ts; tests/browser/vehicle-classes/ și vehicle-classes-baseline.mjs; Docs/vehicle-classes.md; Docs/Evidence/023-vehicle-classes/. Barrel/sharedDocs sunt integrate de coordinator.

Limitări sau follow-up: Calibrare mecanică timpurie raycast, grip empiric, aceeași cutie șasiu simplificată021, fără ABS/aero/cutie de viteze. Probele nu validează gameplay complet, laptop sau gate224; memoria WASM/GPU exactă nu este măsurată. Gate-urile complete de gameplay/laptop rămân pentru task-urile ulterioare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '023' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-05T14:24:39.3943519+03:00: dependențe fizicDone verificate; performance_checks ajustate înainte de implementare; pregătirea baseline-ului precede modificarea algoritmului/fizicii.

- 2026-10-05T16:30:11.8423275+03:00: verificări finale364PASS și verifiers current/historical PASS; mutare fizică Done și RequireDone023 înainte de commit/push dedicat.

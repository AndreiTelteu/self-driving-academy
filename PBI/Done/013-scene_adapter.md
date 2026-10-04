---
id: "013"
title: "Scenă Babylon și maparea entităților"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["011","005"]
owner: "Codex gpt-6.1-sol medium · scene-adapter"
started_at: "2026-10-05T02:22:34.5621521+03:00"
completed_at: "2026-10-05T02:42:59.3796742+03:00"
performance_checks: ["frame","memory"]
---

# 013 Scenă Babylon și maparea entităților

## Obiectiv

Creează scene root, registry entityId–nod vizual și convenții de coordonate.

## Context și plan

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 011 trebuie să existe în Done înainte de începere.
- PBI 005 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare entitate are o mapare stabilă și un lifecycle de resurse.
- [x] Schimbarea mesh-ului păstrează entityId și starea domeniului.

## Verificare

Testează creare, înlocuire și eliminare a unei reprezentări.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: BabylonSceneAdapter, scene root și TransformNode stabil per entityId; create/replace/remove/dispose, pose readonly VehicleState, convenție Y-up/metri/left-handed/+Z forward, pivot de entitate zero, mapare descendenți. Ownership explicit, validare înainte de înlocuire, shared materials/textures păstrate, identitate session/epoch și istoric tick plafonat împotriva stale/reuse. Backend011 și bootstrapul aplicației nu au fost modificate.

Verificări executate și rezultat: npm run check PASS (typecheck, lint, format, architecture, 158 teste Node); npm run build PASS cu avertisment chunk >500 kB. Browser T3 real WebGPU și WebGL2 PASS: pose/quaternion/pivot, domain frozen neschimbat, candidate duplicate/foreign/disposed/attached, resurse exclusive duplicate/reutilizate, shared resources și 20 cicluri/backend cu toate contoarele revenite la baseline, stale session/epoch/tick/reuse, identity capacity și disposal idempotent. Baseline înaintea implementării și aceeași probă finală: CPU p95 median WebGPU 0,30→0,30 ms, WebGL2 0,10→0,20 ms; proba separată 70 cutii + 70 pose updates/cadru: 1,60/1,30 ms. Raport, JSON, output comenzi, MP4 și cadre PNG inspectate în [Evidence013](../../Docs/Evidence/013-scene-adapter/report.md).

Fișiere și documente actualizate: src/rendering/babylon/scene-adapter.ts, src/rendering/scene-contract.ts și exports publice rendering/babylon și rendering; tests/browser/scene-adapter/{index.html,baseline.ts,main.ts}; tests/rendering/scene-contract.test.ts; Docs/scene-adapter.md, Docs/03-babylon-engine.md; Docs/Evidence/013-scene-adapter/** și acest PBI.

Limitări sau follow-up: Probe dev/bootstrap scurte și bugete provizorii pre203, fără FPS/display cadence/GPU time/memorie GPU exactă; contoarele sunt obiecte Babylon. preview_snapshot T3 a eșuat inițial; recordings au reușit și capturile PNG native T3 finale au reușit pe ambele backenduri. Dovezile au fost inspectate. Nu implementează interpolation, selecție UI014, loaders/asset registry017, instancing sau device recovery. Nodurile adoptate sunt împrumutate read-only; resursele partajate rămân caller-owned. Owner-ul 032 a rezolvat erorile typecheck concurente; check final complet trecut. Nicio modificare în modulele celorlalți agenți, nicio delegare, niciun commit/push.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '013' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-05: Asumat de Codex gpt-6.1-sol medium, mutare fizică To Do→In Progress și Validate-Board PASS înainte de cod; performance_checks frame/memory adăugate înainte de implementare; baseline browser capturat înainte de registry/resurse.
- 2026-10-05: Implementare exclusiv013 și probe browser/statice finalizate. Contractul și dovezile documentate; închiderea cere mutarea fizică și validarea finală.



- 2026-10-05: Mutare fizică In Progress→Done confirmată; Validate-Board -RequireDone 013 PASS și Validate-Plan PASS (235 task-uri, 820 link-uri locale). Outputs păstrate în Evidence013/board-validation.json și plan-validation.json.


- 2026-10-05: Revizie finală: redeschis fizic Done→In Progress cu board valid, referințe shared foreign/disposed respinse înainte de adoptare; 20 cicluri reale/backend repetate PASS, 158 teste/check și build PASS, snapshot T3 nativ recuperat pe ambele backenduri.



- 2026-10-05: Revizia finală închisă prin mutarea fizică In Progress→Done; Validate-Board -RequireDone 013 PASS și Validate-Plan PASS după mutare.

- 2026-10-05T02:45:21.1868648+03:00: Validare integrată de părinte pentru lotul 008/013/032: npm run check PASS (158 teste), npm run build PASS; Validate-Board -RequireDone 008,013,032 și Validate-Plan PASS. Loguri: Docs/Evidence/013-scene-adapter/integration-check.txt și integration-build.txt. Avertismentul Vite pentru bundle >500 kB rămâne documentat.

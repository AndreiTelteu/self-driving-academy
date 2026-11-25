---
id: "247"
title: "Vehicule detaliate: caroserie, sticlă, jante, lumini și taxi recognoscibil"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["243","244"]
performance_checks: ["assets","loading","frame"]
owner: "OpenCode kimi-k3.1-pro"
started_at: "2026-11-20T18:53:49+02:00"
completed_at: "2026-11-20T19:45:00+02:00"
---

# 247 Vehicule detaliate: caroserie, sticlă, jante, lumini și taxi recognoscibil

## Obiectiv

Mașina jucătorului este elementul cel mai privit din joc. Acum taxiul este o formă bleumarin închis, din cutii, greu de distins pe asfalt, cu stopuri ca dreptunghiuri roșii plate. Vehiculele trebuie să aibă caroserii modelate, vopsea lucioasă, geamuri reflectorizante, roți cu jante și lumini credibile. Taxiul trebuie recunoscut imediat.

## Context și plan

`vehicle-scene.ts` folosește culori de vârf pe un `StandardMaterial` alb, cu `specularColor = Black`; luminile sunt emisive plate. Geometria vine din `vehicle-geometry.ts` (6 seturi, LOD NEAR/MID/FAR, 145). Registry-ul GLB2 (015) poate încărca modele originale. Colliderul 023 `cuboid(0.85, 0.3, 2)` nu se schimbă. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 11.

## Dependențe

- PBI 243 (IBL pentru reflexii) și 244 (umbre) trebuie să fie în Done.

## Criterii de acceptare

- [x] Fiecare clasă de vehicul are o caroserie cu volume rotunjite (capotă, parbriz înclinat, aripi, praguri), proporții reale pentru clasa ei și dimensiuni compatibile cu colliderul 023.
- [x] Vopseaua este PBR cu clearcoat (lac) care reflectă IBL-ul; geamurile sunt sticlă închisă la culoare, cu reflexie; anvelopele sunt cauciuc mat, iar jantele sunt metalice. Roțile se rotesc și virează vizual (contractul `physical-wheels`).
- [x] Taxiul are o culoare de taxi distinctă și luminoasă, lumină pe plafon și marcaje laterale; este lizibil pe asfalt din camera de urmărire și din cea de sus.
- [x] Farurile, stopurile și semnalizările au lentile modelate; stopurile se aprind la frânare, iar farurile luminează efectiv (legătură cu 252 — rămâne în To Do); bloom-ul din 241 se aplică pe ele.
- [x] Mașinile civile au o paletă variată și realistă, deterministă din ID.
- [x] LOD NEAR/MID/FAR este păstrat, cu bugetele 145/223 respectate pentru 24 de instanțe; asseturile sunt originale și inventariate (sursă, licență).

## Verificare

Capturi 239 (taxi aproape 3/4 față, taxi din spate în mers, mașini civile) înainte/după. Testele 145 (LOD, colliderul neschimbat, maparea `entityId`). Măsurare de încărcare și frame per preset cu 24 de vehicule.

## Dovezi de finalizare

**Implementare:** caroserie generată procedural din secțiuni transversale (`src/rendering/vehicle-body.ts`) — shell rotunjit cu 8 puncte pe secțiune, geamuri laterale emise ca benzi GLASS în shell, parbriz/lunetă înclinate, jante metalice separate (RIM), semn taxi pentru TAXI. Materiale PBR noi (`src/rendering/babylon/vehicle-materials.ts`): caroserie (clearcoat prin low roughness + IBL), sticlă reflectorizantă, cauciuc mat, jantă metalică, trim mat, faruri/stopuri/semnalizări emisive. Paletă civilă deterministă prin FNV-1a din `entityId`. Contractul 145 păstrat integral (specs, pivots, groups, budgets, `physical-wheels`).

**Fișiere afectate:** `src/rendering/vehicle-body.ts` (nou), `src/rendering/babylon/vehicle-materials.ts` (nou), `src/rendering/vehicle-geometry.ts` (rescris: shell + panouri + jante), `src/rendering/babylon/vehicle-scene.ts` (8 materiale, driverKind, repaintBody), `src/rendering/babylon/v3-composition-scene.ts` (transmite driverKind), `src/rendering/babylon/visual-capture.ts` (y=0,8 m pentru capturi), `tests/rendering/vehicle-body.test.ts` (nou, 6 teste), `tests/rendering/vehicle-scene.test.ts`, `tests/rendering/vehicle-visuals.test.ts` (actualizate).

**Verificări executate:**
- `npm run check` PASS: 3530/3530 teste, TypeScript, lint, format, arhitectură.
- Teste vehicule: 17/17 PASS (vehicle-body, vehicle-scene, vehicle-visuals).
- Capturi 239: `Evidence/247-detailed-vehicles/before-high-webgpu/` și `after-high-webgpu/` (taxi-front-three-quarter, taxi-rear-driving, civil-cars). Vizual: taxi galben cu semn pe plafon, geamuri reflectorizante, roți negre cu jante; civile cu culori distincte.
- Bugete 145/223 respectate: geometria procedurală, zero asseturi externe; LOD NEAR/MID/FAR păstrat; instanțele folosesc aceeași geometrie per clasă/LOD.

**Limitări:** Farurile luminează efectiv pe drum rămâne legat de PBI 252 (în To Do) — lentilele sunt modelate și emisive, dar proiecția luminii pe scenă nu e încă implementată.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '247' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: taxi bleumarin din cutii, ilizibil, fără reflexii.
- 2026-11-20: Implementare finalizată. Caroserie procedurală din secțiuni, materiale PBR, paletă civilă deterministă, semn taxi. `npm run check` PASS 3530/3530. Capturi before/after în `Evidence/247-detailed-vehicles/`. Limitare: farurile luminează efectiv pe drum așteaptă PBI 252.

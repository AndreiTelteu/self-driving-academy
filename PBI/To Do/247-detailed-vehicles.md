---
id: "247"
title: "Vehicule detaliate: caroserie, sticlă, jante, lumini și taxi recognoscibil"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["243","244"]
performance_checks: ["assets","loading","frame"]
owner: null
started_at: null
completed_at: null
---

# 247 Vehicule detaliate: caroserie, sticlă, jante, lumini și taxi recognoscibil

## Obiectiv

Mașina jucătorului este elementul cel mai privit din joc. Acum taxiul este o formă bleumarin închis, din cutii, greu de distins pe asfalt, cu stopuri ca dreptunghiuri roșii plate. Vehiculele trebuie să aibă caroserii modelate, vopsea lucioasă, geamuri reflectorizante, roți cu jante și lumini credibile. Taxiul trebuie recunoscut imediat.

## Context și plan

`vehicle-scene.ts` folosește culori de vârf pe un `StandardMaterial` alb, cu `specularColor = Black`; luminile sunt emisive plate. Geometria vine din `vehicle-geometry.ts` (6 seturi, LOD NEAR/MID/FAR, 145). Registry-ul GLB2 (015) poate încărca modele originale. Colliderul 023 `cuboid(0.85, 0.3, 2)` nu se schimbă. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 11.

## Dependențe

- PBI 243 (IBL pentru reflexii) și 244 (umbre) trebuie să fie în Done.

## Criterii de acceptare

- [ ] Fiecare clasă de vehicul are o caroserie cu volume rotunjite (capotă, parbriz înclinat, aripi, praguri), proporții reale pentru clasa ei și dimensiuni compatibile cu colliderul 023.
- [ ] Vopseaua este PBR cu clearcoat (lac) care reflectă IBL-ul; geamurile sunt sticlă închisă la culoare, cu reflexie; anvelopele sunt cauciuc mat, iar jantele sunt metalice. Roțile se rotesc și virează vizual (contractul `physical-wheels`).
- [ ] Taxiul are o culoare de taxi distinctă și luminoasă, lumină pe plafon și marcaje laterale; este lizibil pe asfalt din camera de urmărire și din cea de sus.
- [ ] Farurile, stopurile și semnalizările au lentile modelate; stopurile se aprind la frânare, iar farurile luminează efectiv (legătură cu 252); bloom-ul din 241 se aplică pe ele.
- [ ] Mașinile civile au o paletă variată și realistă, deterministă din ID.
- [ ] LOD NEAR/MID/FAR este păstrat, cu bugetele 145/223 respectate pentru 24 de instanțe; asseturile sunt originale și inventariate (sursă, licență).

## Verificare

Capturi 239 (taxi aproape 3/4 față, taxi din spate în mers, mașini civile) înainte/după. Testele 145 (LOD, colliderul neschimbat, maparea `entityId`). Măsurare de încărcare și frame per preset cu 24 de vehicule.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '247' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: taxi bleumarin din cutii, ilizibil, fără reflexii.

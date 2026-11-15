---
id: "246"
title: "Clădiri cu fațade, ferestre, acoperișuri și variație"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["245"]
performance_checks: ["assets","frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 246 Clădiri cu fațade, ferestre, acoperișuri și variație

## Obiectiv

Clădirile sunt acum cutii maro, toate cu aceeași culoare, fără ferestre sau uși. Orașul trebuie să pară locuit: fațade cu etaje, ferestre, intrări, vitrine la parter, acoperișuri cu detalii și variație între clădiri.

## Context și plan

Geometria clădirilor provine din layoutul 042 și este extrudată cu un singur material `building` `[0.55, 0.47, 0.4]`. Blocatoarele de coliziune din 192/238 folosesc aceleași footprinturi. Footprintul, înălțimea și colliderele nu se schimbă. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 10.

## Dependențe

- PBI 245 trebuie să fie în Done (pipeline-ul de materiale și texturi PBR).

## Criterii de acceptare

- [ ] Fiecare clădire are fațade cu ritm de etaje și ferestre (shader de fațadă procedural sau atlas de module), parter distinct (vitrine sau intrări după zona din 042: comercial, rezidențial, servicii), cornișă sau parapet și acoperiș cu detalii (unități AC, ventilație, apă) pe MEDIUM și HIGH.
- [ ] Sticla ferestrelor reflectă IBL-ul și are interioare false (parallax interior mapping sau cubemap) pe HIGH; pe LOW, ferestrele sunt doar albedo și roughness.
- [ ] Variația este deterministă din seed-ul hărții: cel puțin 6 stiluri de fațadă și o paletă de materiale (cărămidă, tencuială, beton, sticlă și metal), fără două clădiri vecine identice.
- [ ] Footprintul și înălțimea rămân exact cele din 042; testele 192/238 de coliziune cu clădirile trec neschimbate.
- [ ] Clădirile au LOD (sau impostori la distanță) și batching per celulă, astfel încât draw calls și vârfurile să rămână în bugetele 223.

## Verificare

Capturi 239 (fațade aproape, oraș de sus, stradă) înainte/după. Măsurare de frame, draw calls și memorie per preset. Testele 192 și 238.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '246' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: clădiri ca niște cutii maro uniforme, fără ferestre.

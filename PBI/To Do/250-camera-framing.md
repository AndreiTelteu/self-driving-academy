---
id: "250"
title: "Încadrarea camerei: FOV, înălțime, orbitare verticală și netezire"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["240"]
performance_checks: ["frame"]
owner: null
started_at: null
completed_at: null
---

# 250 Încadrarea camerei: FOV, înălțime, orbitare verticală și netezire

## Obiectiv

Camera actuală deformează scena: unghi larg (trotuarul și copacul din prim-plan sunt uriașe), cameră aproape de sol, iar taxiul ocupă jumătate din ecran când jucătorul conduce. Orbitarea verticală nu răspunde. Încadrarea trebuie să arate ca într-un joc de condus sau de explorare modern.

## Context și plan

`v3-composition-scene.ts` pornește cu `camera.fov = 1.4` (~80°) și aplică `cameraFrame.fovRadians` din 194/`vehicle-camera.ts`, derivat din `fovDegrees` (preferințele 009 și sliderele 229). Agentul din audit a raportat că tragerea verticală a mouse-ului nu schimbă camera. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 14.

## Dependențe

- PBI 240 trebuie să fie în Done (raport de aspect real).

## Criterii de acceptare

- [ ] FOV-ul vertical implicit este între 55° și 65° pentru camera de urmărire a mașinii și pentru personaj; sliderul 229 rămâne în limitele lui. FOV-ul crește ușor cu viteza (maximum +8°).
- [ ] Camera de urmărire a mașinii stă deasupra și în spatele mașinii, astfel încât mașina să ocupe 25–35% din lățimea ecranului, cu drumul din față vizibil; camera personajului este la umăr, cu personajul în treimea inferioară.
- [ ] Orbitarea verticală cu mouse-ul funcționează, cu limite (fără trecere prin sol), iar camera revine lin în spate după ce jucătorul nu o mai controlează.
- [ ] Mișcarea camerei este netezită (spring-damper), fără sacadare la frânare bruscă sau viraj; evitarea obstacolelor 194 rămâne funcțională.
- [ ] Opțional pe HIGH: motion blur ușor pe viteză mare, cu dezactivare din setări.

## Verificare

Capturi 239 (taxi din spate în mers, personaj aproape, stradă) înainte/după. Testele 194 și ale camerei vehiculului. Playtest în browser cu taste reale și mouse: orbitare orizontală și verticală, viraje, frânare.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '250' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: perspectivă deformată, cameră joasă, orbitare verticală nefuncțională.

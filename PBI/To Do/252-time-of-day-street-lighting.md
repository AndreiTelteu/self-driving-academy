---
id: "252"
title: "Ora din zi, iluminat stradal și faruri"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["246","247","249"]
performance_checks: ["frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 252 Ora din zi, iluminat stradal și faruri

## Obiectiv

Adaugă atmosferă prin ora din zi: dimineață, amiază, apus și noapte, cu stâlpi de iluminat care se aprind, ferestre luminate și faruri care chiar luminează drumul.

## Context și plan

Starea de atmosferă din 243 (cer, ceață, IBL și soare) este sursa unică de parametri. Stâlpii (249), ferestrele (246) și farurile (247) au deja geometrie și materiale. Babylon limitează luminile per material (`materialLights: 2` în `QUALITY_PRESETS`), deci iluminatul stradal folosește lumini clustered sau o soluție echivalentă, nu sute de lumini clasice. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md).

## Dependențe

- PBI 246, 247 și 249 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Ora din zi este o setare (fixă sau ciclu lent) care interpolează lin soarele, cerul, ceața, IBL-ul și expunerea; schimbarea nu afectează simularea, determinismul sau KPI/XP.
- [ ] Noaptea, stâlpii luminează trotuarul și carosabilul (clustered lights sau decal-uri de lumină), ferestrele clădirilor sunt luminate parțial (deterministic), iar farurile vehiculelor proiectează lumină pe drum; bloom-ul 241 se aplică pe surse.
- [ ] Pe LOW, iluminarea de noapte folosește numai emisie și decal-uri, fără lumini dinamice, în bugetul de frame.
- [ ] Semafoarele și marcajele rămân lizibile la orice oră (verificat pe cadrele 239 la noapte).

## Verificare

Capturi 239 la patru ore din zi pe HIGH și LOW. Măsurare de frame și memorie noaptea, cu 24 de vehicule, per preset.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '252' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual, pentru atmosferă și lumină dinamică.

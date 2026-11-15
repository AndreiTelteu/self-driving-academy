---
id: "248"
title: "Personaj uman credibil: proporții, materiale și animație"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["243","244"]
performance_checks: ["assets","frame"]
owner: null
started_at: null
completed_at: null
---

# 248 Personaj uman credibil: proporții, materiale și animație

## Obiectiv

Personajul jucătorului arată ca o figurină din cuburi. Fă din el un om credibil, cu proporții reale, forme netede, haine și piele cu materiale PBR și animații de mers și alergare care nu par rigide.

## Context și plan

`character-scene.ts` creează personajul procedural din `createCharacterAsset()` (17 mesh-uri, 4 draw calls), cu `StandardMaterial` per grup. Animația vine din clipurile 191/192 (`idle`, `walk`, `run`), iar contractul spune că animația nu scrie poziția. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 12.

## Dependențe

- PBI 243 și 244 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Personajul este un mesh skinned original (GLB prin registry-ul 015 sau generat procedural), cu proporții umane reale (aproximativ 7,5 capete), mâini, picioare și cap modelate, fără muchii de cutie vizibile din camera de urmărire.
- [ ] Hainele (tricou sau geacă, pantaloni, încălțăminte) și pielea folosesc materiale PBR distincte, cu normal maps sau detalii; personajul aruncă umbră (244).
- [ ] Clipurile `idle`, `walk` și `run` au blend între ele (crossfade sau blend tree după viteză), fără pocnituri la tranziție și fără alunecarea picioarelor peste 5 cm la viteza nominală.
- [ ] Contractele 191–197 rămân valabile: animația nu scrie poziția, iar intrarea și ieșirea din mașină funcționează. Personajul nu rămâne vizibil lângă mașină după intrare (defect observat în 238).
- [ ] LOD NEAR/MID/FAR este păstrat, în bugetele 223.

## Verificare

Capturi 239 (personaj aproape, personaj în mers) înainte/după și un clip scurt de mers–alergare–oprire. Testele 191–197. Măsurare de frame per preset.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '248' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: personaj din cuburi, animație rigidă.

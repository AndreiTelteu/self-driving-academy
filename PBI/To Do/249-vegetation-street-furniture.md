---
id: "249"
title: "Vegetație și mobilier stradal realiste"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["245"]
performance_checks: ["assets","frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 249 Vegetație și mobilier stradal realiste

## Obiectiv

Copacii sunt acum conuri verzi pe bețe, iar decorul (bănci, stâlpi, hidranți, pubele, indicatoare, adăposturi) este făcut din cutii și cilindri cu 8 segmente, toate într-o singură culoare plată. Înlocuiește-le cu vegetație și mobilier stradal credibile, care se mișcă în vânt și au materiale reale.

## Context și plan

Decorul 146 (`city-decor.ts`, `city-decor-scene.ts`) generează procedural 1.585 de itemuri în 36 de batchuri per celulă, cu un singur material și culori de vârf. Plasarea și orientarea 238 (`facingYaw`) și razele de coliziune 238 nu se schimbă. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 13.

## Dependențe

- PBI 245 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Copacii au trunchi cu ramificare și coroană din clustere de frunze (alpha-tested sau mesh), cu cel puțin 3 specii potrivite unui oraș american și variație deterministă de mărime, rotație și nuanță.
- [ ] Frunzele se mișcă în vânt printr-un vertex shader (amplitudine mică, fază per copac), fără cost CPU per copac; pe LOW, mișcarea este dezactivată.
- [ ] Copacii au impostori (billboard) la distanță, cu tranziție fără popping vizibil.
- [ ] Mobilierul are forme reale (stâlp de iluminat cu braț și corp de lampă, bancă cu șipci și picioare metalice, hidrant cu capace, adăpost cu sticlă și acoperiș) și materiale PBR distincte: metal vopsit, lemn, beton, sticlă.
- [ ] Iarba de lângă trotuar are smocuri sau variație la sol pe HIGH (instanțiate pe GPU), dezactivate pe LOW.
- [ ] Plasarea, orientarea și razele de coliziune 238 sunt identice; testele 146 și 238 trec. Draw calls, vârfurile și memoria rămân în bugetele 223.

## Verificare

Capturi 239 (decor, stradă, oraș de sus) înainte/după. Testele 146 și 238. Măsurare de frame și memorie per preset.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '249' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: copaci din conuri, decor din cutii, o singură culoare plată.

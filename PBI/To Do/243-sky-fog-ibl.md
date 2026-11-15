---
id: "243"
title: "Cer, ceață atmosferică și iluminare din mediu (IBL)"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["241","242"]
performance_checks: ["frame","assets","loading"]
owner: null
started_at: null
completed_at: null
---

# 243 Cer, ceață atmosferică și iluminare din mediu (IBL)

## Obiectiv

Înlocuiește cerul uniform și orizontul tăiat cu o atmosferă credibilă: cer cu gradient și soare, ceață de distanță și iluminare din mediu care să dea reflexii și lumină ambientală corectă materialelor PBR din 245–249.

## Context și plan

`daylight.ts` setează `scene.clearColor = (0.55, 0.74, 0.88)` și o lumină hemisferică fixă. Nu există skybox, ceață sau textură de mediu. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 7.

## Dependențe

- PBI 241 (pipeline HDR) și 242 (teren până la orizont) trebuie să fie în Done.

## Criterii de acceptare

- [ ] Cerul este randat de un shader procedural sau de un skybox HDR original: gradient zenit–orizont, disc solar aliniat cu direcția luminii `daylight-sun` și nori opționali pe HIGH.
- [ ] Ceața exponențială (sau perspectiva atmosferică în shader) are culoarea orizontului cerului; obiectele de la distanță se topesc în cer, fără margine dură, iar lizibilitatea la sub 80 m rămâne neschimbată.
- [ ] Scena are `environmentTexture` (IBL prefiltrat, generat din cerul procedural sau un `.env` original), folosit pentru lumina ambientală și reflexiile speculare; lumina hemisferică este eliminată sau redusă, ca să nu dubleze ambientul.
- [ ] Textura de mediu respectă bugetele 223 per preset (rezoluție mai mică pe LOW) și este inventariată în manifestul de asseturi 150 cu sursa și licența.
- [ ] Cerul, ceața și IBL-ul primesc parametri dintr-o singură sursă (o „stare de atmosferă”), pregătind ora din zi din 252.

## Verificare

Capturi 239 (orizont, oraș de sus, stradă) înainte/după. `npm run assets:manifest -- --check` actualizat. Măsurare de încărcare și frame per preset.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '243' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: cer de o singură culoare, orizont tăiat, fără adâncime atmosferică.

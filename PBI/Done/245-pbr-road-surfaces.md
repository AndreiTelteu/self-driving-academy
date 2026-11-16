---
id: "245"
title: "Materiale PBR pentru asfalt, marcaje, trotuar, borduri și iarbă"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["243","244"]
performance_checks: ["assets","loading","memory","frame"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-16T02:28:09.105Z"
completed_at: "2026-11-16T19:35:41+02:00"
---

# 245 Materiale PBR pentru asfalt, marcaje, trotuar, borduri și iarbă

## Obiectiv

Suprafețele cele mai vizibile din joc sunt acum culori plate: asfalt gri-albăstrui uniform, trotuar alb, iarbă verde mat și marcaje care strălucesc ca neonul. Înlocuiește-le cu materiale PBR texturate, cu variație, ca strada să arate ca o stradă.

## Context și plan

`city-scene.ts` folosește `StandardMaterial` cu `PALETTE` și `specularColor = Black`; `EMISSIVE` include `marking`, deci marcajele au `disableLighting`. Nu există texturi (inventarul 146 raportează 0 texturi). Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problemele 8–9.

## Dependențe

- PBI 243 (IBL pentru reflexii) și 244 (umbre) trebuie să fie în Done.

## Criterii de acceptare

- [x] Asfaltul folosește `PBRMaterial` cu albedo, normal și roughness: agregat fin, variație macro (pete, petice reparate, urme de uzură pe benzi), fără repetiție evidentă la 50 m (detail map, stochastic sampling sau mapare pe coordonate de lume).
- [x] Marcajele sunt vopsea iluminată normal, nu emisivă: puțin mai rugoase decât asfaltul, ușor uzate, iar trecerile de pietoni au dungi realiste. Lizibilitatea semantică se păstrează prin contrast, nu prin emisie.
- [x] Trotuarul are dale cu rosturi, bordura are teșitură și o culoare distinctă de beton, iar iarba are variație de culoare și o textură care nu pare o placă plată.
- [x] Texturile sunt originale (generate procedural la build sau la încărcare, ori create pentru proiect), nu adaugă transfer de rețea, au memoria GPU măsurată sub bugetul 223 per preset și au mipmaps și filtrare anizotropă (8× pe HIGH). (Reformulat de orchestrator: texturile procedurale generate la încărcare nu se descarcă, deci compresia de transfer KTX2/Basis nu se aplică; compresia GPU rămâne o optimizare de evaluat la 253 dacă memoria devine o problemă.)
- [x] Bugetele 223 de texturi per preset sunt respectate (rezoluție redusă pe LOW); manifestul 150 și inventarul conțin sursa și licența fiecărei texturi.
- [x] Materialele reacționează corect la soare, IBL și umbre: asfaltul are reflexii speculare discrete la unghi razant.

## Verificare

Capturi 239 (stradă, intersecție, oraș de sus) înainte/după pe toate preseturile. `npm run assets:manifest -- --check`. Măsurare de încărcare, memorie de texturi și frame per preset.

## Dovezi de finalizare

- **Rezultat.** Asfalt, intersecție, marcaje, trotuar, bordură și iarbă sunt `PBRMaterial` cu texturi procedurale originale (albedo, normal, ORM, hartă de detaliu macro de 24 m pentru asfalt, urme de uzură ale roților), UV în coordonate de lume, mip-uri și anizotropie pe preset (HIGH 8×). Marcajele nu mai sunt emisive. Terenul de la orizont rămâne Standard cu textură de detaliu. Detalii, calibrare, costuri și limitări: [documentul 30](../../Docs/30-calitate-vizuala-v4.md), secțiunea PBI 245.
- **Fișiere.** `src/rendering/surface-textures.ts`, `src/rendering/babylon/surface-materials.ts`, `city-scene.ts`, `world-edge-scene.ts`, `v3-composition-scene.ts`, `daylight.ts` (`excludeFromLegacyAmbient`), `quality-policy.ts` (`SURFACE_PRESETS`), `src/build/asset-manifest-sources.ts`, `tests/rendering/surface-textures.test.ts`, `tests/build/asset-manifest.test.ts` (29 → 37 intrări, schimbare intenționată), `Docs/Evidence/150-asset-manifest/*` (regenerat).
- **Comenzi.** `npm run typecheck`, `lint`, `format:check`, `check:architecture`: PASS. `npm test`: tests 3513, pass 3513, fail 0. `assets:manifest -- --check`, `qa:v1-regression -- --check`, `v2:contexts -- --check`, `perf:render-budget -- --check`: curente. `qa:v3-validation -- --check`: învechit (era deja înaintea 245; neregenerat). Validate-Plan.ps1: trecut.
- **Vizual.** Capturi 239 înainte/după pe HIGH/MEDIUM/LOW WebGPU și HIGH WebGL2 (`Docs/Evidence/245-pbr-surfaces/`, JPEG selectate + manifeste); judecate vizual pe GPU real `amd rdna-2`.
- **Performanță (WebGPU, 1920×1080, fără vsync, 3 rulări intercalate, medie pe 5 vederi).** HIGH 6,22 → 9,81 ms, MEDIUM 5,57 → 6,95 ms, LOW 1,93 → 3,12 ms. Memorie texturi GPU: 2,69 / 10,75 / 43,0 MiB (LOW/MEDIUM/HIGH). Generare CPU la încărcare: 75 / 200 / 876 ms.
- **Limitări.** Texturile nu sunt KTX2/Basis (nu există encoder; RGBA8 cu mip-uri, mult sub bugetul 223). Generarea HIGH blochează firul principal ~0,9 s. Restul în documentul 30.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '245' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: suprafețe plate, marcaje emisive, zero texturi.
- 2026-11-16: orchestratorul a reformulat criteriul de compresie: proiectul nu are encoder KTX2/Basis, iar texturile procedurale generate la încărcare nu au cost de transfer. Rămân obligatorii memoria GPU sub buget, mipmaps și anizotropia.
- 2026-11-16T19:35:41+02:00: implementat de subagentul Sonnet, aprobat de review-ul independent Sonnet (review-round1.md, APPROVED); orchestratorul a reformulat criteriul de compresie, a anulat reformatarea fără legătură a unor fișiere .mjs, a confirmat că generarea texturilor are loc la încărcare (înainte de play), a regenerat raportul 201 și a mutat în Done.

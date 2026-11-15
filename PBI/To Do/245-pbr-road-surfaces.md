---
id: "245"
title: "Materiale PBR pentru asfalt, marcaje, trotuar, borduri și iarbă"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["243","244"]
performance_checks: ["assets","loading","memory","frame"]
owner: null
started_at: null
completed_at: null
---

# 245 Materiale PBR pentru asfalt, marcaje, trotuar, borduri și iarbă

## Obiectiv

Suprafețele cele mai vizibile din joc sunt acum culori plate: asfalt gri-albăstrui uniform, trotuar alb, iarbă verde mat și marcaje care strălucesc ca neonul. Înlocuiește-le cu materiale PBR texturate, cu variație, ca strada să arate ca o stradă.

## Context și plan

`city-scene.ts` folosește `StandardMaterial` cu `PALETTE` și `specularColor = Black`; `EMISSIVE` include `marking`, deci marcajele au `disableLighting`. Nu există texturi (inventarul 146 raportează 0 texturi). Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problemele 8–9.

## Dependențe

- PBI 243 (IBL pentru reflexii) și 244 (umbre) trebuie să fie în Done.

## Criterii de acceptare

- [ ] Asfaltul folosește `PBRMaterial` cu albedo, normal și roughness: agregat fin, variație macro (pete, petice reparate, urme de uzură pe benzi), fără repetiție evidentă la 50 m (detail map, stochastic sampling sau mapare pe coordonate de lume).
- [ ] Marcajele sunt vopsea iluminată normal, nu emisivă: puțin mai rugoase decât asfaltul, ușor uzate, iar trecerile de pietoni au dungi realiste. Lizibilitatea semantică se păstrează prin contrast, nu prin emisie.
- [ ] Trotuarul are dale cu rosturi, bordura are teșitură și o culoare distinctă de beton, iar iarba are variație de culoare și o textură care nu pare o placă plată.
- [ ] Texturile sunt originale (generate procedural la build sau la încărcare, ori create pentru proiect), comprimate (KTX2/Basis unde este suportat, cu fallback) și au mipmaps și filtrare anizotropă (8× pe HIGH).
- [ ] Bugetele 223 de texturi per preset sunt respectate (rezoluție redusă pe LOW); manifestul 150 și inventarul conțin sursa și licența fiecărei texturi.
- [ ] Materialele reacționează corect la soare, IBL și umbre: asfaltul are reflexii speculare discrete la unghi razant.

## Verificare

Capturi 239 (stradă, intersecție, oraș de sus) înainte/după pe toate preseturile. `npm run assets:manifest -- --check`. Măsurare de încărcare, memorie de texturi și frame per preset.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '245' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: suprafețe plate, marcaje emisive, zero texturi.

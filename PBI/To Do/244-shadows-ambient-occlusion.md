---
id: "244"
title: "Umbre reale pentru toată scena și ambient occlusion"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["241"]
performance_checks: ["frame","memory"]
owner: null
started_at: null
completed_at: null
---

# 244 Umbre reale pentru toată scena și ambient occlusion

## Obiectiv

Jocul nu are acum nicio umbră. Obiectele par lipite peste teren, iar scena nu are volum. Adaugă umbre de la soare pentru tot ce stă în lume și ambient occlusion pentru contactul dintre obiecte și sol.

## Context și plan

`daylight.ts` creează un `ShadowGenerator` (1024/2048 pe MEDIUM/HIGH), dar `addShadowCaster` nu este apelat nicăieri în compunerea V3, deci shadow map-ul este gol. Contractul 157 (`SHADOW_MAP_CONTENT`) exclude explicit clădirile și decorul 146. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 4. Schimbarea contractului 157 este intenționată și se documentează.

## Dependențe

- PBI 241 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Compunerea V3 înregistrează ca casters: vehiculul urmărit (`essential`), traficul și personajul (`standard`), clădirile și decorul (`optional` sau o hartă statică separată). Terenul, drumul și trotuarul primesc umbre.
- [ ] Pe HIGH, umbrele folosesc Cascaded Shadow Maps (3–4 cascade) cu PCF sau PCSS soft; pe MEDIUM, o hartă cu PCF; pe LOW, umbre de contact ieftine (blob) sub vehicule și personaj, fără shadow map.
- [ ] Nu există shadow acne, peter-panning vizibil sau tremur al umbrelor la mișcarea camerei (stabilizare texel-snapped).
- [ ] Umbrele clădirilor statice sunt cache-uite (refresh numai la schimbarea soarelui), ca să nu fie re-randate în fiecare cadru.
- [ ] Ambient occlusion în spațiu-ecran (SSAO2 sau GTAO) pe HIGH, mai slab pe MEDIUM, oprit pe LOW; colțurile clădire–trotuar, roțile și baza decorului primesc ocluzie.
- [ ] `SHADOW_MAP_CONTENT`, contractul 157 și documentația sunt actualizate cu noua listă, iar testele 157 sunt adaptate fără slăbirea priorității `essential`.

## Verificare

Capturi 239 pe toate preseturile (taxi, personaj, stradă, fațade). Măsurare frame și memorie GPU per preset; raportează separat costul umbrelor și al AO-ului. Test de stabilitate: camera se rotește 360°, iar marginile umbrelor nu tremură.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '244' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: zero umbre, `addShadowCaster` neapelat în compunere.

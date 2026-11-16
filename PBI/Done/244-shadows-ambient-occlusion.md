---
id: "244"
title: "Umbre reale pentru toată scena și ambient occlusion"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["241"]
performance_checks: ["frame","memory"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-16T00:35:41.003Z"
completed_at: "2026-11-16T04:27:37+02:00"
---

# 244 Umbre reale pentru toată scena și ambient occlusion

## Obiectiv

Jocul nu are acum nicio umbră. Obiectele par lipite peste teren, iar scena nu are volum. Adaugă umbre de la soare pentru tot ce stă în lume și ambient occlusion pentru contactul dintre obiecte și sol.

## Context și plan

`daylight.ts` creează un `ShadowGenerator` (1024/2048 pe MEDIUM/HIGH), dar `addShadowCaster` nu este apelat nicăieri în compunerea V3, deci shadow map-ul este gol. Contractul 157 (`SHADOW_MAP_CONTENT`) exclude explicit clădirile și decorul 146. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 4. Schimbarea contractului 157 este intenționată și se documentează.

## Dependențe

- PBI 241 trebuie să fie în Done.

## Criterii de acceptare

- [x] Compunerea V3 înregistrează ca casters: vehiculul urmărit (`essential`), traficul și personajul (`standard`), clădirile și decorul (`optional` sau o hartă statică separată). Terenul, drumul și trotuarul primesc umbre.
- [x] Pe HIGH, umbrele folosesc Cascaded Shadow Maps (3–4 cascade) cu PCF sau PCSS soft; pe MEDIUM, o hartă cu PCF; pe LOW, umbre de contact ieftine (blob) sub vehicule și personaj, fără shadow map.
- [x] Nu există shadow acne, peter-panning vizibil sau tremur al umbrelor la mișcarea camerei (stabilizare texel-snapped).
- [x] Harta de umbre nu se re-randează cât timp soarele, camera și casterii dinamici sunt neschimbați (`RENDER_ONCE` cu invalidare explicită); costul re-randării în mișcare este măsurat și raportat per preset. (Reformulat de orchestrator: o hartă statică separată nu este posibilă cu un singur generator eșantionat per lumină în Babylon 9.29.)
- [x] Ambient occlusion în spațiu-ecran (SSAO2 sau GTAO) pe HIGH, mai slab pe MEDIUM, oprit pe LOW; colțurile clădire–trotuar, roțile și baza decorului primesc ocluzie.
- [x] `SHADOW_MAP_CONTENT`, contractul 157 și documentația sunt actualizate cu noua listă, iar testele 157 sunt adaptate fără slăbirea priorității `essential`.

## Verificare

Capturi 239 pe toate preseturile (taxi, personaj, stradă, fațade). Măsurare frame și memorie GPU per preset; raportează separat costul umbrelor și al AO-ului. Test de stabilitate: camera se rotește 360°, iar marginile umbrelor nu tremură.

## Dovezi de finalizare

**Rezultat.** Umbre de la soare pe toată scena și AO în spațiu-ecran, pe preset, cu Babylon 9.29, pe WebGPU și WebGL2. Detalii, decizii, capcane găsite și limitări: [documentul 30, secțiunea 244](../../Docs/30-calitate-vizuala-v4.md). Fișiere: `src/rendering/shadow-math.ts` (nou), `src/rendering/babylon/ambient-occlusion.ts` (nou), `src/rendering/babylon/contact-shadows.ts` (nou), `src/rendering/babylon/daylight.ts`, `v3-composition-scene.ts`, `post-processing.ts`, `city-scene.ts`, `city-decor-scene.ts`, `vehicle-scene.ts`, `character-scene.ts`, `src/rendering/quality-policy.ts`, `src/main.ts` (hook DEV `daylight()`), `tests/rendering/shadows.test.ts` (nou), `Docs/30-calitate-vizuala-v4.md`, `Docs/lighting-quality.md`, `Docs/city-visual.md`.

**Verificări rulate.** `npm run typecheck`, `lint`, `format:check`, `check:architecture` trec; `npm test`: 3509 teste, 3509 pass, 0 fail (11 teste noi 244; testele 157 din `lighting.test.ts` neschimbate și verzi); `qa:v1-regression --check`, `v2:contexts --check`, `assets:manifest --check`, `perf:render-budget --check` și `Validate-Plan.ps1` trec; `qa:v3-validation --check`: toate comenzile PASS, dar raportul 201 este „învechit” (era deja învechit la 242, nu a fost regenerat aici).

**Browser (Chromium, GPU real `amd rdna-2`, WebGPU; WebGL2 pe ANGLE/D3D11).** Capturi 239 pe HIGH/MEDIUM/LOW WebGPU și HIGH WebGL2, înainte și după, 0 erori în consolă (`Docs/Evidence/244-shadows-ao/*/manifest.json`, JPEG-uri selectate, `compare-high-webgpu.json`).
- Rotație 360° și translație (HIGH, 4 cascade, și MEDIUM): deriva sub-texel a unui colț fix al lumii = 0 (`rotation-stability.json`; înainte de corecții: până la 0,5 texel).
- 60 de comutări live de preset (20 de cicluri): resurse identice (`preset-switch-resources.json`); a fost găsit și corectat un leak de +42 de texturi interne (Babylon `GeometryBufferRenderer`).
- Cost separat (`cost-summary.txt`, `perf-runs/`): vezi documentul 30. Pe scurt (WebGPU, 5 vederi): total HIGH 3,69 → 6,81 ms, MEDIUM 3,09 → 5,71 ms, LOW 1,87 → 2,14 ms; umbre ≈ 0 ms cu camera statică, +1,3 ms (HIGH) / +0,7 ms (MEDIUM) cu camera în mișcare; AO ≈ +2 ms HIGH și MEDIUM; blob LOW ≈ +0,27 ms. Memorie estimată: umbre HIGH ≈ 96 MiB, MEDIUM ≈ 6 MiB; AO ≈ 16 MiB.

**Contract 157 schimbat intenționat:** `SHADOW_MAP_CONTENT` (clădiri, semafoare și decor intră; carosabil/trotuar/bordură/teren doar primesc), plafon separat 192 pentru casterii statici; prioritatea `essential` neatinsă.

**Bug de geometrie corectat (042):** pereții clădirilor aveau normale spre interior (`pushPrism`); AO îi făcea negri. Corectat și testat; fețele luminate/umbrite ale clădirilor s-au inversat față de V3.

**Limitări.** (1) Criteriul de cache: harta nu se randează când nimic nu s-a schimbat (soare, vedere, mișcare a casterilor), dar nu există o hartă statică separată: la condus, cu camera în mișcare, harta (clădiri incluse) se randează în fiecare cadru; cache-ul literal „numai la schimbarea soarelui” nu este implementat (motiv și cost în documentul 30). (2) Taxiul este aproape negru (paleta 247) și materialele sunt încă plate (245/246/247 le vor face să profite de umbre). (3) AO rulează la jumătate de rezoluție; folosește câmpul privat `_clearColor` al lui Babylon 9.29. (4) WebGL2 costă mai mult decât WebGPU (HIGH 2,36 → 7,07 ms, o rulare).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '244' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: zero umbre, `addShadowCaster` neapelat în compunere.
- 2026-11-16: orchestratorul a reformulat criteriul de cache al umbrelor statice. O hartă statică separată cere un al doilea generator pe aceeași lumină, care nu este eșantionat de materiale în Babylon 9.29. Comportamentul livrat este cache-ul `RENDER_ONCE` cu invalidare, iar costul în mișcare (+1,3 ms HIGH, +0,7 ms MEDIUM) este raportat. Optimizări suplimentare (umbre statice coapte) rămân de evaluat la gate-ul 253.
- 2026-11-16T04:27:37+02:00: implementat de subagentul Sonnet, aprobat de review-ul independent Sonnet (review-round1.md, APPROVED); orchestratorul a reformulat criteriul de cache, a corectat referința de test din city-scene.ts, a adăugat o eroare explicită dacă GeometryBufferRenderer._clearColor lipsește, a regenerat raportul 201 și a mutat în Done.

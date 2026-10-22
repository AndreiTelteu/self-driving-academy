---
id: "145"
title: "Asseturi auto roți lumini și LOD"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["015","023","014","220","223"]
performance_checks: ["assets", "frame", "memory"]
owner: "loop-pbi/assets-145-146-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T08:07:03+03:00"
completed_at: "2026-10-22T08:38:57+03:00"
---

# 145 Asseturi auto roți lumini și LOD

## Obiectiv

Livrează două clase vizuale cu pivoturi și variante de detaliu.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 023 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Axele și roțile corespund configurației mecanice.
- [x] LOD nu schimbă colliderele sau entityId.

- [x] Manifestul trece bugetele 223; materialele/LOD și uploadul primei utilizări sunt măsurate pe instanțe dinamice.

## Verificare

Inspectează asseturi la viteze și distanțe diferite.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Două clase vizuale (sedan/compact) în `src/rendering/vehicle-visuals.ts`, `vehicle-geometry.ts` și `src/rendering/babylon/vehicle-scene.ts`. Pivoturile derivă din mecanica 023 (`x=±track/2`, `z=±wheelbase/2`, `y=-0,5` = connection −0,15 + rest 0,35, raza clasei); roțile din față virează pe +Y, toate se rotesc pe +X, iar poziția fizică de suspensie este aplicată pe pivot. Geometria procedurală originală este grupată pe material (caroserie cu culori de vârf + faruri/stopuri/frână/semnalizare), iar cele patru roți ale unui vehicul folosesc o singură sursă instanțiată. LOD `NEAR`/`MID`/`FAR` (30/70 LOW, 40/85 MEDIUM, 55/110 HIGH, histerezis 5 m) schimbă doar vizibilitatea grupurilor: nodurile, pivoturile, colliderul 023 (`cuboid(0.85, 0.3, 2)`) și maparea `entityId` rămân identice. Manifestul are 7 definiții și inventarul de surse/licențe este explicit.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` (263 fișiere, PASS) și `npm test` (1870 teste, 0 eșecuri) — toate verzi. Probe noi: `tests/rendering/vehicle-visuals.test.ts` (12 verificări de contract împreună cu `vehicle-scene.test.ts`), inclusiv alinierea la `VEHICLE_CLASSES`, manifestul pe LOW/MEDIUM/HIGH, respingerea unui manifest peste buget, inventarul licențelor, identitatea `entityId` după LOD și curățarea scenei. Probe browser cu backend real (Chrome 155 headless, GPU AMD Radeon ANGLE D3D11, WEBGL2, preset MEDIUM, 24 instanțe): buget 223 acceptat — 7 definiții, transfer runtime 0 B, geometrie estimată 114.656 B din 64 MiB, texturi 0 B, 8 variante shader, zero diagnostice; prima utilizare sedan 3,1+1,3+3,5 ms și compact 2,4+0,7+3,9 ms (sub 50 ms primul render, sub 2000 ms shaderele); LOD la 8/60/160 m păstrează `entityId=taxi:01` la picking și ascunde doar roțile la FAR; 61 draw calls de aplicație (75 cu solul), 5.232 vârfuri, trimitere CPU/render p95 1,2 ms, 0 cadre peste 25 ms, heap 24,6 MB. Capturi: `near.png`, `side.png`, `mid.png`, `far.png`, `overview.png`. Raportul complet și limitele: [Docs/Evidence/145-vehicle-assets](Docs/Evidence/145-vehicle-assets/README.md).

Fișiere și documente actualizate: `src/rendering/vehicle-visuals.ts`, `src/rendering/vehicle-geometry.ts`, `src/rendering/babylon/vehicle-scene.ts`, `src/rendering/index.ts`, `src/rendering/babylon/index.ts`, `tests/rendering/vehicle-visuals.test.ts`, `tests/rendering/vehicle-scene.test.ts`, `tests/browser/vehicle-assets/{index.html,main.ts}`, `scripts/vehicle-assets-server.mjs`, `scripts/vehicle-assets-capture.mjs`, `Docs/16-asseturi-vizual-si-audio.md`, `Docs/Evidence/145-vehicle-assets/**`.

Limitări sau follow-up: Proba este de prezentare (nu gameplay) și nu înlocuiește FPS-ul hardware al gate-ului 220 sau workload-ul integrat 155; „frame” raportat este timpul de trimitere CPU/render fără vsync. Memoria GPU exactă nu este disponibilă, ca în 223. Nu există asseturi GLB/texturi finale pentru vehicule; arhetipurile destructibile și audio rămân la PBI-urile lor. Capturile sunt din Chrome headless cu GPU real, deci focusul/vsync nu fac obiectul probei.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '145' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare completă în worktree `loop-pbi/assets-145-146-01`: contract vizual + geometrie procedurală + scenă Babylon, teste de aliniere 023/LOD/manifest/inventar, probe browser cu 24 de instanțe dinamice și capturi. Toate verificările proiectului trec; PBI mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

---
id: "015"
title: "Registry asseturi și încărcare GLB"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["013"]
performance_checks: ["assets", "loading", "memory"]
owner: "Codex PBI015"
started_at: "2026-10-05T02:51:39.3542930+03:00"
completed_at: "2026-10-05T03:12:53.8497743+03:00"
---

# 015 Registry asseturi și încărcare GLB

## Obiectiv

Configurează loaderul versiunii Babylon fixate, progres, cache și placeholder.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 013 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Asseturile critice au erori explicite; decorul lipsă poate folosi placeholder.
- [x] Load și unload eliberează resurse și nu dublează materiale.

- [x] Încărcarea critică/opțională, cache-ul și decode/upload au limite și timpi raportați; disposal păstrează resursele partajate încă folosite.

## Verificare

Încarcă un asset valid, unul lipsă și două instanțe ale aceluiași asset.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: BabylonAssetRegistry cu loader GLB2 Babylon 9.29.0, progres, cache bounded/LRU și dedup concurent, lease/refcount pentru materiale/geometrie/texturi comune, erori critice explicite, placeholder opțional și disposal idempotent. PNG/JPEG încorporate sunt admise cu preflight de dimensiuni și memorie; shader preparation precede ready.

Verificări executate și rezultat: npm run check PASS185 (typecheck/lint/format/architecture/teste), npm run build PASS, 4 teste preflight dedicate PASS. Browser T3 tab_4: WebGL2 și WebGPU reale PASS18 verificări, PNG/JPEG, două instanțe/material comun, critical error/placeholder, retry, limite coadă/cache/bytes/instanțe/rapoarte, disposal active/queued/decode și 20 cicluri load/unload pe fiecare backend cu contoare revenite la baseline. Dovezi: [raport](../../Docs/Evidence/015-asset-registry/report.md), JSON before/after/WebGL2/WebGPU, bundle și logs .txt. Baseline comparabil bootstrap median CPU p95 0,20→0,20ms; cost nou raportat separat.

Fișiere și documente actualizate: src/rendering/babylon/asset-registry.ts și asset-contract.ts; tests/rendering/asset-registry.test.ts; tests/browser/asset-registry/{index.html,main.ts,glb-fixture.ts}; Docs/asset-registry.md și Docs/Evidence/015-asset-registry. Exporturile barrel și linkurile modulelor sunt integrate de parent.

Limitări sau follow-up: Plafoane provizorii înainte de203. Decode/upload reprezintă timpul CPU/readiness Babylon și buget observat la terminare, nu un timeout preemptiv sau timer GPU. GLB2 acceptă core geometry/material/animation și PNG/JPEG embedded; URI-uri externe, sparse accessors și extension codecs se resping explicit. Fixture dev mic, cache-cold registry cu runtime cald, rețea neprofilată; nu închide benchmarkul jocului/223/224. Contoarele/estimările nu sunt memorie GPU exactă. After bootstrap precede exclusiv optimizarea importului loaderului; funcționalitatea finală pe ambele backenduri a fost remăsurată după. Vezi raportul pentru hardware și concurență externă.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '015' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05T03:12:53.8497743+03:00: Implementare și verificări reale finalizate; mutare fizică în Done urmată de Validate-Board -RequireDone015.

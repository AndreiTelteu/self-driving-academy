---
id: "146"
title: "Asseturi cartier decor și optimizare"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["042","015","220","223"]
performance_checks: ["assets", "loading", "frame"]
owner: "loop-pbi/assets-145-146-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T08:41:04+03:00"
completed_at: "2026-10-22T09:42:05+03:00"
---

# 146 Asseturi cartier decor și optimizare

## Obiectiv

Înlocuiește placeholder-ele cu decor coerent american și instanțe potrivite.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 042 trebuie să existe în Done înainte de începere.
- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 220 trebuie să existe în Done înainte de începere.
- PBI 223 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Semantica hărții rămâne aliniată după schimbarea asseturilor.
- [x] Costul asseturilor și sursele/licențele sunt inventariate.

- [x] Batchurile statice sunt locale spațial; texturile/umbrele/draw calls și startup-ul rămân în buget pe workload-ul gate-ului 220.

## Verificare

Parcurge orașul și măsoară încărcarea și draw calls.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Decor procedural coerent american în `src/rendering/city-decor.ts` (plan + clearance + geometrie fuzionată + manifest + inventar) și `src/rendering/babylon/city-decor-scene.ts` (un mesh per celulă de 120 m, material partajat cu culori de vârf). Sunt 1.585 de itemuri (312 stâlpi, 448 copaci, 253 pubele, 221 parcometre, 148 indicatoare, 111 hidranți, 84 bănci, 8 adăposturi de stație) în 36 de batchuri locale, 81.620 vârfuri, ≈4,35 MB geometrie estimată, 0 texturi. Plasarea derivă exclusiv din layout-ul 042 (numai trotuare și trotuarul cel mai apropiat de zonele de serviciu), cu pas determinist, offset în lățimea trotuarului și respingere la orice contact cu banda, marcajul, intersecția, trecerea, linia de stop sau clădirea; harta nu este modificată și nu se creează collidere. `cityDecorManifest` admite 9 definiții pe LOW/MEDIUM/HIGH, iar `cityDecorInventory` documentează sursa originală și licența de proiect pentru fiecare tip.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` (263 fișiere, PASS) și `npm test` (1878 teste, 0 eșecuri) — toate verzi. Teste noi `tests/rendering/city-decor.test.ts` (8 teste: determinism, plasare pe trotuar, respingerea unui item forțat pe bandă, geometrie exactă, manifest 223, inventar, batchuri/disposal, semantică 042 + material împrumutat). Proba de oraș (Chrome 155 headless, GPU AMD Radeon ANGLE D3D11, WEBGL2, MEDIUM, 1280×720) a rulat 923 elemente de layout: 0 elemente lipsă/necunoscute/fantomă, 0 probleme de aliniere, 191 mesh-uri (176 draw calls în vedere de ansamblu), 0 texturi, 13 materiale, startup layout/oraș/decor 241/40/885 ms (total 1.166 ms), trimitere CPU/render p95 3,0 ms cu 0 cadre >25 ms, heap 52,8 MB. Harness-ul 220 a fost refolosit cu parametrul aditiv `assets=146` pe `maximum-30` (30 taxiuri + 40 civili): frame p95 16,8 ms și p99 16,8–17,0 ms, GPU p95 0,78 ms, ratio 1,0001, 0 cadre >35 ms, 0 long tasks, 0 texturi, startup decor 613 ms; sesiunea DEV de control fără decor are aceleași frame/GPU/ratio și aceleași variații de tick, iar ambele sesiuni DEV sunt raportate `DEV_FAIL` din cauza mașinii partajate, nu ca gate. Capturi: `overview.png`, `junction.png`, `sidewalk.png`, `avenue.png`. Raportul complet, capturile de gate și limitele: [Docs/Evidence/146-city-assets](Docs/Evidence/146-city-assets/README.md).

Fișiere și documente actualizate: `src/rendering/city-decor.ts`, `src/rendering/babylon/city-decor-scene.ts`, `src/rendering/index.ts`, `src/rendering/babylon/index.ts`, `tests/rendering/city-decor.test.ts`, `tests/browser/city-assets/{index.html,main.ts}`, `tests/browser/fleet-performance-gate/main.ts` (parametru aditiv `assets=146`, comportamentul implicit neschimbat), `scripts/city-assets-server.mjs`, `scripts/city-assets-capture.mjs`, `Docs/16-asseturi-vizual-si-audio.md`, `Docs/render-asset-budgets.md`, `Docs/Evidence/146-city-assets/**`.

Limitări sau follow-up: Draw calls integrate 191 depășesc capul indicativ 128 din 223; excesul este baseline-ul 042 (96 suprafețe de bandă + 52 mesh-uri de semafor), nu decorul (36 batchuri locale). Batchuirea spațială a suprafețelor de bandă schimbă contractul de identitate al 042 și rămâne un PBI de optimizare separat (propunere pentru 157/158). Probele DEV nu sunt gate și au rulat pe o mașină partajată (tick p95 7,9–12 ms, inclusiv fără decor); rularea full pe hardware liniștit rămâne la 220/224/155. Nu există texturi, umbre proiectate de decor, audio sau obiecte fizice de decor; adăposturile apar doar unde încap pe trotuarul de 2,4 m (8 din 16 zone de serviciu).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '146' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare completă în worktree `loop-pbi/assets-145-146-01`: plan de decor derivat din layout-ul 042, geometrie procedurală fuzionată pe celule de 120 m, manifest/inventar 223, probă de oraș cu capturi și probă pe harness-ul 220 cu decor opt-in. Toate verificările proiectului trec; PBI mutat în Done cu limitarea documentată a draw calls integrate moștenite din 042.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

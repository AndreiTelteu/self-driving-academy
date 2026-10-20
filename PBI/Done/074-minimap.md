---
id: "074"
title: "Minimap și traseul curent"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["073","043"]
performance_checks: ["ui", "frame"]
owner: "Codex gpt-6-luna medium loop-074"
started_at: "2026-10-21T01:45:26+03:00"
completed_at: "2026-10-21T00:50:00+03:00"
---

# 074 Minimap și traseul curent

## Obiectiv

Desenează drumuri, direcția vehiculului și ruta.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 043 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Minimapul nu cere randare completă a orașului într-o a doua cameră.
- [x] Ruta și poziția se actualizează la schimbarea taxiului.

- [x] Minimapul refolosește geometria statică și actualizează markerii la frecvență plafonată, independent de tick-ul autoritar.

## Verificare

Verifică viraje, sens unic și selecția unui taxi distant.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/ui/minimap-format.ts`, `src/ui/minimap.ts` și `src/app/minimap.ts` oferă `readMinimapGeometry({ map, graph })` (032 + 033, o singură dată), `createMinimap(host, geometry)`, `readMinimapFrame({ fleet, lifecycle, eta }, ...)`, `update/getStats/dispose`, plus funcțiile pure `createMinimapTransform`, `projectMinimapPoint`, `createMinimapScene`, `projectMinimap`, `paintMinimapLayer`, `parseMinimapFrame` și `MINIMAP_VERSION`. Proiecția este **north-up**, documentată și asertată: `xPx = width/2 + (xM − centerXM)·scale`, `yPx = height/2 − (zM − centerZM)·scale`, cu `+Z` nord/sus și o singură scală uniformă din `map.bounds`. Toate benzile dirijate 033, ariile reale de intersecție 032, path-urile de Movement și ancorele reale ale zonelor de serviciu sunt extrase o dată; canvas-ul static este pictat exact o dată, iar ruta/markerele stau pe un al doilea canvas transparent. Ruta este desenată exclusiv din `EtaSnapshot.routeLaneIds` pentru o cursă/taxi/stare/leg potrivite și `READY`; benzile consecutive se unesc prin Movement-ul real, o bandă lipsă închide întreaga rută (fail closed), iar `ROUTE_MISSING/STALE/INVALID` nu cad niciodată pe înregistrarea cursei. Replanificarea/staleness-ul curăță imediat ruta veche. Markerul taxiului folosește poziția/heading-ul real al gazdei, niciodată snap-uit pe rută; `P`/`D` vin din ancorele reale și id-urile de zonă 061, fără markere pentru curse străine sau zone lipsă. Stările explicite (fără estimare 064, fără rută, rută învechită, poziție lipsă, cursă străină/terminală) au text plus `data-route`/`data-position`; canvas-ul este `aria-hidden`, cu o descriere textuală north-up referită prin `aria-describedby`.

Verificări: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (197 fișiere), `check:parameter-catalog` PASS; `npm run hud:minimap -- --check` **25/25 checks**, 6 scenarii, transcript curent; `scripts/capture-minimap.mjs` **5 capturi, 45/45 checks**, Chromium 151.0.7922.34; suita țintă 12/12; `npm test` 1303/1303 PASS (1291 baseline + 12). Șase probe de mutație (proiecție inversată, P/D inversate, taxi snap-uit, rută învechită păstrată, throttle eliminat, rută de fallback inventată) au picat fiecare testul țintă. Dovezi în [Evidence/074-minimap](../../Docs/Evidence/074-minimap/README.md).

Fișiere și documente actualizate: `src/ui/minimap-format.ts`, `src/ui/minimap.ts`, `src/app/minimap.ts` (noi), `src/ui/index.ts`, `src/app/index.ts`, `scripts/hud-minimap-report.mjs`, `scripts/capture-minimap.mjs`, `tests/ui/minimap.test.ts`, [Docs/minimap.md](../../Docs/minimap.md) (nou), [Docs/27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md), `Docs/Evidence/074-minimap/`.

Limitări sau follow-up: fără cablare live în bootstrap; cusătura de compoziție este pregătită pentru 075/153. Doar north-up, fără zoom sau rotație heading-up. 240 CSS px fix, fără backing store DPR-aware. Captura Playwright opțională redă comenzile de desen comise peste fixture-ul real, nu un cadru de simulare live. Fără FPS/GPU/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '074' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.
- 2026-10-21: Implementare în worktree izolat (commit `cb076f0e`): minimap north-up din geometria reală 032/033, rută exclusiv din ETA 064, markere reale, throttle 10 Hz și stări accesibile; 12 teste, 25/25 report, 5 capturi. Integrat prin fast-forward; verificat de orchestrator cu 1303/1303 teste.

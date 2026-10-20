---
id: "042"
title: "Construirea cartierului în Babylon"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["015","016","032","040","204"]
owner: "Codex gpt-6-luna medium city-visual-01"
started_at: "2026-10-20T02:00:00+03:00"
completed_at: "2026-10-20T02:25:00+03:00"
---

# 042 Construirea cartierului în Babylon

## Obiectiv

Construiește cartierul american compact și legătura visual–semantic.

## Context și plan

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 016 trebuie să existe în Done înainte de începere.
- PBI 032 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.
- PBI 204 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Benzile, marcajele și semnalele se aliniază cu datele de simulare.
- [x] Orașul include contextele necesare misiunilor V1.

## Verificare

Inspectează alinierea și parcurge toate tipurile de intersecție.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/world/neighbourhood.ts` authorizează harta 032 (25 intersecții, 96 benzi dirijate, 16 blocuri), `src/world/city-layout.ts` derivă layout-ul (`createCityLayout`, `createCityLayoutReport`, `verifyCityAlignment`) fără Babylon, iar `src/rendering/babylon/city-scene.ts` construiește scena din layout (`createCityScene`) cu `getRenderedElementIds`, `meshFor`, `lampFor`, `getResourceCounts` și `dispose` idempotent. Fiecare element provine din datele 032/033/036/040: suprafața benzii este calea ± `widthM/2`, marcajele din `neighbors` și perechea opusă a segmentului, liniile STOP/SIGNAL/CROSSWALK din geometriile cu 2 noduri, trecerile din poligonul lor, intersecțiile din poligon cu tipul derivat (program de semafor → SIGNALIZED, altfel STOP/SIGNAL → STOP_CONTROLLED, altfel UNCONTROLLED), câte un cap de semafor pe banda de intrare, offset la dreapta cu `widthM/2 + 0.8 m`, iar zonele de serviciu din ariile lor. Nu există o a doua copie a layout-ului în renderer.

Raport geometric: 923 elemente (96 suprafețe de bandă, 216 marcaje, 25 intersecții, 234 linii de oprire, 80 treceri, 26 semafoare, 16 zone de serviciu, 16 sol, 64 trotuare, 64 borduri, 86 clădiri); Babylon 155 mesh-uri (7 loturi combinate, 122 individuale, 801 elemente combinate), 19.172 vertecși, 10.054 triunghiuri. Tipuri de intersecție 4/4/17 signalized/STOP/uncontrolled; clase de drum 32 arterial / 64 residential.

Aliniere: `verifyCityAlignment` → **0 probleme**; testele compară vertecșii mesh-urilor cu centrul benzii din 033 în **1e-6 m**, offset-urile marcajelor și poziția/orientarea capetelor de semafor. Probele negative pică pe bandă deplasată 5 cm, marcaj reassignat, cap lipsă, cap mutat 0,2 m și id fantomă. Capturi reale Playwright/Chromium headless WebGL2 (SwiftShader), nu simulate: `capture-overview.png`, `capture-signalized.png`, `capture-stop_controlled.png`, `capture-uncontrolled.png` plus JSON per pagină, 0 erori de consolă; WebGPU nu a fost disponibil, deci nu se pretinde WebGPU/FPS.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (177 fișiere), `check:parameter-catalog` exit 0; `npm test` 1127/1127 PASS (1110 baseline + 17: 5 neighbourhood, 6 layout/aliniere/acoperire, 6 scenă/dispose/determinism). Dovezi în [Evidence/042-city-visual](../../Docs/Evidence/042-city-visual/README.md).

Fișiere și documente actualizate: `src/world/neighbourhood.ts`, `src/world/city-layout.ts`, `src/rendering/babylon/city-scene.ts`, `scripts/city-visual-report.mjs`, cele două `index.ts`, testele aferente, [Docs/city-visual.md](../../Docs/city-visual.md) (nou), [Docs/04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md), `Docs/Evidence/042-city-visual/`.

Limitări sau follow-up: capturi doar WebGL2/SwiftShader (fără gate WebGPU/FPS); programele de semafor sunt didactice și statice (un singur GREEN per fază de viraj, fără right-on-red/protected left); înălțimile clădirilor/trotuarelor/zebrelor sunt reguli de prezentare documentate; fără LOD, coliziune, pietoni, vehicule sau destructibile; derivarea blocurilor cere o grilă de intersecții și întoarce zero blocuri pe alte hărți; fără playtest de condus.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '042' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.
- 2026-10-20: Implementare în worktree izolat (commit `849b25af`): cartier derivat din datele 032/033/036/040, 923 elemente, aliniere 1e-6 m cu 0 probleme, capturi reale WebGL2 pe 4 tipuri de intersecție și 17 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1127/1127 teste.

---
id: "239"
title: "Direcția vizuală V4 și harness de capturi înainte/după"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["238"]
performance_checks: ["frame"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-15T19:06:08.029Z"
completed_at: "2026-11-15T21:47:37+02:00"
---

# 239 Direcția vizuală V4 și harness de capturi înainte/după

## Obiectiv

Fixează direcția vizuală V4 („realism stilizat curat”) și construiește harnessul de capturi pe care îl folosesc toate PBI-urile 240–253 ca dovadă înainte/după. Fără acest harness, îmbunătățirile vizuale nu pot fi comparate obiectiv.

## Context și plan

Citește [Calitate vizuală V4](../../Docs/30-calitate-vizuala-v4.md) și [auditul din 16 noiembrie](../../Docs/Evidence/visual-audit-2026-11-16/README.md). Auditul a fost făcut manual, cu un agent care a jucat jocul, deci cadrele nu se pot repeta. Harnessul trebuie să poziționeze camera determinist, fără input de jucător.

## Dependențe

- PBI 238 trebuie să fie în Done.

## Criterii de acceptare

- [x] `Docs/03-babylon-engine.md` și `Docs/16-asseturi-vizual-si-audio.md` trimit la decizia din 16 noiembrie 2026 din documentul 30; textul vechi rămâne vizibil ca istoric, nu este șters pe ascuns.
- [x] Un mod de cameră numai pentru capturi, activat explicit (de exemplu `?capture=1`), fixează seed-ul, ora și pozițiile vehiculelor și expune `window.__visualCapture.go(viewId)`. Nu este accesibil în build-ul normal fără flag.
- [x] Cel puțin 12 cadre numite acoperă: personaj aproape, taxi aproape (3/4 față), taxi din spate în mers, stradă la nivelul ochilor, intersecție cu trecere de pietoni, fațade aproape, oraș de sus, orizont, decor (copac, bancă, stâlp, adăpost), mașini civile, marginea hărții și UI/HUD.
- [x] `npm run visual:capture -- --out <dir> --preset <LOW|MEDIUM|HIGH>` pornește `vite preview`, randează toate cadrele la 1920×1080 și scrie PNG-uri plus un `manifest.json` (commit, backend, renderer, preset, viewport, timp de cadru per vedere).
- [x] `npm run visual:compare -- <before> <after>` produce o pagină HTML cu perechi alăturate și diferența procentuală de pixeli per cadru.
- [x] Baseline-ul V4 pe codul de la începutul PBI-ului este salvat în `Docs/Evidence/239-visual-baseline/` pentru HIGH și LOW.

## Verificare

Rulează harnessul de două ori pe același commit: aceleași cadre trebuie să difere sub 0,5% din pixeli (pragul pentru zgomotul de animație). Rulează `npm test`, `npm run typecheck` și `npm run lint`. Atașează pagina de comparație baseline-vs-baseline.

## Dovezi de finalizare

**Rezultat.** Harness de capturi V4 determinist, fără dependențe noi. Modul `?capture=1` (inert fără steag: verificat în browser, `__visualCapture` este `undefined` și canvasul rămâne 640×360 pe `/` și `/?capture=0`), 13 vederi ca date în `src/rendering/visual-capture.ts`, controller în `src/rendering/babylon/visual-capture.ts`, `npm run visual:capture` (build temporar, `vite preview` pe port liber sau `--port`, Chromium 1920×1080, PNG + `manifest.json`, curățare la eroare/SIGINT) și `npm run visual:compare` (HTML cu perechi, hartă de diferențe, procent per cadru). Decizia din 16 noiembrie 2026 este legată din Docs/03 și Docs/16 (textul vechi păstrat), iar Docs/30 documentează harnessul.

**Backend.** Chromium `channel: 'chromium'` cu flaguri GPU: WebGPU real, `amd rdna-2` (nu SwiftShader); WebGL2 pe ANGLE/D3D11 AMD Radeon. Headless-shell a căzut pe WebGL2 (`dxcompiler.dll`, eroare 87), de aceea nu este implicit. Timpii sunt CPU render (≈1–2,5 ms) și interval de cadre plafonat de vsync (16,7 ms), nu costul GPU.

**Verificări.**
- Aceeași revizie, de două ori (HIGH/WebGPU): `visual:compare` dă 0,000% pixeli diferiți pe toate cele 13 cadre (prag 0,5%). Pagina: `Docs/Evidence/239-visual-baseline/compare-high-webgpu-repeat/compare.html`.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture`: trec. `npm test`: 3446 tests, 3446 pass, 0 fail (include 5 teste noi în `tests/rendering/visual-capture.test.ts` și `visual-compare.test.ts`).
- `qa:v1-regression -- --check`, `v2:contexts -- --check`, `assets:manifest -- --check`: actuale. `Validate-Plan.ps1` și `Validate-Board.ps1`: fără erori.
- Performanță (nivel targeted, metrica `frame`): PBI-ul nu adaugă lucru pe tick/cadru în calea normală; codul de captură nu rulează fără steag. Costul CPU de randare per vedere este în fiecare `manifest.json`.

**Observații de pornire.** HIGH și LOW sunt identice pixel cu pixel (presetul nu schimbă încă nimic vizibil); WebGPU vs WebGL2 sub 0,01% pe 12 cadre și 0,878% pe `city-aerial`.

**Fișiere.** `src/rendering/visual-capture.ts`, `src/rendering/babylon/visual-capture.ts`, `src/rendering/babylon/index.ts`, `src/rendering/babylon/v3-composition-scene.ts` (accesor `representation`), `src/main.ts`, `scripts/visual-capture.mjs`, `scripts/visual-compare.mjs`, `package.json`, `tests/rendering/visual-capture.test.ts`, `tests/rendering/visual-compare.test.ts`, `Docs/03-babylon-engine.md`, `Docs/16-asseturi-vizual-si-audio.md`, `Docs/30-calitate-vizuala-v4.md`, `Docs/Evidence/239-visual-baseline/`.

**Limitări.** Baseline-ul a fost capturat peste commit-ul `aad81799` cu modificările 239 locale (manifestul are `sourceDirty: true`); imaginea nu diferă, modul de captură fiind inert la randare. Soarele este constant (fără ciclu zi/noapte până la 252), deci „ora” este doar înregistrată. Vederile 3D forțează canvasul pe tot viewportul până la 240. Nu s-au măsurat timpi GPU.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '239' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual al compunerii V3, la cererea utilizatorului ca jocul să arate realist, curat și HD.
- 2026-11-15T21:47:37+02:00: implementat de subagentul Sonnet, aprobat de review-ul independent Sonnet (review-round1.md, APPROVED), verificat de orchestrator și mutat în Done.

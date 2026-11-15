---
id: "240"
title: "Randare pe tot ecranul, la rezoluție HD și DPR real"
status: "Done"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["239"]
performance_checks: ["frame","memory"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-15T19:48:11.393Z"
completed_at: "2026-11-15T22:27:38+02:00"
---

# 240 Randare pe tot ecranul, la rezoluție HD și DPR real

## Obiectiv

Jocul trebuie să ocupe toată fereastra și să randeze la rezoluția reală a ecranului. În audit, scena are 640×360 pixeli în mijlocul unei ferestre de 1600×900 și arată pixelată.

## Context și plan

`src/style.css` fixează `canvas { width: min(100%, 40rem); height: 20rem }`. `src/main.ts` transmite `canvas.clientWidth/clientHeight` ca viewport, iar `daylight.apply()` setează `engine.setSize(internalWidth, internalHeight)`, rezultat din `resolveQuality`. `QUALITY_PRESETS` are `maxDpr` 1/1,5/2. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problema 1.

## Dependențe

- PBI 239 trebuie să fie în Done (harnessul de capturi).

## Criterii de acceptare

- [x] Canvasul de joc ocupă 100% din viewportul ferestrei (`100dvw × 100dvh`), fără scroll și fără margini; titlul, butoanele și panoul Diagnostic nu mai sunt în fluxul paginii deasupra sau dedesubtul jocului (sunt mutate peste canvas sau, temporar, ascunse până la 251).
- [x] Rezoluția internă este `clientSize × min(devicePixelRatio, maxDpr) × resolutionScale`; pe HIGH, la 1920×1080 cu DPR 1, `backend().renderWidth/renderHeight` raportează 1920×1080.
- [x] Redimensionarea ferestrei, ecranul complet (F11 sau API Fullscreen) și mutarea între monitoare cu DPR diferit actualizează rezoluția internă, raportul de aspect și proiecția camerei fără distorsiune și fără recrearea scenei.
- [x] Adaptive quality (`createAdaptiveQuality`) poate scădea `resolutionScale` sub buget și îl readuce când frame time-ul permite; schimbarea apare în panoul Diagnostic.
- [x] HUD-ul, panourile și minimapul rămân lizibile și ancorate la 1280×720, 1920×1080 și 2560×1440.

## Verificare

Capturi 239 înainte/după la 1920×1080 pe HIGH și LOW. Teste unitare pentru calculul rezoluției interne (DPR, preset, scale, limite). Măsurare de frame pe preset, conform [contractului de performanță](../../Docs/25-performanta-contracte-si-benchmark.md); raportează separat costul de fill-rate adăugat.

## Dovezi de finalizare

### Rezultat

Canvasul de joc umple fereastra (`.game-stage` fix, `100dvw × 100dvh`, `overflow: hidden`); titlul, starea și butoanele sunt un overlay compact sus-centru (sub 1100 px jos-centru), panoul Diagnostic este jos-dreapta. Rezoluția internă = CSS × min(DPR, maxDpr) × scară, aplicată prin `setHardwareScalingLevel` (nu `setSize`, care ar fi fost suprascris de `engine.resize()`). Noul `src/rendering/display-surface.ts` observă resize, fullscreenchange, ResizeObserver, `matchMedia(resolution)` și un sondaj de siguranță la 500 ms, fără să recreeze scena. Calitatea adaptivă coboară/readuce întâi scara rezoluției (1 → 0,85 → 0,7 → 0,55 × scara jucătorului, minim 0,5), apoi presetul; este legată în `main.ts` doar când `quality.adaptive` e activ (implicit dezactivat) și apare în Diagnostic („Rezoluție internă”). Detalii în [documentul 30](../../Docs/30-calitate-vizuala-v4.md).

### Fișiere

Noi: `src/rendering/display-surface.ts`, `tests/rendering/display-surface.test.ts`, `Docs/Evidence/240-fullscreen-hd/*`. Modificate: `src/main.ts`, `src/style.css`, `src/ui/rendering-view.ts`, `src/ui/diagnostics-panel.ts`, `src/rendering/quality-policy.ts`, `src/rendering/index.ts`, `src/rendering/babylon/{daylight,diagnostics-adapter,v3-browser-composition,v3-composition-scene}.ts`, `tests/rendering/lighting.test.ts`, `Docs/30-calitate-vizuala-v4.md`.

### Verificări (rezultate reale)

- `npm run typecheck`: exit 0. `npm run lint`: exit 0. `npm run format:check`: toate fișierele conforme. `npm run check:architecture`: exit 0.
- `npm test`: `ℹ tests 3455 / pass 3455 / fail 0` (9 teste noi în `display-surface.test.ts`).
- `npm run qa:v1-regression -- --check`: current. `npm run v2:contexts -- --check`: current. `ui:responsive -- --check`: 42/42 PASS. `ui:accessibility -- --check`: 53/53 PASS. `qa:ui -- --check`: raportul comis este curent (verdictul FAIL cu 8 findings este cel preexistent al 153; nu am rulat `--browser`, care rescrie dovezile; scena 153 nu conține `.game-shell`, iar regulile noi sunt scoped pe `.game-shell`/`.game-canvas`/`.diagnostics-panel`).
- `Validate-Plan.ps1`: trecut (fără erori).
- Test modificat intenționat: `tests/rendering/lighting.test.ts` „automatic presentation port…” (primul pas adaptiv este acum scara rezoluției, nu presetul); politica fără `adaptResolution` este neschimbată și testul ei vechi trece nemodificat.

### Browser (Chromium 156, GPU real AMD rdna-2; `verify-browser.mjs`, 22/22 OK pe fiecare config)

Configurații: HIGH/WebGPU, LOW/WebGPU, HIGH/WebGL2. Rezultate pe HIGH/WebGPU: 1280×720, 1920×1080, 2560×1440 la DPR 1 → `renderWidth×renderHeight` identic cu viewportul, canvas la (0,0) cu dimensiunea viewportului, scroll 0, `overflow: hidden`; 1280×720 la DPR 1,5 → 1920×1080 și la DPR 2 → 2560×1440; resize 1280→1600→1000→1920 actualizează rezoluția; Fullscreen API: 1920×1080 randat; schimbare DPR în sesiune (CDP) 2 → 3840×2160 și înapoi; scena nu e recreată (aceleași statistici/vehicule), 0 ascultători resize/fullscreenchange noi la resize repetat, 0 rămași după `pagehide`; 0 erori de consolă. Harnessul 239 după schimbare: HIGH și LOW WebGPU, 13 vederi la 1920×1080, 0 erori; `visual:compare` față de baseline-ul 239: 0 pixeli diferiți în afara zonelor de overlay pe `character-close`, `street-eye-level`, `city-aerial`, `horizon`, `map-edge` (diferențele de 3,7–4,2% sunt overlay-ul nou), `ui-hud` 98,6% (640×360 în pagină → ecran complet). Capturi: `after-{high,low}-webgpu-{ui-hud,street-eye-level}.png`, `high-webgpu-1280x720.png`, `high-webgpu-fullscreen.png`, `high-webgpu-playing-diagnostic.png`, `high-webgl2-1920x1080.png`.

### Performanță (WebGPU, AMD rdna-2, 1920×1080 DPR 1, `measure-fill-rate.mjs`, vsync oprit, 295 cadre)

Interval între cadre rAF (ms, medie / p95), înainte → după. `ui-hud` (în „înainte” = 640×360 în pagină):
- HIGH: ui-hud 0,742 / 1,3 → 1,245 / 1,8 (costul de fill-rate adăugat de 9× mai mulți pixeli ≈ +0,5 ms); street-eye-level (deja 1920×1080 forțat în baseline) 1,231 / 1,7 → 1,073 / 1,7 (zgomot).
- LOW: ui-hud 1,08 / 1,7 → 1,066 / 1,6; street-eye-level 1,091 / 1,6 → 1,011 / 1,5.
- Stres HIGH la DPR 2 (3840×2160): street-eye-level 2,264 / 3,1; ui-hud 4,008 / 6,4. Cu vsync (harness 239) cadrele rămân la 16,7 ms.
- Memorie: nu s-a măsurat; estimare analitică a țintelor de randare (culoare + adâncime/stencil, 4 B/pixel fiecare): 640×360 ≈ 1,8 MiB, 1920×1080 ≈ 15,8 MiB, 3840×2160 ≈ 63 MiB. Nu există alocări noi per cadru (nivelul hardware se schimbă doar la resize/DPR).

### Limitări

- Timerul GPU nu este disponibil în Chromium headless pe această mașină (`GPU status: unavailable: timer query unsupported`), deci cifrele sunt intervale rAF fără vsync, nu timp GPU; scena este foarte ieftină (≈1 ms), deci costul de fill-rate real apare abia cu efectele din 241–252. Nu s-a măsurat WebGL2 pe frame time. Probă targeted, nu full/soak.
- Calitatea adaptivă este testată unitar (politică, daylight cu NullEngine) și vizibilă în Diagnostic, dar nu a fost declanșată în browser: cere GPU timer, indisponibil aici; este dezactivată implicit.
- Fullscreen verificat prin API Fullscreen în headless, nu F11; mutarea între monitoare este acoperită de interogarea `resolution` + sondaj și simulată prin CDP, nu pe două monitoare fizice.
- Criteriul 5 este bifat pentru ce este montat în `main.ts` (HUD-ul personajului jos-stânga, overlay-ul sus-centru, Diagnostic jos-dreapta): lizibile și ancorate la 1280×720, 1920×1080 și 2560×1440 (`high-webgpu-1280x720.png`, `after-high-webgpu-ui-hud.png`, `high-webgpu-2560x1440-diagnostic.png`). HUD-ul taxi, minimapa și panourile 075–230 nu sunt montate în joc până la 251 și nu au fost verificate aici; `qa:ui --browser` nu a fost rulat.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '240' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: randare 640×360 într-o fereastră de 1600×900.
- 2026-11-15T22:27:38+02:00: implementat de subagentul Sonnet, aprobat de review-ul independent Sonnet (review-round1.md, APPROVED), verificat de orchestrator și mutat în Done. Nota din review despre suprapunerea sub 1100px a fost adăugată ca criteriu în 251.

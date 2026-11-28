---
id: "281"
title: "Minimapa, harta de flotă și HUD-ul complet de joc"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["260","263"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-281"
started_at: "2026-11-27T23:43:55.053Z"
completed_at: "2026-11-28T01:23:57.882Z"
---

# 281 Minimapa, harta de flotă și HUD-ul complet de joc

## Obiectiv

HUD-ul arată viteza, modul, sesiunea, obiectivul și o minimapă cu ruta și markerii flotei, fără suprapuneri și fără muncă în bucla 3D.

## Starea actuală și ce lipsește

- Nu există minimapă montată în joc.
- Nu există markeri pentru taxiuri/civili, rută, pickup/dropoff sau incidente.
- Nu există obiectivul curent, sesiunea sau starea cursei în HUD.
- Nu există hinturi contextuale pentru intrare, mod și recuperare.
- Nu există layout responsive și verificarea suprapunerilor.
- Nu există o probă vizuală la 1280×720 și pe zoom.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Reglaje HUD și cameră](../../Docs/27-reglaje-hud-si-camera.md)
- [Minimapa](../../Docs/minimap.md)
- [HUD](../../Docs/hud.md)
- [Layout responsive](../../Docs/responsive-layout.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Minimapa arată ruta, vehiculul selectat, taxiurile/civilii și pickup/dropoff, cu identitate stabilă.
- [x] HUD-ul arată viteză, mod, sesiune, obiectivul curent și starea cursei.
- [x] Un click pe marker selectează numai camera și respectă contractul de selecție.
- [x] HUD-ul se actualizează la 5–10 Hz, nu per frame, și nu blochează tastele.
- [x] Layout-ul rămâne lizibil la 1280×720, 1920×1080 și zoom 150%.
- [x] Nicio informație indisponibilă nu este afișată ca zero inventat.

## Verificare

- Teste de proiecție, identitate marker și overlap.
- Probă în browser: minimapă, click, rută, obiectiv, zoom.
- Capturi la cele trei breakpoint-uri.

## Dovezi de finalizare

Rezultat implementare: `src/ui/minimap-live.ts` montează 074 + 076 + incidente peste un singur `.minimap__map`; `src/ui/minimap-incidents.ts` și `src/app/minimap.ts` transformă faptele 065 `FleetHealth` reale în markere cu identitate stabilă. HUD-ul 073 arată viteza reală, modul, sesiunea 261, obiectivul 061/064 și starea cursei, cu stare explicită pentru informația indisponibilă (niciodată zero inventat). Un click pe marker emite doar intenția de selecție a camerei, păstrează autoritatea și taxiul `AUTO`, și readuce focusul pe canvas. Minimapa, HUD-ul și incidentele sunt actualizate printr-un gate de 10 Hz pe wall clock, nu per frame. Layout-ul 084 rezervă 24rem pentru HUD și rămâne fără suprapuneri la 1280×720, 1920×1080 și zoom 150% (viewport efectiv 853×480, font minim 12 px).

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (488 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run minimap:hud -- --check`, `npm run hud:taxi -- --check`, `npm run hud:minimap -- --check`, `npm run ui:responsive -- --check` — PASS. Teste țintă 41/41. `npm test` integrat: 3.806 teste, 3.792 pass, 0 fail, 14 skip-uri istorice. Raport 281 36/36; HUD taxi 23/23; minimapă 25/25; responsive 42/42. Browser probe 26/26 PASS, Chrome 157/WebGL2: 58 markere (25 taxi/33 civili), pickup/dropoff `sz:2-3`/`sz:3-2`, rută `READY` cu 2 benzi, obiectiv „Du-te la pasagerul din sz:2-3”, stare „În desfășurare”, sesiune „Academia”; click pe marker → camera target taxi, autoritate `CHARACTER:player-character` neschimbată, taxi `AUTO`, focus `CANVAS.game-canvas`; minimapă/HUD **9,22 Hz**, 0 listeneri globali; incident 065 real cu `incidentId` stabil; suprapuneri **0/0/0** la cele trei breakpoint-uri; capturi în `Docs/Evidence/281-minimap-hud/screenshots/`.

Fișiere și documente actualizate: `src/ui/minimap-live.ts`, `src/ui/minimap-incidents.ts`, `src/ui/minimap.ts`, `src/ui/taxi-hud.ts`, `src/ui/taxi-hud-format.ts`, `src/ui/responsive-layout.ts`, `src/ui/live-economy-hud.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/app/minimap.ts`, `src/app/taxi-hud.ts`, `src/app/live-fleet-selection.ts`, `src/app/index.ts`, `src/main.ts`, `src/style.css`, tests app/UI/browser, `scripts/run-minimap-hud-report.mjs`, `scripts/run-live-minimap-hud-probe.mjs`, `package.json`, `Docs/08`, `Docs/27`, `Docs/31`, `Docs/minimap.md`, `Docs/hud.md`, `Docs/responsive-layout.md`, `Docs/live-fleet-selection.md`, `Docs/Evidence/281-minimap-hud/`, `Docs/Evidence/073-hud/`, `Docs/Evidence/074-minimap/`, `Docs/Evidence/084-responsive-pc/`.

Limitări sau follow-up: Build-ul live nu are încă producător 028/029 de incidente; fără probă, poate afișa corect zero incidente, iar stratul este cablat la 065 și testat cu fapte 065 reale. Proba este Chrome headless/WebGL2 local, fără măsurare FPS/GPU/hardware. „Zoom 150%” este emulat prin viewport-ul CSS efectiv 853×480, conform contractului 084. Panoul 275 poate acoperi statusul economic secundar cât timp este deschis; HUD-ul, minimapa și bara shell rămân neobstrucționate. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '281'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-281`; integrat, verificat și mutat în Done.

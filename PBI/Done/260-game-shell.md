---
id: "260"
title: "Shell-ul jocului și composition root pentru Academia jucabilă"
status: "Done"
release: "V1"
module: "Integrare joc"
depends_on: []
performance_checks: ["frame","simulation"]
owner: "loop-pbi/deepseek-260"
started_at: "2026-11-25T23:37:07.568Z"
completed_at: "2026-11-26T01:00:50.049Z"
---

# 260 Shell-ul jocului și composition root pentru Academia jucabilă

## Obiectiv

Un singur composition root de browser pentru Academia jucabilă: pornește o sesiune reală, rulează compunerea V3 pe tickul autoritar, expune porturi explicite pentru sistemele care se integrează în 261–287 și montează shell-ul UI (start, pauză, gazdă de panouri). Sistemele încă nelivrate rămân în taskurile dependente; acest task nu le simulează cu placeholder-e.

## Starea actuală și ce lipsește

- `src/main.ts` creează doar `createRenderingView`, `createDiagnosticsPanel`, `createV3BrowserComposition` și HUD-ul de personaj.
- Nu există un owner unic pentru tick, pauză, focus, schimbarea sesiunii și ordinea sistemelor.
- Modulele de flotă, curse, economie, learning, misiuni și persistență nu sunt injectate în compunerea live.
- Nu există un shell UI pentru Academie/Haos, flotă, misiuni, KPI, profil, setări și salvare.
- Nu există o regulă de compunere care să împiedice două simulări sau două scrieri concurente.
- Nu există o dovadă de browser pentru bucla completă, doar probe izolate de module.

## Context și plan

- [Arhitectură și contracte](../../Docs/02-arhitectura-si-contracte.md)
- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Salvare și import/export](../../Docs/15-salvare-si-import-export.md)
- [Contracte de performanță](../../Docs/25-performanta-contracte-si-benchmark.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- Niciuna.

## Criterii de acceptare

- [x] Pornirea din `index.html` ajunge într-o sesiune jucabilă cu lumea V3, nu doar într-o scenă de randare. Meniul Academie/Haos rămâne taskul 261.
- [x] Un singur tick autoritar avansează compunerea V3 și apelează porturile sistemelor în ordinea declarată; un port absent este raportat explicit, nu înlocuit cu o simulare paralelă.
- [x] Pauza, focusul pierdut, panourile și reload-ul nu creează un al doilea tick sau o a doua lume.
- [x] Shell-ul UI montează start, pauză și o gazdă de panouri; porturile sunt injectate și pot fi înlocuite în teste.
- [x] O probă în browser WebGPU și WebGL2 pornește, conduce, deschide un panou și revine fără erori de consolă.
- [x] Costul pe tick și frame este raportat separat și rămâne în bugetul provizoriu al fixture-ului.
- [x] Sistemele neintegrate (flotă, curse, economie, learning, misiuni, persistență) rămân dependențe ale taskurilor 261–287, nu sunt declarate livrate aici.

## Verificare

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`.
- Probă Playwright în browser real pe WebGPU și WebGL2: start, tick, pauză, panou, reluare.
- Măsurare tick/frame înainte/după pe același fixture; păstrează baseline-ul.

## Dovezi de finalizare

Rezultat implementare: `src/app/game-shell.ts` este un composition root pur, cu un singur tick autoritar, ordine declarată a 16 sisteme, porturi injectabile și raportare explicită `ABSENT` pentru cele 15 sisteme încă nelivrate. `src/main.ts` atașează compunerea V3 ca singura lume, rulează un singur `shell.step` și leagă start/pauză/reluare/focusul prin owner-ul 070. `src/ui/game-shell-host.ts` montează Start/Pauză/Reia și un singur panou de integrare, cu focus, Tab, Escape și zero listeneri globali. O a doua lume este refuzată până la detach; un port absent nu este simulat.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (449 fișiere TS); `npm run build` PASS (1346 module); `npm run composition:report -- --check` PASS; `npm run docs:check -- --check` PASS. Teste țintă shell 11/11 PASS (7 shell + 4 host). `npm test` integrat: 3.570 teste, 3.556 pass, 0 fail, 14 skip-uri istorice. Proba de browser din worktree-ul de implementare: WebGL2 PASS (9,676 m apoi 16,209 m; tick 194→194→214; reload 293→1; 0 erori) și WebGPU PASS (9,995 m apoi 16,004 m; tick 334→334→373; reload 490→1; 0 erori); `browser.json` este `MEASURED` cu două rulări PASS, iar capturile sunt în `Docs/Evidence/260-game-shell/screenshots/`. Shell tick p95: 5,6 ms WebGL2 software, 5,0 ms WebGPU; overhead shell 0,1/0,2 ms. În părinte, `npm run shell:probe` nu a putut fi reluat după integrare pentru că Playwright nu este instalat; dovada măsurată din worktree a fost păstrată și verificată, nu înlocuită cu un PASS simulat.

Fișiere și documente actualizate: `src/app/game-shell.ts`, `src/main.ts`, `src/app/index.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/ui/rendering-view.ts`, `tests/app/game-shell.test.ts`, `tests/ui/game-shell-host.test.ts`, `tests/ui/hud-dom.ts`, `scripts/run-game-shell-probe.mjs`, `Docs/game-shell.md`, `Docs/02`, `Docs/31`, `Docs/README.md`, `package.json`, `Docs/Evidence/260-game-shell/`.

Limitări sau follow-up: WebGL2 rulează pe SwiftShader, deci frame time-ul nu este FPS hardware; WebGPU a rulat pe GPU real, dar fără GPU timer sau soak, iar gate-ul hardware rămâne 287. Flota, cursele, economia, learning-ul, misiunile, persistența, setările, first-person, minimapa, fizica Rapier, regulile de trafic, distrugerea și pietonii rămân taskuri dependente; shell-ul le raportează `ABSENT`. Panoul de integrare este singurul panou montat. `npm run shell:probe` în părinte necesită Playwright; dovada existentă provine din worktree-ul de implementare. Node local este 24.19.0, sub versiunea declarată `>=24.21.0`.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '260'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-260`; integrat, verificat și mutat în Done.

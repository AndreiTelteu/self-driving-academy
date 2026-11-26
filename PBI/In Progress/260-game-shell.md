---
id: "260"
title: "Shell-ul jocului și composition root pentru Academia jucabilă"
status: "In Progress"
release: "V1"
module: "Integrare joc"
depends_on: []
performance_checks: ["frame","simulation"]
owner: "loop-pbi/deepseek-260"
started_at: "2026-11-25T23:37:07.568Z"
completed_at: null
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

- [ ] Pornirea din `index.html` ajunge într-o sesiune de Academie cu lumea V3, nu doar într-o scenă de randare.
- [ ] Un singur tick autoritar avansează compunerea V3 și apelează porturile sistemelor în ordinea declarată; un port absent este raportat explicit, nu înlocuit cu o simulare paralelă.
- [ ] Pauza, focusul pierdut, panourile și reload-ul nu creează un al doilea tick sau o a doua lume.
- [ ] Shell-ul UI montează start, pauză și o gazdă de panouri; porturile sunt injectate și pot fi înlocuite în teste.
- [ ] O probă în browser WebGPU și WebGL2 pornește, conduce, deschide un panou și revine fără erori de consolă.
- [ ] Costul pe tick și frame este raportat separat și rămâne în bugetul provizoriu al fixture-ului.
- [ ] Sistemele neintegrate (flotă, curse, economie, learning, misiuni, persistență) rămân dependențe ale taskurilor 261–287, nu sunt declarate livrate aici.

## Verificare

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`.
- Probă Playwright în browser real pe WebGPU și WebGL2: start, tick, pauză, panou, reluare.
- Măsurare tick/frame înainte/după pe același fixture; păstrează baseline-ul.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '260'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

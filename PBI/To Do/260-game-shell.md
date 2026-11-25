---
id: "260"
title: "Shell-ul jocului și composition root pentru Academia jucabilă"
status: "To Do"
release: "V1"
module: "Integrare joc"
depends_on: []
performance_checks: ["frame","simulation"]
owner: null
started_at: null
completed_at: null
---

# 260 Shell-ul jocului și composition root pentru Academia jucabilă

## Obiectiv

O singură compunere de browser care pornește o sesiune de Academie, avansează toate sistemele pe același tick autoritar și expune porturile UI pentru panourile reale.

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

- [ ] Pornirea din `index.html` ajunge într-o Academie jucabilă, nu doar într-o scenă de randare.
- [ ] Un singur tick autoritar avansează lumea, flota, cursele, economia, learning-ul și misiunile în ordinea declarată.
- [ ] Pauza, focusul pierdut, panourile și reload-ul nu creează un al doilea tick sau o a doua lume.
- [ ] Porturile UI sunt injectate și pot fi înlocuite în teste; compunerea nu importă direct DOM-ul panourilor.
- [ ] O probă în browser WebGPU și WebGL2 pornește, conduce, deschide un panou și revine fără erori de consolă.
- [ ] Costul pe tick și frame este raportat separat și rămâne în bugetul provizoriu al fixture-ului.

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

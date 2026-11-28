---
id: "285"
title: "Decor destructibil, feedback audio și replay în joc"
status: "In Progress"
release: "V1"
module: "Haos"
depends_on: ["282","283"]
performance_checks: ["simulation","assets","memory","frame"]
owner: "loop-pbi/deepseek-285"
started_at: "2026-11-28T11:03:36.128Z"
completed_at: null
---

# 285 Decor destructibil, feedback audio și replay în joc

## Obiectiv

Obiectele ușoare se mișcă sau se rup la impact, feedbackul vizual/audio este clar, iar replay-ul reconstituie evenimentele fără a inventa scor.

## Starea actuală și ce lipsește

- Decorul destructibil 227 nu este conectat la compunerea live.
- Nu există impact, fragmente, sunet sau reset al decorului.
- Nu există audio de motor, coliziune, frânare sau mediu în joc.
- Nu există replay pentru distrugeri și reseturi.
- Nu există plafoane pentru fragmente, voci și obiecte.
- Nu există o probă vizuală/audio pentru distrugere și reset.

## Context și plan

- [Joacă liberă, Haos și distrugere](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [Asseturi vizual și audio](../../Docs/16-asseturi-vizual-si-audio.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 282 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Gardurile, conurile, lăzile și mobilierul ușor se mișcă sau se rup la impact; clădirile și drumul rămân structurale.
- [x] Feedbackul vizual și audio este legat de material și intensitate, cu alternativă vizuală.
- [x] Fragmentele, vocile și obiectele au plafoane și sunt eliberate după durata de viață.
- [x] Replay-ul păstrează evenimentele și reseturile în ordine, fără reevaluare de politică sau recompense.
- [x] Resetul readuce decorul la starea inițială și nu atinge XP-ul sau profilul.
- [x] Costul de simulare, memorie și asseturi este raportat.

## Verificare

- Teste pentru material, prag, deduplicare, replay și reset.
- Probă în browser: impact, sunet, fragmente, reset.
- Verifică plafoanele și cleanup-ul.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-chaos.ts` (`285-live-chaos-v1`) compune planul real 227 (3 zone, 35 de obiecte, 6 arhetipuri), catalogul/reacția 228, recorder-ul 207 și un singur motor 148 peste lumea Rapier 282. Incidentele 028 reale sunt publicate ca `COLLISION` și introduse în 227 cu impuls și instigator real; sursa MANUAL/LEARNING/AUTO este doar numărată, lanțul păstrează instigatorul fizic, iar reluarea este deduplicată. Vizualul Babylon (`src/rendering/babylon/destructible-decor-scene.ts`) are 35 de mesh-uri, un pool de 192 de fragmente cu viață de 120 tick-uri și 4 inele de șoc. Sunetul folosește cele șase profiluri de material 228 pe cue-ul `impact` al lui 148, cu plafoanele 4/14 voci și 8 buffere; înainte de gest nu există context audio, dar HUD-ul și efectul vizual rămân. Resetul publică `WORLD_RESET` în epoch-ul următor, readuce 35 de obiecte/35 de corpuri/35 de collidere/0 fragmente și păstrează XP-ul și checksum-ul profilului (delta 0). 228 repetă chunk-ul 207 în ordine, cu 0 pași de simulare/fizică, 0 reevaluări de politică, 0 recompense și 0 artefacte de învățare. Fereastra fizică este de cel mult 6 obiecte simultan, fiindcă 90 din cele 96 de obstacole numite 028 sunt clădiri; restul obiectelor rămân vizuale/logice, iar un obiect rupt eliberează slotul.

Verificări executate și rezultat: `npm run destructibles:live` 13/13; `npm run destructibles:live:cost` 2 000 de pași (pas live p95 sub 0,2 ms, impact injectat p95 sub 0,6 ms, reset sub 1,8 ms); `npm run destructibles:live:probe` Chrome 157 11/11 (audio RUNNING, PLASTIC/HEAVY, FRAGMENT_BURST, 2 fragmente active, reset 35, XP/profil neschimbate, replay REPLAYED cu 1 distrugere + 1 reset); `tests/destructibles/live-chaos.test.ts`, `tests/destructibles/live-physics-integration.test.ts` și `tests/destructibles/live-chaos-report.test.ts` 12/12; `npm test` 3845 teste, 3831 pass, 0 fail, 14 skip; `npm run typecheck`; `npm run lint`; `npm run format:check`; `npm run build`; `npm run check:architecture`; `npm run composition:report -- --check`; `npm run docs:check -- --check`.

Fișiere și documente actualizate: `src/app/live-chaos.ts`, `src/destructibles/index.ts`, `src/rendering/babylon/destructible-decor-scene.ts`, `src/rendering/babylon/v3-composition-scene.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/main.ts` (audio, compunere, reset, HUD, debug), `src/vehicles/rapier/live.ts` și `src/vehicles/index.ts` (port aditiv de obstacole 028 + incidente), `package.json`, `scripts/run-live-chaos-report.mjs`, `scripts/run-live-chaos-cost.mjs`, `scripts/run-live-chaos-probe.mjs`, `tests/destructibles/*`, `tests/browser/destructible-chaos/*`, `Docs/26`, `Docs/16`, `Docs/21`, `Docs/31`, `Docs/README`, `Docs/Evidence/285-destructible-audio-replay/*`.

Limitări sau follow-up: fereastra de 6 collidere fizice; audio ambiental nu există în tabelul 148; proba de browser injectează contactul prin aceeași cale și este marcată `PROBE_INJECTED`; integrarea completă în shell și mutarea în Done rămân orchestratorului; FPS/GPU/hardware nu sunt pretinse, iar soak-ul rămâne 287.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '285'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementare locală de sub-agent: decor destructibil live, feedback de material, fragmente, reset și replay; criterii bifate după raportul 13/13, testele țintă 12/12 și proba de browser 11/11. Fișierul rămâne In Progress până la integrarea și mutarea orchestratorului.

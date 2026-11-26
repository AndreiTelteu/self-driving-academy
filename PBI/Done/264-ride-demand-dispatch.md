---
id: "264"
title: "Cereri de curse live, coadă și dispecerizare către flota reală"
status: "Done"
release: "V1"
module: "Flotă și curse"
depends_on: ["262"]
performance_checks: ["simulation"]
owner: "loop-pbi/deepseek-264"
started_at: "2026-11-26T03:50:56.352Z"
completed_at: "2026-11-26T04:55:57.320Z"
---

# 264 Cereri de curse live, coadă și dispecerizare către flota reală

## Obiectiv

Un program de scenariu produce cereri deterministe, iar dispecerul le alocă taxiurilor disponibile cu replanificare și motive închise.

## Starea actuală și ce lipsește

- Modulele 059/060 există, dar nu sunt create în compunerea live.
- Nu există zone de pickup/dropoff active în lumea jucabilă.
- Nu există coadă, cursor de program, politică `REJECT_NEWEST` sau replanificare la asignare.
- Nu există excluderea taxiurilor blocate, avariate sau offline din alegere.
- Nu există legătura dintre starea de sănătate a flotei și cursa activă.
- Nu există o probă de browser cu cereri care apar în timpul condusului.

## Context și plan

- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Cereri de curse](../../Docs/ride-demand.md)
- [Dispecerizare](../../Docs/dispatcher.md)
- [Sănătatea flotei](../../Docs/fleet-health.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 262 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Cererile apar determinist din scenariu și seed, cu pickup/dropoff în zone reale.
- [x] Dispecerul alege taxiul disponibil cu costul real minim și departajează stabil după ID.
- [x] Fiecare asignare replanifică ambele etape și păstrează aceeași cerere până la terminal.
- [x] Un taxi blocat, avariat sau offline nu este propus și este eliberat cu motiv.
- [x] O cerere nu primește două taxiuri, iar resetul nu duplică asignările.
- [x] Costul per pas este plafonat și raportat.

## Verificare

- Raport pe programul real de cereri și flotă.
- Teste pentru taxi indisponibil, replanificare și dublă asignare.
- Probă în browser cu cereri vizibile și taxiuri alocate.

## Dovezi de finalizare

Rezultat implementare: `src/fleet/live-rides.ts` compune 059/060/041 peste flota live de 24 de taxiuri și 32 de civili. Planul determinist are 8 ferestre × 8 cereri = 64 cereri, prima la tick 60, ultima la 533, cu zone reale `sz:`. Dispecerizarea rulează la 10 Hz, cu maximum 2 asignări și 128 căutări de rută per pas, replanifică ambele etape la asignare și alege costul real minim până la pickup cu departajare stabilă după ID. Taxiurile conduse de jucător, blocate, avariate sau offline sunt excluse și eliberate cu `PLAYER_TAKEOVER`, `TAXI_BLOCKED`, `TAXI_DAMAGED` sau `TAXI_REMOVED`. Un `rides` POST_WORLD port este montat în `main.ts`; resetul de sesiune eliberează revendicările și rewindează coada fără identități duplicate. Panoul „Curse” expune read model-ul.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (455 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run ride:live -- --check` — PASS. Teste țintă 19/19 PASS (`live-rides` 10, `live-rides-panel` 2, `game-shell-host` 7). `npm test` integrat: 3.614 teste, 3.600 pass, 0 fail, 14 skip-uri istorice. Raport 39/39 verificări: 25 asignări, 4 eliberări (player/blocked/damaged/offline), 21 cereri/taxiuri active unice, 39 în coadă; reset 21 revendicări eliberate, 0 active, 23 asignări după reset, 0 duplicate. Cost: `live.step` p95 0,785 ms, dispatch-step p95 1,967 ms, 0,376 ms amortizat din bugetul de 8 ms. Browser probe `ride:live:probe` 14/14 PASS, MEASURED, deschidere la tick 85 cu 4 claims active, 64 rânduri de cereri, takeover la tick 102 cu `PLAYER_TAKEOVER`; capturi în `Docs/Evidence/264-live-rides/screenshots/`.

Fișiere și documente actualizate: `src/fleet/live-rides.ts`, `src/fleet/index.ts`, `src/main.ts`, `src/ui/live-rides-panel.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `tests/fleet/live-rides.test.ts`, `tests/fleet/live-rides-report.ts`, `tests/ui/live-rides-panel.test.ts`, `tests/ui/game-shell-host.test.ts`, `scripts/run-live-rides-report.mjs`, `scripts/run-live-rides-probe.mjs`, `package.json`, `Docs/07`, `Docs/21`, `Docs/31`, `Docs/README.md`, `Docs/live-rides.md`, `Docs/dispatcher.md`, `Docs/ride-demand.md`, `Docs/Evidence/264-live-rides/`.

Limitări sau follow-up: Pickup/dropoff fizic, pasagerii, ETA și lifecycle-ul complet rămân 265; asignările sunt revendicări 060, iar taxiurile își păstrează rutele 058. După ce toate cele 24 de taxiuri sunt revendicate, cererile rămân în coadă până le eliberează 265. Costul este proba headless a subsistemului, nu FPS/GPU/hardware. Proba de browser a folosit Chrome instalat prin `PLAYWRIGHT_MODULE`; `shell:probe` nu a fost rerulat pentru noile butoane, iar suita shell/unitate trece. Node local 24.19.0, sub engine-ul declarat `>=24.21.0`.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '264'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-264`; integrat, verificat și mutat în Done.

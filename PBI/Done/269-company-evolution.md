---
id: "269"
title: "Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri"
status: "Done"
release: "V1"
module: "Companie"
depends_on: ["268"]
performance_checks: ["simulation"]
owner: "loop-pbi/deepseek-269"
started_at: "2026-11-26T21:07:11.866Z"
completed_at: "2026-11-26T22:22:22.977Z"
---

# 269 Evoluția companiei: nivel, achiziții de vehicule și upgrade-uri

## Obiectiv

Profitul reinvestit crește nivelul companiei și permite achiziții/upgrade-uri cu cost, efect și stare explicite, fără a atinge XP-ul.

## Starea actuală și ce lipsește

- Nu există praguri de nivel de companie sau valoare de companie.
- Nu există achiziție de vehicule noi în flotă și nici capacitate de flotă.
- Nu există upgrade-uri cu efecte măsurabile și versionate.
- Nu există refuz pentru fonduri insuficiente sau upgrade deja deținut.
- Nu există persistență pentru nivel, achiziții și upgrade-uri.
- Nu există o regulă care să împiedice un upgrade să modifice ascuns stilul învățat.

## Context și plan

- [Companie: profit și evoluție](../../Docs/32-companie-profit-si-evolutie.md)
- [Misiuni și progres](../../Docs/13-misiuni-si-progres.md)
- [Misiuni zilnice și XP](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 268 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Nivelul companiei este o funcție monotonă de profitul reinvestit, separat de nivelul XP.
- [x] O achiziție adaugă un vehicul real în flotă, cu cost scăzut din cash și slot respectat.
- [x] Un upgrade are cost, efect declarat și versionat; efectul este vizibil în perioada următoare.
- [x] Cash-ul nu poate deveni negativ; o achiziție refuzată nu schimbă nimic.
- [x] Nivelul companiei, achizițiile și upgrade-urile se salvează și se restaurează prin snapshot/restore; fișierul durabil rămâne 278.
- [x] Un upgrade nu produce o versiune de profil fără o cale explicită și nu atinge XP-ul.

## Verificare

- Teste pentru praguri, cash insuficient, upgrade duplicat și efectul din perioada următoare.
- Scenariu de achiziție urmat de reload și de import de sesiune.
- Verifică independența față de XP și profilul de driving.

## Dovezi de finalizare

Rezultat implementare: `src/economy/company-evolution.ts` (`269-company-evolution-v1`) leagă ledgerul 268 de evoluția companiei: niveluri monotone din profit reinvestit (0/5.000/15.000/35.000/70.000/120.000 SDA), catalog versionat de achiziții și upgrade-uri, costuri scăzute din cash, sloturi și capacitate respectate, efecte de upgrade cu `basisPoints` și aplicare din perioada următoare. O achiziție adaugă un vehicul real în același registry 057/058 și în compunerea live; un upgrade reduce costul de serviciu declarat. Snapshot/restore păstrează nivelul, cash-ul, achizițiile, upgrade-urile și slotul; un restore deja persistat de 278 este adoptat fără dublă achiziție. XP, profilul și stilul rămân identice; nu există suprafață de override de stil sau al doilea fleet.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (464 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run company:evolution -- --check` — PASS. Teste țintă 24/24. `npm test` integrat: 3.671 teste, 3.657 pass, 0 fail, 14 skip-uri istorice. Raport determinist 66/66: nivel 1→2 la 5.220 SDA reinvestit; achiziție `offer-city-compact-1` 12.000 SDA, slot 21, `compact`, flotă 20→21; upgrade `upgrade-service-contract` 8.000 SDA, 5.000 bp, efectiv tick 2.160.000, serviciu 40→20 SDA; cash 55.220→43.220, apoi final 36.110; fleet value 12.000; reload 1 purchase + 1 upgrade, level 2→2, cash 35.655→35.655, slot 21→21; refuzuri pentru cash insuficient, nivel insuficient și duplicate neschimbă nimic. XP 0/0, level 1/1, entries 0/0; style checksum neschimbat; `xpWrites/profileWrites/styleOverrides/economyWrites` 0, `investmentWrites` 2, `historyScans` 0. Cost read p95 0,0192 ms, modified-ride p95 0,0190 ms, sub 8 ms. Browser probe `NOT_RUN` din lipsă Playwright.

Fișiere și documente actualizate: `src/economy/company-evolution.ts`, `src/economy/company-finance.ts`, `src/economy/index.ts`, `src/fleet/registry.ts`, `src/fleet/civil-traffic.ts`, `src/app/ambient-traffic.ts`, `src/app/walking-composition.ts`, `src/main.ts`, tests economy/fleet/app, `scripts/run-company-evolution-report.mjs`, `run-company-evolution-cost.mjs`, `run-company-evolution-probe.mjs`, `package.json`, `Docs/07`, `Docs/31`, `Docs/32`, `Docs/Evidence/269-company-evolution/`.

Limitări sau follow-up: Valorile de nivel, cost și efect sunt propuneri de calibrare. Fleet value este suma de achiziție, fără depreciere sau revânzare în V1. Upgrade-urile reduc doar costuri operaționale; nu ating fizica, KPI 209 sau profilurile de condus. Panoul companiei rămâne 270. Persistarea în fișier, reload-ul browserului și importul atomic rămân 278; 269 expune snapshot/restore. Jurnalul 269 este per sesiune, iar flota live este un singur registry 057 partajat; ownership-ul/persistarea per sesiune rămân 278. Browser probe `NOT_RUN` din lipsă Playwright; Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '269'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-27: Implementat de `loop-pbi/deepseek-269`; integrat, verificat și mutat în Done.

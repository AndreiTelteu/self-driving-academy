---
id: "268"
title: "Modelul financiar al companiei: costuri, profit, cash și P&L"
status: "Done"
release: "V1"
module: "Companie"
depends_on: ["266"]
performance_checks: ["simulation"]
owner: "loop-pbi/deepseek-268"
started_at: "2026-11-26T20:22:23.940Z"
completed_at: "2026-11-26T21:05:52.492Z"
---

# 268 Modelul financiar al companiei: costuri, profit, cash și P&L

## Obiectiv

O companie are un ledger propriu în care revenue-ul real este redus cu costuri versionate, iar profitul, cash-ul și raportarea lunară sunt consecințe calculabile.

## Starea actuală și ce lipsește

- Docs/22 și manualul exclud explicit costurile de operare și profitul.
- Nu există entitate `Company`, ledger de costuri, cash sau valoare de flotă.
- Nu există costuri pe cursă (energie, mentenanță, incident, serviciu) sau costuri fixe lunare.
- Nu există legătura dintre daune, kilometraj și cost.
- Nu există raport lunar revenue/costuri/profit și nici idempotență pe cursă.
- Nu există separarea formală față de XP și față de ledgerul 209.

## Context și plan

- [Companie: profit și evoluție](../../Docs/32-companie-profit-si-evolutie.md)
- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Savefile și integritate](../../Docs/29-savefile-si-integritate.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 266 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] Un ledger de companie calculează `profit = revenue - costuri` și păstrează separat cash-ul.
- [x] Fiecare cursă terminală produce exact o intrare de cost, idempotentă, cu referință la `rideId`.
- [x] Costurile fixe lunare sunt aplicabile și pot produce profit negativ real, fără a fi confundate cu lipsa datelor.
- [x] O rambursare sau anulare ajustează costul fără să rescrie istoricul.
- [x] Compania nu are nicio cale către ledgerul XP; profitul negativ nu retrage XP.
- [x] Documentația 32 este actualizată la starea confirmată și valorile rămân marcate ca propuneri.

## Verificare

- Teste de contract pentru profit, cash, cost fix, duplicat și refund.
- Scenariu cu o cursă profitabilă, una în pierdere și o lună fără curse.
- Verifică amprenta XP înainte/după toate scenariile.

## Dovezi de finalizare

Rezultat implementare: `src/economy/company-finance.ts` (`268-company-ledger-v1`) deține un ledger separat de 209: costuri versionate pe cursă (energie, mentenanță, incident, serviciu) și costuri fixe lunare (asigurare, salarii, licențe), profit, cash, P&L lunar și ajustări semnate pentru refund/anulare. Fiecare cursă terminală produce o singură intrare imuabilă, idempotentă pe `rideId`; o ajustare referă intrarea originală fără să o rescrie. Portul live `268-live-company-finance-v1` consumă settle-urile 209 acceptate și numărul real de incidente din `review.evidence.impacts`. Nu există suprafață de purchase/upgrade, scriere XP sau scriere 209. Docs/32 și Docs/22 descriu boundary-ul implementat, iar valorile rămân propuneri de calibrare.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (463 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run company:finance -- --check` — PASS. Teste țintă 15/15. `npm test` integrat: 3.655 teste, 3.641 pass, 0 fail, 14 skip-uri istorice. Raport determinist 50/50: cursă profitabilă revenue 551, cost 148 (energie 62, mentenanță 46, serviciu 40), profit +403; cursă cu incident revenue 551, cost 2.648, profit −2.097; anulare fără pasager cost brut 40, ajustare −40, net 0, intrarea originală rămâne 40; lună fără curse revenue 0, cost fix 4.000, profit −4.000, `hasRideData: false`; lună cu curse revenue 551, cost 4.148, profit −3.597, cash 46.403; duplicat `applied 0`, `duplicates 1`, entries 1/1, revenue 551/551. Amprente 209: revenue 551/551, settlements 1/1, reviews 1/1, day revenue 551/551, `historyScans` 0/0. XP: balance 0/0, level 1/1, entries 0/0, debits 0; `xpWrites/economyWrites/investmentWrites` 0. Cost 2.700 eșantioane, p95 0,0157 ms, sub 8 ms. Browser probe `NOT_RUN` pentru că Playwright nu este instalat în worktree.

Fișiere și documente actualizate: `src/economy/company-finance.ts`, `src/economy/index.ts`, `src/main.ts`, `tests/economy/company-finance.test.ts`, `company-finance-live.test.ts`, `company-finance-report.test.ts`, `company-finance-report.ts`, `company-finance-cost.ts`, `live-economy-fixture.ts`, `scripts/run-company-finance-report.mjs`, `run-company-finance-cost.mjs`, `run-company-finance-probe.mjs`, `package.json`, `Docs/22`, `Docs/32`, `Docs/Evidence/268-company-finance/`.

Limitări sau follow-up: Costurile folosesc distanța planificată 061, nu un odometru real; 061 nu expune odometru, deci este o estimare explicită. Costul de incident vine din dovezile review-ului; fără impact nu se inventează. Dashboard-ul companiei (270), evoluția/achizițiile/upgrade-urile (269) și persistarea (278) rămân taskuri separate. Costul este proba headless a subsistemului, nu FPS/GPU/hardware. Browser probe `NOT_RUN` din lipsa Playwright; Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '268'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-26: Implementat de `loop-pbi/deepseek-268`; integrat, verificat și mutat în Done.

---
id: "268"
title: "Modelul financiar al companiei: costuri, profit, cash și P&L"
status: "To Do"
release: "V1"
module: "Companie"
depends_on: ["266"]
performance_checks: ["simulation"]
owner: null
started_at: null
completed_at: null
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

- [ ] Un ledger de companie calculează `profit = revenue - costuri` și păstrează separat cash-ul.
- [ ] Fiecare cursă terminală produce exact o intrare de cost, idempotentă, cu referință la `rideId`.
- [ ] Costurile fixe lunare sunt aplicabile și pot produce profit negativ real, fără a fi confundate cu lipsa datelor.
- [ ] O rambursare sau anulare ajustează costul fără să rescrie istoricul.
- [ ] Compania nu are nicio cale către ledgerul XP; profitul negativ nu retrage XP.
- [ ] Documentația 32 este actualizată la starea confirmată și valorile rămân marcate ca propuneri.

## Verificare

- Teste de contract pentru profit, cash, cost fix, duplicat și refund.
- Scenariu cu o cursă profitabilă, una în pierdere și o lună fără curse.
- Verifică amprenta XP înainte/după toate scenariile.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '268'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

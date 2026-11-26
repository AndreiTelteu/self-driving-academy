---
id: "266"
title: "Economia live: revenue, review-uri, KPI și ceasul economic"
status: "In Progress"
release: "V1"
module: "Economie"
depends_on: ["265"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-266"
started_at: "2026-11-26T17:35:32.357Z"
completed_at: null
---

# 266 Economia live: revenue, review-uri, KPI și ceasul economic

## Obiectiv

Fiecare cursă terminală produce exact o decontare și un review când experiența este evaluabilă, iar KPI-urile se agregă pe ziua și luna simulată.

## Starea actuală și ce lipsește

- `createFleetEconomy` nu este instanțiat în compunerea live.
- Nu există ceas economic, zi/lună simulată sau expunere care să hrănească KPI-urile.
- Nu există review-uri reale din cursele jucătorului sau din taxiurile AI.
- Nu există legătura dintre incidente/confomfort și rating.
- Nu există idempotență vizibilă între reload, reluare și dubla livrare.
- Nu există o probă de browser cu revenue și rating după o cursă.

## Context și plan

- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Indicatorii de serviciu](../../Docs/metric-service.md)
- [Indicatorii de comportament](../../Docs/behavior-metrics.md)
- [Indicatorii de confort](../../Docs/comfort-metrics.md)
- [Savefile și integritate](../../Docs/29-savefile-si-integritate.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 265 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] COMPLETED încasează tariful complet o singură dată; FAILED/CANCELLED respectă regulile versionate.
- [ ] Civilii nu ajung niciodată în revenue, curse sau review-uri.
- [ ] Un review există cel mult o dată per cursă evaluabilă, cu motiv din vocabularul închis.
- [ ] Bucketurile de zi și lună păstrează revenue, curse, review-uri, `ratingSum`, histogramă și expunere.
- [ ] Pauza și focusul suspendă ceasul economic; offline nu produce revenue.
- [ ] `historyScans` rămâne `0`, iar un eveniment duplicat nu schimbă nimic.

## Verificare

- Raport determinist pe curse mixte, anulări, review-uri și reload.
- Probă în browser: o cursă produce revenue și rating vizibil.
- Verifică idempotența și `historyScans` înainte/după panou.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '266'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

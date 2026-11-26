---
id: "270"
title: "Panoul companiei: profit, costuri, cash, flotă și investiții"
status: "In Progress"
release: "V1"
module: "Interfață"
depends_on: ["268","269"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-270"
started_at: "2026-11-26T22:23:58.119Z"
completed_at: null
---

# 270 Panoul companiei: profit, costuri, cash, flotă și investiții

## Obiectiv

Un panou read-only pentru finanțe și un flux de investiții permit jucătorului să vadă profitul, costurile, cash-ul și efectul achizițiilor.

## Starea actuală și ce lipsește

- Nu există buton sau dialog „Companie”.
- Nu există grafic revenue/costuri/profit pe lună și tabel pe perioade.
- Nu există detaliere pe categorie de cost și pe cursă.
- Nu există listă de achiziții/upgrade-uri cu cost, efect și stare.
- Nu există mesaje pentru fonduri insuficiente, nivel insuficient sau upgrade deținut.
- Nu există reguli de focus, Escape, Tab și cost când panoul este închis.

## Context și plan

- [Companie: profit și evoluție](../../Docs/32-companie-profit-si-evolutie.md)
- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Accesibilitatea interfeței](../../Docs/ui-accessibility.md)
- [Layout responsive](../../Docs/responsive-layout.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 268 trebuie să fie Done înainte de începere.
- 269 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Panoul arată revenue, costuri, profit, cash, valoare de flotă și nivel companie.
- [ ] O lună fără date este `null`/„fără date”, iar un profit zero sau negativ real este afișat ca atare.
- [ ] Graficul și tabelul folosesc aceleași agregate, fără medii ale mediilor.
- [ ] Achiziția/upgrade-ul afișează costul, efectul și confirmarea; fondurile insuficiente blochează acțiunea.
- [ ] Focusul, Tab, Escape și pauza respectă regulile celorlalte panouri.
- [ ] Panoul închis nu citește ledgerul și nu randează.

## Verificare

- Teste de proiecție, zero vs fără date, refuz de fonduri și upgrade duplicat.
- Probă în browser: deschide panoul, cumpără un upgrade, verifică profitul perioadei următoare.
- Verifică accesibilitatea și costul UI.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '270'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

---
id: "267"
title: "Panoul KPI, tabloul orașului și feedbackul consecințelor în joc"
status: "In Progress"
release: "V1"
module: "Interfață"
depends_on: ["266"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-267"
started_at: "2026-11-26T23:15:14.627Z"
completed_at: null
---

# 267 Panoul KPI, tabloul orașului și feedbackul consecințelor în joc

## Obiectiv

Jucătorul vede revenue, rating, curse, review-uri, distribuție și consecințe reale, cu perioade, eșantioane și stări „fără date” corecte.

## Starea actuală și ce lipsește

- `createKpiHistory`, `createCityDashboard` și `createKpiImpactHud` nu sunt apelate din shell.
- Nu există buton „KPIs” sau hotkey `K` în jocul live.
- Nu există grafice lunare, tabel zilnic și distribuție 0–5 montate.
- Nu există tabloul orașului cu incidente, blocaje și confort.
- Nu există feedback scurt după o scădere de KPI, fără mesaj de pierdere XP.
- Nu există verificarea focusului, Escape, Tab și a costului când panoul este închis.

## Context și plan

- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- [Tabloul orașului](../../Docs/city-dashboard.md)
- [Accesibilitatea interfeței](../../Docs/ui-accessibility.md)
- [Layout responsive](../../Docs/responsive-layout.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 266 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Butonul KPIs și `K` deschid dialogul cu 12 luni, lună parțială, proiecție și „fără date” distinct de zero.
- [ ] Tabloul orașului arată cei șapte indicatori și incidentele reale, fără valori inventate.
- [ ] Feedbackul de consecințe apare după o schimbare reală și nu promite niciodată pierdere de XP.
- [ ] Focusul intră în dialog, Tab rămâne în interior, Escape închide și readuce focusul.
- [ ] Panoul închis nu citește ledgerul și nu randează; `historyScans` rămâne `0`.
- [ ] Layout-ul rămâne lizibil la 1280×720 și pe zoom, fără suprapuneri.

## Verificare

- Teste de proiecție și accesibilitate pentru panouri.
- Probă în browser: deschide KPI, inspectează o lună fără date, închide cu Escape.
- Verifică `historyScans`, citirile și randările când panoul este închis.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '267'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

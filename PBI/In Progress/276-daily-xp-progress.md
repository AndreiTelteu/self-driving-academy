---
id: "276"
title: "Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc"
status: "In Progress"
release: "V1"
module: "Progres"
depends_on: ["260","265","271"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-276"
started_at: "2026-11-27T14:12:10.722Z"
completed_at: null
---

# 276 Trei misiuni zilnice, XP, nivel și progresul jucătorului în joc

## Obiectiv

Exact trei misiuni zilnice rulează pe ziua reală, XP-ul se acumulează idempotent din misiuni și timp activ, iar nivelul nu scade niciodată.

## Starea actuală și ce lipsește

- Nu există generator daily, calendar sau panou montat în shell.
- Nu există ledger XP, credit de misiune, credit daily sau timp activ.
- Nu există nivel, istoric XP sau afișare a soldului.
- Nu există excluderea pauzei, focusului, background-ului, AFK și Haos.
- Nu există reconciliere după reload, schimbare de zi sau ceas inversat.
- Nu există feedback fără mesaje de pierdere XP.

## Context și plan

- [Misiuni zilnice și XP](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [Misiuni și progres](../../Docs/13-misiuni-si-progres.md)
- [KPI-uri, economie și review-uri](../../Docs/22-kpi-economie-si-review-uri.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] La prima intrare a zilei există exact trei misiuni, cel puțin una MANUAL fără learning; reload-ul nu le rerandomizează.
- [ ] XP-ul din misiuni, daily și timp activ este idempotent, cu fracții exacte și fără credit negativ.
- [ ] Nivelul este derivat monoton din sold și nu scade la KPI, accident, misiune eșuată sau zi ratată.
- [ ] Panoul arată XP, nivel, istoric, cele trei obiective, fereastra și motivul expirării.
- [ ] Pauza, background-ul, focusul pierdut, AFK și Haos nu acordă XP Academie.
- [ ] O probă în browser arată o misiune zilnică completată și soldul XP actualizat.

## Verificare

- Teste pentru trei daily, DST, rollback, expirare și duplicat.
- Probă în browser: completează un obiectiv, verifică XP și nivelul.
- Verifică amprenta XP după KPI negativ și misiune eșuată.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '276'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

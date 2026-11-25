---
id: "275"
title: "Campania, tutorialul și panoul de misiuni în jocul live"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["260","265","271"]
performance_checks: ["simulation","ui"]
owner: null
started_at: null
completed_at: null
---

# 275 Campania, tutorialul și panoul de misiuni în jocul live

## Obiectiv

Cele opt etape de campanie și tutorialul „primul taxi” rulează din evenimente reale, iar panoul arată obiective, progres, eșec și reluare.

## Starea actuală și ce lipsește

- Nu există tracker de campanie în compunerea live.
- Nu există tutorialul de cinci pași și nici separarea lui de învățare.
- Nu există panou de misiuni montat și nici buton în shell.
- Nu există ferestre de evaluare, buget de incidente sau motive de eșec live.
- Nu există recompense idempotente și nici reluare fără dublare.
- Nu există o probă de browser pentru etapa 1 și etapa 2.

## Context și plan

- [Misiuni și progres](../../Docs/13-misiuni-si-progres.md)
- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 265 trebuie să fie Done înainte de începere.
- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Campania pornește și obiectivele se calculează exclusiv din evenimente reale, nu din textul HUD.
- [ ] Tutorialul parcurge cei cinci pași, nu produce learning și poate fi pus pe pauză sau sărit.
- [ ] Panoul arată starea reală, progresul, fereastra, bugetul, motivul de eșec și reluarea disponibilă.
- [ ] O misiune finalizată acordă recompensa o singură dată; o reluare nu dublează.
- [ ] Eșecul păstrează profilul învățat și nu retrage XP.
- [ ] O probă în browser arată etapa 1 completă și o misiune eșuată cu motiv.

## Verificare

- Teste pentru obiective, fereastră, buget, duplicat și replay.
- Probă în browser: tutorial, prima cursă, panoul de misiuni.
- Verifică recompensele și progresul după reload.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '275'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

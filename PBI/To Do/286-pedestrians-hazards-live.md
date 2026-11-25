---
id: "286"
title: "Pietoni, treceri și pericole V2 în lumea live"
status: "To Do"
release: "V2"
module: "Pietoni și pericole"
depends_on: ["282","283"]
performance_checks: ["simulation","frame"]
owner: null
started_at: null
completed_at: null
---

# 286 Pietoni, treceri și pericole V2 în lumea live

## Obiectiv

Pietonii traversează, mașinile cedează, pericolele produc reacție reală, iar contexte pentru learning și provocări sunt observabile.

## Starea actuală și ce lipsește

- Nu există pietoni în lumea live.
- Nu există treceri active, faze de traversare sau yield observabil.
- Nu există obstacole/pericole cu reacție și evitare.
- Nu există contexte V2 pentru estimatoare și provocări.
- Nu există o probă de browser cu pieton, yield și obstacol.
- Nu există costul pentru 96 de pietoni/obstacole.

## Context și plan

- [Extensii și mers pe jos](../../Docs/20-extensii-si-mers-pe-jos.md)
- [Autonomie și trafic](../../Docs/06-autonomie-si-trafic.md)
- [Zonele de trecere](../../Docs/crosswalk-zones.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 282 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Pietonii apar pe treceri reale și traversează cu o fază observabilă.
- [ ] Un vehicul care cedează este dovedit prin ordinea reală a tick-urilor, nu printr-un text.
- [ ] Un pieton neobservat nu produce o dovadă de yield.
- [ ] Obstacolele/pericolele produc reacție și evitare în aceeași fizică, fără un al doilea solver.
- [ ] Contextul V2 este disponibil estimatoarelor și provocărilor.
- [ ] Costul pentru 96 de pietoni/obstacole este raportat.

## Verificare

- Probe pentru traversare, yield, obstacol și context.
- Probă în browser: pieton, frânare, obstacol, ocolire.
- Măsurare și cleanup.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '286'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

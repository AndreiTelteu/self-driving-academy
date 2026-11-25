---
id: "264"
title: "Cereri de curse live, coadă și dispecerizare către flota reală"
status: "To Do"
release: "V1"
module: "Flotă și curse"
depends_on: ["262"]
performance_checks: ["simulation"]
owner: null
started_at: null
completed_at: null
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

- [ ] Cererile apar determinist din scenariu și seed, cu pickup/dropoff în zone reale.
- [ ] Dispecerul alege taxiul disponibil cu costul real minim și departajează stabil după ID.
- [ ] Fiecare asignare replanifică ambele etape și păstrează aceeași cerere până la terminal.
- [ ] Un taxi blocat, avariat sau offline nu este propus și este eliberat cu motiv.
- [ ] O cerere nu primește două taxiuri, iar resetul nu duplică asignările.
- [ ] Costul per pas este plafonat și raportat.

## Verificare

- Raport pe programul real de cereri și flotă.
- Teste pentru taxi indisponibil, replanificare și dublă asignare.
- Probă în browser cu cereri vizibile și taxiuri alocate.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '264'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

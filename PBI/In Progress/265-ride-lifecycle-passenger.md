---
id: "265"
title: "Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD"
status: "In Progress"
release: "V1"
module: "Flotă și curse"
depends_on: ["264"]
performance_checks: ["simulation","frame"]
owner: "loop-pbi/deepseek-265"
started_at: "2026-11-26T04:58:00.520Z"
completed_at: null
---

# 265 Ciclul complet al cursei: pickup, dropoff, pasager, ETA și HUD

## Obiectiv

O cursă reală trece prin `TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED`, cu pasager vizibil, ETA și motive terminale.

## Starea actuală și ce lipsește

- Modulele 061–064 și pasagerul 147 există, dar nu sunt compuse în browser.
- Nu există marcaje de pickup/dropoff, pasager, boarding sau dropoff în lume.
- Nu există HUD de cursă cu pickup, destinație, ETA, progres și stare.
- Nu există păstrarea cursei la schimbarea modului sau a vehiculului.
- Nu există rezultate `FAILED`/`CANCELLED` cu motive și eliberare de revendicare.
- Nu există o probă de browser pentru o cursă completă condusă manual și autonom.

## Context și plan

- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Lifecycle-ul cursei](../../Docs/ride-fsm.md)
- [Pickup](../../Docs/pickup.md)
- [Dropoff](../../Docs/dropoff.md)
- [ETA și progres](../../Docs/eta.md)
- [Pasageri simplificați](../../Docs/passenger-visual.md)
- [HUD](../../Docs/hud.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 264 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Pickup-ul și dropoff-ul se acceptă numai în zona reală, sub pragul de viteză și după durata cerută.
- [ ] Pasagerul este vizibil la pickup, rămâne la bord și dispare la dropoff; un marker lipsă este omisiune motivată.
- [ ] Cursa supraviețuiește schimbării AUTO/MANUAL/LEARNING și selecției altui vehicul.
- [ ] HUD-ul arată pickup, destinație, ETA, progres și motivul unei stări indisponibile, niciodată `0` inventat.
- [ ] O cursă terminală eliberează exact o revendicare și nu poate fi închisă de două ori.
- [ ] O probă în browser arată cel puțin o cursă completă și una eșuată cu motiv.

## Verificare

- Teste de contract pentru pickup/dropoff, pasager și ETA.
- Probă în browser: cursă completă în MANUAL și în AUTO.
- Verifică HUD-ul, pasagerul, revendicarea și cleanup-ul.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '265'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

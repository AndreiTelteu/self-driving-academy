---
id: "272"
title: "Telemetrie, oportunități și eligibilitate din condusul live"
status: "In Progress"
release: "V1"
module: "Moduri și learning"
depends_on: ["271"]
performance_checks: ["simulation","memory"]
owner: "loop-pbi/deepseek-272"
started_at: "2026-11-27T02:07:43.902Z"
completed_at: null
---

# 272 Telemetrie, oportunități și eligibilitate din condusul live

## Obiectiv

Fiecare segment live produce eșantioane 085, oportunități 086, ferestre 087 și artefacte 088, cu deduplicare și fără muncă pe hot path.

## Starea actuală și ce lipsește

- Nu există writer de telemetrie conectat la condusul jucătorului.
- Nu există oportunități STOP/semnal/urmărire/bandă din contextul real al lumii live.
- Nu există ferestre de eligibilitate și nici excluderea pauzelor, focusului și teleportărilor.
- Nu există deduplicare pe `opportunity.id + occurrence`.
- Nu există includerea taxiurilor și civililor din afara camerei.
- Nu există un cost măsurat pentru înregistrare și nici un buffer mărginit.

## Context și plan

- [Telemetrie și oportunități](../../Docs/09-telemetrie-si-oportunitati.md)
- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Eșantioanele la tick](../../Docs/telemetry-samples.md)
- [Dovezile de learning](../../Docs/learning-evidence.md)
- [Indicatorii de comportament](../../Docs/behavior-metrics.md)
- [Regresiile de intervenție](../../Docs/learning-edgecases.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 271 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Un segment live produce eșantioane la 60 Hz, cu input brut, comandă filtrată, viteză, bandă, semnal și clasă.
- [ ] Oportunitățile vin din contextul real și sunt deduplicate pe identitate și ocurență, nu pe cadre.
- [ ] Pauza, focusul pierdut și teleportarea produc artefacte și nu devin dovezi de stil.
- [ ] MANUAL rămâne în metrici, dar nu devine demonstrație eligibilă.
- [ ] Toate taxiurile și civilii contribuie, indiferent de cameră sau selecție.
- [ ] Bufferul este mărginit, hot path-ul nu serializează JSON per tick, iar costul este raportat.

## Verificare

- Teste pe fixture-ul real 044/036/025/023 și pe segmente închise.
- Verifică deduplicarea, artefactele și numitorii.
- Măsoară costul p95 per tick și memoria bufferului.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '272'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

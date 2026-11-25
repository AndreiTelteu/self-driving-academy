---
id: "263"
title: "Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["262"]
performance_checks: ["ui","frame"]
owner: null
started_at: null
completed_at: null
---

# 263 Selectarea oricărui taxi sau civil, camera și un singur scaun PLAYER

## Obiectiv

Jucătorul poate selecta orice taxi sau mașină civilă, camera se mută, iar preluarea explicită păstrează un singur vehicul condus și ruta/cursea celui părăsit.

## Starea actuală și ce lipsește

- Nu există panoul flotei, lista de taxiuri, filtrele sau sortarea în jocul live.
- Nu există selecție pe minimapă/hartă și nici intenția `WORLD` către autoritate.
- Mașinile AI refuză intrarea cu `AI_TRAFFIC`; „orice mașină” din Docs/01 nu este îndeplinit.
- Nu există păstrarea rutei/cursei vehiculului părăsit și nici revenirea lui în AUTO.
- Nu există verificarea unui singur scaun `PLAYER` la tranziții rapide.
- Nu există comportament de focus, pauză și Escape pentru panoul de flotă.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Panoul flotei](../../Docs/fleet-panel.md)
- [Selectarea prin hartă](../../Docs/map-selection.md)
- [Schimbarea vehiculului](../../Docs/vehicle-switch.md)
- [Pickingul vehiculelor](../../Docs/vehicle-picking.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 262 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Lista și harta arată toate taxiurile și civilii, cu identitate stabilă și filtre disponibile/în cursă/blocate.
- [ ] Un click sau Enter/Space selectează numai camera; vehiculul rămâne în AUTO până la `M`/`L` explicit.
- [ ] Preluarea unui vehicul eliberează vehiculul vechi în AUTO și păstrează ruta/cursea lui.
- [ ] O mașină AI poate fi preluată după reconcilierea poziției, fără teleport și fără dublă autoritate.
- [ ] Maximum un vehicul este sub controlul jucătorului în orice tick.
- [ ] Panoul respectă focusul, Tab, Escape, pauza și nu fură tastele de condus.

## Verificare

- Teste de contract pentru selecție, tranziție și un singur scaun.
- Probă în browser: listă, hartă, click, `M`, `L`, revenire.
- Verifică ruta/cursea vehiculului părăsit și costul UI.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '263'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

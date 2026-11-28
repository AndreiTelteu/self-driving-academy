---
id: "284"
title: "Traficul civil complet autonom și preluarea oricărei mașini"
status: "In Progress"
release: "V1"
module: "Trafic"
depends_on: ["262","283"]
performance_checks: ["simulation"]
owner: "loop-pbi/deepseek-284"
started_at: "2026-11-28T08:59:54.576Z"
completed_at: null
---

# 284 Traficul civil complet autonom și preluarea oricărei mașini

## Obiectiv

Civilii folosesc întregul lanț de context/politică, respectă regulile, iar jucătorul poate prelua orice mașină fără teleport sau rută pierdută.

## Starea actuală și ce lipsește

- Traficul civil live are context incomplet (`signals: []`, fără obstacole/zone).
- Nu folosește semafoare, STOP, prioritate, yield, benzi sau recuperare.
- Nu poate fi preluat de jucător; `requestEntry` îl refuză.
- Nu există reconcilierea rutei la preluare și nici reluarea ei la ieșire.
- Nu există paritate taxi/civil pentru profilul comun și pentru moduri.
- Nu există o probă de browser cu preluarea unui civil AI.

## Context și plan

- [Flotă și curse](../../Docs/07-flota-si-curse.md)
- [Traficul civil](../../Docs/civil-traffic.md)
- [Traficul AI din browser](../../Docs/browser-ai-traffic.md)
- [Schimbarea vehiculului](../../Docs/vehicle-switch.md)
- [Cursa completă și intervenția](../../Docs/manual-trip.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 262 trebuie să fie Done înainte de începere.
- 283 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Toți civilii folosesc contextul complet și politicile de semafor, STOP, prioritate, yield și bandă.
- [ ] Un civil poate fi preluat de jucător; ruta lui este suspendată, nu duplicată.
- [ ] La ieșire, civilul revine în AUTO și își reia ruta fără teleport.
- [ ] Profilul comun se aplică identic taxiurilor și civililor, iar un vehicul ascuns continuă simularea.
- [ ] Un vehicul nou creat nu dublează un ID și nu apare peste jucător.
- [ ] Costul pentru 24–40 de civili rămâne în buget.

## Verificare

- Teste pentru preluare, suspendare de rută, reluare și paritate.
- Probă în browser: oprește un civil AI, intră în el, condu-l, ieși, verifică reluarea.
- Verifică semafoarele și costul.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '284'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

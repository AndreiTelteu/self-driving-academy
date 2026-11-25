---
id: "282"
title: "Fizica Rapier live pentru jucător și AI"
status: "To Do"
release: "V1"
module: "Fizică"
depends_on: ["260","262"]
performance_checks: ["simulation","frame"]
owner: null
started_at: null
completed_at: null
---

# 282 Fizica Rapier live pentru jucător și AI

## Obiectiv

Jucătorul și AI-ul folosesc aceeași fizică Rapier și același controller, cu roți, frânare, contacte, daune și recuperare reale.

## Starea actuală și ce lipsește

- Compunerea live folosește `driveVehicle` cinematic, nu adaptorul Rapier 022/024.
- Nu există corpuri fizice, roți, suspensie sau contacte reale în joc.
- Nu există daune, avarii sau recuperare fizică în compunerea live.
- Nu există paritate player/AI pe aceeași comandă și aceeași suprafață.
- Nu există calibrare sedan/compact în jocul live.
- Nu există o probă de browser cu impact, frânare și revenire fără penetrare.

## Context și plan

- [Vehicule și fizică](../../Docs/05-vehicule-si-fizica.md)
- [Adaptorul fizic](../../Docs/physics-adapter.md)
- [Controllerul vehiculului](../../Docs/vehicle-controller.md)
- [Dinamica roților](../../Docs/wheel-dynamics.md)
- [Daunele vehiculului](../../Docs/vehicle-damage.md)
- [Recuperarea vehiculului](../../Docs/vehicle-recovery.md)
- [Calibrarea fizicii](../../Docs/physics-calibration.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 262 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] PLAYER și AUTONOMY aplică aceeași comandă prin același controller Rapier, la același tick fizic.
- [ ] Roțile, suspensia, frânarea și contactele sunt reale; nu există penetrare sau teleport la contact.
- [ ] Daunele și recuperarea sunt consecințe fizice, nu stări inventate de UI.
- [ ] Schimbarea modului sau a vehiculului păstrează poziția, viteza și yaw-ul fără salt.
- [ ] Sedanul și compactul au diferențe măsurate pe aceeași suprafață.
- [ ] Costul fizicii rămâne în buget și este raportat separat de render.

## Verificare

- Probe native Rapier pentru frânare, viraj, contact și recuperare.
- Probă în browser: impact, oprire, revenire, schimbare de mod.
- Măsurare tick/frame înainte/după și cleanup.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '282'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

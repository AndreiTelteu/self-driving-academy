---
id: "280"
title: "Camera first-person din poziția șoferului"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["260","263"]
performance_checks: ["frame"]
owner: null
started_at: null
completed_at: null
---

# 280 Camera first-person din poziția șoferului

## Obiectiv

`C` comută între camera din spate și first-person din poziția șoferului, fără a schimba autoritatea sau fizica.

## Starea actuală și ce lipsește

- Nu există binding `C` în compunerea live.
- Camera V3 este third-person/character; nu există ancoră în scaunul șoferului.
- Nu există tranziție între camere la intrare/ieșire sau schimbarea vehiculului.
- Nu există FOV/offset din setări aplicate camerei first-person.
- Nu există ocluzie și clipping pentru caroserie în first-person.
- Nu există probă în browser pe ambele backenduri.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Reglaje HUD și cameră](../../Docs/27-reglaje-hud-si-camera.md)
- [Camera vehiculului](../../Docs/vehicle-camera.md)
- [Input de tastatură](../../Docs/keyboard-input.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] `C` comută camera în timpul condusului și revine la camera din spate.
- [ ] First-person pornește din poziția șoferului, cu FOV-ul setat și fără caroseria în față.
- [ ] Intrarea, ieșirea și schimbarea vehiculului păstrează camera coerentă.
- [ ] Comutarea camerei nu schimbă autoritatea, poziția, viteza sau segmentul.
- [ ] Setarea este salvată și respectată după reload.
- [ ] Proba vizuală arată ambele camere pe WebGPU și WebGL2.

## Verificare

- Teste pentru comutare, ancoră și păstrarea autorității.
- Probă în browser: condus, `C`, first-person, ieșire, revenire.
- Capturi înainte/după și verificarea FOV.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '280'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

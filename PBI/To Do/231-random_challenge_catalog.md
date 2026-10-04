---
id: "231"
title: "Catalog de provocări neobișnuite și evaluatori"
status: "To Do"
release: "V1"
module: "Misiuni"
depends_on: ["116","040","031","227","139"]
performance_checks: ["simulation", "memory"]
owner: null
started_at: null
completed_at: null
---

# 231 Catalog de provocări neobișnuite și evaluatori

## Obiectiv

Definește catalogul minim de 12 șabloane cu obiective calculabile, dialog și prerechizite realizabile.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 116 trebuie să existe în Done înainte de începere.
- PBI 040 trebuie să existe în Done înainte de începere.
- PBI 031 trebuie să existe în Done înainte de începere.
- PBI 227 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Include urgență la maternitate/toaletă, influenceri, tort, destinație schimbată, terminal, tur, parcare și experiment de stil conform modulului 28.
- [ ] Evaluatorii checkpoint/dwell/heading/confort/drift/distrugere și LEARNING au praguri/versionare; driftul nu se acumulează prin rotire pe loc sau impuls de coliziune.
- [ ] Fiecare șablon declară sesiunea, zonele, bugetul de incidente, deadline-ul, rewardPolicy și regulile R/reluare.
- [ ] Validatorul respinge zone/rute/evaluatori lipsă și obiective contradictorii; demolarea este Haos, iar scenele nu cer pietoni V2/mers V3.
- [ ] Dialogurile reflectă evenimente reale și premisa de filmare rămâne internă, fără upload social sau date fabricate.

## Verificare

Verifică fiecare șablon într-un fixture realizabil și unul invalid, exactitatea evaluării și fallbackul; consemnează praguri și umorul din playtest.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [ ] Contracte/documentație actualizate.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '231'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

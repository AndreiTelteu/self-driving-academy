---
id: "233"
title: "Interfață reluare recorduri și recompense pentru provocări"
status: "To Do"
release: "V1"
module: "Misiuni și interfață"
depends_on: ["232","211","212","213","126","073","225"]
performance_checks: ["ui", "storage", "frame"]
owner: null
started_at: null
completed_at: null
---

# 233 Interfață reluare recorduri și recompense pentru provocări

## Obiectiv

Oferă reacții comice, reluare rapidă, recorduri personale și varietate daily cu credite idempotente.

## Context și plan

- [28-provocari-random-si-revenire.md](../../Docs/28-provocari-random-si-revenire.md)
- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 232 trebuie să existe în Done înainte de începere.
- PBI 211 trebuie să existe în Done înainte de începere.
- PBI 212 trebuie să existe în Done înainte de începere.
- PBI 213 trebuie să existe în Done înainte de începere.
- PBI 126 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.
- PBI 225 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Oferta discretă și rezultatul arată premise/obiectiv/reward; Acceptă/Refuză/Mai încearcă/Continuă condusul sunt accesibile și nu cer grafice.
- [ ] Meniul rejucabil păstrează provocările descoperite/recordurile; încercarea are identitate nouă și nu dublează recompensa.
- [ ] Academie aplică rewardKey per familie/data daily; Haos are doar scor local, iar replay/rerun/import de profil nu acordă XP.
- [ ] Daily rămâne exact trei cu cel puțin unul MANUAL; integrarea catalogului adaugă familii variate fără obiective destructibile Haos obligatorii.
- [ ] Decline/eșec/reset/zile ratate nu scad XP, iar recordurile/deduplicarea/calendarul supraviețuiesc reload și sunt izolate per sesiune.

## Verificare

Playtest pe fiecare familie, retentarea voluntară și repetiții; testează limite de zi, reward dublu, reset/reload, Haos și viewport mic.

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

Verificare finală: Validate-Board.ps1 -RequireDone '233'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

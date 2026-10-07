---
id: "206"
title: "Checkpoint complet și reluare coerentă a lumii"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["127","128","129","065","008","010","221"]
performance_checks: ["storage", "memory", "frame"]
owner: null
started_at: null
completed_at: null
---

# 206 Checkpoint complet și reluare coerentă a lumii

## Obiectiv

Persistă SessionCheckpoint complet cu lumea fizică și stările proprii, fără a confunda salvarea progresului cu continuarea lumii.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)
- [02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 127 trebuie să existe în Done înainte de începere.
- PBI 128 trebuie să existe în Done înainte de începere.
- PBI 129 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.
- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 221 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Pozițiile, cursele, pasagerii, FSM/controller, oportunitățile, RNG și learningEpoch sunt restaurate la ultimul commit coerent.
- [ ] Reload pornește în pauză/AUTO; inputul este eliberat, iar segmentele devin incomplete și joburile se reiau idempotent.
- [ ] Salvarea are un singur writer; pierderea GPU folosește RAM și poate salva checkpointul durabil după integrare.

- [ ] Captura fizică și de stare păstrează același tick; costul sincron este măsurat separat de encode/commit și nu este ascuns sub eticheta async.

## Verificare

Roundtrip în viraj/pickup, crash înainte/după commit, două taburi, job pending, device loss și versiune incompatibilă.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

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

Verificare finală: Validate-Board.ps1 -RequireDone '206'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

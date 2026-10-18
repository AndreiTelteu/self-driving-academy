---
id: "234"
title: "Savefile complet cu checksum și încărcare atomică"
status: "To Do"
release: "V1"
module: "Persistență"
depends_on: ["135","215","225","227","229","230","233","222"]
performance_checks: ["storage", "memory", "workers", "ui"]
owner: null
started_at: null
completed_at: null
---

# 234 Savefile complet cu checksum și încărcare atomică

## Obiectiv

Implementează Salvează/Încarcă jocul în fișier .sdasave complet cu checksum calculat/verificat în browser.

## Context și plan

- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)
- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 135 trebuie să existe în Done înainte de începere.
- PBI 215 trebuie să existe în Done înainte de începere.
- PBI 225 trebuie să existe în Done înainte de începere.
- PBI 227 trebuie să existe în Done înainte de începere.
- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 230 trebuie să existe în Done înainte de începere.
- PBI 233 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Envelope-ul SHA-256/SDA-CJSON-1 acoperă metadatele și payloadul, exclude numai checksum top-level și include ambele sesiuni/decor/reglaje/progres.
- [ ] Vectorii de canonicalizare acoperă Unicode, numere finite/safe integers, ordine obiect/array, -0 și base64; duplicate keys sunt respinse înainte de hashing.
- [ ] Editarea fără checksum recalculat, checksum lipsă/necunoscut și fișier corupt/prea mare produc eroare fără bypass sau modificare live.
- [ ] Verificarea checksum precede schema/migrarea; un checksum recalculat nu face o schemă invalidă acceptabilă și nu este prezentat drept anti-cheat.
- [ ] Sumarul fișierului validat precede confirmarea înlocuirii; staging/commit/rollback și un singur writer împiedică activarea parțială sau adunarea reward-urilor.
- [ ] Exportul/importul au progres/anulare și limite bytes/depth; statusul distinge autosave de fișierul pregătit, iar startup reia în pauză/AUTO.

## Verificare

Roundtrip ambele sesiuni, modifică XP fără hash nou, checksum valid/schema invalidă, whitespace/key order, missing hash, truncation, versiune veche/nouă, quota, două taburi și rollback; măsoară fișierul maxim admis.

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

Verificare finală: Validate-Board.ps1 -RequireDone '234'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

---
id: "209"
title: "Revenue-ul flotei și review-uri ale curselor 0–5"
status: "To Do"
release: "V1"
module: "Economie"
depends_on: ["063","065","137","139","208"]
owner: null
started_at: null
completed_at: null
---

# 209 Revenue-ul flotei și review-uri ale curselor 0–5

## Obiectiv

Implementează tarife versionate, încasări/rambursări și review-uri simulate ale experienței pasagerului.

## Context și plan

- [22-kpi-economie-si-review-uri.md](../../Docs/22-kpi-economie-si-review-uri.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 137 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.
- PBI 208 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Fiecare rezultat comercial și review este idempotent, inclusiv după schimbarea modelului de review; civilii nu intră în veniturile flotei.
- [ ] Ratingul 0–5 include confort, întârziere și incidente reale, cu motive explicabile.
- [ ] Scenarii comparabile arată eficiență cu ratings bune și throughput mai mare cu ratings mai slabe.

## Verificare

Testează finalizare/eșec/anulare, curse mixte, impact, ocoluri, duplicate și două stiluri pe aceeași cerere.

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

Verificare finală: Validate-Board.ps1 -RequireDone '209'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

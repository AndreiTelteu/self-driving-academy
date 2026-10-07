---
id: "226"
title: "Deblocare rapidă și resetul orașului cu stil păstrat"
status: "To Do"
release: "V1"
module: "Experiență"
depends_on: ["225","030","065","206","207"]
performance_checks: ["simulation", "storage", "frame"]
owner: null
started_at: null
completed_at: null
---

# 226 Deblocare rapidă și resetul orașului cu stil păstrat

## Obiectiv

Separă R/deblocarea vehiculului de refacerea lumii și de restaurarea stilului.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 225 trebuie să existe în Done înainte de începere.
- PBI 030 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] R restabilește mobilitatea la un punct fără collider; ținta propusă de două secunde este playtestată și nu retrage XP.
- [ ] R cu pasager produce o singură încheiere FAILED; incidentul rămâne în istoric, iar Haos permite reluare rapidă.
- [ ] Resetul închide curse/provocări, incrementează worldEpoch/learningEpoch, păstrează profil/dovezi/XP/daily/rewards și reconstruiește traficul.
- [ ] Resetul pornește un economyEpoch nou fără ștergerea istoricului, invalidează cache-uri/joburi și marchează discontinuitatea replay.
- [ ] Pregătirea/commitul eșuat păstrează checkpointul valid; reset repetat nu dublează progres, corpuri sau listeners. Integrarea decorului vine în 227.

## Verificare

Verifică răsturnare/blocaj, pasager, daily parțial, worker întârziat, storage eșuat și 20 reseturi; playtest pentru revenirea rapidă la condus.

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

Verificare finală: Validate-Board.ps1 -RequireDone '226'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

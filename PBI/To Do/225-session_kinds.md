---
id: "225"
title: "Sesiuni Academie și Joacă liberă Haos"
status: "To Do"
release: "V1"
module: "Experiență"
depends_on: ["215","205","065","070"]
performance_checks: ["storage", "memory", "frame"]
owner: null
started_at: null
completed_at: null
---

# 225 Sesiuni Academie și Joacă liberă Haos

## Obiectiv

Oferă Academie și Haos de la început, cu lumi/profiluri izolate și revenire la checkpoint fără modificarea campaniei.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 215 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 070 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] SessionKind nu înlocuiește AUTO/MANUAL/LEARNING; selecția oricărei mașini și condusul liber sunt disponibile în ambele sesiuni.
- [ ] Haos copiază explicit profilul ales, are recorduri/checkpoint proprii și nu consumă daily sau ledger/XP Academie.
- [ ] Schimbarea închide segmentul, salvează atomic, invalidează joburile prin sessionId/worldEpoch/learningEpoch și eliberează inputul.
- [ ] Există o singură lume fizică live; salvarea eșuată păstrează lumea curentă, iar reload reia în pauză/AUTO.
- [ ] Copierea explicită a stilului Haos în Academie validează profilul și nu transferă progres; 20 de tranziții nu lasă resurse/joburi rezidente.

## Verificare

Testează Academie→Haos→Academie, learning în curs, rezultat întârziat, quota/crash, reload și copiile profilului; măsoară memoria și commitul.

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

Verificare finală: Validate-Board.ps1 -RequireDone '225'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

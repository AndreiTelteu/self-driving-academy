---
id: "228"
title: "Feedback audio vizual și replay al distrugerii"
status: "To Do"
release: "V1"
module: "Asseturi și audio"
depends_on: ["227","148","149","207","141"]
performance_checks: ["assets", "frame", "memory"]
owner: null
started_at: null
completed_at: null
---

# 228 Feedback audio vizual și replay al distrugerii

## Obiectiv

Face distrugerea satisfăcătoare prin reacții de material și păstrează adevărul evenimentelor în replay.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 227 trebuie să existe în Done înainte de începere.
- PBI 148 trebuie să existe în Done înainte de începere.
- PBI 149 trebuie să existe în Done înainte de începere.
- PBI 207 trebuie să existe în Done înainte de începere.
- PBI 141 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Impactul produce cedare vizibilă, sunet distinct și câteva fragmente/efecte cu intensitate reglabilă și alternativă vizuală.
- [ ] Pool-urile au plafon și durată de viață; fragmentele cosmetice nu blochează traficul, nu produc scor și nu generează coliziuni suplimentare.
- [ ] Replay-ul reproduce stările și reseturile din evenimente, fără a acorda rewards sau a pretinde că AI-ul a învățat cascadorii.
- [ ] Impacturi multiple respectă bugetul de audio/efecte, iar cleanup/disposal revine la baseline după reset.

## Verificare

Inspectează toate materialele la impact, voci simultane, Low/Medium, volum zero, replay/seek, reload și reset; păstrează capturi și rapoarte.

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

Verificare finală: Validate-Board.ps1 -RequireDone '228'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

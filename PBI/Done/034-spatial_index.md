---
id: "034"
title: "Index spațial pentru vecini"
status: "Done"
release: "V1"
module: "Oraș"
depends_on: ["033","022"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium PBI034"
started_at: "2026-10-05T14:24:39.4073010+03:00"
completed_at: "2026-10-05T14:44:00.8986998+03:00"
---

# 034 Index spațial pentru vecini

## Obiectiv

Implementează căutări locale de vehicule, obstacole și zone.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[04-oras-si-retea-rutiera.md](../../Docs/04-oras-si-retea-rutiera.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 033 trebuie să existe în Done înainte de începere.
- PBI 022 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Query-urile includ numai vecinii geometric relevanți.
- [x] Entitățile mutate sau eliminate nu rămân în celule vechi.

- [x] Workload aglomerat și granițele celulelor au contoare/costuri; plafonarea nu elimină vecini relevanți.

## Verificare

Compară query-uri cu o referință brută în scene mici.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: index semantic mutabil VEHICLE/OBSTACLE/ZONE, geometrie exactă3D (sfere/prisme concave), identitate id+incarnation, ownership frozen, update atomic, remove/reset/dispose și fallback complet bounded. [Contract API](../../Docs/spatial-index.md).

Verificări executate și rezultat: typecheck PASS;9/9teste034 PASS,6960query-uri benchmark și600query-uri mutate comparate pe IDs exacte cu referința brută; ESLint/Prettier scoped PASS; before/after5perechiCPU observeroff/on și20cicluri memorie PASS. Baseline capturat înaintea modulului, original sourceSHA/bytes păstrate. Tick p95median normal0,4135→0,1109ms și dens4,3485→1,6324ms; cost update separat0,0063/0,0032ms. Contoare ownership zero după toate reseturile/dispose. [Raport complet](../../Docs/Evidence/034-spatial-index/report.md). Probe CPU suplimentare, fără FPS sau aprobarea gate-urilor hardware.

Fișiere și documente actualizate: src/world/spatial-index.ts, export public world/index.ts (coordonator), tests/world/spatial-index.test.ts și spatial-index-reference.ts, scripts/benchmark-spatial-index.mjs și measure-spatial-index-memory.mjs, Docs/spatial-index.md și Docs/Evidence/034-spatial-index; contract04/README integrate de coordonator.

Limitări sau follow-up: observațiile explicite sunt supplied de owner;022 are IDs autoritare numai pentru vehicule. Fără obstacole/zone inventate din meshuri. Ownerul asigură completitudinea și fencing la reset; prisme verticale semantice și query local, fără swept/coliziune. Plafoane provizorii finite; costuri CPU Node, fără calibrare gameplay/laptop/FPS. Nu există verificări restante pentru criteriile034; mutarea fizică și validatorii finali sunt consemnați în raport.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '034' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05T14:24:39.4073723+03:00: dependențe fizicDone verificate; performance_checks ajustate înainte de implementare; pregătirea baseline-ului precede modificarea algoritmului/fizicii.


- 2026-10-05T14:44:00.9013272+03:00: npmcheck329PASS și revizie independentă fără defecte blocante; mutare fizică Done, RequireDone034/ValidatePlan final și publicare per-task.

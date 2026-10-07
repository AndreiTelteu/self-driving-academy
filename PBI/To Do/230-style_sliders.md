---
id: "230"
title: "Slidere de stil și versiuni MANUAL_TUNING"
status: "To Do"
release: "V1"
module: "Profiluri și interfață"
depends_on: ["229","110","114","205","102","092"]
performance_checks: ["ui", "frame", "storage"]
owner: null
started_at: null
completed_at: null
---

# 230 Slidere de stil și versiuni MANUAL_TUNING

## Obiectiv

Permite reglarea manuală a opt parametri înțeleși ușor, cu proveniență, validare și restaurare.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)
- [12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 114 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.
- PBI 102 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Mapările sliderelor folosesc cheile/domeniile existente; km/h și procentele se convertesc corect, iar cheile nesuportate sunt dezactivate.
- [ ] Aplică publică numai diferențele ca versiune MANUAL_TUNING cu before/after, barieră learningEpoch și tick comun taxi/civil.
- [ ] Nu inventează observații sau confidence; dovezile istorice sunt distincte de proveniența valorii ajustate și nu acordă progres LEARNING.
- [ ] Draftul depășit nu suprascrie un profil nou; anularea/no-op nu publică, restore este funcțional și LEARNING ulterior poate modifica din nou valorile.
- [ ] Ținta este profilul sesiunii active; aplicarea în Haos nu schimbă Academie, iar schimbarea sesiunii invalidează draftul.

## Verificare

Testează conversii/limite, parametru nesuportat, worker în curs, baseVersionId depășit, no-op, anulare, restore și reload; verifică efectul real în AUTO.

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

Verificare finală: Validate-Board.ps1 -RequireDone '230'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

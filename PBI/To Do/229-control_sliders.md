---
id: "229"
title: "Popup cu slidere pentru control și confort"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["025","081","085","070"]
performance_checks: ["ui", "frame"]
owner: null
started_at: null
completed_at: null
---

# 229 Popup cu slidere pentru control și confort

## Obiectiv

Permite ajustarea inputului și camerei prin ControlPreferences versionat, fără modificarea directă a DrivingProfile.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)
- [05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 025 trebuie să existe în Done înainte de începere.
- PBI 081 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 070 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Tabul de control are slidere/preseturi, capete simple, valori și suport tastatură pentru direcție/revenire/atenuare/accelerație/frână/cameră/FOV.
- [ ] Draft/Aplică/Anulează/Reset nu modifică live la fiecare pointer move; popup-ul pune toate modurile pe pauză și eliberează inputul.
- [ ] Setările păstrează mecanica mașinii; versiunea este salvată și înregistrată în telemetrie, iar schimbarea închide/deschide segmentul la tick.
- [ ] Extremele sunt utilizabile în două clase; controlPreferences nu schimbă direct AI-ul și nu fabrică dovezi de stil.

## Verificare

Playtest slidere/preseturi, extreme, anulare și reload; verifică focus/Escape/remapare și 1280×720, fără rafale de capturi sau lucru pe frame.

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

Verificare finală: Validate-Board.ps1 -RequireDone '229'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

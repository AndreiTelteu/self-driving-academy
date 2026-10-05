---
id: "203"
title: "Hardware de referință înainte de fizică și oraș"
status: "In Progress"
release: "V1"
module: "Fundație"
depends_on: ["001","004","019"]
performance_checks: ["frame", "loading", "memory"]
owner: "Codex /root"
started_at: "2026-10-05T03:50:45.4947870+03:00"
completed_at: null
---

# 203 Hardware de referință înainte de fizică și oraș

## Obiectiv

Fixează configurații reale și bugete/măsurători de referință înaintea extinderii.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [17-webgpu-si-performanta.md](../../Docs/17-webgpu-si-performanta.md)
- [24-milestone-timpuriu-si-contracte.md](../../Docs/24-milestone-timpuriu-si-contracte.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 001 trebuie să existe în Done înainte de începere.
- PBI 004 trebuie să existe în Done înainte de începere.
- PBI 019 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Desktopul și laptopul de referință, browser/OS/GPU/rezoluție și metoda de măsurare sunt identificate.
- [ ] Bugetele CPU/GPU/memorie/încărcare și latența estimatorului au context și nu sunt declarate deja îndeplinite.

- [ ] Manifestul fixează workload normal/stres, percentilele/inputul/debitul, startup cold și capacități; pragurile propuse din modulul 25 sunt calibrate, nu declarate atinse.

## Verificare

Măsoară bootstrapul pe configurațiile alese și documentează baseline-ul și limitele.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: Unealtă portabilă de măsurare bootstrap în producție, identificare locală PowerShell și export JSON cu proveniența surselor/artefactelor. Desktop identificat local; laptop Lenovo Yoga7/Ryzen7735U/Radeon680M declarat de utilizator. Calibrarea este în lucru.

Verificări executate și rezultat: Smoke Chrome/WebGPU real și invalidare la context loss WebGL, plus blur sintetic PASS. Rezultatul scurt este explicit neeligibil ca baseline. [Dovezi](../../Docs/Evidence/203-hardware/verification.md). Baseline-urile complete pe ambele dispozitive și calibrarea manifestului rămân necesare.

Fișiere și documente actualizate: scripts/Run-HardwareProbe.ps1, scripts/hardware-probe-server.mjs, tests/browser/hardware-bootstrap, Docs/hardware-reference.md, Docs/performance-budgets.draft.json și Docs/Evidence/203-hardware.

Limitări sau follow-up: Accesul sau rularea probei pe laptop necesită acțiunea utilizatorului. Bootstrapul gol nu certifică workloadul complet, fizica, estimatorul ori cold-startul de gameplay. GPU timer indisponibil este null; capacitățile necalibrate nu sunt aprobate. Taskul rămâne In Progress până la măsurătorile reale și manifestul calibrat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '203'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.
- 2026-10-05T03:50:45.4973133+03:00: Dependențele001/004/019 sunt Done. Utilizatorul a identificat laptopul Lenovo Yoga7 14ARP8, Ryzen7 7735U, Radeon680M,16GB RAM,512GB SSD,OLED WUXGA14in. Specificațiile sunt declarate de utilizator, nu măsurători. Pregătim proba locală și exportul; accesul/rularea pe laptop rămâne necesară. Taskurile independente continuă în paralel.

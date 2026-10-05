---
id: "203"
title: "Hardware de referință înainte de fizică și oraș"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["001","004","019"]
performance_checks: ["frame", "loading", "memory"]
owner: "Codex /root"
started_at: "2026-10-05T03:50:45.4947870+03:00"
completed_at: "2026-10-05T05:06:23.5816510+03:00"
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

- [x] Desktopul, browser/OS/GPU/rezoluție și metoda sunt identificate prin raport real; laptopul este identificat prin specificațiile utilizatorului. Identificarea efectivă și testul laptop sunt omise prin derogarea explicită din 5 octombrie 2026, fără PASS fictiv.
- [x] Bugetele CPU/GPU/memorie/încărcare și latența estimatorului au context și nu sunt declarate deja îndeplinite.

- [x] Manifestul 203-initial-1 fixează workload normal/stres, percentilele/inputul/debitul, startup cold și capacități. Criteriul de calibrare pe ambele configurații este revizuit transparent conform derogării: baseline-ul bootstrap desktop este măsurat, laptopul este omis, iar pragurile/capacitățile gameplay rămân provizorii cu owner/fixture pentru calibrare ulterioară obligatorie.

## Verificare

Măsoară bootstrapul desktop și documentează baseline-ul și limitele. Testul laptopului din 203 este omis conform derogării explicite a utilizatorului; nu substitui omiterea cu o măsurătoare sau rezultat PASS. Gate-urile ulterioare rămân obligatorii.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: Unealtă portabilă de măsurare bootstrap în producție, identificare PowerShell și export JSON cu proveniența surselor/artefactelor; manifest inițial versionat 203-initial-1. Desktop identificat și măsurat local; laptop Lenovo Yoga7/Ryzen7735U/Radeon680M declarat de utilizator. Utilizatorul a cerut explicit să ignorăm testul laptopului și să continuăm ca succes; închiderea este acceptată cu derogare de scope, nu ca PASS al unui test neexecutat. Bugetele gameplay/capacitățile nemăsurate rămân provizorii. Gate-urile 021/218/220–224/155 nu sunt declarate trecute și nu sunt omise.

Verificări executate și rezultat: Smoke Chrome/WebGPU real și invalidare la context loss WebGL, plus blur sintetic PASS. Baseline complet desktop: cinci perechi 30s/120s, validBaseline=true, CPU p95 median 0,20ms și interval p95 de 7ms pe bootstrap gol, GPU timer indisponibil. [Dovezi și verificarea închiderii](../../Docs/Evidence/203-hardware/verification.md), [raport desktop](../../Docs/Evidence/203-hardware/desktop-report.md). Test laptop: OMIS PRIN DEROGARE, fără măsurători. Verificările administrative și parserul baseline sunt consemnate în dovada de închidere.

Fișiere și documente actualizate: scripts/Run-HardwareProbe.ps1, scripts/hardware-probe-server.mjs, scripts/summarize-hardware-probe.mjs, tests/browser/hardware-bootstrap, tests/harness/hardware-probe-summary.test.ts; Docs/hardware-reference.md, Docs/hardware-probe-summary.md, Docs/performance-budgets.json (înlocuiește draftul), Docs/Evidence/203-hardware; modulele 17/24/25, Docs/README.md și PBI/AGENTS.md reflectă transparent derogarea și contractul provizoriu.

Limitări sau follow-up: Laptopul nu are identificare efectivă și baseline; câmpurile necunoscute rămân null. Desktopul este high-end, fără extrapolare la desktop mediu. Bootstrapul gol nu certifică workloadul complet, fizica, estimatorul, memoria exactă ori cold-startul de gameplay. GPU timer indisponibil este null; capacitățile null nu sunt nelimitate. Ownerii/fixture-urile din manifest trebuie să fixeze plafoane finite înaintea introducerii resurselor și să calibreze pe probele relevante; gate-urile hardware/gameplay/release ulterioare sunt obligatorii. Derogarea este limitată la testul laptopului din 203.

## Definition of Done

- [x] Criterii revizuite conform derogării explicite, îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '203'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.
- 2026-10-05T03:50:45.4973133+03:00: Dependențele001/004/019 sunt Done. Utilizatorul a identificat laptopul Lenovo Yoga7 14ARP8, Ryzen7 7735U, Radeon680M,16GB RAM,512GB SSD,OLED WUXGA14in. Specificațiile sunt declarate de utilizator, nu măsurători. Pregătim proba locală și exportul; accesul/rularea pe laptop rămâne necesară. Taskurile independente continuă în paralel.

- 2026-10-05T04:51:29.2722836+03:00: Baseline complet desktop Chrome/WebGPU pe1044d0f, cinci perechi30s/120s, validBaseline=true; raport și sumar păstrate. Utilizatorul a ales să ruleze personal proba pe laptop; rezultatul este în așteptare.203 rămâne In Progress.

- 2026-10-05T05:06:23.5816510+03:00: Derogare explicită utilizator pentru testul laptopului: omis, fără PASS sau măsurători fabricate. Manifest 203-initial-1 fixat cu baseline desktop real și bugete gameplay provizorii; gate-urile ulterioare rămân obligatorii. Parser7/7 și reproducerea exactă a sumarului desktop PASS; criteriile și contractele actualizate transparent.

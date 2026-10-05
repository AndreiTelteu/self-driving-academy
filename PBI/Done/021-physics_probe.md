---
id: "021"
title: "Prototip Rapier și decizia de fizică"
status: "Done"
release: "V1"
module: "Vehicule și fizică"
depends_on: ["001","004","203","218"]
performance_checks: ["simulation", "frame"]
owner: "Codex physics_021"
started_at: "2026-10-05T10:02:51.5015127+03:00"
completed_at: "2026-10-05T12:00:14.2142393+03:00"
---

# 021 Prototip Rapier și decizia de fizică

## Obiectiv

Validează controllerul auto Rapier în scene de frânare, viraj, bordură și contact.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 001 trebuie să existe în Done înainte de începere.
- PBI 004 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Aderența și frânarea pot fi calibrate pentru experiența realistă cerută.
- [x] Decizia și limitele observate sunt documentate; Babylon rămâne engine-ul.

- [x] Pasul fizic, query-urile și bridge-ul JS/WASM sunt măsurate cu multe contacte și collidere calibrate; setările solver/CCD nu se schimbă cu FPS.

## Verificare

Măsoară curbe de frânare și viraj, cu note de playtest.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Rapier 3D 0.21.0 fixat exact, adaptor izolat și port SI fără obiecte externe; sedan raycast calibrabil, admitere finită și pas 60 Hz/solver 8/CCD 4 independent de FPS. Babylon rămâne engine-ul. Decizia este continuarea cu Rapier raycast, cu limitele anvelopei documentate în [prototip](../../Docs/physics-prototype.md).

Verificări executate și rezultat: Calibrare numerică PASS (frânare 6,09/24,24/54,00 m la 10/20/30 m/s; brake slab 47,48 m și grip redus 26,47 m la 20 m/s). Șase teste fizice PASS, inclusiv contact/bordură/CCD și aceleași 300 ticks/proiecții la 30/60/144 FPS. npm run typecheck și npm run check:architecture PASS; ESLint/Prettier scope 021 PASS. Browser Chrome headed pe build producție: smoke și full cu 10 brațe, fiecare 30 s warmup/120 s măsurare. Proba completă capturată 2026-10-05T07:44:41.740Z: 70 cars + 64 debris, 134 corpuri/138 collidere, 783–860 contacte solver, zero overload/overflow; median p95 pas 1,8 ms, controller 0,4 ms, query 0,2 ms, readback bridge reprezentativ 0,1 ms, tick 2,2 ms și main-thread 3,4 ms; frame p95/p99 7/7,1 ms, în bugetele desktop provizorii. Verifier source/artifact PASS pentru commit 01b595a + hash acc393f4 și 165 artefacte; copia manifestului la captură păstrează identitatea după adăugarea sub-contractelor. Probe vizuale reale, capturi imediate manual/turn/curb/contact inspectate. [Dovezi și comenzi exacte](../../Evidence/021/verification.md), [sumar](../../Evidence/021/summary.json).

Fișiere și documente actualizate: src/vehicles/physics.ts, src/vehicles/rapier/index.ts, entry point vehicles, package.json/package-lock, exception și negative probes în scripts/verify-architecture.mjs; tests/vehicles, tests/browser/physics, scripts/calibrate-physics.mjs, Run-PhysicsProbe.ps1, physics-probe-server.mjs, verify-physics-evidence.mjs; Docs/physics-prototype.md, 05, module-layout, README; Evidence/021 incluzând raport brut, baseline 218 nemodificat, snapshot manifest, curbe, sumar și capturi browser. Root a reconciliat caps în manifestul comun fără schimbarea pragurilor/protocolului.

Limitări sau follow-up: Controller raycast simplificat, fără pneu pneumatic/ABS/transmisie completă, un sedan configurabil; gameplay, arbitraj și două clase continuă în PBI-urile dedicate. Grip este parametrul empiric Rapier, nu µ fizic. Bridge count/readback este reprezentativ, nu total JS/WASM. WASM 32 MiB este estimare de rezervare/admitere cu world cap 1, nu heap măsurat; GPU timer/memorie exactă unavailable. Scope desktop prototype nu validează laptop, jocul complet sau gate-urile 220/224/155; gameplayGate rămâne NOT_VALIDATED. Capturile târzii ale camerei fixe au fost completate cu capturi imediate vizibile, fără modificarea buildului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '021' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05: Implementat și verificat prototipul Rapier 0.21.0, curbe și contact/browser reale, protocol desktop complet și limite documentate; source/artifact hash validate. Mutare fizică în Done și validator obligatoriu executat la final.

---
id: "019"
title: "Diagnostic Babylon și resurse"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["011","014"]
performance_checks: ["frame", "memory"]
owner: "Codex PBI019"
started_at: "2026-10-05T03:15:29.7454657+03:00"
completed_at: "2026-10-05T03:47:38.3466053+03:00"
---

# 019 Diagnostic Babylon și resurse

## Obiectiv

Expune backend, timpi, draw calls și resurse; inspector doar în dezvoltare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 011 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Diagnosticarea nu actualizează întregul HUD în fiecare frame.
- [x] Buildul de producție exclude inspectorul și codul de debug nefolosit.

- [x] Raportul separă CPU, GPU când este disponibil, frame time, tick/debt și bytes/cozi; colectorul are buffer limitat și overhead măsurat.

## Verificare

Compară bundle dev/producție și profilul costului de UI.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Colector numeric bounded, instrumentare Babylon reală cu GPU-if-supported și ownership, panou separat5Hz conectat în bootstrap, Inspector DEV-only cu token ownership.

Verificări executate și rezultat: Typecheck aplicație/teste019, lint/format scoped, architecture10probe negative,4teste PASS. Production build și scan sourcemap graph PASS. ChromeGL/GPU6assertions/overhead/cleanup PASS; UI reală production și Inspector DEV ownership PASS. [Raport și rezultate exacte](../../Docs/Evidence/019-diagnostics/report.md). Globalchecks afectate de018/039WIP sunt raportate separat; nu sunt declarate PASS.

Fișiere și documente actualizate: rendering/diagnostics.ts, babylon/diagnostics-adapter.ts și dev-inspector.ts, ui/diagnostics-panel.ts, main.ts, tests/rendering și tests/browser/diagnostics, scripts/verify-architecture/build-diagnostics-fixture/verify-diagnostics-build, package files, Docs/render-diagnostics.md/module-layout.md și Evidence/019-diagnostics. Barrels și legăturile comune integrate de parent.

Limitări sau follow-up: Bugete provizorii pre203 și scenă goală, nu gate gameplay. WebGPU GPUtimer unsupported=null. CPUtick/bytes/cozi fără serviciu real=null; fixture explicit sintetic. Memorie exactă JS/GPU nemăsurată. Inspector9.29.0 emite o eroare internă async la disposal; scena curăță observerele, redeschiderea disposed este refuzată, consolelog exact păstrat. T3host eronat: probe finale în Chrome headed autorizat cu skill Playwright C:/Users/Andrei/.codex/skills/playwright/SKILL.md.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '019' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05T03:47:38.3466053+03:00: Implementat și verificat; probe și limitări în Evidence019; mutat fizic în Done.

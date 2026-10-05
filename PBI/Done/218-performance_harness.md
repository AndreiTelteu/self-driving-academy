---
id: "218"
title: "Harness și rapoarte versionate de performanță"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["004","019","203","008"]
performance_checks: ["frame", "simulation", "memory"]
owner: "Codex /root/performance_harness"
started_at: "2026-10-05T05:07:30.3616664+03:00"
completed_at: "2026-10-05T09:59:53.4603816+03:00"
---

# 218 Harness și rapoarte versionate de performanță

## Obiectiv

Implementează probe reproductibile, colectare plafonată și PerformanceReport de la bootstrap, înainte de extindere.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 004 trebuie să existe în Done înainte de începere.
- PBI 019 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 008 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Raportul identifică commit/bugete/fixture/seeds/hardware/backend/preset și separă CPU, GPU disponibil, frame time, input și debit de simulare.
- [x] Colectorul are limite de resurse și overhead măsurat; cinci repetări, cold load și warmup sunt raportate distinct.
- [x] Probele CPU portabile și probele de browser pe hardware au roluri separate; datele indisponibile și scope-ul încă neimplementat nu sunt inventate.

## Verificare

Rulează fixture minim și aceeași probă cu colector activ/inactiv; verifică exportul după probă, percentilele pe date cunoscute și lipsa API-ului GPU/memorie.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: Colector numeric plafonat și PerformanceReport v1, fixture CPU determinist, fixture browser producție, export și sumarizator implementate și verificate. Cinci perechi hardware desktop Chrome154/WebGPU au warmup efectiv >=30s și measure >=120s; cold fresh/first-use și render warm sunt raportate separat.

Verificări executate și rezultat: npm run check PASS (284 teste, typecheck/lint/format/architecture); npm run build PASS; CPU fixture 5 perechi x 20.000 cadre PASS; smoke și full Chrome local autorizat PASS; sumarizatoare CPU/browser PASS; verify-performance-evidence PASS (surse și129 artefacte efective, 5 perechi, 5 cold/5 warm, resurse); git diff --check PASS. CPU p95 median0,20ms în ambele brațe, frame p95 de7ms și simulation ratio aproximativ0,99998; delta p95 indistinct la precizia ceasului, fără afirmație overhead zero. Dovezi: Evidence/218/verification.md, desktop-webgpu.json și desktop-summary.json.

Fișiere și documente actualizate: src/telemetry/performance.ts și index.ts; tests/harness/performance.test.ts; tests/browser/performance-harness; scripts/Run-PerformanceHarness.ps1, performance-harness-server.mjs, benchmark-performance-harness.mjs, summarize-performance-report.mjs, verify-performance-evidence.mjs; Docs/performance-harness.md; Evidence/218.

Limitări sau follow-up: T3 focus=false a respins smoke-ul corect; după autorizarea explicită user, Chrome local headed a păstrat focus real. Snapshotul CIM/power este punctual la startup server, anterior probei, nu monitorizare continuă. GPU timer unsupported și memoria exactă, fizică/gameplay/input/learning rămân indisponibile; laptop nemăsurat. Cold local no-store/fresh backend nu certifică rețeaua25Mbit/s/RTT40ms sau prima comandă driving. Bugetele203 rămân provizorii și gameplayGate=NOT_VALIDATED. Nu există blocaj pentru scope-ul minim218; gate-urile viitoare păstrează cerințele proprii.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '218'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.

- 2026-10-05T05:20:03.9291985+03:00: 218 început după203 Done și push bf37fd9. Implementare și verificări CPU/check/build finalizate; hardware blocat de focus T3, fără schimbarea condițiilor sau mutare Done.

- 2026-10-05T09:59:53.4628276+03:00: Chrome local autorizat explicit; smoke și proba full hardware5paired30s/120s încheiate, export și verificarea surselor/artefactelor PASS. Criterii scope218 verificate, fără certificare gameplay sau măsurători laptop.

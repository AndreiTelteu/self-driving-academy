---
id: "221"
title: "Buget comun priorități și backpressure pentru workers"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["010","203","218"]
performance_checks: ["workers", "memory", "frame"]
owner: "Codex worker_governor"
started_at: "2026-10-05T10:02:33.7081159+03:00"
completed_at: "2026-10-05T12:01:28.7227800+03:00"
---

# 221 Buget comun priorități și backpressure pentru workers

## Obiectiv

Implementează admitere globală, priorități logice, felii de lucru și ownership de payload pentru learning, encode/hash și comparații.

## Context și plan

- [Contracte de performanță și benchmark](../../Docs/25-performanta-contracte-si-benchmark.md)
- [WebGPU și performanță](../../Docs/17-webgpu-si-performanta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 010 trebuie să existe în Done înainte de începere.
- PBI 203 trebuie să existe în Done înainte de începere.
- PBI 218 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Limitele de joburi/lumi/bytes sunt versionate; learning-ul interactiv poate întrerupe cooperativ un lot secundar fără ordine greșită sau publicare duplicată.
- [x] Anularea/progresul și timpul de coadă sunt măsurate; transferul de ArrayBuffer nu detașează starea live sau dovezi încă folosite.
- [x] Presiunea nu pierde dovezi learning, credite XP sau date protejate; PENDING, reluarea în idle/pauză și capacitatea insuficientă sunt explicite.

## Verificare

Folosește joburi sintetice lungi/scurte pentru a măsura admiterea unui job interactiv în timpul unui lot secundar, anulare, restart, payload detașat și RAM/cozi plafonate. Integrarea learning/A/B real se verifică ulterior în 103/144/234/224, care depind de acest protocol; nu condiționa protocolul de implementarea lor.

Păstrează comenzile, configurația, rapoartele și limitările reale. Nu declara verificări fără execuție.

## Dovezi de finalizare

Rezultat implementare: WorkerResourceGovernor comun learning/encode/hash/comparison, priorități protected/interactiv/encode-hash/comparison, preempție după cancel acknowledgement și restart cu jobId nou, identitate logică operation/segment/epochs, persistență protejată injectată cu completed recovery și acknowledge explicit. Snapshoturi8jobs/16MiB, ingress async separat8jobs/16MiB, transport1heavy/8MiB și un world token sintetic; versiunea221-synthetic-1. Bufferul live nu este transferat. XP/ledger nu sunt calculate sau modificate în governor.

Verificări executate și rezultat: 20/20 teste workers PASS, typecheck/lint/format scope PASS; probe finale CPU5reps și Chrome154headed5perechi burst1s+1s cu focus/visibility per frame PASS. Felie max browser3,1ms/CPU2,0784ms, anulare max5,3ms/6,72ms, learning end-to-end max3,2ms/7,1388ms. rAF p95 baseline/worker7,1ms, delta0 la precizia raportată; fără afirmație de gameplay FPS. Clone4096x1000 baseline original010 mediana5,5151ms păstrat, aceeași probă curentă4,1238ms; costul nou lifecycle separat. Verifier source/artifact identity+ownership/budgets PASS. [Comenzi, rapoarte, build/hardware și limitări](../../Evidence/221/verification.md). Root a raportat npmcheck integrat306tests și Validate-Plan PASS înainte de replay; dovezile221 sunt independente.

Fișiere și documente actualizate: src/workers/governor.ts și index.ts; tests/workers/governor*, tests/harness/governor*, tests/browser/worker-governor/*; scripts/Run-WorkerGovernorProbe.ps1, worker-governor-server.mjs, benchmark-worker-governor.mjs și verify-worker-governor-evidence.mjs; Docs/worker-resource-governor.md, Evidence/221/*. Root integrează manifestul comun resourceAdmissionContracts221-synthetic-1 fără schimbarea baseline-ului203/pragurilor gameplay.

Limitări sau follow-up: Governor protocol sintetizat, fără algoritmi learning/A/B/savefile real sau IndexedDB; ProtectedJobStore production bounded/durabil este responsabilitatea222/234. Preempția reîncepe unitatea jobului; callbackul sincron blocant nu poate fi întrerupt. Capacități finite provizorii; 4bytes nu calibrează savefile maxim. RAM totală/GPU/Long Tasks/laptop/gameplay nu sunt validate. Integrare și calibrare103/144/234/224. Snapshot CIM punctual înainte de probă, fără monitorizare continuă. Callerul publică idempotent la tick și suspendă sesiunea la SESSION_SUSPENDED fără pierderea dovezilor/XP.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv rapoartele performance_checks.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '221'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.4; implementarea nu a început.
- 2026-10-05T10:02:33+03:00: Implementare începută de Codex worker_governor, mutare în In Progress; reluată din fișierul real după întrerupere.
- 2026-10-05T12:01:28+03:00: Protocol,20teste și probeCPU/browser reale verificate pe fixture final; mutare fizică în Done și RequireDone221 obligatoriu.

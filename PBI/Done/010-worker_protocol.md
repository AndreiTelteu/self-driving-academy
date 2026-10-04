---
id: "010"
title: "Protocol pentru workers și anulare"
status: "Done"
release: "V1"
module: "Fundație"
depends_on: ["005","006"]
performance_checks: ["workers", "memory"]
owner: "Codex /root/pbi010_workers"
started_at: "2026-10-05T00:43:18.0941173+03:00"
completed_at: "2026-10-05T00:53:34.2309570+03:00"
---

# 010 Protocol pentru workers și anulare

## Obiectiv

Definește jobId, segmentId, baseVersionId, progres, rezultat și anulare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[02-arhitectura-si-contracte.md](../../Docs/02-arhitectura-si-contracte.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 005 trebuie să existe în Done înainte de începere.
- PBI 006 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Rezultatele întârziate se pot identifica și nu scriu direct starea lumii.
- [x] Un job anulat nu blochează workerul pentru jobul următor.

- [x] Protocolul expune bytes/ownership și prioritate; anularea/progresul nu generează trafic de mesaje neplafonat.

## Verificare

Simulează mesaje în ordine greșită, anulare și eroare de worker.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Protocol pur start/progress/result/cancel/cancelled/error, identitate completă și watermark anti-replay, client și runtime cooperativ cu yield macrotask, adaptor port, ownership/bytes/prioritate și capacități explicite. Nu scrie lumea sau profilul.

Verificări executate și rezultat: 9/9 teste workers PASS inclusiv thread real, typecheck/lint/build/check:architecture PASS, format pe fișiere 010 PASS, Validate-Plan PASS. Proba baseline/final și costul nou trec pragurile provizorii: max felie 2.596 ms, anulare max 4.207 ms, progres la minimum 200 ms. [Dovezi complete](../../Docs/Evidence/010-workers/dovezi.txt). npm check global exit 1 pe formatarea fișierelor PBI011 aflate în lucru; ownerul root verifică ulterior integrarea.

Fișiere și documente actualizate: src/workers/**, tests/workers/**, tests/browser/workers/transport-types.ts, scripts/benchmark-workers.mjs, Docs/worker-protocol.md și Docs/Evidence/010-workers/**. Root actualizează checkerul și legăturile Docs02/README.

Limitări sau follow-up: PBI221 coordonator și integrarea learning/experimente rămân viitoare; runtime cooperativ nu poate preempta callback JS blocant. Dovezile CPU Node worker_threads nu validează FPS/GPU sau WebWorker browser. Starea protejată la capacitate revine callerului; nu există persistență implicită.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '010' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.


- 2026-10-05T00:53:34.2340219+03:00: Protocol implementat, teste și probe workers/memory executate; mutare fizică în Done și validare RequireDone 010.


- 2026-10-05T01:02:26.4011557+03:00: Validare integrată de părinte pentru lotul 007/010/011: npm run check PASS (87 teste), npm run build PASS; Validate-Board -RequireDone 007,010,011 și Validate-Plan PASS. Loguri: Docs/Evidence/011-render-boot/integration-check.txt și integration-build.txt. Avertismentul Vite pentru bundle >500 kB rămâne documentat, fără suprimare.

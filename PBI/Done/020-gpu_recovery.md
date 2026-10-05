---
id: "020"
title: "Resize disposal și recuperare GPU"
status: "Done"
release: "V1"
module: "Babylon"
depends_on: ["012","015","014"]
performance_checks: ["memory", "frame"]
owner: "Codex6.1-Sol medium /root/pbi014"
started_at: "2026-10-05T03:18:43.2800506+03:00"
completed_at: "2026-10-05T03:54:42.4234633+03:00"
---

# 020 Resize disposal și recuperare GPU

## Obiectiv

Implementează resize, cleanup și reconstrucția scenei din snapshot după pierderea dispozitivului.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[03-babylon-engine.md](../../Docs/03-babylon-engine.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 012 trebuie să existe în Done înainte de începere.
- PBI 015 trebuie să existe în Done înainte de începere.
- PBI 014 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Resize/disposal/pierderea GPU reconstruiesc rendererul din snapshotul în RAM, fără dublarea resurselor.
- [x] Un eșec repetat păstrează starea în RAM și oferă reluare; salvarea durabilă este integrată și verificată în 206/216.

- [x] Resize/reload/recovery repetate nu cresc numărul de listeners, texturi sau observers peste plafonul fixat.

## Verificare

Testează resize repetat, disposal și pierdere GPU simulată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Coordinatorul de recuperare deține un checkpoint RAM profund readonly, suspendă simularea existentă și reconstruiește exclusiv rendererul/scena. Bridge nativ WebGL contextlost / WebGPU device.lost, registry015, adapter013 și presenter014 recreează asseturile și pose-urile fără resurse GPU vechi. Composition root păstrează loop-ul012 și diagnosticul019, iar reload/retry nu resetează tick-ul. Cleanup eliberează rendererul și checkpointul; captura invalidă dezactivează retry-ul unui checkpoint vechi.

Verificări executate și rezultat: 7 teste unit recovery PASS, inclusiv lifecycle012 tick420, captură invalidă, callbacks stale, limite RAM și pending disposal. Producție frozen5179 pe Radeon RX7900 XTX, Babylon9.29 / Chromium152: GL și GPU 20 cicluri fiecare, incluzând10 semnale native induse deliberat, PASS; tick417/bodypose neschimbate, max1 engine, plateau3 nodes/2 meshes/1 material/2 textures/1 geometry/3 disposal observers/1 loss subscription/1 resize/1 RAF. Disposal final toate contoarele de ownership0 și RAM cleared. Bootstrapul main.ts real: GL tick2120 și GPU tick1046 păstrate prin loss/reload/repeated failure/UI retry, PASS; pagehide cleanup engine0/UI0. CPU p95 median baseline/new/after: GL0,2/0,4/0,4ms, GPU0,3/0,6/0,5ms, cinci150 iterații timer5ms (30 warmup), cost suplimentar scenă/coordinator0,2ms GL și0,3/0,2ms GPU; sub propunerea CPU10ms Docs25 pe fixture mic. npm test PASS223, architecture PASS, typecheck/lint PASS, build PASS. Rapoarte și PNG: [Evidence020](../../Docs/Evidence/020-gpu-recovery/README.md). Baseline revision0d4d003 include tree frozen cu schimbări concurente necomise; raportat explicit. npm run check final PASS230 (typecheck, lint, format, architecture, teste).

Fișiere și documente actualizate: src/app/renderer-recovery.ts, src/rendering/babylon/recovery-session.ts, src/main.ts, barrelurile publice app/Babylon, tests/app/renderer-recovery.test.ts, tests/browser/gpu-recovery, [contractul recovery](../../Docs/gpu-recovery.md), Docs/Evidence/020-gpu-recovery.

Limitări sau follow-up: loss este provocat prin API-uri native (nu defecțiune hardware observată). Contoare de resurse/ownership, fără GPU time, FPS sau memorie GPU/heap exactă. Bootstrapul curent are numai tick și proiecție de scenă goală; reconstrucția vehiculului GLB/body este verificată separat prin fixture013/014/015. GPU bridge folosește câmpul declarat Babylon9.29 _device, de reverificat la upgrade. RAM snapshot limitat la100000 noduri/adâncime64/32MiB estimate, nu salvare durabilă;206/216 integrează persistence. Nu certifică workload gameplay/benchmark203/218–224.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '020' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.



- 2026-10-05T03:54:42+03:00: Recovery nativ GL/GPU și bootstrap main verificate; npm check PASS230, build PASS, Plan/Board PASS. Mutare fizică în Done și RequireDone020 verificate separat.

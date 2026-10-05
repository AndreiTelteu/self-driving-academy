---
id: "044"
title: "Context rutier pentru fiecare vehicul"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["034","036","038"]
performance_checks: ["simulation", "memory"]
owner: "Codex gpt-6.1-sol medium PBI044"
started_at: "2026-10-05T14:46:58.4958414+03:00"
completed_at: "2026-10-05T15:56:54.8000563+03:00"
---

# 044 Context rutier pentru fiecare vehicul

## Obiectiv

Produce context cu bandă, lider, semnal aplicabil, conflicte și obstacole.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 034 trebuie să existe în Done înainte de începere.
- PBI 036 trebuie să existe în Done înainte de începere.
- PBI 038 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Contextul este derivat din starea simulării și păstrează tick-ul.
- [x] Vehiculele de pe benzi necorelate nu devin lideri falși.

- [x] Contextul folosește indexul spațial și poate fi invalidat urgent; samplingul AI nu schimbă timpii oportunităților sau telemetriei.

## Verificare

Testează bandă comună, intersecție și vecini laterali.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: consumator semantic autonomy din frame autoritar identificat session/epoch/tick, cu bandă/lider orientat3D, semnal036 concret, relații035/politică038 explicită și obstacole/zone034. Cache AI bounded păstrează tick-ul sursă; invalidarea urgentă forțează citirea ultimului frame. Fără resampling de evenimente/telemetrie, legal gap inventat sau importuri Rapier/Babylon. [Contract API](../../Docs/road-context.md).

Verificări executate și rezultat:16/16teste044 PASS; typecheck/architecture/scoped ESLint/Prettier PASS. Baseline exhaustiv capturat înaintea fișierului production;5perechi observer off/on înainte/după pe fixture identic, oracle IDs exacte și checksums PASS. Query p95median normaloff2,156→2,238ms și densoff10,4985→8,0746ms; noul cost frame update separat1,9321/5,7200ms.20cicluri epoch-reset și finaldispose elimină toate contoarele ownership, inclusiv proiecțiile de bandă; heap forcedGC +746936bytes diagnostic. [Raport complet și raw/source identity](../../Docs/Evidence/044-road-context/report.md). Global npm check PASS345teste, typecheck/lint/format/architecture. Mutarea fizică și validatorii se verifică în tranziția finală.

Fișiere și documente actualizate: src/autonomy/road-context.ts; tests/autonomy/road-context.test.ts și road-context-reference.ts; scripts/benchmark-road-context.mjs și measure-road-context-memory.mjs; Docs/road-context.md și Docs/Evidence/044-road-context. Export public autonomy/index.ts și Docs06/README integrate de coordonator. Coordinator npmcheck final PASS345teste/type/lint/format/architecture, log global-check.txt;36fișiere source finale declarate arhivate byte-exact și verificateSHA256.

Limitări sau follow-up: context local cu gap UNKNOWN/LOCAL_ONLY, fără dovezi temporale038; ownerul furnizează route/distanțe SI și observații/completitudine explicite. Nu există bridge live sau IDs inventate pentru obstacole addBox. Plafoane finite provizorii, inclusiv110context/proiecții și1024identități per epoch; vârful atomic două indexuri și copie validată documentat. Probe Node suplimentare fără FPS, laptop sau aprobarea5,5ms whole-game tick; frame-update cost separat, fără sumă de percentile. Limitele de integrare gameplay rămân explicit separate de acest consumator semantic.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '044' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-05T14:46:58.4979911+03:00: dependențe034/036/038 fizicDone verificate; performance_checks memory adăugat înainte de lucru pe tick/cache; pregătire baseline light, CPU/hardware exclusiv023. Implementarea contextului începe numai după baseline și grantCPU.

- 2026-10-05T15:56:54.8000563+03:00: implementare, probe CPU/memorie și globalcheck345PASS; tranziție fizică în Done pentru validarea finală.
- 2026-10-05T15:57:32.4219160+03:00: fișierul există numai în Done; RequireDone044 PASS și Validate-Plan PASS1100links, rezultate arhivate în Evidence044.

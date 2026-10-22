---
id: "139"
title: "Indicatori de confort cu pasager"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["137","088","121"]
performance_checks: ["simulation"]
owner: "loop-pbi/metrics-139-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T16:18:53+03:00"
completed_at: "2026-10-22T17:06:10+03:00"
---

# 139 Indicatori de confort cu pasager

## Obiectiv

Calculează accelerație, accelerație laterală și jerk în intervalele cu pasager pentru toate taxiurile, în AUTO, MANUAL și LEARNING.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 137 trebuie să existe în Done înainte de începere.
- PBI 088 trebuie să existe în Done înainte de începere.
- PBI 121 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Intervalele cu pasager sunt agregate în toate modurile, inclusiv pentru taxiuri în afara camerei, independent de eligibilitatea pentru learning.
- [x] Teleportările și impulsurile de impact nu devin confort al comenzii.
- [x] Impactul real rămâne consecință a experienței pasagerului și intră separat în review.
- [x] Misiunea, dashboardul și modelul review citesc aceleași agregări.
- [x] Agregările per pasager se actualizează incremental, cu cost măsurat în toate modurile și pentru taxiuri nevizibile.

## Verificare

Testează curse lină, bruscă și cu incident în AUTO, MANUAL și LEARNING, inclusiv o cursă mixtă și un taxi nevizibil.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/experiments/comfort-metrics.ts` (`139-comfort-metrics-v1`) și `src/app/comfort-metrics.ts` (`139-comfort-metrics-app-v1`) implementează agregările incrementale de confort cu pasager: intervale longitudinale și laterale, jerk, praguri, agregate per flotă, per mod (`AUTO`, `MANUAL`, `LEARNING`) și per cursă, plus agregatul separat de impacturi. Derivarea intervalelor (`deriveComfortIntervals`), rezumarea (`summarizeComfortIntervals`) și verdictul (`comfortVerdict`) sunt funcții pure unice, folosite și de misiunea 121, deci misiunea, tabloul 082 și modelul de review citesc aceleași agregate dintr-un singur read model. Singura sursă de excludere este filtrul 088 (teleportările 030 și impulsurile de impact nu devin confort al comenzii), iar impactul real 028 rămâne consecință separată, raportată distinct în review. Contract: `Docs/comfort-metrics.md`; dovize: `Docs/Evidence/139-metric-comfort/README.md`.

Verificări executate și rezultat: `npm test` preflight exit 0 (`tests 1978`, `pass 1978`, `fail 0`) și după modificare exit 0 (`tests 1994`, `pass 1994`, `fail 0`, +16 teste 139); `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0 („All matched files use Prettier code style!”); `npm run check:architecture` exit 0 („Architecture imports: PASS (282 TypeScript files)”); `npm run check:parameter-catalog` exit 0 („Parameter catalog is synchronized.”); `npm run metrics:comfort` exit 0 („SUMMARY checks 36/36, scenarios 8, overall PASS”); `npm run metrics:comfort -- --check` exit 0 („Comfort metrics report is current”). Cost local măsurat (provizoriu, pe această mașină): ingest 12 000 intervale în 31,5422 ms (≈2,63 µs/interval), per mod AUTO ≈3,22 µs, MANUAL ≈2,29 µs, LEARNING ≈2,37 µs, taxi nevizibil ≈1,87 µs, 2 000 snapshoturi în 14,9983 ms (≈7,50 µs/snapshot). Validator de board: `pwsh -NoProfile -ExecutionPolicy Bypass -Command "& './PBI/Validate-Board.ps1' -RequireDone '139'"` → exit 0, `Valid: true`.

Fișiere și documente actualizate: adăugate `src/experiments/comfort-metrics.ts`, `src/app/comfort-metrics.ts`, `tests/experiments/comfort-metrics.test.ts`, `tests/experiments/comfort-fixture.ts`, `tests/experiments/comfort-metrics-report.ts`, `scripts/run-metric-comfort-report.mjs`, `Docs/comfort-metrics.md`, `Docs/Evidence/139-metric-comfort/{README.md,report.json,report.md}`; modificate `src/experiments/index.ts`, `src/app/index.ts`, `src/missions/index.ts`, `src/missions/comfort.ts` (evaluatorul 121 apelează derivarea și rezumarea din 139 și expune `comfortMissionOutcomeFromAggregates`), `package.json` (script `metrics:comfort`), `Docs/README.md`, `Docs/14-experimente-si-indicatori.md`, `Docs/metric-service.md`, `Docs/city-dashboard.md`, `Docs/13-misiuni-si-progres.md` și fișierul de board al PBI-ului 139.

Limitări sau follow-up: fără UI, captură de browser, FPS, GPU sau măsurătoare hardware — proba de cost este locală și provizorie, iar validarea rămâne `targeted`; memoria de idempotență (8192 chei FIFO) și modelul de lectură per cursă (512 curse FIFO) sunt mărginite, deci o cursă eliminată pierde agregatul ei per cursă (contoarele de flotă supraviețuiesc); jerkul cere intervalele unei curse în ordine de tick, iar o suprapunere reală este respinsă cu `OUT_OF_ORDER`; coeficienții termenului de confort (2/2/1 puncte, plafon 5) sunt propunerea versionată a formulei de rating din modulul 22, nu o calibrare pe jucători reali; limita laterală este capacitatea mecanică reală a clasei (`grip × 9,81 m/s²`), nu o preferință de confort; adaptorul 082 este livrat și testat, dar nu este încă legat de o buclă de joc (ca 137 și 138, hostul furnizează providerul), iar PBI-ul nu persistă ledgerul, review-urile sau bucketurile (209/210). Notă de rulare: o rulare a suitei complete a eșuat o singură dată în `tests/workers/protocol.test.ts` pe un prag de timp real (`cancel 112,27 ms`), test fără legătură cu 139, care rulează izolat în ≈84 ms; mașina este folosită în paralel de alți agenți, iar celelalte rulări au fost verzi (1994/1994).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '139' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă probe de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare livrată (`139-comfort-metrics-v1` în `src/experiments/comfort-metrics.ts`, `139-comfort-metrics-app-v1` în `src/app/comfort-metrics.ts`): agregări incrementale per pasager în `AUTO`, `MANUAL` și `LEARNING`, excluzare prin filtrul 088, impacturi reale separate, read model comun pentru misiunea 121, tabloul 082 și modelul de review, plus adaptorul 082 `comfortScore`. Verificări: `npm test` 1978 → 1994 teste, toate pass; typecheck, lint, format, arhitectură și catalogul de parametri exit 0; raport determinist 36/36. Cost local măsurat și raportat ca mărime, marcat provizoriu.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

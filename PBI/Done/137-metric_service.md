---
id: "137"
title: "Indicatori de serviciu și expunere"
status: "Done"
release: "V1"
module: "Experimente și indicatori"
depends_on: ["063","028","085"]
performance_checks: ["simulation"]
owner: "opencode deepseek-v4.1-flash metric-service-01"
started_at: "2026-10-21T12:54:28.173Z"
completed_at: "2026-10-21T16:13:51+03:00"
---

# 137 Indicatori de serviciu și expunere

## Obiectiv

Calculează durate, finalizări, kilometri-vehicul și timp blocat.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 028 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Denominatoarele includ toată flota și au unități.
- [x] Expunerea zero produce indisponibil, nu o rată aparent perfectă.

- [x] Agregările sunt incrementale pe evenimente idempotente; nu se rescanează istoricul întreg la fiecare tick sau refresh HUD.

## Verificare

Testează flotă nevizibilă și lipsa curselor/distanței.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Serviciul `137-metric-service-v1` acumulează incremental cinci tipuri de evenimente idempotente: curse terminale, distanță pe vehicul, intervale blocate, coliziuni și încălcări cu oportunitate. Fiecare eveniment are parser strict, identitate mărginită, valori finite nenegative și cheie de idempotență; reluarea aceluiași `eventId` este `DUPLICATE` și nu schimbă nimic, iar cheile sunt păstrate într-o fereastră mărginită de 8192. Nu se păstrează istoric de evenimente: toate agregatele sunt contoare, sume și min/max, deci `historyScans` este structural 0 și 101 snapshoturi pe date neschimbate returnează exact aceleași valori. Denominatoarele folosesc exclusiv `fleet.counts()` — toată flota, inclusiv vehiculele nevizibile/neselectate — iar expunerea este `vehicule × secunde simulate`. Fiecare metrică are unitate (count, seconds, metres, km, ratio, per100km, percentage), stare `AVAILABLE|UNAVAILABLE`, valoare, mărimea eșantionului și motiv închis. Expunerea zero, lipsa curselor, lipsa distanței, flota zero sau lipsa oportunităților produc `UNAVAILABLE` cu `value:null`, niciodată o rată perfectă; un zero real cu numitor real este `AVAILABLE` cu valoarea 0. Sunt expuse finalizări, eșecuri, anulări, rata de finalizare, durate medii pickup/cursă, distanța totală, kilometri-vehicul, timp blocat și fracția blocată, coliziuni la 100 km-vehicul și încălcări per oportunitate. Adaptorul pentru 082 produce `completedRides`, `averageRideSeconds`, `totalDistanceM`, `collisions` și `blockages`; violations/comfort rămân `SOURCE_MISSING` pentru 138/139.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (232 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1553/1553 pass, 0 fail (preflight înainte: 1533/1533); `npm run metrics:service` 44/44 verificări, 7 scenarii, overall PASS; `npm run metrics:service -- --check` „Metric service report is current”. Testele țintite 137: 20/20 pass. Raportul acoperă flotă invizibilă, fără curse, fără distanță, zero real, coliziuni la 100 km, timp blocat și proba locală de 20.000 de evenimente. Proba locală: 20.000 evenimente în 47,15 ms (≈2,36 µs/eveniment) și 2.000 snapshoturi în 6,28 ms (≈3,14 µs/snapshot), marcate explicit ca locale și provizorii. Dovezi: [report.json](../../Docs/Evidence/137-metric-service/report.json), [report.md](../../Docs/Evidence/137-metric-service/report.md), [README](../../Docs/Evidence/137-metric-service/README.md).

Fișiere și documente actualizate: `src/experiments/metric-service.ts`, `src/app/metric-service.ts`, `src/experiments/index.ts`, `src/app/index.ts`, `tests/experiments/metric-service.test.ts`, `tests/experiments/metric-service-report.ts`, `scripts/run-metric-service-report.mjs`, `package.json`, `Docs/metric-service.md`, `Docs/14-experimente-si-indicatori.md`, `Docs/README.md` și `Docs/Evidence/137-metric-service/`.

Limitări sau follow-up: Nu există UI, captură browser, FPS, GPU sau măsurători hardware; proba de throughput este locală și provizorie. Cheile de idempotență sunt doar în memorie și mărginite (8192 FIFO); o reluare foarte veche poate fi numărată din nou, iar cheile nu supraviețuiesc reload-ului. Istoricul 065 nu conține durata blocajului, deci hostul trebuie să o măsoare; altfel adaptorul sare explicit, fără secunde inventate. Numitorul de oportunități este declarat de apelantul 086 la snapshot; clasificarea/atribuirea rămân 138/139. Nu există persistență de ledger/bucket (209/210) și nu a fost modificat contractul 082.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '137' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-21: Implementare finalizată: serviciu incremental pe evenimente idempotente, denominatoare pe toată flota cu unități, indisponibil la expunere zero, adaptor 082, 20 de teste, raport cu 44 de verificări și probă locală de throughput. Mutat fizic în Done după validare.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

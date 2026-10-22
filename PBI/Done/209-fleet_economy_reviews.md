---
id: "209"
title: "Revenue-ul flotei și review-uri ale curselor 0–5"
status: "Done"
release: "V1"
module: "Economie"
depends_on: ["063","065","137","139","208"]
performance_checks: ["simulation", "storage"]
owner: "loop-pbi/economy-209-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T20:22:34+03:00"
completed_at: "2026-10-22T21:00:02+03:00"
---

# 209 Revenue-ul flotei și review-uri ale curselor 0–5

## Obiectiv

Implementează tarife versionate, încasări/rambursări și review-uri simulate ale experienței pasagerului.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [22-kpi-economie-si-review-uri.md](../../Docs/22-kpi-economie-si-review-uri.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 063 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 137 trebuie să existe în Done înainte de începere.
- PBI 139 trebuie să existe în Done înainte de începere.
- PBI 208 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare rezultat comercial și review este idempotent, inclusiv după schimbarea modelului de review; civilii nu intră în veniturile flotei.
- [x] Ratingul 0–5 include confort, întârziere și incidente reale, cu motive explicabile.
- [x] Scenarii comparabile arată eficiență cu ratings bune și throughput mai mare cu ratings mai slabe.

- [x] Bucketurile și reviews sunt actualizate incremental; citirea KPI-urilor nu reprocesează întregul ledger.

## Verificare

Testează finalizare/eșec/anulare, curse mixte, impact, ocoluri, duplicate și două stiluri pe aceeași cerere.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/economy/` livrează schema `209-fleet-economy-v1`: `tariffs.ts` (`209-tariff-v1`, 240 bază + 180/km + 90/min + 3000 bp taxă de anulare), `ledger.ts` (`209-fleet-ledger-v1`), `reviews.ts` (`209-review-v1`), `kpi.ts` (`209-fleet-kpi-v1`), `ride-outcome.ts` (singurul adaptor 061 + `LaneGraph`) și `economy.ts` (facada care compune ledgerul, review-urile și bucketurile). Devizul este fixat la acceptare din distanța planificată (`tripRouteLaneIds`) și durata de referință (`tripCostSeconds`), deci ocolul și așteptarea nu ridică prețul. COMPLETED încasează tariful complet, FAILED și CANCELLED fără pasager 0, CANCELLED cu pasager doar taxa de serviciu versionată; excepțiile sunt rambursări explicite care referă încasarea. Un rezultat `CIVILIAN` este respins înainte de deviz, deci civilii nu ajung în revenue, curse sau review-uri. Review-ul este unic per `rideId`, derivat din întârzierea reală, confortul 139 (`comfortReviewModel`), incidentele 028 reale și un vocabular închis de motive; reluarea este `DUPLICATE`, alt `eventId` este `EXISTING`, iar rescrierea cere `reissueReview` cu `acknowledgeModelChange: true` și crește `revision`. Bucketurile de zi și lună se actualizează în același apel cu settle-ul/review-ul, revizia aplică delta, iar `snapshot` raportează structural `historyScans: 0`. Contractul este documentat în `Docs/22-kpi-economie-si-review-uri.md`, iar dovezile în `Docs/Evidence/209-fleet-economy-reviews/README.md`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0, 0 warnings; `npm run format:check` exit 0 („All matched files use Prettier code style!”); `npm run check:architecture` exit 0 („Architecture imports: PASS (305 TypeScript files)”, probe negative 6/4/3 și lifecycle PASS); `npm run check:parameter-catalog` exit 0 („Parameter catalog is synchronized.”); `node --import ./scripts/register-typescript.mjs --test "tests/economy/*.test.ts"` → `tests 62`, `pass 62`, `fail 0`; `npm test` → `tests 2136`, `pass 2136`, `fail 0`, 76,9 s; `npm run fleet:economy -- --check` exit 0 (10/10 checks, „Fleet economy report is current”). Raportul determinist: deviz 551, neschimbat de un ocol de 300 s (întârziere 0,006947 s → 300,006947 s, rating 5 → 3); settle-uri 551/0/0/165; stilul eficient 2 curse în fereastră, revenue 1102, rating mediu 5 (5, 5, 5); stilul agresiv 3 curse, revenue 1653, rating mediu 1,333333 (1, 1, 2); bucketul zilei 4 curse terminale (1 completed, 1 failed, 2 cancelled), 3 review-uri, medie 3,666667, revenue lunar 716, `historyScans: 0`. Cost local măsurat (Node 24, Windows, execuție warm, 30 runde × 10 curse reale 061/139, marcat provizoriu): ingest settle+review medie 0,0602 ms, p95 0,1122 ms, max 0,5747 ms (300 eșantioane); `snapshot` medie 0,0071 ms, p95 0,0125 ms, max 0,0691 ms (3000 eșantioane); după 10 curse rămân 10 settle-uri, 12 intrări de ledger, 10 review-uri, 1 zi și 1 lună. Validator de board: `pwsh -NoProfile -ExecutionPolicy Bypass -Command "& './PBI/Validate-Board.ps1' -RequireDone '209'"` → exit 0, `Valid: true`.

Fișiere și documente actualizate: adăugate `src/economy/{tariffs,ledger,reviews,kpi,ride-outcome,economy}.ts`, `tests/economy/{economy-fixture, tariffs.test, ledger.test, reviews.test, kpi.test, economy.test, economy-report, economy-report.test}.ts`, `scripts/run-fleet-economy-report.mjs`, `Docs/Evidence/209-fleet-economy-reviews/{README.md,report.json,report.md}`; modificate `src/economy/index.ts` (export public), `package.json` (scriptul `fleet:economy`, ultima intrare din blocul `scripts`), `Docs/22-kpi-economie-si-review-uri.md` (secțiunea „Contract implementat în V1 (PBI 209)”) și fișierul de board al PBI-ului 209.

Limitări sau follow-up: fără browser, FPS, GPU sau măsurătoare hardware — proba de cost este locală și provizorie, iar nivelul rămâne `targeted`; feedbackul rating→cerere este rezervat unei revizii ulterioare, deci revenue și rating rămân rezultate independente ale acelorași curse; persistarea ledgerului/bucketurilor în checkpoint și migrarea aparțin straturilor 127–136, modulul expunând doar snapshoturi înghețate; popup-ul KPI, paginarea review-urilor și downsampling-ul graficelor sunt scope 210; memoria este mărginită (4096 settle-uri FIFO, 4096 review-uri FIFO cu 8192 chei de idempotență, 512 zile, 24 luni), deci un element eliminat nu mai poate fi reafișat din ledger; coeficienții de tarif și de review sunt constante versionate în modul, nu parametri din catalogul de condus, deci `Docs/driving-parameters.json` rămâne neschimbat.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '209'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementare livrată (`209-fleet-economy-v1` în `src/economy/`): tarife versionate `209-tariff-v1`, ledger comercial cu rambursări explicite și respingerea civililor, review-uri 0–5 din fapte 061/139/028 cu idempotență și reissue explicit, KPI incremental pe zi/lună cu `historyScans: 0` și raport determinist `npm run fleet:economy`. Verificări: 62 teste țintă și 2136 teste de suită, toate pass; typecheck, lint, format, arhitectură și catalog de parametri exit 0; raport 10/10. Cost local măsurat și raportat ca mărime, marcat provizoriu. PBI mutat fizic în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

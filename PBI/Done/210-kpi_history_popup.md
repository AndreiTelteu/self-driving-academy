---
id: "210"
title: "Buton KPIs și grafice istorice ale flotei"
status: "Done"
release: "V1"
module: "UI"
depends_on: ["209","075","082","084"]
performance_checks: ["ui", "frame"]
owner: "loop-pbi/kpi-210-01"
started_at: "2026-11-11T04:29:00+02:00"
completed_at: "2026-11-11T04:50:06+02:00"
---

# 210 Buton KPIs și grafice istorice ale flotei

## Obiectiv

Deschide prin buton KPIs/K un pop-up detaliat pentru revenue lunar, ratings și agregări zilnice.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [22-kpi-economie-si-review-uri.md](../../Docs/22-kpi-economie-si-review-uri.md)
- [08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 209 trebuie să existe în Done înainte de începere.
- PBI 075 trebuie să existe în Done înainte de începere.
- PBI 082 trebuie să existe în Done înainte de începere.
- PBI 084 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Graficele arată revenue lunar efectiv/proiectat, curse/zi, review-uri/zi, media și distribuția notelor.
- [x] Media ponderată, zero/lipsă date, luni parțiale și sample count sunt afișate corect.
- [x] Focusul, tabelul accesibil, Escape și pauza MANUAL/LEARNING funcționează la rezoluțiile țintă.

- [x] Istoricul de 12 luni este paginat/downsampled numai vizual, fără medii greșite; panoul închis nu reconstruiește grafice.

## Verificare

Inspectează grafice pe date cunoscute, perioade fără review-uri, limite de lună și operare cu tastatura.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: Pop-up-ul KPI este livrat în `src/ui/kpi-history.ts` (`210-kpi-history-popup-v1`) peste selectorul read-only `src/economy/kpi-history.ts` (`210-kpi-history-v1`) și proiecția `src/ui/kpi-history-format.ts`. Butonul `<button type="button">KPIs</button>` deschide un dialog cu cinci grafice HTML deterministe (revenue lunar efectiv/proiectat, curse/zi, review-uri/zi, media/zi, distribuția 0–5) și trei tabele accesibile. Fereastra de 12 luni are un slot „fără date” pentru luna lipsă, media este `ratingSum / reviewCount` peste sumele exacte, luna curentă este marcată parțială și proiectată separat. Downsampling-ul zilnic este numai vizual: 310 zile exacte → 52 de puncte la plafonul de 60, cu sume exacte în grup. Deschiderea citește read model-ul 209 o singură dată; `historyScans` rămâne 0, iar panoul închis nu citește și nu randează nimic.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0 („All matched files use Prettier code style”); `npm run check:architecture` exit 0 (314 fișiere TS, toate probele PASS); `npm run check:parameter-catalog` exit 0; `npm test` 2186 teste, 2186 pass, 0 fail, 1 suite (~74 s); testul țintă `tests/ui/kpi-history.test.ts` 21/21 pass; `npm run kpi:history` 26/26 verificări PASS cu `historyScans 0/0`, iar `npm run kpi:history -- --check` exit 0 (raportul committed este curent). Numere reale: 310 settle-uri, 284 review-uri, 12 luni (11 cu date, 1 fără date, 1 parțială, 10 încheiate), revenu 31960 SDA, media ponderată 2.552817 față de 2.5 cât ar da media mediilor lunare, distribuția 49/45/45/45/45/55, proiecție 3483 SDA din 10800.15 s, 1369 elemente, 3 listeners (0 globali), 1 citire la deschidere.

Fișiere și documente actualizate: `src/economy/kpi-history.ts`, `src/economy/index.ts`, `src/ui/kpi-history.ts`, `src/ui/kpi-history-format.ts`, `src/ui/index.ts`, `tests/ui/kpi-history-fixture.ts`, `tests/ui/kpi-history.test.ts`, `tests/ui/kpi-history-report.ts`, `scripts/run-kpi-history-report.mjs`, `package.json`, `Docs/22-kpi-economie-si-review-uri.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/Evidence/210-kpi-history-popup/` (`README.md`, `report.json`, `report.md`) și acest fișier PBI.

Limitări sau follow-up: Nivel `targeted`: dovezile sunt deterministe, fără browser real, FPS sau cost GPU; gate-urile integrate rămân 155/159/220/224. Pop-up-ul nu este adăugat în lista închisă a descriptorilor 083, ca să nu schimbe contractul și dovezile 083; respectă aceleași reguli de focus/Escape și zero listeners globali. Montarea butonului în panoul flotei și bindingul tastei K rămân ale hostului, care apelează `open()`. Stilurile sunt inline, ca să nu se modifice `src/style.css` în afara ownership-ului.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '210'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-11: Implementare `targeted` finalizată pe branch-ul `loop-pbi/kpi-210-01`: selector read-only 209, pop-up accesibil, raport determinist 26/26 și 2186 teste pass; fișierul se mută fizic în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

---
id: "131"
title: "Autosave și închiderea sesiunii"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["128","129","130","206","222"]
performance_checks: ["storage", "frame"]
owner: "loop-pbi/autosave-131-01"
started_at: "2026-11-11T15:03:11+02:00"
completed_at: "2026-11-11T18:20:15+02:00"
---

# 131 Autosave și închiderea sesiunii

## Obiectiv

Leagă salvările periodice și evenimentele de închidere.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 128 trebuie să existe în Done înainte de începere.
- PBI 129 trebuie să existe în Done înainte de începere.
- PBI 130 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] UI indică pending, succes și eroare fără a pretinde o salvare neterminată.
- [x] Timpul de salvare este separat de timpul simulat.

- [x] Autosave folosește pipeline-ul 222; cererile redundante sunt coalesced fără a pierde evenimente protejate și fără salvare finală garantată la shutdown.

## Verificare

Testează periodic, close intervention și eroare de scriere.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/session-autosave.ts` (contract `131-autosave-v1`) leagă pipeline-ul 222 și salvarea 130. Autosave-ul este periodic la 900 tick-uri (15 s la 60 Hz), nu la fiecare tick: un tick nescadent costă o comparație și zero citiri de ceas. O fereastră care se suprapune cu o scriere intră într-un singur slot `deferred`; la eliberarea benzii se salvează o dată, la următoarea graniță. Ciclul scrie progresul 130 (tracker, campanie, setări) înainte de checkpointul 222. `close()` îngheață ferestrele, așteaptă scrierea în curs, scrie progresul și apoi checkpointul final; rezultatul explicit este `SAVED`/`PARTIAL`/`FAILED`/`NOTHING_TO_SAVE`/`ALREADY_CLOSED`, cu tick durabil, `unsavedTicks`, cod și `retryable`. O închidere eșuată nu este raportată ca succes, payload-ul rămâne pentru `retryClose`, iar după moartea paginii baza este ultimul commit confirmat. Proiecția de stare pentru UI expune `PENDING`/`SUCCESS`/`ERROR` și `claimsCompletedSave` (adevărat numai după un commit confirmat cu zero tick-uri nesalvate), separat de timpul simulat.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (331 fișiere TypeScript, probe negative 6+4+3); `npm run check:parameter-catalog` „synchronized”; `npm test` 2376/2376 pass, 0 fail, 80309.4534 ms; testele țintă 20/20 pass, 1110.0512 ms; `npm run autosave:session` 61/61 verificări, overall PASS; `--check` „Autosave report is current”; `--cost --samples 20` a scris `cost.json`/`cost.md` (capture median 0,027 ms din bugetul de tick de 5,5 ms desktop, encode 4,342 ms, commit 7,098 ms, total 12,806 ms).

Fișiere și documente actualizate: create `src/persistence/session-autosave.ts`, `tests/persistence/autosave-fixtures.ts`, `tests/persistence/autosave.test.ts`, `tests/persistence/autosave-report.ts`, `scripts/run-autosave-report.mjs`, `Docs/Evidence/131-autosave/` (README, report.json, report.md, cost.json, cost.md); modificate `src/persistence/index.ts` (exporturi la final), `package.json` (scriptul `autosave:session`, ultima intrare), `Docs/15-salvare-si-import-export.md` (secțiune nouă la final).

Limitări sau follow-up: nivel `targeted` (fără browser real, FPS, hardware); contractul de stare pentru UI este livrat și testat, dar montarea în panoul DOM rămâne la compunere pentru că `src/ui` este read-only în acest PBI; persistarea este verificată pe dublul în memorie peste porturile 127, nu pe IndexedDB real; encode-ul rulează sincron în microtask, nu feliat în worker; o închidere eșuată este reluabilă numai cât timp pagina trăiește, iar shutdownul nu garantează salvarea finală. Dovezi: [Docs/Evidence/131-autosave](../../Docs/Evidence/131-autosave/README.md).

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '131' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-11-11: Implementare livrată (`131-autosave-v1`): autosave la 900 tick-uri, coalescing plafonat, contract de închidere explicit cu retry, proiecție de stare și cost separat; 20 de teste țintă și 61/61 verificări în raport, suita completă 2376/2376.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

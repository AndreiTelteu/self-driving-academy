---
id: "225"
title: "Sesiuni Academie și Joacă liberă Haos"
status: "Done"
release: "V1"
module: "Experiență"
depends_on: ["215","205","065","070"]
performance_checks: ["storage", "memory", "frame"]
owner: "loop-pbi/session-kinds-225-01"
started_at: "2026-11-11T22:13:31+02:00"
completed_at: "2026-11-11T22:48:34+02:00"
---

# 225 Sesiuni Academie și Joacă liberă Haos

## Obiectiv

Oferă Academie și Haos de la început, cu lumi/profiluri izolate și revenire la checkpoint fără modificarea campaniei.

## Context și plan

- [26-joaca-libera-haos-si-distrugere.md](../../Docs/26-joaca-libera-haos-si-distrugere.md)
- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 215 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.
- PBI 065 trebuie să existe în Done înainte de începere.
- PBI 070 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] SessionKind nu înlocuiește AUTO/MANUAL/LEARNING; selecția oricărei mașini și condusul liber sunt disponibile în ambele sesiuni.
- [x] Haos copiază explicit profilul ales, are recorduri/checkpoint proprii și nu consumă daily sau ledger/XP Academie.
- [x] Schimbarea închide segmentul, salvează atomic, invalidează joburile prin sessionId/worldEpoch/learningEpoch și eliberează inputul.
- [x] Există o singură lume fizică live; salvarea eșuată păstrează lumea curentă, iar reload reia în pauză/AUTO.
- [x] Copierea explicită a stilului Haos în Academie validează profilul și nu transferă progres; 20 de tranziții nu lasă resurse/joburi rezidente.

## Verificare

Testează Academie→Haos→Academie, learning în curs, rezultat întârziat, quota/crash, reload și copiile profilului; măsoară memoria și commitul.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/session-kinds.ts` (contract `225-session-kinds-v1`) livrează axa `SessionKind` separată de AUTO/MANUAL/LEARNING, copia explicită și independentă a profilului 109 pentru Haos, poarta de izolare peste instanțele reale 212/213/125, checkpointuri separate pe tip de sesiune, gazda cu o singură lume vie (închidere segment, commit atomic, invalidare de joburi după `sessionId`/`worldEpoch`/`learningEpoch`, eliberare input, salvare eșuată care păstrează lumea, reload/restore în `PAUSED_AUTO`) și politica de transfer care refuză orice promovare Haos→Academie în afara copiei explicite de stil.

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture` PASS (348 fișiere); `npm run check:parameter-catalog` PASS; `npm test` 2530/2530 pass, 0 fail, 79 351 ms; testele țintă 15/15 pass; `npm run session:kinds` 45/45 verificări PASS; `npm run session:kinds -- --check` raportează transcript curent. Numere: amprenta combinată `sha256:0756ca4b…3b68` identică înainte/după Haos; 6 operații contabile refuzate; 500 000 micro-XP doar prin delegarea Academiei; 20 de tranziții → 20 checkpointuri (10/10), 773 B total (max 40 B), 1 lume vie, 2 joburi, 1 listener, 1 copie de profil, 0 orfani; salvare eșuată → epoca rămâne 1, 0 checkpointuri, reîncercarea comite.

Fișiere și documente actualizate: `src/persistence/session-kinds.ts` (nou), `src/persistence/index.ts`, `tests/persistence/session-kinds-fixture.ts`, `tests/persistence/session-kinds.test.ts`, `tests/persistence/session-kinds-report.ts`, `tests/persistence/session-kinds-report.test.ts`, `scripts/run-session-kinds-report.mjs`, `package.json`, `Docs/26-joaca-libera-haos-si-distrugere.md`, `Docs/15-salvare-si-import-export.md`, `Docs/Evidence/225-session-kinds/README.md` + `report.json` + `report.md`.

Limitări sau follow-up: Adaptorul durabil al portului `SessionKindCheckpointStore` rămâne al stratului de compoziție; aici este livrat magazinul determinist în memorie cu aceleași reguli închise. Captura lumii este un port determinist (4 vehicule), nu un physics world real; costul hardware al capturii aparține probelor 206/224. Nivelul este `targeted`: storage raportează bytes măsurați, memoria este raportată ca contoare de proprietate, iar `totalHeapBytes` rămâne `null` în manifest. Nu există modificări de UI, deci verificarea vizuală nu se aplică acestui PBI.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '225'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-11: Implementare finalizată pe branch-ul `loop-pbi/session-kinds-225-01`: contract `225-session-kinds-v1`, teste țintă 15/15, suita completă 2530/2530, raport determinist 45/45; fișier mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

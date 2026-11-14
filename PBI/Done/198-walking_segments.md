---
id: "198"
title: "Intervenții și telemetrie cu personaj"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["197","069"]
owner: "loop-pbi/v3-telemetry-198-01"
started_at: "2026-11-14T23:48:41+02:00"
completed_at: "2026-11-15T00:03:06+02:00"
---

# 198 Intervenții și telemetrie cu personaj

## Obiectiv

Leagă intrarea/ieșirea de închiderea segmentelor de condus.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 197 trebuie să existe în Done înainte de începere.
- PBI 069 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Mersul nu este demonstrație de driving; numai LEARNING închis produce estimator.
- [x] Intrarea/ieșirea și selectarea distantă păstrează autoritatea unică și modurile explicit alese.

## Verificare

Testează intrare, ieșire și schimbare rapidă după câteva străzi.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `198-walking-segments-v1` din `src/character/walking-segments.ts` este un read model pur (fără telemetrie scrisă, fără analiză lansată, fără ceas) care decide la fiecare tranziție acceptată ce segment se închide și cu ce fel. `WALK` numără tick-uri și metri și nu poate produce segment; `ENTER` (195/197 TAKE) deschide `MANUAL` implicit sau `LEARNING` numai la cerere explicită; `EXIT` (196/197 RETURN) închide cu `RETURN_TO_AUTO`; schimbarea mașinii închide cu `VEHICLE_SWITCH`; `FOCUS` nu închide nimic. Poarta estimatorului copiază regula reală 069: `LEARNING` + `learningEligible` înghețat la deschidere + `CLOSED` + aceeași identitate lume/jucător/profil/epocă/versiune. Segmentul trunchiat de o ieșire rămâne eligibil; numai `DATA_LOSS` (`INCOMPLETE`) îl descalifică. Starea este serializabilă și reluabilă strict pentru 200.

Verificări executate și rezultat:
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run format:check` — „All matched files use Prettier code style!”.
- `npm run check:architecture` — PASS (408 fișiere TypeScript).
- `npm run check:parameter-catalog` — „Parameter catalog is synchronized.”.
- `npm test` — 3375 teste, 3375 pass, 0 fail.
- Teste țintă — `tests/character/walking-segments.test.ts` 12/12 pass; `tests/character/walking-segments-report.test.ts` 1/1 pass.
- `npm run walking:segments` — 16/16 scenarii, overall PASS; 3600 tick-uri/82,26 m de mers → 0 segmente și 0 candidați; plafon 1000 tick-uri × 50 m (50 km) → 0 și 0; control 1 segment; MANUAL 0 candidați, LEARNING 1, țintă neeligibilă 0, trunchiat 1; verificare încrucișată 069 identică pe 6 cazuri; digest SHA-256 `87a00a30855732eab84029ace8638843c5eb16e1389b3bd9b66ca1e03ecb14c2`.
- `npm run walking:segments -- --check` — raport curent.

Fișiere și documente actualizate: `src/character/walking-segments.ts` (nou), `src/character/index.ts` (export), `tests/character/walking-segments-suite.ts` (nou), `tests/character/walking-segments.test.ts` (nou), `tests/character/walking-segments-report.test.ts` (nou), `scripts/run-v3-walking-segments-report.mjs` (nou), `package.json` (o intrare nouă `walking:segments`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiunea 198), `Docs/Evidence/198-v3-walking-segments/{report.json,report.md,README.md}`.

Limitări sau follow-up: contractul este read model, consumatorul real rămâne 069; candidatul expune intrările porții, nu descriptorul (operationId/recordBytes rămân la telemetrie); ținta este fixă pe durata instanței (schimbările de profil sunt granițe `PROFILE_CHANGE` ale 069); numai tranzițiile acceptate intră în model; `INCOMPLETE` este modelat doar în poartă; integrarea în bucla jocului și feedback-ul vizual rămân la compunerea ulterioară.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '198' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-11-15: Implementat contractul `198-walking-segments-v1` (segmente MANUAL/LEARNING/niciunul, poarta 069 copiată, segment trunchiat eligibil, mod explicit, FOCUS fără închidere, stare pentru 200); raport determinist 16/16, suita completă 3375/3375.

# 198 — intervenții și telemetrie cu personaj

Dovezile PBI 198 pentru contractul `198-walking-segments-v1` din
[`src/character/walking-segments.ts`](../../../src/character/walking-segments.ts).

## Ce s-a livrat

- **Read model pur de segmentare.** Tranzițiile sunt exact cele pe care le acceptă deja contractele
  livrate: `ENTER` primește autoritatea `VEHICLE:<id>` a lui 195/197 TAKE, `EXIT` primește
  `CHARACTER:<id>` a lui 196/197 RETURN, `FOCUS` copiază autoritatea 193 neschimbată, iar `WALK`
  numără tick-urile și metrii mersului. Contractul nu scrie în telemetrie și nu lansează analiza.
- **`WALK` nu poate produce driving.** Un segment se deschide numai pe un `ENTER` cu autoritatea
  reală a mașinii; `WALK` nu are cale de creare de segment și nici de candidat. Mersul rămâne, prin
  construcție, în afara profilului de driving.
- **Poarta 069, copiată nu inventată.** `estimatorCandidate` este conjuncția reală din
  `intervention-lifecycle.ts`: `controlMode === 'LEARNING'`, `learningEligible` înghețat la
  deschidere, `completeness === 'CLOSED'` și aceeași identitate de lume/jucător/profil/epocă/versiune
  de bază ca ținta. `target.learningEligible` nu este recitit la închidere, exact ca în 069.
- **Segmentul trunchiat.** O ieșire în mijlocul unei manevre închide segmentul cu `CLOSED` și îl
  lasă eligibil, pentru că 069 nu are regulă de manevră completă. `DATA_LOSS` este singurul motiv
  care produce `INCOMPLETE`, iar atunci poarta refuză candidatul în ambele contracte.
- **Mod explicit și autoritate unică.** `ENTER` fără alegere explicită deschide exact modul de intrare
  al lui 195 (`MANUAL`); un TAKE nu ghicește `LEARNING` din segmentul anterior. `RETURN` închide și nu
  deschide nimic; `FOCUS` nu închide nimic și nu schimbă autoritatea sau modul.
- **Stare serializabilă pentru 200.** `snapshot()` / `parseWalkingSegmentsState` oferă date pure,
  înghețate, cu parser strict invers și continuare corectă a secvenței de ID-uri.
- **Un singur script nou în `package.json`**: `walking:segments` (ultima intrare din `scripts`), cu
  `--check`.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0 (`eslint . --max-warnings 0`) |
| `npm run format:check` | „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS (408 fișiere TypeScript, probe negative incluse) |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `npm test` | 3375 teste, 3375 pass, 0 fail (13 teste noi) |
| `node --import ./scripts/register-typescript.mjs --test tests/character/walking-segments.test.ts` | 12/12 pass |
| `node --import ./scripts/register-typescript.mjs --test tests/character/walking-segments-report.test.ts` | 1/1 pass |
| `npm run walking:segments` | 16/16 scenarii, walking PASS, gate PASS, explicit mode PASS, focus PASS, overall PASS |
| `npm run walking:segments -- --check` | „Walking segments report is current” pentru `report.json` și `report.md` |

Numerele din raportul determinist:

- **Criteriul 1a:** 3600 tick-uri de mers la viteza reală a clipului (1,3710 m/s ÷ 60 Hz, adică
  **82,26 m**) produc **0** segmente de driving și **0** candidați; plafonul „oricât" de 1000
  tick-uri × 50 m (**50 km**) produce tot **0** și **0**. Controlul aceluiași model produce exact
  **1** segment când autoritatea părăsește corpul.
- **Criteriul 1b:** MANUAL închis → **0** candidați; LEARNING închis → **1** candidat; LEARNING cu
  țintă neeligibilă → **0**; LEARNING trunchiat de o ieșire cu `LANE_CHANGING` → **1** candidat.
- **Verificarea încrucișată cu 069** (ciclul de viață real, închis de aceleași granițe): MANUAL **0**
  intrări, LEARNING **1**, țintă neeligibilă **0**, trunchiat de ieșire **1**, țintă schimbată după
  deschidere **1**, `DATA_LOSS` **0** — identice cu proiecția 198 pe toate cele **6** cazuri.
- **Criteriul 2:** matricea mod anterior (`MANUAL`/`LEARNING`) × tranziție (`TAKE`/`RETURN`/`FOCUS`)
  trece **6/6**; TAKE deschide mereu `MANUAL` fără alegere explicită, FOCUS închide **0** segmente.
- Determinism: 2 construcții identice, SHA-256
  `87a00a30855732eab84029ace8638843c5eb16e1389b3bd9b66ca1e03ecb14c2`.

## Fișiere atinse

- `src/character/walking-segments.ts` (nou) — contractul.
- `src/character/index.ts` — export la finalul fișierului.
- `tests/character/walking-segments-suite.ts` (nou) — suita deterministă și raportul.
- `tests/character/walking-segments.test.ts` (nou) — 12 teste de contract.
- `tests/character/walking-segments-report.test.ts` (nou) — testul raportului și al determinismului.
- `scripts/run-v3-walking-segments-report.mjs` (nou) — scriptul `walking:segments`.
- `package.json` — o singură intrare nouă, `walking:segments`, ultima din `scripts`.
- `Docs/20-extensii-si-mers-pe-jos.md` — secțiunea 198 la final.
- `Docs/Evidence/198-v3-walking-segments/{report.json,report.md,README.md}`.
- `PBI/Done/198-walking_segments.md` — mutat fizic din `In Progress`.

## Cum se citește raportul

- `report.json` este sursa de adevăr pentru cifre; `report.md` este transcrierea lui lizibilă.
- Secțiunea „mers = 0 segmente" arată cele două probe de mers și controlul care produce un segment.
- Tabelul de tranziții leagă fiecare scenariu de segmentul închis, felul lui, motivul, manevra
  întreruptă, candidați și segmentul deschis.
- Matricea de moduri arată cele 6 combinații (mod anterior × tranziție).
- Secțiunea porții 069 pune față în față intrările reale ale ciclului de viață 069 și candidații
  proiectați de 198, caz cu caz.

## Limitări

- Contractul este un read model: nu scrie în telemetrie și nu lansează analiza; consumatorul real
  rămâne 069.
- Candidatul expune intrările porții 069, nu descriptorul 069: `operationId` și `recordBytes` aparțin
  proprietarului telemetriei.
- Ținta (jucător/profil/epocă/versiune de bază) este fixă pe durata instanței; schimbările de profil
  sunt granițe `PROFILE_CHANGE` ale 069, nu ale acestui contract.
- Numai tranzițiile deja acceptate intră aici: un TAKE refuzat de 195/197 nu produce segment.
- `INCOMPLETE` (`DATA_LOSS`) este modelat în poartă, dar contractul nu produce tranziții de pierdere
  de date.
- Modulul nu simulează mașina: durata conducerii se citește din `startTick`/`endTick`, iar starea
  manevrei este cea raportată de proprietarul 024.
- Proba este deterministă și headless; integrarea în bucla jocului și feedback-ul vizual rămân la
  compunerea ulterioară (200/UI).

# Dovezi 208 — propagarea stilului către taxiuri și civili

Status: implementare și validare funcțională locală. Contract `208-city-style-v1`, harness offline
în `src/app/city-style-propagation.ts`. Nu există captură de browser, măsurătoare FPS/GPU, corp
Rapier sau scriere de fizică.

## Ce dovedește

Sesiunea leagă modulele reale 057 (registry), 110 (activare), 058 (trafic civil), 112 (pipeline, cu
outcome 103 injectat) și țintele 106. Șapte scenarii izolate, fiecare cu store 109, registry 057 și
trafic 058 proprii:

| Scenariu | Verifică |
| --- | --- |
| `MIXED_ACTIVATION` | o singură versiune publicată la tickul viitor; nimic înainte de tick; taxiuri și civili identici după tick; raportul și lista flotei neschimbate; suprafața de scriere `{version, tick}` |
| `HIDDEN_VEHICLES` | vehicule ascunse, selectate și conduse de jucător intră în același plan; modurile `MANUAL`/`LEARNING` sunt păstrate; câmpurile de prezentare nu fac parte din contract |
| `LATER_SPAWN` | un vehicul creat înainte de tick primește ținta `PENDING`, unul creat după tick primește versiunea activă, pentru ambele categorii, fără o a doua activare |
| `CIVIL_MANUAL` | segmentul civil `MANUAL` este `SKIPPED_MANUAL`, fără job 103, versiune 109 sau comandă 110; civilul păstrează ruta și modul |
| `CIVIL_RELEASE` | revenirea în `AUTO` păstrează ruta și recitește versiunea activă; civilul conduce din nou |
| `CIVIL_LEARNING` | un segment civil `LEARNING` eligibil produce exact o versiune; histograma taxiurilor și a civililor are aceeași singură cheie |
| `ROUTE_PRESERVATION` | amprentele rutelor 041, clasele 023 și limitele mecanice rămân identice; numai `appliedProfileVersion` și `tick` se schimbă |

## Rezultate

```text
npm run city:style
SUMMARY checks 71/71, scenarios 7, common segment-208-fleet~112,
learning segment-208-civilian~112, manual changes 0, overall PASS

npm run city:style -- --check
City style report is current: Docs/Evidence/208-city-style/report.json
```

`tests/app/city-style-propagation.test.ts` conține 17 teste de contract (contract închis, activare
mixtă, flotă neschimbată, suprafață de scriere, vehicule ascunse/selectate, spawn înainte/după tick,
`MANUAL` fără job/versiune/activare, păstrarea rutei, release, `LEARNING` pentru ambele categorii,
păstrarea rutelor/claselor/limitelor, lipsa profilului ascuns, determinism și potrivirea cu
dovezile comise).

Comenzi rulate: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run check:architecture`, `npm test`, `npm run city:style`, `npm run city:style -- --check`.

## Fișiere

- `src/app/city-style-propagation.ts` — contractul și harness-ul.
- `tests/app/city-style-propagation.test.ts` — 17 teste.
- `tests/app/city-style-propagation-report.ts` — driverul de raport.
- `scripts/run-city-style-propagation-report.mjs` — runnerul.
- `Docs/city-style.md` — contractul uman.
- `Docs/Evidence/208-city-style/report.json` și `report.md` — transcriptul determinist.
- `package.json` — scriptul `city:style`.

## Limite

- Proba este offline și deterministă; nu certifică jocul integrat, browserul, FPS/GPU sau hardware.
- Coada 103 este injectată de apelant (coada reală cu transport sintetic în raport); transportul
  estimatorului nu face parte din această dovadă.
- 058 păstrează propriul bundle compilat, deci composition root apelează `refreshStyle()` după
  `APPLIED` și înainte de următorul pas; `refreshStyle()` în timpul `PENDING` ar adopta prematur
  ținta. Harness-ul respectă și înregistrează această ordine.
- Proiecția `DrivingProfile` a unei versiuni 109 marchează valorile `BASE`, pentru că registry-ul 092
  raportează încă `estimable: false` pentru toate cheile; 208 nu schimbă registry-ul.
- Nu există dovezi vizuale sau de driving; nu se pretinde o sesiune de participant.

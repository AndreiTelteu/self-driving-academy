# 170 — învățare extinsă pentru accelerație și frânare

Contractul `170-accel-estimator-v1` din [`src/learning/accel-estimator.ts`](../../../src/learning/accel-estimator.ts)
estimează cele patru chei longitudinale ale politicii 169 și păstrează separat frânarea reală,
ridicarea reală de throttle, plecarea de la oprire și coasting-ul real. Estimarea rămâne
candidat-only: nu publică profiluri, nu scrie în store, nu schimbă semantica 169 și nu modifică
flagurile `implemented` ale catalogului 092. Raportul determinist este [report.json](report.json),
iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare episod admis este un fapt demonstrat în mod `LEARNING`, cu fereastră `PREFIX_ELIGIBLE` și
identitate 086/088 validă. Estimatorul citește lista cheilor, intervalele catalogului, pragul de
plecare de 2 m/s, cererea de coasting de 0,6 m/s², podeaua de lider de 5 m și frecvența de 60 Hz
direct de la 169 și de la registrul 092, deci măsurarea folosește exact constantele politicii care
aplică valorile.

- `braking_jerk` se estimează numai dintr-o frânare reală cerută de 047, cu cererea de decelerație
  constantă și rampa complet observată sub ea. Valoarea pe episod este mediana creșterilor
  consecutive ale decelerației commitate, înmulțită cu 60: exact panta cu care 169 crește frânarea.
- `throttle_release_delay` cere o ridicare reală — cererea 047 coborâtă la zero după un throttle
  pozitiv — și numără tick-urile în care accelerația anterioară este menținută până la primul tick
  cu accelerație zero, împărțite la 60.
- `launch_intensity` cere o plecare reală sub 2 m/s și inversează raportul aplicat/cerut în factorul
  169 `0,35 + 0,65 · intensity`, deci o valoare 0 înseamnă plecare blândă, nu „fără dovezi”.
- `coasting_bias` cere o cerere pozitivă mică (≤ 0,6 m/s²) peste 2 m/s și inversează raportul în
  `1 − bias`; o cerere puternică nu este coasting, iar un raport peste unu este în afara anvelopei.

Incertitudinea este eroarea standard a medianei aproximată prin MAD (1,4826·MAD/√n), cu podea per
cheie (0,05 m/s³, 0,002 s, 0,005 pentru rapoarte). Pragurile sunt 1,5 m/s³ (jerk), 0,25 s
(întârziere) și 0,1 (cele două rapoarte). Peste prag cheia rămâne `UNOBSERVED`, cu incertitudinea
măsurată păstrată în rezultat.

Împărțirea estimare/validare este explicită și deterministă: identitățile episoadelor sunt ordonate
după hash-ul seed-ului 170, iar fiecare al doilea episod merge în validare. Nicio identitate nu apare
în ambele seturi, iar `estimateEpisodes + validation.episodes` acoperă exact setul admis (2 + 2 pentru
fiecare cheie în setul pozitiv).

## Tabelul cheie → context → estimare → incertitudine → validare independentă

| Cheie | Context eligibil | Estimare | Incertitudine | Prag | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `braking_jerk` | frânare reală cerută de 047, cerere constantă și rampă completă sub ea | 3,0000 m/s³ | ±0,0500 m/s³ | 1,5 m/s³ | `VALIDATED`, 2 episoade ținute deoparte, valoare 3,0000, eroare 0,0000 |
| `throttle_release_delay` | ridicare reală de throttle, fără cerere de frânare | 0,2000 s | ±0,0020 s | 0,25 s | `VALIDATED`, 2 episoade, valoare 0,2000, eroare 0,0000 |
| `launch_intensity` | plecare reală sub 2 m/s, raport aplicat/cerut | 0,6000 | ±0,0657 | 0,1 | `VALIDATED`, 2 episoade, valoare 0,6000, eroare 0,0000 |
| `coasting_bias` | coasting real peste 2 m/s, cerere mică ≤ 0,6 m/s² | 0,4000 | ±0,0657 | 0,1 | `VALIDATED`, 2 episoade, valoare 0,4000, eroare 0,0000 |

Fixturile sunt sintetice și deterministe, construite din semantica de actuare 169 (rampă per tick,
ținere de throttle, factor de plecare, eliberare de coasting), nu capturi reale: ele dovedesc
contractul de context, incertitudine, split și refuz, nu calibrarea finală. Valorile reale ale
raportului sunt în [report.json](report.json).

## Cazuri fără dovezi identificabile

| Cheie | Scenariu | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `braking_jerk` | rampă tăiată înainte de cererea 047 | `UNOBSERVED`, valoare `null` | `BRAKING_RAMP_CENSORED` | `BRAKING_RAMP_CENSORED`×4 |
| `braking_jerk` | cererea 047 atinsă în primul tick de frânare | `UNOBSERVED`, valoare `null` | `BRAKING_RAMP_NOT_OBSERVED` | `BRAKING_RAMP_NOT_OBSERVED`×4 |
| `braking_jerk` | cererea 047 se schimbă în timpul rampei | `UNOBSERVED`, valoare `null` | `BRAKING_DEMAND_CHANGED` | `BRAKING_DEMAND_CHANGED`×4 |
| `braking_jerk` | patru rampe reale, dar împrăștiate (2, 8, 14, 20 m/s³) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±3,9423 > 1,5) | — |
| `throttle_release_delay` | fereastra de dovezi taie ținerea | `UNOBSERVED`, valoare `null` | `RELEASE_HOLD_CENSORED` | `RELEASE_HOLD_CENSORED`×4 |
| `throttle_release_delay` | frânarea anulează ridicarea | `UNOBSERVED`, valoare `null` | `RELEASE_CANCELLED_BY_BRAKING` | `RELEASE_CANCELLED_BY_BRAKING`×4 |
| `throttle_release_delay` | oprire cerută pe toată ridicarea | `UNOBSERVED`, valoare `null` | `SAFETY_CONSTRAINED` | `SAFETY_CONSTRAINED`×4 |
| `launch_intensity` | cerere puternică constantă, fără plecare | `UNOBSERVED`, valoare `null` | `NO_LAUNCH_EVENT` | `NO_LAUNCH_EVENT`×4 |
| `launch_intensity` | raport aplicat/cerut peste anvelopa 169 | `UNOBSERVED`, valoare `null` | `LAUNCH_FACTOR_OUT_OF_ENVELOPE` | `LAUNCH_FACTOR_OUT_OF_ENVELOPE`×4 |
| `coasting_bias` | doar cereri puternice (1,2 m/s²) | `UNOBSERVED`, valoare `null` | `STRONG_REQUEST` | `STRONG_REQUEST`×4 |
| `coasting_bias` | raport aplicat/cerut peste anvelopa 169 | `UNOBSERVED`, valoare `null` | `COASTING_FACTOR_OUT_OF_ENVELOPE` | `COASTING_FACTOR_OUT_OF_ENVELOPE`×4 |
| `coasting_bias` | oprire cerută pe toată rularea | `UNOBSERVED`, valoare `null` | `SAFETY_CONSTRAINED` | `SAFETY_CONSTRAINED`×4 |

O intrare malformată (accelerație `NaN`, fapte de lider incomplete, frânare cu accelerație
commitată pozitivă, seed negativ) este refuzată cu excepție. Un episod `MANUAL` este raportat
`NOT_LEARNING_ELIGIBLE`, iar aceeași identitate de episod de două ori este raportată
`DUPLICATE_EPISODE`; niciuna nu produce valoare.

## Constrângeri de grup

1. `BRAKING_AND_RELEASE_SHARED_TRANSITION` — jerk-ul de frânare și întârzierea de ridicare împart
   aceeași tranziție de pedală. Frânarea anulează imediat ținerea, deci o ridicare urmată de frânare
   dovedește jerk-ul și lasă întârzierea `RELEASE_CANCELLED_BY_BRAKING`; cele două chei nu se pot
   citi din aceleași tick-uri.
2. `LAUNCH_AND_COAST_SHARED_REQUEST` — plecarea și coasting-ul citesc același raport aplicat/cerut;
   numai pragul de 2 m/s al politicii le separă. Un set doar cu plecări lasă coasting-ul
   `NO_COASTING_EVENT`, iar unul doar cu rulare peste 2 m/s lasă plecarea `NO_LAUNCH_EVENT`.
3. `JERK_ABOVE_DEMAND_RAMP` — rampa este plafonată de cererea 047: dacă decelerația atinge cererea în
   primul tick observat, jerk-ul este doar o limită inferioară, nu o valoare.
4. `VETO_SPLITS_BRAKING_FROM_THROTTLE` — oprirea cerută sau liderul sub 5 m anulează throttle-ul,
   ținerea, plecarea și coasting-ul, dar nu frânarea. Același segment constrâns dovedește
   `braking_jerk` și nu poate dovedi niciodată celelalte trei chei.

## Compatibilitate cu 169 și catalogul 092

Cele patru valori candidate sunt în intervalele catalogului (jerk 0,2–20 m/s³, întârziere 0–3 s,
rapoarte 0–1), cu unitatea reală a registrului și fără clampare. Trecute prin
`compileAccelPolicyProfile` și `evaluateAccelPolicy`, politica 169 citește exact aceste valori:
factorul de plecare 0,7400 (0,35 + 0,65 · 0,6), factorul de coasting 0,6000 (1 − 0,4), 12 tick-uri de
throttle ținut (`ceil(0,2 · 60)`) și cererea de frânare atinsă după 40 de tick-uri la jerk 3 m/s³.
Semantica 169 nu este modificată; niciun fișier din `src/autonomy` nu a fost editat.

## Determinism

Aceleași episoade și seed 170 produc aceeași estimare, aceeași împărțire și aceleași refuzuri.
Amprenta rezultatului este `fnv1a32:eaa7cad7`, identică la a doua rulare. Nu există ceas,
aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`, 0 erori |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (373 fișiere TypeScript) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/accel-estimator.test.ts` | 10 teste, 10 PASS, 0 fail |
| `npm test` | 2993 teste, 2993 PASS, 0 fail |
| `npm run accel:learning` | 21/21 verificări PASS, raport scris |
| `npm run accel:learning -- --check` | `report.json` și `report.md` actuale |

## Fișiere atinse

- `src/learning/accel-estimator.ts` — contractul `170-accel-estimator-v1`.
- `src/learning/index.ts` — export adăugat la finalul listei (append-only).
- `tests/learning/accel-estimator.test.ts`, `tests/learning/accel-estimator-reference.ts`,
  `tests/learning/accel-estimator-report.ts` — teste, fixturi și oracolul raportului.
- `scripts/run-v2-accel-learning-report.mjs`, `package.json` — raportul determinist `accel:learning`,
  adăugat ca ultima intrare din blocul `scripts`.
- `Docs/10-invatarea-stilului.md` — secțiunea contractului, la final.
- `Docs/Evidence/170-v2-accel-learning/` — acest document, `report.json`, `report.md`.

## Limitări

- Fixturile sunt sintetice și deterministe; conectarea la o captură reală de telemetrie cere un
  adaptor care să producă faptele de actuare (cerere 047, accelerație commitată, viteză, fapte de
  lider, oprire cerută) din 086–089. Estimatorul nu pretinde calibrare pe date reale.
- Pragurile de incertitudine, numărul minim de episoade și toleranțele de validare sunt inițiale,
  documentate în `ACCEL_ESTIMATOR_LIMITS`; ele trebuie revizuite pe date reale înainte de activarea
  învățării pentru aceste chei.
- Catalogul 092 rămâne fail-closed: cele patru chei R au încă `implemented: false`, deci estimările
  sunt candidate și nu pot deveni `LEARNED` sau `MANUAL_TUNING` prin acest contract.
- Rampa de frânare este identificabilă doar când cererea 047 este constantă și rampa este vizibilă
  sub ea; o frânare scurtă sau o cerere care se schimbă lasă cheia neobservată, conform politicii
  „nu inventa o valoare”.

# 184 — învățare extinsă pentru pietoni și pericole

Dovezile PBI 184 pentru contractul `184-hazard-estimator-v1` din
[`src/learning/hazard-v2-estimator.ts`](../../../src/learning/hazard-v2-estimator.ts).

Estimatorul inversează aritmetica deja livrată de `183-hazard-policy-v2`: cele opt chei R se măsoară
numai din faptele pe care comanda 183 reală le raportează în tick-ul ei, niciodată din profil. Este
candidat-only: nu publică profile, nu scrie în store, nu schimbă semantica 183 și nu flipă flagurile
`implemented` din catalogul 092.

Faptele nu sunt numere scrise de mână: fiecare traversare vine dintr-o rulare reală
`164-pedestrians-v1` peste cartierul autorat (identitate, lungime de traversare, viteză de mers și
timp rămas sunt cele raportate de modul), iar fiecare obstacol și stimul vine dintr-o lume reală
`165-hazards-v1`. Fiecare comandă este produsă de stratul 183 real cu un set de chei cunoscut.

## Tabelul celor opt chei

Sursa numerelor: `Docs/Evidence/184-v2-hazard-learning/report.json`, generat determinist cu seed 184
din 72 de episoade reale (comenzi 164 + 165 + 183), 0 refuzate, împărțite de același split în
estimare și validare fără suprapunere.

| Cheie | Scenariu | Cum se măsoară (faptul din comanda 183) | Estimare | Incertitudine / prag | Validare independentă |
| --- | --- | --- | ---: | ---: | --- |
| `pedestrian_yield_probability` | `PEDESTRIAN_CROSSING` | traversare reală cu eșantion determinist `pedestrian-yield`, numai unde cedarea este discreționară: rata pe **oportunități distincte** | **0,5000** | ±0,1021 / 0,15 | VALIDATED, 12 episoade, eroare 0,0000 |
| `pedestrian_clearance` | `PEDESTRIAN_CLEARANCE_APPROACH` | plafon de viteză peste podeaua fizică, inversat cu M-ul declarat: `distanță − plafon² / (2 · comfort_deceleration)` | **2,5000 m** | ±0,0200 / 0,15 | VALIDATED, 12 episoade, eroare 0,0000 |
| `hazard_reaction_delay` | `HAZARD_REACTION` | reacție **nesaturată** la un stimul real: `delayS − brake_reaction_delay` | **0,8000 s** | ±0,0200 / 0,2 | VALIDATED, 8 episoade, eroare 0,0000 |
| `obstacle_clearance` | `OBSTACLE_CLEARANCE_APPROACH` | aceeași inversare față de cutia de obstacol, cu jumătatea reală a cutiei în podea | **2,4000 m** | ±0,0200 / 0,15 | VALIDATED, 7 episoade, eroare 0,0000 |
| `emergency_brake_intensity` | `EMERGENCY_BRAKE` | frânare sub plafonul de aderență: `decelerație / brakeAcceleration` | **0,6500** | ±0,0200 / 0,15 | VALIDATED, 8 episoade, eroare 0,0000 |
| `evasive_steer_willingness` | `EVASION_OPPORTUNITY` | intersecția eșantioanelor `evasion` pe oportunități cu spațiu lateral verificat | **0,3053** | ±0,0200 / 0,15 | VALIDATED, 4 episoade, eroare 0,0124 |
| `crosswalk_approach_speed` | `CROSSWALK_APPROACH` | comandă sub limita postată: `min(cheie, limită)` sub limită este cheia | **6,0000 m/s** | ±0,0500 / 0,5 | VALIDATED, 5 episoade, eroare 0,0000 |
| `horn_use_probability` | `HORN_OPPORTUNITY` | intersecția eșantioanelor `horn` pe oportunități permise | **0,2521** | ±0,0200 / 0,15 | VALIDATED, 4 episoade, eroare 0,0076 |

Fiecare cheie are propriul context eligibil, propriul prag de incertitudine și propria validare pe
episoade ținute deoparte. Un segment fără faptul cerut nu produce estimare pentru cheia respectivă.

## Identificabilitate: cele două capcane ale modulului

### 1. Plafoanele de spațiu depind de M

183 nu raportează spațiul ca poziție, ci ca **plafon de viteză**:

```
cameră = max(0, distanță − max(cheie, minim fizic))
plafon = sqrt(2 · comfort_deceleration · cameră)
```

Plafonul amestecă deci cheia R cu cheia M `comfort_deceleration`. Estimatorul nu presupune niciodată o
valoare de confort: recuperează camera din plafonul raportat și din M-ul declarat pentru același tick
și refuză proba când

- M lipsește din flux (`CLEARANCE_M_UNKNOWN`) — un flux vechi care nu a înregistrat decelerația de
  confort nu poate izola cheia;
- M declarat nu reproduce plafonul raportat (`CLEARANCE_M_INCONSISTENT`) — 3 m/s² declarați în locul
  celor 2 m/s² folosiți nu reproduc camera, deci proba este minciună, nu estimare;
- spațiul efectiv a fost ridicat de podeaua fizică (`CLEARANCE_FLOOR_SATURATED`) — `max(cheie, 2,30 m)`
  ascunde toată banda 0,10–2,30 m față de pieton și 0,10–1,70 m (con) sau 0,10–3,40 m (barieră) față
  de obstacol;
- hazardul este deja în marjă (`CLEARANCE_ROOM_EXHAUSTED`) — camera este zero, comanda este 0 m/s la
  orice valoare a cheii, deci oprirea demonstrează siguranța, nu spațiul dorit.

Din 72 de episoade pozitive, ambele chei de spațiu ies `UNOBSERVED` în toate cele patru demonstrații
de mai sus, fără nicio valoare inventată.

### 2. Saturația întârzierii de reacție

`hazard_reaction_delay` este adăugat peste M-ul `brake_reaction_delay` și apoi tăiat de fizică:

```
cerut = brake_reaction_delay + cheie
plafon = (cameră − v² / (2 · capability)) / v
delayS = min(cerut, plafon)
```

O valoare saturată dovedește doar `cheie ≥ plafon − M` și **nu** este o estimare. Estimatorul cere
`!saturated`; un stimul real la 20 m cu 12 m/s și o cheie de 2,5 s produce
`REACTION_DELAY_SATURATED`, nu valoarea 2,5. În setul pozitiv toate cele opt stimuluri reale au
plafonul fezabil între 4,25 s și 5,13 s, deci întârzierea cerută (0,5 + 0,8 = 1,3 s) rămâne
nesaturată și cheia se citește exact.

## Alte refuzuri demonstrate

| Demonstrație | Cheie | Motiv raportat |
| --- | --- | --- |
| frânare de urgență pe `reduced-adhesion`, intensitate 0,8 | `emergency_brake_intensity` | `ADHESION_CAP_SATURATED` — plafonul de anvelopă este 4,463550 m/s², sub capacitatea de 8 m/s², deci orice intensitate peste 0,557944 produce aceeași frânare |
| ocolire cu 2,00 m de spațiu lateral (sub marja de 3,40 m) | `evasive_steer_willingness` | `EVASION_NO_SPACE` — 183 nu trage eșantion, cheia este inertă |
| apropiere de trecere cu limita postată de 5 m/s | `crosswalk_approach_speed` | `CROSSWALK_LIMIT_SATURATED` — comanda atinge limita, deci dovedește doar `cheie ≥ 5` |
| claxon interzis de lume | `horn_use_probability` | `HORN_FORBIDDEN` — eșantionul nu se trage |
| patru traversări obligatorii (`yield_time_gap` 8 s) | `pedestrian_yield_probability` | `PEDESTRIAN_ALL_CROSSINGS_MANDATORY` — cedarea nu este o decizie de stil; spațiul față de pieton rămâne `CANDIDATE` în aceleași episoade |
| aceleași stimuluri cu întârzieri demonstrate între 0,1 și 2,9 s | `hazard_reaction_delay` | `UNCERTAINTY_ABOVE_THRESHOLD` — 0,7434 s peste pragul de 0,2 s |
| episoade `MANUAL` / fereastră fără prefix | toate cele opt chei | `NO_ELIGIBLE_EPISODES` (refuzate `NOT_LEARNING_ELIGIBLE` / `NO_USABLE_PREFIX`) |

## Zerouri demonstrate

| Demonstrație | Cheie | Rezultat |
| --- | --- | --- |
| claxon nefolosit la fiecare oportunitate, eșantioane sub prag | `horn_use_probability` | `CANDIDATE` cu valoarea **0**, incertitudine 0,0200 |
| ocolire refuzată la fiecare oportunitate verificată | `evasive_steer_willingness` | `CANDIDATE` cu valoarea **0**, incertitudine 0,0200 |

Un zero demonstrat rămâne candidat, nu `UNOBSERVED`: o refuzare constantă la eșantioane mici este o
dovadă, nu o lipsă de dovezi.

## Constrângeri de grup explicate

1. `CLEARANCE_SPEED_CAP_DEPENDS_ON_M` — plafonul de spațiu amestecă cheia cu `comfort_deceleration`;
   fără M cunoscut cheia nu se izolează și rămâne neobservată.
2. `CLEARANCE_FLOOR_HIDES_SMALL_VALUES` — `max(cheie, minim fizic)` ascunde banda mică a catalogului
   (0,10–2,30 m față de pieton, 0,10–1,70 m față de con, 0,10–3,40 m față de barieră).
3. `REACTION_CAP_HIDES_LARGE_DELAYS` — plafonul de oprire ascunde întârzierile mari; o reacție
   saturată dovedește doar o margine inferioară.
4. `ADHESION_CAP_HIDES_HIGH_INTENSITIES` — pe aderență redusă, intensitățile peste 0,557944 sunt
   invizibile pentru că toate frânează la limita anvelopei.
5. `HAZARD_IN_MARGIN_COMMANDS_ZERO_WITHOUT_CLEARANCE` — un hazard deja în marjă comandă 0 m/s fără să
   spună nimic despre spațiul dorit.
6. `YIELD_AND_HORN_ARE_BINARY_OPPORTUNITIES` — cedarea și claxonul sunt decizii binare pe
   oportunități identificate, nu rate pe cadre; cedarea obligatorie iese din numitor, iar claxonul
   interzis nu trage eșantion.
7. `EVASION_DEPENDS_ON_VERIFIED_SPACE` — fără marja laterală fizică, disponibilitatea de ocolire este
   inertă la orice valoare.
8. `HAZARD_KEYS_FROM_ONE_TICK` — ordinea ramurilor 183 dă fiecărui tick un set de fapte; nicio cheie nu
   este dedusă din alta.

## Compatibilitate cu 183 (citire fără schimbare de semantică)

Versiune politică `183-hazard-policy-v2`, candidate-only `true`, semantică schimbată `false`, rată
60 Hz, rezervă de spațiu 0,5 m, gravitație 9,81 m/s². Cheile M citite de politică rămân
`comfort_deceleration`, `brake_reaction_delay`, `curve_lateral_accel` și `yield_time_gap`; estimatorul
le citește din faptele episodului și nu le rescrie.

Cele opt fapte demonstrate, rejucate cu profilul estimat (rotunjit la șase zecimale, precizia la care
este citit raportul), sunt identice cu cele ale profilului autorat în **8/8** cazuri:
`yielded true`, `effectiveM 2,5`, `delayTicks 78`, `effectiveM 2,4`, `deceleration 5,2`,
`offset 0,45`, `commandedSpeed 6`, `used false`.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`, fără erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (387 fișiere TypeScript, 6 + 4 + 3 probe negative respinse) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | PASS: 3195 teste, 3195 trecute, 0 eșecuri, 99685,02 ms |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/hazard-v2-estimator.test.ts` | PASS: 27 teste, 27 trecute, 0 eșecuri |
| `npm run hazard:learning` | 23/23 verificări PASS, 8 chei candidate, 0 chei neobservate, digest `fnv1a32:57a8782d`, overall PASS |
| `npm run hazard:learning -- --check` | PASS: `report.json` și `report.md` sunt actuale, cod de ieșire 0 |

## Fișiere atinse

- Creat: `src/learning/hazard-v2-estimator.ts` (contractul `184-hazard-estimator-v1`).
- Creat: `tests/learning/hazard-v2-estimator-reference.ts` (traversările 164 reale, stimulurile 165
  reale, cele 72 de episoade pozitive și toate demonstrațiile de refuz).
- Creat: `tests/learning/hazard-v2-estimator-report.ts` (raportul determinist și tabelul din
  `report.md`).
- Creat: `tests/learning/hazard-v2-estimator.test.ts` (27 de teste deterministe).
- Creat: `scripts/run-v2-hazard-learning-report.mjs` (scriptul de raport cu `--check`).
- Creat: `Docs/Evidence/184-v2-hazard-learning/report.json`, `report.md`, `README.md`.
- Modificat: `src/learning/index.ts` (export nou la finalul listei).
- Modificat: `package.json` (intrarea `hazard:learning` la finalul blocului `scripts`).
- Modificat: `Docs/10-invatarea-stilului.md` (secțiune nouă la final).
- Mutat: `PBI/In Progress/184-v2_learn_9.md` → `PBI/Done/184-v2_learn_9.md` (mutare fizică).

## Limitări

- Valorile din fixture sunt demonstrații plauzibile, nu date măsurate pe jucători: dovezile validează
  contractul de context, identificabilitate, incertitudine, împărțire și refuz, nu calibrarea finală a
  stilului.
- Episoadele de traversare folosesc doi pietoni reali ai aceleiași treceri autorate, iar distanța ego
  față de linia trecerii este cea a scenariului (ca în 183): starea, identitatea și ceasul traversării
  sunt cele ale modulului 164.
- Benzile de eșantioane ale ocolirii și claxonului sunt alese înguste (0,26–0,295 respectiv
  0,21–0,245) pentru ca intersecția să fie informativă; un flux real cu eșantioane doar pe o parte a
  pragului lasă cheia `UNOBSERVED` sau cu o bandă mai largă, niciodată cu o valoare inventată.
- `pedestrian_yield_probability` are cea mai largă incertitudine (±0,1021) pentru că numără 24 de
  oportunități ținute deoparte; un flux cu mai multe traversări reale o îngustează.
- `crosswalk_approach_speed` nu are un prag de incertitudine relativ: 0,5 m/s este tolerant pentru că
  limita autorată domină comanda; o cheie apropiată de limită rămâne neobservată prin construcție.
- Estimatorul nu publică profile și nu scrie în store; integrarea în pipeline-ul de publicare și
  consumul de către 183 rămân în afara scope-ului acestui PBI.

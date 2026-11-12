# 174 — învățare extinsă pentru semafoare

Contractul `174-signal-estimator-v2` din
[`src/learning/signal-v2-estimator.ts`](../../../src/learning/signal-v2-estimator.ts) estimează cele
patru chei R ale politicii 173 — `yellow_stop_probability` (probabilitate), `red_run_gap_acceptance`
(s), `yellow_commit_time` (s) și `green_launch_acceleration` (m/s²) — din scenarii separate:
fezabilitate la galben, angajare în traversare, gap pe roșu și plecare de pe loc la verde. Estimarea
rămâne candidat-only: nu publică profiluri, nu scrie în store, nu schimbă semantica 173 și nu
modifică flagurile `implemented` ale catalogului 092. Raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare episod admis este o demonstrație în mod `LEARNING`, cu fereastră `PREFIX_ELIGIBLE` și
identitate 086/088 validă. Estimatorul nu reconstruiește semaforul: inversează aritmetica deja livrată
de `173-signal-policy-v2`, folosind exact faptele pe care comanda politicii le raportează —
motivul 173, eșantionul oportunității, timpul până la linie, traversarea acceptată sau refuzată și
accelerația de plecare — plus factorul M `red_stop_probability` al rezultatului 050 din același tick.
Citește lista cheilor, vocabularul opririi pe oportunitate, plasa de siguranță de 3 s și plafonul de
plecare de 6 m/s² direct din 173, iar intervalele și unitățile din registrul 092. Nicio valoare nu
este citită din profilul care a produs demonstrația.

- `yellow_stop_probability` se estimează numai din apropieri de galben în mișcare, cu geometrie
  cunoscută, în care 173 a ajuns la eșantionul propriu de fezabilitate. Rata de oprire pe
  oportunități identificate este produsul `red_stop_probability · cheie`, deci factorul M observat
  este denominatorul onest; numitorul este numărul de oportunități, niciodată numărul de cadre.
- `yellow_commit_time` cere o apropiere de galben cu timp cunoscut până la linie. O apropiere tratată
  de ramura de angajare dovedește `cheie ≥ timp`, una eșantionată (sau oprită pentru că intrarea ar
  cădea pe roșu) dovedește `cheie ≤ timp`; estimarea este mijlocul intersecției, iar incertitudinea
  este jumătatea lățimii ei.
- `red_run_gap_acceptance` cere o traversare propusă de 050 cu gap conflictual raportat. Acceptarea
  dovedește `cheie ≤ gap`, refuzul peste plasa de siguranță de 3 s dovedește `cheie > gap`. Un refuz
  sub 3 s este decis de plasă, nu de cheie, și un gap necunoscut refuză traversarea.
- `green_launch_acceleration` cere o plecare de pe loc la verde, după expirarea ținerii M de la
  verde; valoarea pe episod este mediana plecărilor lui.

Incertitudinea cheilor de tip rată sau mediană este eroarea standard a medianei aproximată prin MAD
(1,4826·MAD/√n), cu podea per cheie (0,02 probabilitate, 0,05 m/s²). Pentru orizont și gap,
incertitudinea este jumătatea lățimii intersecției limitelor. Pragurile sunt 0,2 probabilitate, 0,6 s
orizont, 1 s gap și 0,35 m/s² accelerație; peste prag cheia rămâne `UNOBSERVED` cu motivul
`UNCERTAINTY_ABOVE_THRESHOLD`, iar incertitudinea măsurată rămâne în rezultat.

Împărțirea estimare/validare este explicită și deterministă: identitățile episoadelor sunt ordonate
după hash-ul seed-ului 174, iar fiecare al doilea episod merge în validare. Nicio identitate nu apare
în ambele seturi. Pentru rate și mediane, valoarea de validare este mediana episoadelor ținute
deoparte și se compară cu estimarea în toleranța documentată; pentru limite, demonstrațiile ținute
deoparte trebuie să admită estimarea în aceeași toleranță. Un set mai mic de două episoade raportează
`TOO_SMALL`.

## Tabelul cheie → scenariu → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Estimare | Incertitudine | Prag | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `yellow_stop_probability` | `YELLOW_FEASIBILITY` | 0,8875 probabilitate | ±0,0493 | 0,2 | `VALIDATED`, 2 episoade ținute deoparte, valoare 0,7625, eroare 0,1250 ≤ 0,15 |
| `yellow_commit_time` | `YELLOW_COMMITMENT` | 2,0500 s | ±0,1500 s | 0,6 s | `VALIDATED`, 4 episoade, valoare 2,0500, eroare 0,0000 ≤ 0,5 |
| `red_run_gap_acceptance` | `RED_RUN_GAP` | 4,5000 s | ±0,5000 s | 1 s | `VALIDATED`, 2 episoade, valoare 4,5000, eroare 0,0000 ≤ 1 |
| `green_launch_acceleration` | `GREEN_LAUNCH` | 1,5000 m/s² | ±0,0500 m/s² | 0,35 m/s² | `VALIDATED`, 2 episoade, valoare 1,5000, eroare 0,0000 ≤ 0,4 |

Majoritatea episoadelor produc câte un fapt per cheie; cheia de angajare primește 4 + 4 episoade
pentru că fiecare apropiere eșantionată din familia de probabilitate dovedește și o limită
superioară a orizontului (constrângerea `YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH`), fără să
intre în numitorul opririlor.

Fixturile sunt sintetice și deterministe, dar nu sunt scrise de mână: fiecare episod este produs prin
rularea straturilor 050 și 173 reale cu un set de chei cunoscut, iar estimatorul măsoară comanda
rezultată. Ele dovedesc contractul de context, incertitudine, split și refuz, nu calibrarea finală pe
date reale. Pentru probabilitate, demonstrația folosește 0,8 cu 40 de oportunități pe episod, iar
estimatorul raportează 0,8875 din ratele măsurate: o rată finită nu reconstruiește exact cheia care a
produs eșantioanele, iar diferența este acoperită de incertitudinea raportată și de validarea
independentă.

## Cazuri fără dovezi identificabile

| Cheie | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `yellow_stop_probability` | oportunități sub pragul de eșantioane | `UNOBSERVED`, valoare `null` | `YELLOW_TRIALS_BELOW_MINIMUM` | `YELLOW_TRIALS_BELOW_MINIMUM`×2 |
| `yellow_stop_probability` | opt rate de oprire reale, dar împrăștiate (0–1) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,3020 > 0,2) | — |
| `yellow_stop_probability` | demonstrații `MANUAL` | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |
| `yellow_stop_probability` | set fără episoade | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |
| `yellow_commit_time` | doar apropieri angajate | `UNOBSERVED`, valoare `null` | `COMMIT_UPPER_BOUND_UNOBSERVED` | — |
| `yellow_commit_time` | doar apropieri eșantionate | `UNOBSERVED`, valoare `null` | `COMMIT_LOWER_BOUND_UNOBSERVED` | — |
| `yellow_commit_time` | limite reale, dar prea largi (0,4–4,0 s) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±1,8000 s > 0,6) | — |
| `yellow_commit_time` | două limite incompatibile în același episod | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_COMMIT_BOUNDS` | `CONTRADICTORY_COMMIT_BOUNDS`×4 |
| `yellow_commit_time` | oprirea M de frânare târzie precede orizontul | `UNOBSERVED`, valoare `null` | `COMMIT_PREEMPTED_BY_LATE_BRAKE` | `COMMIT_PREEMPTED_BY_LATE_BRAKE`×4 |
| `red_run_gap_acceptance` | doar traversări acceptate | `UNOBSERVED`, valoare `null` | `RED_RUN_LOWER_BOUND_UNOBSERVED` | — |
| `red_run_gap_acceptance` | doar refuzuri peste plasa de siguranță | `UNOBSERVED`, valoare `null` | `RED_RUN_UPPER_BOUND_UNOBSERVED` | — |
| `red_run_gap_acceptance` | toate refuzurile sub 3 s | `UNOBSERVED`, valoare `null` | `RED_RUN_SAFETY_CAP` | `RED_RUN_SAFETY_CAP`×4 |
| `red_run_gap_acceptance` | acceptare sub un refuz (4,2 s vs 4,6 s) | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_GAP_BOUNDS` | `CONTRADICTORY_GAP_BOUNDS`×4 |
| `red_run_gap_acceptance` | limită reală, dar prea largă (3–8 s) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±2,5000 s > 1) | — |
| `red_run_gap_acceptance` | gap conflictual necunoscut | `UNOBSERVED`, valoare `null` | `RED_RUN_GAP_UNKNOWN` | `RED_RUN_GAP_UNKNOWN`×4 |
| `red_run_gap_acceptance` | 050 păstrează oprirea, nicio traversare propusă | `UNOBSERVED`, valoare `null` | `RED_RUN_NOT_PROPOSED` | `RED_RUN_NOT_PROPOSED`×4 |
| `green_launch_acceleration` | ținerea M de la verde încă activă | `UNOBSERVED`, valoare `null` | `GREEN_LAUNCH_HELD_BY_DELAY` | `GREEN_LAUNCH_HELD_BY_DELAY`×4 |
| `green_launch_acceleration` | eliberare din mișcare | `UNOBSERVED`, valoare `null` | `GREEN_LAUNCH_NOT_FROM_STANDSTILL` | `GREEN_LAUNCH_NOT_FROM_STANDSTILL`×4 |
| `green_launch_acceleration` | patru plecări reale, dar împrăștiate (0,3–6) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,6504 > 0,35) | — |

Un zero demonstrat rămâne distinct de „fără dovezi”: patru episoade cu 40 de oportunități fără nicio
oprire produc `CANDIDATE` cu valoarea `0` și validare `VALIDATED`, nu `UNOBSERVED`. O intrare
malformată (viteză `NaN`, accelerație peste plafonul 173, motiv necunoscut, seed negativ) este
refuzată cu excepție. Un episod `MANUAL` este raportat `NOT_LEARNING_ELIGIBLE`, o fereastră
suprimată `NO_USABLE_PREFIX`, iar aceeași identitate de episod de două ori `DUPLICATE_EPISODE`;
niciuna nu produce valoare.

## Constrângeri de grup

1. `YELLOW_STOP_AND_RED_COMPLIANCE_SHARED` — probabilitatea de galben și probabilitatea M de oprire
   la roșu împart aceeași decizie: 173 oprește cu probabilitatea efectivă
   `red_stop_probability · yellow_stop_probability`. Din comportament se vede numai produsul, deci
   factorul M observat este denominatorul cheii; cu un factor M nul nicio oprire la galben nu este
   posibilă și cheia rămâne neobservată.
2. `YELLOW_PROBABILITY_AND_COMMIT_SHARE_APPROACH` — probabilitatea și orizontul împart aceeași
   apropiere: 173 verifică întâi orizontul, apoi eșantionează. O apropiere angajată dovedește doar o
   limită inferioară a orizontului și nu intră în numitorul opririlor, iar una eșantionată dă o limită
   superioară și un singur eșantion de conformitate.
3. `RED_RUN_GAP_DEPENDS_ON_OBSERVED_GAP` — gap-ul pe roșu este identificabil numai când lumea
   raportează un gap conflictual. Sub plasa de siguranță de 3 s cerința efectivă este plasa, nu cheia,
   deci un refuz acolo nu oferă limită inferioară; un gap necunoscut refuză traversarea.
4. `GREEN_LAUNCH_AFTER_START_DELAY` — accelerația de plecare este identificabilă numai după ce ținerea
   M de la verde a expirat și vehiculul este încă oprit; cât timp 173 raportează `GREEN_START_DELAY`,
   comanda este ținerea, nu plecarea.
5. `SIGNAL_KEYS_FROM_ONE_APPROACH` — cele patru chei pot fi observate în aceeași călătorie, dar nu din
   aceleași fapte: un set cu un singur tip de fapt lasă celelalte trei chei neobservate.

## Compatibilitate cu 173 și catalogul 092

Cele patru valori candidate sunt în intervalele catalogului (probabilitate 0–1, gap 0,1–8 s, orizont
0,2–6 s, accelerație 0,2–6 m/s²), cu unitatea reală a registrului și fără clampare. Trecute prin
`compileSignalPolicyV2Profile` și `evaluateSignalPolicyV2`, politica 173 citește exact aceste valori,
fără schimbare de semantică:

- eșantionul 0,4563 este sub probabilitatea estimată → `YELLOW_STOP`, iar eșantionul 0,9620 este
  peste ea → `YELLOW_PROCEED`;
- o apropiere la 2,0000 s este angajată (`YELLOW_COMMIT`), una la 2,1000 s este eșantionată;
- gap-ul cerut pe roșu este **4,5000 s**, plafonat de plasa de siguranță de 3 s: 4,5 s este acceptat,
  4,4 s este refuzat;
- plecarea de pe loc comandă **1,5000 m/s²**, sub plafonul de 6 m/s² al lui 173.

Niciun fișier din `src/autonomy` nu a fost editat; semantica 173 rămâne neschimbată, iar cheile M
(`red_stop_probability`, `green_start_delay`, `red_stop_line_offset`, `late_red_brake_threshold`) sunt
doar citite, niciodată estimate aici.

## Determinism

Aceleași episoade și seed 174 produc aceeași estimare, aceeași împărțire și aceleași refuzuri.
Amprenta rezultatului este `fnv1a32:adefc652`, identică la a doua rulare. Nu există ceas, aleatorism
ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`, 0 erori |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (377 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/signal-v2-estimator.test.ts` | 14 teste, 14 PASS, 0 fail |
| `npm test` | 3038 teste, 3038 PASS, 0 fail |
| `npm run signal:learning` | 23/23 verificări PASS, 4 chei candidate, 19 demonstrații neobservate, raport scris |
| `npm run signal:learning -- --check` | `report.json` și `report.md` actuale |

## Fișiere atinse

- `src/learning/signal-v2-estimator.ts` — contractul `174-signal-estimator-v2`.
- `src/learning/index.ts` — export adăugat la finalul listei (append-only).
- `tests/learning/signal-v2-estimator.test.ts`, `tests/learning/signal-v2-estimator-reference.ts`,
  `tests/learning/signal-v2-estimator-report.ts` — teste, fixturi produse de straturile 050/173 reale
  și oracolul raportului.
- `scripts/run-v2-signal-learning-report.mjs`, `package.json` — raportul determinist
  `signal:learning`, adăugat ca ultima intrare din blocul `scripts`.
- `Docs/10-invatarea-stilului.md` — secțiunea contractului, la final.
- `Docs/Evidence/174-v2-signal-learning/` — acest document, `report.json`, `report.md`.

## Limitări

- Fixturile sunt sintetice și deterministe, produse prin straturile 050/173 reale. Conectarea la o
  captură reală de telemetrie cere un adaptor care să furnizeze faptele comenzii 173 (motiv,
  eșantion, timp până la linie, gap conflictual, accelerația de plecare) plus factorul M din 050;
  estimatorul nu pretinde calibrare pe date reale.
- Cheia `yellow_stop_probability` este o rată măsurată: o demonstrație de 0,8 cu 40 de oportunități pe
  episod produce 0,8875 pe jumătatea de estimare. Valorile exacte ale cheii nu sunt reconstituibile
  din eșantioane finite, iar contractul raportează incertitudinea măsurată în loc să o ascundă.
- Orizontul de angajare și gap-ul pe roșu sunt identificabile doar ca interval; când demonstrațiile
  oferă o singură latură sau laturi incompatibile, cheia rămâne `UNOBSERVED` cu motiv explicit.
- Sub plasa de siguranță de 3 s, gap-ul pe roșu nu este identificabil prin construcție: 173 ridică
  cerința efectivă la 3 s, deci un refuz acolo nu spune nimic despre cheie.
- Pragurile de incertitudine, numărul minim de oportunități și toleranțele de validare sunt inițiale,
  documentate în `SIGNAL_V2_ESTIMATOR_LIMITS`; ele trebuie revizuite pe date reale înainte de
  activarea învățării pentru aceste chei.
- Catalogul 092 rămâne fail-closed: cele patru chei R au încă `implemented: false`, deci estimările
  sunt candidate și nu pot deveni `LEARNED` sau `MANUAL_TUNING` prin acest contract.
- Estimatorul este un contract neexecutat încă în bucla live de simulare; montarea lui în pipeline-ul
  de învățare și proba de browser rămân pași separați.

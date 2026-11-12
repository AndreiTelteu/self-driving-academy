# 176 — învățare extinsă pentru stop și prioritate

Contractul `176-stop-priority-estimator-v1` din
[`src/learning/stop-priority-estimator.ts`](../../../src/learning/stop-priority-estimator.ts)
estimează cele patru chei R ale politicii 175 — `rolling_stop_speed` (m/s),
`priority_assertiveness` (raport), `allway_stop_patience` (s) și
`blocked_intersection_entry_probability` (probabilitate) — din patru scenarii separate: rolling
stop, revendicare la un refuz 052, răbdare la all-way stop și intrare fără spațiu de ieșire
declarat. Estimarea rămâne candidat-only: nu publică profiluri, nu scrie în store, nu schimbă
semantica 175 și nu modifică flagurile `implemented` ale catalogului 092. Raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare episod admis este o demonstrație în mod `LEARNING`, cu fereastră `PREFIX_ELIGIBLE` și
identitate 086/088 validă. Estimatorul nu reconstruiește oprirea: inversează aritmetica deja livrată
de `175-stop-priority-policy-v1`, folosind exact faptele pe care comanda politicii le raportează —
motivul 175, viteza de traversare și flagul de plafon, diagnosticele 051/052 moștenite, separatorul
052 și cerința efectivă, poziția și durata scursă la all-way, eșantionul determinist de intrare și
rezultatul lui. Citește lista cheilor, plafonul de 2,5 m/s, podeaua de 3 s și plafonul de 0,5 direct
din 175, iar intervalele și unitățile din registrul 092. Nicio valoare nu este citită din profilul
care a produs demonstrația.

- `rolling_stop_speed` se măsoară numai dintr-o comandă `ROLL_THROUGH` reală: o comandă
  neplafonată raportează cheia exact, iar una plafonată dovedește doar `cheie > 2,5 m/s`.
- `priority_assertiveness` cere un refuz real 052 cu separator cunoscut. Revendicarea dovedește
  `cheie ≥ (yield_time_gap − separator) / (yield_time_gap − 3 s)`, cedarea dovedește limita
  superioară a aceluiași raport; estimarea este mijlocul intersecției, iar incertitudinea este
  jumătatea lățimii ei.
- `allway_stop_patience` cere o eliberare 051 la un all-way stop unde subiectul nu este primul
  sosit: ținerea dovedește `cheie > secunde de la oprire`, trecerea dovedește `cheie ≤` același
  număr. Primul sosit nu este niciodată întârziat, iar o apropiere ori o ținere 051 nu observă cheia.
- `blocked_intersection_entry_probability` cere o oportunitate de intrare fără spațiu de ieșire
  declarat și fără veto: acceptarea dovedește `cheie > eșantion`, așteptarea sub plafon dovedește
  `cheie ≤ eșantion`.

Incertitudinea vitezei de rolling stop este eroarea standard a medianei aproximată prin MAD
(1,4826·MAD/√n), cu podea de 0,05 m/s; pentru celelalte trei chei, incertitudinea este jumătatea
lățimii intersecției limitelor. Pragurile sunt 0,5 m/s, 0,15 raport, 0,5 s și 0,15 probabilitate;
peste prag cheia rămâne `UNOBSERVED` cu motivul `UNCERTAINTY_ABOVE_THRESHOLD`, iar incertitudinea
măsurată rămâne în rezultat.

Împărțirea estimare/validare este explicită și deterministă: identitățile episoadelor sunt ordonate
după hash-ul seed-ului 176, iar fiecare al doilea episod merge în validare. Nicio identitate nu apare
în ambele seturi. Pentru viteză, valoarea de validare este mediana episoadelor ținute deoparte și se
compară cu estimarea în toleranța documentată; pentru cele trei chei de tip interval, demonstrațiile
ținute deoparte trebuie să admită estimarea în aceeași toleranță. Un set mai mic de două episoade
raportează `TOO_SMALL`.

## Tabelul cheie → scenariu → estimare → incertitudine → validare independentă

| Cheie | Scenariu | Estimare | Incertitudine | Prag | Validare pe date independente |
| --- | --- | ---: | ---: | ---: | --- |
| `rolling_stop_speed` | `ROLLING_STOP` | 1,2000 m/s | ±0,0500 m/s | 0,5 m/s | `VALIDATED`, 2 episoade ținute deoparte, valoare 1,2000, eroare 0,0000 ≤ 0,5 |
| `priority_assertiveness` | `PRIORITY_CLAIM` | 0,3667 raport | ±0,0333 raport | 0,15 raport | `VALIDATED`, 2 episoade, valoare 0,3667, eroare 0,0000 ≤ 0,15 |
| `allway_stop_patience` | `ALLWAY_PATIENCE` | 4,0000 s | ±0,2000 s | 0,5 s | `VALIDATED`, 2 episoade, valoare 4,0000, eroare 0,0000 ≤ 0,5 |
| `blocked_intersection_entry_probability` | `BLOCKED_ENTRY` | 0,2804 probabilitate | ±0,0912 probabilitate | 0,15 probabilitate | `VALIDATED`, 2 episoade, valoare 0,2804, eroare 0,0000 ≤ 0,15 |

Setul pozitiv are 16 episoade admise, împărțite 2 + 2 pe fiecare cheie. Fixturile sunt sintetice și
deterministe, dar nu sunt scrise de mână: fiecare episod este produs prin rularea straturilor 051,
052 și 175 reale cu un set de chei cunoscut, iar estimatorul măsoară comanda rezultată. Ele dovedesc
contractul de context, incertitudine, split și refuz, nu calibrarea finală pe date reale. Pentru
rolling stop demonstrația folosește 1,2 m/s, pentru asertivitate un refuz cu `yield_time_gap` 6 s și
separatoare de 4,8 s (cedare) și 5,0 s (revendicare), pentru răbdare o ținere la 3,8 s și o trecere
la 4,2 s, iar pentru intrare eșantioanele 0,1893 (acceptare) și 0,3716 (așteptare): valoarea
raportată este mijlocul intervalului demonstrat, nu cheia care a produs demonstrația.

## Cazuri fără dovezi identificabile

| Cheie | Demonstrație | Stare | Motiv | Excluderi |
| --- | --- | --- | --- | --- |
| `rolling_stop_speed` | comenzi plafonate la 2,5 m/s | `UNOBSERVED`, valoare `null` | `ROLLING_STOP_CAP_SATURATED` | `ROLLING_STOP_CAP_SATURATED`×4 |
| `rolling_stop_speed` | viteze reale împrăștiate (0,2–2,5 m/s) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±1,5112 > 0,5) | — |
| `rolling_stop_speed` | demonstrații care pretind simultan ≤ 2,5 și > 2,5 m/s | `UNOBSERVED`, valoare `null` | `ROLLING_STOP_CAP_INCONSISTENT` | `ROLLING_STOP_CAP_INCONSISTENT`×1 |
| `rolling_stop_speed` | demonstrații `MANUAL` | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |
| `priority_assertiveness` | doar revendicări | `UNOBSERVED`, valoare `null` | `ASSERTIVENESS_UPPER_BOUND_UNOBSERVED` | — |
| `priority_assertiveness` | doar cedări | `UNOBSERVED`, valoare `null` | `ASSERTIVENESS_LOWER_BOUND_UNOBSERVED` | — |
| `priority_assertiveness` | revendicare sub o cedare | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_ASSERTIVENESS_BOUNDS` | `CONTRADICTORY_ASSERTIVENESS_BOUNDS`×4 |
| `priority_assertiveness` | limită reală, dar prea largă (0,07–0,60) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,2667 > 0,15) | — |
| `priority_assertiveness` | `yield_time_gap` la podeaua de 3 s | `UNOBSERVED`, valoare `null` | `ASSERTIVENESS_INERT_AT_FLOOR` | `ASSERTIVENESS_INERT_AT_FLOOR`×4 |
| `priority_assertiveness` | 052 a acordat prioritatea | `UNOBSERVED`, valoare `null` | `PRIORITY_NOT_REFUSED` | `PRIORITY_NOT_REFUSED`×4 |
| `priority_assertiveness` | refuz 052 fără separator raportat | `UNOBSERVED`, valoare `null` | `PRIORITY_SEPARATION_UNKNOWN` | `PRIORITY_SEPARATION_UNKNOWN`×4 |
| `allway_stop_patience` | doar eliberări | `UNOBSERVED`, valoare `null` | `ALLWAY_LOWER_BOUND_UNOBSERVED` | — |
| `allway_stop_patience` | doar țineri | `UNOBSERVED`, valoare `null` | `ALLWAY_UPPER_BOUND_UNOBSERVED` | — |
| `allway_stop_patience` | ținere peste o eliberare | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_ALLWAY_BOUNDS` | `CONTRADICTORY_ALLWAY_BOUNDS`×4 |
| `allway_stop_patience` | limită reală, dar prea largă (2–9 s) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±3,5000 > 0,5) | — |
| `allway_stop_patience` | primul sosit la all-way stop | `UNOBSERVED`, valoare `null` | `ALLWAY_FIRST_ARRIVAL` | `ALLWAY_FIRST_ARRIVAL`×4 |
| `allway_stop_patience` | apropiere 051 încă în STOP | `UNOBSERVED`, valoare `null` | `ALLWAY_STOP_NOT_RELEASED` | `ALLWAY_STOP_NOT_RELEASED`×4 |
| `blocked_intersection_entry_probability` | veto de intersecție blocată | `UNOBSERVED`, valoare `null` | `BLOCKED_INTERSECTION_VETO` | `BLOCKED_INTERSECTION_VETO`×4 |
| `blocked_intersection_entry_probability` | spațiu de ieșire declarat | `UNOBSERVED`, valoare `null` | `EXIT_SPACE_DECLARED` | `EXIT_SPACE_DECLARED`×4 |
| `blocked_intersection_entry_probability` | doar acceptări | `UNOBSERVED`, valoare `null` | `BLOCKED_ENTRY_UPPER_BOUND_UNOBSERVED` | — |
| `blocked_intersection_entry_probability` | doar așteptări sub plafon | `UNOBSERVED`, valoare `null` | `BLOCKED_ENTRY_LOWER_BOUND_UNOBSERVED` | — |
| `blocked_intersection_entry_probability` | acceptare lângă plafonul de 0,5 | `UNOBSERVED`, valoare `null` | `BLOCKED_ENTRY_CAP_SATURATED` | — |
| `blocked_intersection_entry_probability` | acceptare sub o așteptare | `UNOBSERVED`, valoare `null` | `CONTRADICTORY_BLOCKED_ENTRY_BOUNDS` | `CONTRADICTORY_BLOCKED_ENTRY_BOUNDS`×4 |
| `blocked_intersection_entry_probability` | limită reală, dar prea largă (0,02–0,49) | `UNOBSERVED`, valoare `null` | `UNCERTAINTY_ABOVE_THRESHOLD` (±0,2333 > 0,15) | — |
| `blocked_intersection_entry_probability` | set fără episoade | `UNOBSERVED`, valoare `null` | `NO_ELIGIBLE_EPISODES` | — |

Un zero demonstrat rămâne distinct de „fără dovezi”: patru eliberări 051 la 0 s, fără nicio ținere,
produc `CANDIDATE` cu valoarea `0` și validare `VALIDATED`, nu `UNOBSERVED`. O intrare malformată
(viteză `NaN`, poziție all-way invalidă, motiv necunoscut, seed negativ) este refuzată cu excepție.
Un episod `MANUAL` este raportat `NOT_LEARNING_ELIGIBLE`, o fereastră suprimată `NO_USABLE_PREFIX`,
iar aceeași identitate de episod de două ori `DUPLICATE_EPISODE`; niciuna nu produce valoare.

## Constrângeri de grup

1. `ROLLING_STOP_AND_STOP_INTENT_SHARED` — viteza de rolling stop există numai când 051 a declarat
   `ROLL_THROUGH`: rolul opririi complete este decis de cheile M `stop_full_probability` și
   `stop_dwell_time`, deci un tick cu oprire completă sau cu apropiere nu spune nimic despre viteză.
2. `ROLLING_STOP_CAP_CEILING` — plafonul `rollingStopMaximumMps = 2,5 m/s` face invizibilă orice
   valoare peste el: comanda raportează 2,5 m/s cu `rollingStopCapped`, adică doar limita
   inferioară `cheie > 2,5`. Intervalul catalogului merge până la 5 m/s, dar acea zonă nu este
   identificabilă din comportament.
3. `ASSERTIVENESS_AND_YIELD_GAP_SHARED` — asertivitatea se vede numai din refuzul 052 cu separator
   cunoscut, iar cerința efectivă este `yield_time_gap − asertivitate · (yield_time_gap − 3 s)`. Un
   `yield_time_gap` la sau sub podeaua de 3 s lasă cheia inertă, iar o prioritate acordată de 052 nu
   este o decizie de revendicare.
4. `ALLWAY_PATIENCE_AFTER_M_DWELL` — răbdarea se numără de la momentul în care durata M a opririi
   051 a fost satisfăcută și numai pentru un sosit care nu este primul; primul sosit pleacă fără
   întârziere, iar o apropiere ori o ținere 051 domină cheia.
5. `BLOCKED_ENTRY_VETO_SHADOWS_PROBABILITY` — vetoul de intersecție blocată este absolut și este
   evaluat primul: comanda rămâne `STOP` fără eșantion, deci un astfel de tick nu spune nimic despre
   probabilitate. Un spațiu de ieșire declarat ocolește eșantionul, iar plafonul de 0,5 ascunde
   orice valoare peste el.
6. `STOP_PRIORITY_KEYS_FROM_ONE_APPROACH` — ordinea ramurilor 175 dă fiecărui tick un singur fapt:
   veto, intenție 051, rolling stop, all-way, refuz 052 sau eșantion de intrare. Un set cu un singur
   tip de demonstrație lasă celelalte trei chei neobservate.

## Compatibilitate cu 175 și catalogul 092

Cele patru valori candidate sunt în intervalele catalogului (0,2–5 m/s, 0–1 raport, 0–10 s, 0–1
probabilitate), cu unitatea reală a registrului și fără clampare. Trecute prin
`compileStopPriorityProfile` și `evaluateStopPriorityPolicy`, politica 175 citește exact aceste
valori, fără schimbare de semantică:

- rolling stop-ul comandă **1,2000 m/s**, sub plafonul de 2,5 m/s;
- revendicarea cere exact **4,9000 s**: un separator de 4,9 s este revendicat, unul de 4,85 s este
  cedat, iar podeaua de 3 s rămâne absolută;
- răbdarea all-way ține eliberarea la **3,9 s** (`ALLWAY_PATIENCE`) și o lasă să treacă la **4,1 s**
  (`ALLWAY_TURN`);
- intrarea blocată acceptă eșantionul **0,1893** (`BLOCKED_ENTRY_ACCEPTED`) și așteaptă la
  **0,3716** (`BLOCKED_ENTRY_WAIT`).

Niciun fișier din `src/autonomy` nu a fost editat; semantica 175 rămâne neschimbată, iar cheile M
(`stop_full_probability`, `stop_dwell_time`, `stop_line_offset`, `yield_time_gap`) sunt doar citite,
niciodată estimate aici.

## Determinism

Aceleași episoade și seed 176 produc aceeași estimare, aceeași împărțire și aceleași refuzuri.
Amprenta rezultatului este `fnv1a32:cf5e99b7`, identică la a doua rulare. Nu există ceas, aleatorism
ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`, 0 erori |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (379 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/stop-priority-estimator.test.ts` | 14 teste, 14 PASS, 0 fail |
| `npm test` | 3061 teste, 3061 PASS, 0 fail |
| `npm run stop:learning` | 25/25 verificări PASS, 4 chei candidate, 25 demonstrații neobservate, raport scris |
| `npm run stop:learning -- --check` | `report.json` și `report.md` actuale |

## Fișiere atinse

- `src/learning/stop-priority-estimator.ts` — contractul `176-stop-priority-estimator-v1`.
- `src/learning/index.ts` — export adăugat la finalul listei (append-only).
- `tests/learning/stop-priority-estimator.test.ts`, `tests/learning/stop-priority-estimator-reference.ts`,
  `tests/learning/stop-priority-estimator-report.ts` — teste, fixturi produse de straturile 051/052/175
  reale și oracolul raportului.
- `scripts/run-v2-stop-learning-report.mjs`, `package.json` — raportul determinist `stop:learning`,
  adăugat ca ultima intrare din blocul `scripts`.
- `Docs/10-invatarea-stilului.md` — secțiunea contractului, la final.
- `Docs/Evidence/176-v2-stop-learning/` — acest document, `report.json`, `report.md`.

## Limitări

- Fixturile sunt sintetice și deterministe, produse prin straturile 051/052/175 reale. Conectarea la o
  captură reală de telemetrie cere un adaptor care să furnizeze faptele comenzii 175 (motiv, viteză de
  traversare și flagul de plafon, separator 052, poziția și durata all-way, eșantionul de intrare) plus
  cheile M din 051/052; estimatorul nu pretinde calibrare pe date reale.
- `rolling_stop_speed` este identificabilă numai până la plafonul de 2,5 m/s al lui 175: valorile din
  intervalul 2,5–5 m/s al catalogului nu pot fi distinse din comportament și rămân neobservate.
- `priority_assertiveness` și `allway_stop_patience` sunt identificabile doar ca interval; când
  demonstrațiile oferă o singură latură sau laturi incompatibile, cheia rămâne `UNOBSERVED` cu motiv
  explicit. Sub podeaua de 3 s, asertivitatea este inertă prin construcția politicii.
- `blocked_intersection_entry_probability` este identificabilă numai sub plafonul de 0,5 al politicii;
  peste el, eșantionul nu separă cheia de valori mai mari. Marja de rezoluție a plafonului este
  documentată în `STOP_PRIORITY_ESTIMATOR_LIMITS.blockedEntryCapResolution = 0,05`.
- Pragurile de incertitudine, numărul minim de episoade și toleranțele de validare sunt inițiale,
  documentate în `STOP_PRIORITY_ESTIMATOR_LIMITS`; ele trebuie revizuite pe date reale înainte de
  activarea învățării pentru aceste chei.
- Catalogul 092 rămâne fail-closed: cele patru chei R au încă `implemented: false`, deci estimările
  sunt candidate și nu pot deveni `LEARNED` sau `MANUAL_TUNING` prin acest contract.
- Estimatorul este un contract neexecutat încă în bucla live de simulare; montarea lui în pipeline-ul
  de învățare și proba de browser rămân pași separați.

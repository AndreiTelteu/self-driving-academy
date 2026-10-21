# Validare inversă pe profile cunoscute — PBI 105

Contract `105-inverse-learning-v1`, implementat de `src/experiments/inverse-learning.ts` și expus de
`runInverseLearningValidation()` din `src/app/inverse-learning.ts`. Este un harness offline: pornește
de la patru profile cunoscute, generează demonstrații deterministe pe scenarii independente și verifică
dacă estimatoarele reale 094–099 recuperează valorile țintă în toleranțele declarate. Nu publică
profiluri, nu scrie în store, nu modifică registrul 092 și nu învață din `MANUAL` sau `AUTO`.

## Profile cunoscute

`knownProfiles` conține exact patru profiluri — `PRUDENT`, `IMPULSIVE`, `RECKLESS`, `MIXED` — fiecare cu
24 de ținte explicite pentru cheile `initial_learning_target`. Valorile sunt date de intrare scrise în
cod, nu derivate din `default`-urile 092; la încărcare fiecare țintă este verificată față de intervalul
092 al cheii, iar cheile R/`extension` sunt respinse. Profilurile diferă pe toate dimensiunile
măsurabile: viteză, frânare, urmărire, semnale, STOP și bandă.

| Profil | Intenție | Exemplu viteză urbană | Exemplu headway | Exemplu probabilitate roșu |
| --- | --- | ---: | ---: | ---: |
| `PRUDENT` | prudent, frânare timpurie, distanțe lungi | −2 m/s | 2,4 s | 1 |
| `IMPULSIVE` | nerăbdător, dar nu imprudent | +3,5 m/s | 1,1 s | 0,75 |
| `RECKLESS` | viteză mare, frânare târzie, încălcări | +9 m/s | 0,6 s | 0,35 |
| `MIXED` | inconsecvent: viteză prudentă, urmărire agresivă | +1,5 m/s | 1,6 s | 0,85 |

Matricea completă 4 × 24 este în [raportul de dovezi](Evidence/105-inverse-learning/report.md).

## Scenarii independente

`generateDemonstration(profileId, scenarioId, variant)` produce câte un flux separat pentru fiecare
scenariu: `FREE_FLOW` (viteză, apropiere, curbă), `FOLLOWING` (urmărire la viteze variate și coadă),
`LONGITUDINAL` (accelerație, decelerație, jerk, reacție), `SIGNALIZED` (roșu, verde), `STOP_YIELD`
(STOP la linie și acceptarea priorității) și `LANE_CHANGE`. Fiecare flux aparține unui singur owner
094–099 și contribuie numai cheile acelui owner.

Seed-ul fiecărui flux este `deriveScenarioSeed(105000, profile:scenario:variant)`; zgomotul vine din
`randomUnit`, cu index explicit, deci nu există `Math.random`. Aceleași fapte alimentează simultan
ledger-ul 093 real și estimatorul real, astfel încât read model-ul și intrările estimatorului nu pot
diverge. Scenariile nu partajează observații: un key primește dovezi dintr-un singur flux.

## Modelul de toleranță

Fiecare dintre cele 24 de chei are o intrare
`{key, context, absoluteTolerance, relativeTolerance, justifiedBy}`. Limita efectivă este
`absolute + relative × |target|`: o pardoseală absolută pentru eșantionare/cuantizare plus o parte
proporțională pentru dispersia care crește cu magnitudinea țintei. Nu există un `default` uniform și
nicio justificare nu este partajată între chei.

Exemple de justificări concrete:

- `brake_reaction_delay`: 1 tick la 60 Hz = 0,0167 s, deci pragul absolut este 0,02 s.
- `speed_delta_urban`: fereastră de minimum 10 s, mediană peste eșantioane la 20 Hz; 0,2 m/s acoperă
  rotunjirea limitei și zgomotul de ±0,04 m/s.
- `red_stop_probability`: raport peste un numitor anume, cu granulație `1/N`; 0,03 este sub un singur
  eveniment la numitorii folosiți, nu un interval de încredere statistic.
- `lane_change_front_gap`: valoare de gap măsurată la manevră, validată prin interval; 0,3 m acoperă
  rotunjirea măsurătorii.

Tabelul complet, cu valorile absolute/relative și justificarea fiecărei chei, este în
`report.json`/`report.md` din dovezi.

## Regula de identificabilitate

Un rezultat numeric este raportat numai dacă:

1. read model-ul 093 este `READY` și are cel puțin `minimumEpisodes` din specificația înghețată;
2. cheile care cer viteze variate au cel puțin două benzi de viteză distincte;
3. cheile de prag (`yield_time_gap`, `lane_change_front_gap`, `lane_change_back_gap`,
   `lane_change_speed_gain`) au și observații acceptate, și refuzate, deci un interval coerent —
   succesele singure dau doar o limită observată;
4. estimatorul produce o valoare sau un interval coerent.

Altfel rezultatul este `NOT_IDENTIFIABLE`, cu `estimate: null` și `interval: null`. Cazurile acoperite
explicit sunt urmărirea la o singură viteză (headway și minimum gap nu se separă), numărul insuficient
de oportunități de semnal și absența schimbărilor de bandă. Un port injectat care întoarce o valoare
precisă pentru o cheie neidentificabilă este respins: valoarea este anulată, iar motivul devine
`UNIDENTIFIABLE_ESTIMATOR_VALUE_REJECTED`. Un interval inversat este păstrat ca dovezi contradictorii,
niciodată mediat.

## Statusuri și agregare

| Status | Semnificație |
| --- | --- |
| `WITHIN_TOLERANCE` | estimare numerică sau interval care conține ținta, în limita efectivă |
| `OUTSIDE_TOLERANCE` | estimare reală în afara toleranței; eșec păstrat în raport |
| `NOT_IDENTIFIABLE` | dovezile sau estimatorul nu permit o valoare; nu este eșec de acuratețe |
| `NO_ESTIMATE` | cheia era identificabilă, dar estimatorul nu a produs valoare; defect de contract |

Agregatele pe scenariu numără exact rândurile per cheie. Raportul are șapte scenarii: cele patru
profiluri, un sondaj cu dovezi rare (`SPARSE_EVIDENCE`), unul cu dovezi contradictorii
(`CONTRADICTORY_EVIDENCE`) și un sondaj cu estimare intenționat greșită (`OUT_OF_TOLERANCE`). Primele
șase trebuie să nu aibă `OUTSIDE_TOLERANCE`; sondajul de toleranță trebuie să aibă cel puțin unul,
altfel detectorul a eșuat. `overall.pass` cere ca profilurile să nu aibă eșecuri și ca toate sondajele
să se comporte conform așteptării.

## Ce înseamnă un eșec

- `OUTSIDE_TOLERANCE` la un profil înseamnă fie o conversie a estimatorului care nu respectă ținta, fie
  o toleranță prea strânsă pentru contextul respectiv. Raportul păstrează valoarea, eroarea, toleranța
  și dovezile, deci nu poate fi ascuns printr-un agregat.
- `NO_ESTIMATE` este un defect de contract: dovezile erau suficiente, dar estimatorul nu a produs o
  valoare.
- `NOT_IDENTIFIABLE` nu este un eșec de acuratețe și nu se numără ca pass de precizie; este absența
  justificată a unei estimări. Nu are niciodată valoare numerică.

## Ce NU este

- Nu publică profiluri, nu creează versiuni, nu scrie `implemented`/`estimable` și nu emite `LEARNED`.
- Nu rulează worker-ul 103, nu aplică blend-ul 101 și nu validează un delta 102.
- Nu învață din `MANUAL`/`AUTO` și nu are UI.
- Nu folosește capturi de browser, FPS, GPU sau măsurători hardware; observațiile sunt sintetice și
  deterministe, nu gameplay înregistrat.
- Nu oferă intervale de încredere statistice; toleranțele sunt valori de pornire documentate.

## Verificare

`npm run learning:inverse` scrie raportul, iar `npm run learning:inverse -- --check` verifică faptul că
JSON-ul și Markdown-ul sunt actuale. Testele sunt în `tests/experiments/inverse-learning.test.ts` și
`tests/experiments/inverse-learning-report.ts`. Dovezile și rezultatele exacte sunt în
[Evidence/105-inverse-learning](Evidence/105-inverse-learning/README.md).

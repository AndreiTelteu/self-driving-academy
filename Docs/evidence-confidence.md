# Încredere, praguri și număr efectiv — PBI 100

`src/learning/evidence-confidence.ts` adaugă stratul descriptiv care transformă un candidat 094–099
plus read model-ul 093 în indicatori expliciți de calitate, prag și incertitudine. Modulele sunt
exportate prin `src/learning/index.ts`. Stratul nu calculează un profil, nu publică value/delta și nu
activează `implemented` ori `estimable` din 092; fiecare rezultat are `unchanged: true` și
`published: false`.

## API

- `parameterConfidenceThresholds` și `confidenceThreshold(key)` — pragurile per cheie, derivate din
  specificația înghețată 093 plus podeaua de expunere a acestui PBI.
- `assessEvidenceConfidence({ key, evidence, episodes, candidate })` — evaluarea completă a unui
  candidat, cu stare, valoare, interval, contradicție, incertitudine și număr efectiv.
- `summarizeEvidenceQuality(key, evidence, episodes)` — aceleași praguri fără valoare de candidat.
- `assessEstimatorConfidence(result, reads, episodesByKey)` — adaptor structural pentru rezultatele
  reale 094–099; acceptă orice candidat cu `key`, `status`, `value` și `interval` opțional.

`ConfidenceEpisode` cere `opportunityId`, `occurrence` și `observedTicks` (expunere măsurată la
60 Hz). `value`, `outcome`, `speedMps` și `correlatedWith` sunt opționale. Intrările invalide
(non-finite, occurrence negativ, expunere negativă) sunt respinse, nu ghicite. Rezultatele și
tabelul de praguri sunt înghețate; intrarea nu este mutată.

## Numărul efectiv

Numărul efectiv nu este `sampleCount`, `observationCount`, numărul de cadre sau cadența. Regula:

1. Fiecare cadru al aceleiași apariții (`opportunityId` + `occurrence`) este pliat pe un singur
   episod; se păstrează expunerea maximă măsurată.
2. Episoadele corelate declarate prin `correlatedWith` (de exemplu un singur lider urmărit în mai
   multe ferestre) sunt pliate pe membrul cel mai expus. Fără `correlatedWith`, identitatea
   episodului este propria cheie de corelare.
3. Fiecare reprezentant contribuie cu `min(1, observedTicks / minimumEpisodeTicks)`.
4. `effectiveEpisodeCount` este suma acestor ponderi, rotunjită la trei zecimale;
   `exposureSeconds` este suma tick-urilor reprezentanților / 60.

Astfel 20 de cadre ale aceleiași opriri rămân un episod efectiv, trei apariții corelate rămân un
episod efectiv, iar un interval scurt contribuie fracționar. `sampleCount` este raportat doar pentru
contrast și nu intră în nicio formulă.

Podeaua de expunere este `minimumDurationS × 60` când 093 o cere (600 tick-uri pentru viteză) și 30
tick-uri (0,5 s) pentru celelalte chei. Un episod mai scurt este numărat fracționar și produce
`SHORT_INTERVAL_BELOW_MINIMUM_EXPOSURE` dacă pragul nu este atins. Detaliul de episoade trebuie să
acopere exact `distinctEpisodes` din 093; lipsa detaliului produce `MISSING_EPISODE_EXPOSURE`, iar
un număr diferit produce `EPISODE_DETAIL_MISMATCH`. Ambele rămân `WEAK`, niciodată `OBSERVED`.

## Cele patru stări

| Stare | Semnificație | Valoare |
| --- | --- | --- |
| `UNOBSERVED` | Nu există niciun episod eligibil sau read model-ul 093 nu are dovezi. | `null` |
| `WEAK` | Există dovezi, dar sub prag, cu expunere scurtă, episoade corelate, viteze nediferențiate, contradicție severă sau candidat fără valoare. | `null` |
| `ZERO` | Dovezi suficiente, iar candidatul are exact valoarea `0`. | `0` |
| `OBSERVED` | Dovezi suficiente și candidat cu valoare nenulă sau interval delimitat. | valoarea sau `null` pentru interval |

`ZERO` nu este `UNOBSERVED`: o oprire completă observată de zero ori, un delta de viteză de zero sau
un gap de zero sunt valori reale când pragul de dovezi este atins. `WEAK` păstrează faptul că
există dovezi, chiar dacă estimarea nu este utilizabilă. Cele trei stări cerute nu se colapsează în
nicio combinație.

## Contradicții, intervale și incertitudine

Contradicția este raportată explicit, nu ascunsă într-o medie:

- În interiorul aceleiași grupe comportamentale (acceptate separat de refuzate, altfel toate
  valorile), intervalul se compară cu domeniul parametrului din 092. Peste 15% din domeniu este
  `MODERATE`, peste 50% este `SEVERE`.
- Pentru cheile cu `outcome` `ACCEPTED`/`REFUSED`, intervalul pragului este
  `[max(refuzate), min(acceptate)]`. Suprapunerea (`max refuzat > min acceptat`) este contradicție
  `SEVERE`.
- Un interval de estimator inversat este contradicție `SEVERE`.
- `MODERATE` păstrează starea `OBSERVED`, dar raportează intervalul, `uncertainty: HIGH` și o
  penalizare de calitate (0,6). `SEVERE` forțează `WEAK`, `value: null` și păstrează intervalul
  observat.

`interval` este raportat ori de câte ori există cel puțin două valori numerice sau o delimitare
acceptat/refuzat. `ContradictionIndicator` conține `detected`, `severity`, `interval` și un motiv
stabil (`ACCEPTED_AND_REFUSED_OVERLAP`, `CONTRADICTORY_EPISODE_VALUES`,
`DISPERSED_EPISODE_VALUES`, `INVERTED_ESTIMATOR_INTERVAL`).

Calitatea este `min(1, effective / required) × penalizare`, iar încrederea derivă din calitate
(`HIGH` ≥ 0,85, `MODERATE` ≥ 0,6, `LOW` > 0, altfel `NONE`). Incertitudinea este `NONE` pentru
`UNOBSERVED`, `HIGH` pentru `WEAK` sau contradicție moderată, `LOW` la cel puțin dublul pragului și
`MODERATE` altfel.

## Praguri per cheie

`parameterConfidenceThresholds` acoperă exact cele 24 de chei M. `minimumEffectiveEpisodes` și
`requiresVariedSpeeds` sunt preluate din 093, astfel încât viteza cere un episod de 10 s, iar
urmărirea cere trei episoade cu viteze variate, în timp ce STOP/roșu, frânare și bandă cer trei
episoade. `parameterMin`/`parameterMax` sunt folosite numai la fracția de contradicție. Pragurile
sunt de pornire pentru calibrare, nu garanții statistice.

## Integrare

`assessEstimatorConfidence` acceptă direct rezultatele 094–099. Testul de integrare folosește
estimatorul real 099: un candidat `lane_change_front_gap` cu trei episoade complete devine
`OBSERVED`, iar `lane_change_cooldown` fără măsurători rămâne `WEAK` cu
`ESTIMATOR_NOT_READY`. Nu se publică profil, nu se scrie în catalog și nu se schimbă
`implemented`/`estimable`.

## Limitări

Apelantul trebuie să furnizeze aparițiile reale 086/087, expunerea măsurată și grupul de corelare;
stratul nu le deduce din traiectorie sau geometrie. Fracția de contradicție raportată la domeniul
parametrului este o politică explicită, nu un test de semnificație statistică. Podeaua de 30 de
tick-uri și pragurile 093 sunt provizorii pentru calibrare. Nu există bootstrap, interval de
încredere statistic, worker, persistență, integrare live ori probe browser/FPS.

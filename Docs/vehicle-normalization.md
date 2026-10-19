# Normalizarea după clasa vehiculului — PBI 089

`createVehicleNormalizer(options?)` este proprietarul unic al **caracteristicilor normalizate** ale
unei ferestre eligibile: transformă cererea realizată de accelerație, frânare și virare în valori
comparabile între clase, astfel încât un estimator ulterior să citească un **stil** și nu o
**capacitate mecanică**. Trăiește în `src/telemetry/vehicle-normalization.ts` și este exportat prin
`src/telemetry/index.ts`. Nu deține ceas, lume fizică, renderer, DOM, scheduler, event bus sau
stocare, nu publică niciodată și nu decide conformarea; primul apel primește fapte deja autoritative.

## Cine deține ce

| Componentă | Deține |
| --- | --- |
| 089 `createVehicleNormalizer` | formulele de normalizare, vocabularul închis al canalelor și al marcajelor de capacitate, vocabularul închis al refuzurilor și magazia mărginită a ferestrelor normalizate |
| 023 `vehicleClass` / 085 `mechanicalCapabilities` | plafoanele mecanice ale clasei (`maxAccelerationMps2`, `maxDecelerationMps2`, `maxLateralAccelerationMps2`) folosite ca numitori; 089 nu redeclară niciun plafon |
| 031 calibrarea fizicii | referința empirică pentru ce este realizabil (frânare, viraj, contact); 089 nu afirmă o calibrare nouă |
| 087 `createEligibilityWindows` | clasa și eticheta ferestrei; 089 normaliza **numai** fereastra `ELIGIBLE` și refuză `EXTERNAL_CONSTRAINT`/`EXCLUDED` cu clasa 087 ca motiv |
| 088 `createArtifactFilter` | prefixul utilizabil și gradul `COMPLETE`/`PARTIAL`/`TRUNCATED`; 089 atașează caracteristicile doar prefixului utilizabil și nu re-derivă gradul |
| 047/049 și recorderul | cererea realizată în SI și comanda executată (`throttle`/`brake`/`steering`); 089 nu calculează fizică |
| 095 estimatorul de stil | consumatorul; 089 nu estimează, nu publică un profil și nu antrenează nimic |

## Vocabularul închis

`capabilityLimitChannels` are exact trei valori: `LONGITUDINAL_ACCELERATION`,
`LONGITUDINAL_DECELERATION`, `LATERAL`. Un marcaj are mereu `reason: 'CAPABILITY_LIMITED'` și exact
un canal; `capabilityMarkReasons` este închis la această singură valoare.

`normalizationDemandStatuses` separă cele două situații posibile ale unei ferestre normalizate:
`INTENTIONAL` (niciun plafon nu s-a saturat, deci caracteristica măsoară o alegere) și
`CAPABILITY_LIMITED` (cel puțin un plafon s-a saturat, deci caracteristica este o limită inferioară).

`normalizationRefusals` este închis și total: `NOT_ELIGIBLE_WINDOW`, `WINDOW_FULLY_SUPPRESSED`,
`WINDOW_TRUNCATED`, `NO_USABLE_SAMPLES`, `INSUFFICIENT_SAMPLES`. O fereastră refuzată are
`features: null` și `capabilityMarks` gol: nu poate fi citită tacit ca stil delicat sau deliberat.

## Formula de normalizare, unități și limite

Pentru fiecare eșantion utilizabil (tick în intersecția dintre intervalul ferestrei 087 și prefixul
utilizabil 088), cu plafoanele clasei din 023/085:

```
accelFraction = max(0, a_long)  / maxAccelerationMps2     [adimensional]
decelFraction = max(0, −a_long) / maxDecelerationMps2     [adimensional]
latFraction   = |a_lat|         / maxLateralAccelerationMps2
```

- `a_long` și `a_lat` sunt accelerația longitudinală semnată și cea laterală realizată, în m/s², SI,
  citite din recorder/controller; plafoanele sunt în m/s².
- Fiecare cerere pe canal este **p90** (a 90-a centilă, `NORMALIZATION_DEMAND_PERCENTILE`), definită
  ca ordine statistică deterministă `sorted[ceil(n·p) − 1]` prin `normalizationPercentile`. Un
  eșantion tranzitoriu nu definește stilul.
- `aggressiveness = max(accelerationDemand, decelerationDemand, lateralDemand)` este scalarul unic de
  stil, comparabil între clase.
- `raw` păstrează p90-ul valorilor realizate în SI, iar `intent` păstrează p90-ul comenzii
  (`throttle`, `brake`, `|steering|`), care este independent de clasă.
- Limite: fiecare fracție este ≥ 0 și, în mod normal, ≤ 1; o valoare > 1 înseamnă că raportul
  realizat/plafon a depășit plafonul declarat (tranzitoriu) și antrenează obligatoriu un marcaj de
  capacitate. Nu se aplică nicio limitare artificială, pentru ca estimatorul să vadă adevărul.
- Deoarece ordinea statistică `ceil` este omogenă pentru o scară pozitivă (`p90(x/k) = p90(x)/k`),
  implementarea sortează o singură dată mărimile brute și derivă fracțiile împărțind la plafonul
  clasei; rezultatul este identic și nicio valoare nu este rescalată de două ori.

### Criteriul 1 prin construcție

Fiecare cerere este împărțită la plafonul **propriei** clase, deci aceeași comandă și același stil
produc aceeași valoare normalizată într-un sedan și într-un compact, chiar dacă valorile brute diferă
prin diferența mecanică a claselor. O clasă cu plafon mai mic nu este citită ca prudentă: stilul ei
saturant se normalizează la aceeași fracțiune de cerere. Toleranța documentată pentru „același stil
dă aceeași valoare” este `NORMALIZATION_EQUALITY_TOLERANCE` (0,05), o diferență de fracțiuni
adimensionale, nu de accelerații.

### Criteriul 2 prin construcție

Înregistrarea este o uniune discriminată. Un `CapabilityLimitedVehicleNormalization` este un tip
TypeScript diferit de `IntentionalVehicleNormalization` și poartă o listă `capabilityMarks`
**nevidă** plus `limitingChannel`; `emitIntentFeature` acceptă **doar** înregistrarea intenționată și
re-verifică la runtime că fereastra este încă deținută de strat și încă `INTENTIONAL`, deci o fereastră
saturată nu poate deveni o caracteristică de intenție. O cerere realizată saturată este ea însăși o
dovadă că cererea solicitată a fost cel puțin plafonul, astfel încât valoarea normalizată este
raportată explicit ca **limită inferioară** (`aggressivenessIsLowerBound`) și nu ca alegere.

Un canal este marcat numai la o saturație **susținută**: cel puțin `minSaturatedTicks` eșantioane
(implicit 3) ating `saturationFraction` (implicit 0,95) din plafonul clasei. Un singur tick
tranzitoriu nu ridică niciun marcaj. Marcajul păstrează canalul limitativ, plafonul folosit, fracția
de vârf, numărul de tick-uri saturate, numărul de eșantioane și pragul de saturație.

**Diferența față de 087.** Eticheta `MECHANICAL_LIMIT` din 087 este o constrângere externă calculată
din **cererea declarată** de apelant (o valoare care depășește plafonul clasei) și scoate fereastra
din numitorul de învățare. Marcajul `CAPABILITY_LIMITED` din 089 este observat din **realizarea**
post-fizică în interiorul unei ferestre deja `ELIGIBLE` și este o limită inferioară pentru un
estimator care poate reduce ponderea sau exclude fereastra; 089 nu duplică eticheta, vocabularul sau
filtrul 087.

## Compunerea cu 087 și 088

| Situație | Rezultat 089 |
| --- | --- |
| 087 `windowClass !== 'ELIGIBLE'` | `REFUSED`/`NOT_ELIGIBLE_WINDOW`, fără caracteristici |
| 088 `FULLY_SUPPRESSED` (primul artefact la primul tick) | `REFUSED`/`WINDOW_FULLY_SUPPRESSED` |
| 088 `TRUNCATED` (checkpoint pierdut, `DATA_LOSS`, segment `INCOMPLETE`) | `REFUSED`/`WINDOW_TRUNCATED` |
| prefix utilizabil, dar niciun eșantion în el | `REFUSED`/`NO_USABLE_SAMPLES` |
| mai puțin de `minSamples` (implicit 3) eșantioane utilizabile | `REFUSED`/`INSUFFICIENT_SAMPLES` |
| 088 `COMPLETE` sau `PARTIAL` cu prefix utilizabil | `NORMALIZED`, cu gradul 088 purtat în `completeness`/`completenessReason` |

Granularitatea este fereastra 087 (cheia de stocare este `opportunityId`), iar intervalul utilizabil
este intersecția dintre `[openedTick, lastTick]` al ferestrei 087 și prefixul 088; `usableTicks`,
`sampledTicks` și `sampleCoverage` fac acoperirea explicită, deci o fereastră `PARTIAL` nu primește
niciodată o caracteristică „ca și cum ar fi completă”. Numai eșantioanele din intervalul utilizabil
intră în caracteristici.

## Limite, proprietate și contoare

| Plafon | Valoare |
| --- | --- |
| Ferestre reținute (`maxWindows`) | 32…7168, implicit **4096** (`diagnosticSamples`) |
| Biți denși pe înregistrare | **256** (32 sloturi fixe × 8 B) |
| Unități de cod de identitate pe înregistrare | **1024** |
| Plafon derivat pe înregistrare | **2304** |
| Plafon derivat la capacitatea implicită | 4096 × 2304 B ≈ **9 MiB** |
| Plafon derivat la capacitatea maximă | 7168 × 2304 B ≈ **15,75 MiB** (< `recorderRamBytes` 33 554 432 B) |

Magazia este mărginită și elimină cea mai veche fereastră (`retiredTotal`), iar contoarele cumulative
supraviețuiesc eliminării și `dispose()`. O evaluare ulterioară care refuză o fereastră deja
normalizată o retrogradează (`downgradedTotal`) în loc să lase caracteristici învechite; una care
devine normalizabilă este numărată în `upgradedTotal`. `getDenominators()` expune `total`, `normalized`,
`intentional`, `capabilityLimited`, `refused`, defalcarea pe motiv de refuz și pe canal, tick-urile
utilizabile și cele eșantionate, plus contoarele `intentEmitted`/`intentRefused`.

## Ce NU este

- Nu este estimatorul de stil (095): nu estimează un parametru, nu publică un profil, nu antrenează
  și nu decide dacă un stil este riscant.
- Nu este filtrul de artefacte (088) și nu duplică vocabularul de artefacte, regula de tăiere sau
  gradul de completitudine; consumă prefixul și gradul.
- Nu este ferestrele eligibile (087) și nu duplică etichetele sau excluderile; refuză o fereastră
  neeligibilă în loc să o reeticheteze.
- Nu este recorderul (085) și nu stochează niciun cadru per tick: păstrează o singură înregistrare
  agregată per fereastră.
- Nu declară și nu măsoară performanța integrată de browser, renderer, GPU, FPS sau timp real și nu
  certifică bugetul de gameplay.
- Nu calculează fizică și nu inventează o măsurătoare: cererea realizată și comanda vin de la
  deținătorii lor autoritativi.

## Verificare și dovezi

`tests/telemetry/vehicle-normalization.test.ts` (8 teste) acoperă linia de verificare a PBI-ului —
aceeași comandă și același stil în sedan și compact dau aceeași cerere normalizată în toleranța
documentată, în timp ce valorile brute păstrează raportul de capacitate 023; clasamentul normalizat
urmează stilul, nu plafonul clasei, iar valorile brute pot inversa clasamentul; o cerere saturată este
marcată `CAPABILITY_LIMITED` cu canalul limitativ și este refuzată de `emitIntentFeature`; compunerea
cu 087/088 refuză fereastra neeligibilă, complet suprimată ori trunchiată și normalizează doar
prefixul utilizabil; magazia mărginită, contoarele, `dispose()`, determinismul și respingerea
intrărilor malformate; un lanț real la cadența 219 cu clase reale 023, comenzi reale 047/049 și
straturile reale 086/087/088; și o verificare **măsurată** în Rapier a aceleiași afirmații. Proba
nativă `scripts/benchmark-telemetry-normalization.mjs` reutilizează fixture-ul 044/085 și raportează
costul adăugat înainte/după, contoarele de proprietate a memoriei și un autotest pe lanțul real. Vezi
[Evidence/089-vehicle-normalization](Evidence/089-vehicle-normalization/README.md).

# 186 — învățare extinsă pentru pickup și confortul pasagerilor

Contract: `186-pickup-estimator-v1` din [`src/learning/pickup-v2-estimator.ts`](../../../src/learning/pickup-v2-estimator.ts).
PBI: [186](../../../PBI/Done/186-v2_learn_10.md). Contractele citite: [10 — învățarea stilului](../../10-invatarea-stilului.md) și [11 — catalogul de parametri](../../11-catalog-parametri.md).

Raportul determinist (`report.json` / `report.md`) din acest director este generat de
`npm run pickup:learning`; `npm run pickup:learning -- --check` refuză un raport neactualizat. Toate
numerele din tabelele de mai jos sunt cele din raportul generat.

## Ce s-a implementat

`estimatePickupV2Style` primește episoade de dovezi — fiecare cu fereastra lui de eligibilitate și cu
eșantioanele comenzii `185-pickup-policy-v2` — și estimează cele opt chei R în opt contexte separate.
Estimatorul inversează aritmetica livrată de 185, nu inventează un al doilea model de pickup: fiecare
valoare se citește din faptele pe care comanda le raportează deja (plafonul cinematic al apropierii,
banda de bordură cu clemele ei, fereastra de precizie cu podeaua și plafonul, podeaua de staționare,
baza M și plafonul care a decis scara), niciodată din valoarea R a profilului. Estimatorul este
candidat-only: nu publică profiluri, nu scrie în store, nu schimbă semantica 185 și nu flipă flagurile
`implemented` din catalogul 092.

Fixture-ul nu inventează zona: rulează harta autorată 032 și ia poligonul, ancora, lungimea și
adâncimea zonei reale a primei curse (`sz:0-0` pickup, `sz:1-0` dropoff, `sz:2-2` zonă numai CIVIL),
iar starea ocupată vine din ciclul real 061. Pe bay-ul real de **5,50 m**, cu punctul marcat la
**2,75 m** și adâncimea de **3,00 m**, banda sedanului este `[0,15 m, 1,20 m]`, fereastra de precizie
este de 2,75 m, iar apropierea de 7,75 m are plafonul cinematic de **5,567764 m/s**.

## Cele opt chei: scenariu, estimare, incertitudine, validare independentă

| Cheie | Scenariu | Context eligibil (rezumat) | Estimare | Incertitudine | Prag | Validare |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `pickup_approach_speed` | `PICKUP_APPROACH` | apropiere de pickup cu oprirea permisă și plafonul cinematic neliant | 3,0000 m/s | ±0,0500 m/s | 0,5 m/s | VALIDATED, 2+2 episoade, eroare 0,0000 |
| `pickup_curb_distance` | `PICKUP_CURB` | distanță efectivă strict în banda `[0,15 m, adâncime − ecartament]` | 0,5000 m | ±0,0500 m | 0,15 m | VALIDATED, 8+8 episoade, eroare 0,0000 |
| `pickup_stop_precision` | `PICKUP_PRECISION` | toleranță efectivă sub plafonul `min(punct, lungime − punct)` | 1,0000 m | ±0,0500 m | 0,25 m | VALIDATED, 8+8 episoade, eroare 0,0000 |
| `pickup_dwell_time` | `PICKUP_DWELL` | staționare strict peste podeaua `max(3 s, M stop_dwell_time)` | 5,0000 s | ±0,1500 s | 0,5 s | VALIDATED, 8+8 episoade, eroare 0,0000 |
| `dropoff_approach_speed` | `DROPOFF_APPROACH` | același plafon cinematic, pe faza reală de dropoff | 3,0000 m/s | ±0,0500 m/s | 0,5 m/s | VALIDATED, 2+2 episoade, eroare 0,0000 |
| `dropoff_curb_distance` | `DROPOFF_CURB` | aceeași bandă a bordurii, pe faza reală de dropoff | 0,5000 m | ±0,0500 m | 0,15 m | VALIDATED, 4+4 episoade, eroare 0,0000 |
| `occupied_acceleration_scale` | `OCCUPIED_ACCELERATION` | pasager la bord, scară aplicată, niciun plafon nu leagă | 0,8500 raport | ±0,0200 raport | 0,15 raport | VALIDATED, 8+8 episoade, eroare 0,0000 |
| `occupied_lateral_accel_scale` | `OCCUPIED_LATERAL_ACCEL` | același pasager, canalul lateral, sub plafon | 0,8500 raport | ±0,0200 raport | 0,12 raport | VALIDATED, 8+8 episoade, eroare 0,0000 |

Split explicit cu seed **186**: **32 de episoade admise**, fără suprapunere între estimare și
validare. Un set de trei episoade lasă un singur episod de validare și raportează `TOO_SMALL`, nu o
validare inventată.

## Separarea preferință / prag obligatoriu / stare ocupată

| Categorie | Ce conține | De unde vine | Cum se măsoară |
| --- | --- | --- | --- |
| Preferință de serviciu | apropierea, bordura, precizia și staționarea de pickup, apropierea și bordura de dropoff | profilul jucătorului | numai într-o oprire permisă, din valoarea efectivă a comenzii |
| Prag obligatoriu | zona autorată, accesul TAXI, tipul zonei, punctul marcat, banda bordurii, staționarea de îmbarcare | poligonul și ancora 032, 062, 061 | nu se estimează; mărginește preferința și o ascunde când refuză oprirea |
| Stare ocupată | `occupied_acceleration_scale`, `occupied_lateral_accel_scale` | numai 061 `TO_DROPOFF`/`DROPOFF` | raportul dintre accelerația comandată și baza M, sub plafon |

## Cele trei capcane de identificabilitate

**1. O oprire refuzată de pragul obligatoriu nu spune nimic despre preferință.** Comanda 185
calculează și raportează în continuare apropierea, bordura și precizia pe tick-ul blocat, dar
estimatorul le ignoră. Un refuz de acces TAXI produce `PREFERENCE_MASKED_BY_ZONE_ACCESS` și lasă
neobservate simultan toate cele patru preferințe de pickup; refuzurile de tip, de poziție, de bay
îngust și de fereastră prea strâmtă produc `PREFERENCE_MASKED_BY_ZONE_KIND`,
`PREFERENCE_MASKED_BY_BEYOND_ZONE`, `PREFERENCE_MASKED_BY_NARROW_BAY` și
`PREFERENCE_MASKED_BY_STOP_WINDOW`. În fiecare caz `value` este `null`, `excluded` numără motivul
exact al lui 185 (`ZONE_NOT_TAXI`, `STOP_BEYOND_ZONE` etc.), iar testul dovedește că numărul exista
în comandă: aceeași scenă raportează `commandedSpeedMps` 3 m/s cu `stopAllowed: false`.

**2. Precizia la plafon este ambiguă.** `pickup_stop_precision` este
`clamp(cheie, 0,05 m, min(punct, lungime − punct))`. Pe un punct marcat la 0,50 m de margine,
plafonul este 0,50 m: cheia de 1 m produce exact 0,50 m cu flagul `capped`, deci rezultatul este
`PICKUP_STOP_PRECISION_CAP_SATURATED`, cu valoare `null`, niciodată plafonul ca estimare. O cheie
exact egală cu plafonul rămâne observabilă, pentru că 185 nu o marchează `capped`: aceeași fereastră
dă `CANDIDATE` 0,5000 m. Podeaua fizică de 0,05 m este sub minimul catalogului (0,2 m), deci numai
plafonul poate lega în practică.

**3. Plafonul maschează scara ocupată.** Scările sunt
`min(cheie · M, plafon de confort, aderență)`. Cu `desired_acceleration` 1,5 și confort 2, cheia 1,5
cere 2,25 m/s² și primește 2 m/s² (`COMFORT`), deci `OCCUPIED_ACCELERATION_SCALE_CAP_SATURATED`.
Pe `reduced-adhesion`, anvelopa este `1,3 · 0,35 · 9,81 = 4,463550 m/s²`: cu `desired` 4 și confort 8
taie ea, iar cu `curve_lateral_accel` 8 taie și canalul lateral
(`OCCUPIED_LATERAL_ACCEL_SCALE_CAP_SATURATED`). Estimatorul păstrează doar marginea
`cheie ≥ plafon / bază` și nu raportează niciodată plafonul ca preferință. Fără pasager la bord
scara este inertă (`PASSENGER_NOT_ABOARD`), chiar dacă comanda raportează o valoare numerică.

## Date neidentificabile și constrângeri de grup

Raportul explică zece constrângeri: `PICKUP_AND_DROPOFF_SHARE_ZONE_REFUSALS`,
`TAXI_REFUSAL_HIDES_ALL_FOUR_PICKUP_PREFERENCES`, `PRECISION_AND_DWELL_BELONG_TO_PICKUP_PHASE`,
`APPROACH_CAP_DEPENDS_ON_COMFORT_AND_DISTANCE`, `CURB_BAND_CLAMP_SHARES_PICKUP_AND_DROPOFF`,
`PRECISION_WINDOW_CLAMP_IS_AMBIGUOUS_AT_THE_CAP`, `DWELL_FLOOR_HIDES_SUB_FLOOR_KEYS`,
`OCCUPIED_SCALES_CAPPED_BY_COMFORT_AND_ADHESION`, `OCCUPIED_SCALES_ONLY_WITH_PASSENGER` și
`PICKUP_KEYS_FROM_ONE_STOP`.

Demonstrațiile neobservate din raport (24 de rânduri) acoperă: apropierea tăiată de plafonul
cinematic (8 m/s → 5,567764 m/s) și plafonul structural de 0 m/s la punctul marcat; bordura sub
rezerva de 0,15 m și peste plafonul de 1,20 m; precizia la plafon; staționarea sub 3 s și sub un M
`stop_dwell_time` de 4 s; ambele scări la confort și la aderență; scările inerte în cabină goală;
cele cinci refuzuri obligatorii; și intrările `MANUAL`, fără prefix sau fără episoade.

Un minim demonstrat rămâne distinct de „fără dovezi”: 0,5 m/s, 0,2 m și 0,3 raport sunt `CANDIDATE`
cu validare `VALIDATED`. Catalogul nu are însă niciun zero între cele opt chei (minimul merge de la
0,1 la 1), deci un zero demonstrat nu poate veni dintr-un profil 185 valid; un plafon de 0 m/s produs
când ego-ul este deja pe punctul marcat este structural și rămâne saturat.

## Comenzi executate și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 avertismente |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, importuri PASS (389 fișiere TypeScript, inclusiv probele negative) |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm test` | **3 226 teste, 3 226 trecute, 0 eșuate** (106,9 s) |
| `node --import ./scripts/register-typescript.mjs --test tests/learning/pickup-v2-estimator.test.ts` | **17 teste, 17 trecute, 0 eșuate** (fișierul țintă) |
| `npm run pickup:learning` | **33/33 verificări PASS**, 8 chei candidate, 24 demonstrații neobservate, digest `fnv1a32:2f6c0cae` |
| `npm run pickup:learning -- --check` | „Pickup learning report is current”, „Pickup learning markdown is current” |

Digest de determinism: 32 de episoade, aceeași estimare la rulare repetată →
`fnv1a32:2f6c0cae`.

## Compatibilitate cu 185

Cu valorile estimate, 185 comandă 3 m/s pe apropierea reală de 7,75 m (distanța de oprire 2,25 m,
sub plafonul de 5,567764 m/s), 0,50 m la bordură, 1,00 m toleranță, 5 s staționare peste podeaua de
3 s, 3 m/s și 0,50 m la dropoff, 1,275 m/s² cu pasager (0,85 · 1,5, plafon `NONE`) și 5,1 m/s² pe
canalul lateral (0,85 · 6, plafon `NONE`). Unitățile rămân cele ale catalogului: m/s, m, s și raport.

## Fișiere atinse

- Creat: `src/learning/pickup-v2-estimator.ts` (contractul `186-pickup-estimator-v1`).
- Modificat: `src/learning/index.ts` (un export nou, adăugat la finalul listei).
- Creat: `tests/learning/pickup-v2-estimator-reference.ts` (zonele reale 032, stările reale 061, scenariile).
- Creat: `tests/learning/pickup-v2-estimator-report.ts` (raportul determinist, 33 de verificări).
- Creat: `tests/learning/pickup-v2-estimator.test.ts` (17 teste).
- Creat: `scripts/run-v2-pickup-learning-report.mjs`.
- Modificat: `package.json` (scriptul `pickup:learning`, ultima intrare din blocul `scripts`).
- Modificat: `Docs/10-invatarea-stilului.md` (secțiunea contractului, la final).
- Creat: `Docs/Evidence/186-v2-pickup-learning/` (`README.md`, `report.json`, `report.md`).
- Mutat: `PBI/To Do/186-v2_learn_10.md` → `PBI/Done/186-v2_learn_10.md`.

## Limitări

- Nivel determinist în Node: fără browser, GPU, fizică live sau input uman. Comenzile sunt calculate
  din faptele declarate ale tick-ului; contractul nu este încă legat la un consumator din joc, ca și
  PBI-urile 167–185.
- Zona, ancora, lungimea, adâncimea și accesul sunt reale (032), iar starea ocupată este reală (061),
  dar plasarea ego-ului (distanța până la punctul marcat, viteza, distanța curentă la bordură,
  timpul de staționare) este a scenariului, ca la celelalte straturi V2.
- Valorile demonstrate sunt plauzibile, nu calibrate pe date reale: dovezile probează contractul de
  context, incertitudine, împărțire și refuz, nu calibrarea finală.
- Catalogul nu are nicio cheie cu minim 0 între cele opt; „zeroul demonstrat” nu poate apărea dintr-un
  profil 185 valid, iar plafonul structural de 0 m/s este raportat ca saturație, nu ca preferință.
- Pe bay-ul real de 3,00 m, cheile de bordură din banda 1,20–2 m nu sunt identificabile cu un sedan;
  o clasă sau un bay diferit ar fi necesar pentru a le demonstra.
- Estimatorul tratează un singur punct de serviciu pe tick; alegerea între mai multe zone simultane
  rămâne a consumatorului.

# 179 — politică extinsă pentru control lateral și viraje

Contractul `179-lateral-policy-v2` din [`src/autonomy/lateral-policy-v2.ts`](../../../src/autonomy/lateral-policy-v2.ts)
activează cele opt chei R ale categoriei „Control lateral și viraje” ca strat de politică peste
proiecția deja livrată de 049: `lane_center_offset` (m), `steering_response_time` (s),
`steering_rate_limit` (rad/s), `turn_entry_speed` (m/s), `turn_exit_acceleration` (m/s²),
`corner_cutting_bias` (raport), `lateral_clearance` (m) și `lateral_correction_deadband` (m).
Raportul determinist este [report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare tick primește exact proiecția `049-lateral-v1` a tick-ului și întoarce o comandă înghețată cu
acțiunea, motivul, valorile de decizie, diagnosticele moștenite și latch-ul pentru tick-ul următor.
Stratul nu recalculează urmărirea laterală: 049 rămâne autoritatea pentru fezabilitate, preview,
curbură, avizul de viteză și eroarea de cross-track. Traiectoria este normalizată după geometria reală
a clasei 023 (`wheelbaseM`, `trackM`, `steeringRadians`) și după aderența din cheia M
`curve_lateral_accel`; valorile, unitățile și proveniența se citesc prin
`parsePublishableDrivingProfile`, deci intervalele rămân exact cele ale catalogului 092. Catalogul nu
este modificat.

- `lane_center_offset` este deplasarea țintă față de centrul benzii, plafonată la coridorul 049
  (`lățime/2 − ecartament/2 − 0,2 m`). Pe banda de 4 m a fixture-ului coridorul este 0,9 m, deci
  cheia −1 m dă −0,900 m și cheia +1 m dă +0,900 m; pe clasa compact coridorul este 1,0 m și cheia de
  1 m încape fără plafonare.
- `steering_response_time` este timpul mort: după o schimbare de țintă comanda ține valoarea anterioară
  `max(1, ceil(cheie · 60))` tick-uri, apoi urmează ținta cu pasul de rată. 0,05 s ține 3 tick-uri,
  1,5 s ține 90; limita de rată nu schimbă momentul primei mișcări.
- `steering_rate_limit` este pasul maxim de unghi la roată pe tick, plafonat explicit la
  `maximumSteeringRateRadPerS = 1,5 rad/s`: 0,1 rad/s dă 0,001667 rad/tick, iar 4 rad/s dă
  0,025000 rad/tick, nu 0,066667.
- `turn_entry_speed` este viteza preferată pentru un viraj (rază locală ≤ 40 m), limitată de plafonul
  de aderență `min(sqrt(curve_lateral_accel · rază), avizul 049)`. Pe virajul autorat de 15,719 m cu
  2,5 m/s² plafonul este 6,268769 m/s; cheia de 18 m/s rămâne sub el.
- `turn_exit_acceleration` este accelerația preferată în primul tick după viraj, limitată de cheia M
  `desired_acceleration`: cu 1,5 m/s² cheia de 6 m/s² cere 1,5, iar cu 4 m/s² cere 4.
- `corner_cutting_bias` scurtează traiectoria spre interiorul curbei cu `cheie · coridor`, până la
  0,9 m, în același coridor ca deplasarea de bandă. Virajul autorat este la stânga, deci deplasarea
  este negativă.
- `lateral_clearance` este spațiul dorit față de un obstacol declarat și este un minim: spațiul efectiv
  este `max(cheie, ecartament + 0,2 m)`, adică 2,0 m pentru sedan și 1,8 m pentru compact. Cu 2,6 m
  liberi între caroserie și obstacol, cheia minimă permite trecerea, iar cheia de 3 m o interzice.
- `lateral_correction_deadband` este toleranța la abaterea laterală: sub bandă corecția de cross-track
  este zero și rămâne numai urmărirea de geometrie a lui 049. La 0,3 m abatere, banda 0 activează
  corecția, banda 0,6 m o oprește, dar direcția atinge exact −0,170107 rad, valoarea 049.

## Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `lane_center_offset` | deplasare față de centrul benzii; deplasarea țintă (m) | −1 | −0,900 | 1 | 0,900 | **+1,800** |
| `steering_response_time` | răspunsul comenzii; tick-uri până la prima mișcare | 0,05 | 3 | 1,5 | 90 | **+87 tick-uri** |
| `steering_rate_limit` | limita de rată; pasul aplicat la prima mișcare (rad/tick) | 0,1 | 0,001667 | 4 | 0,025000 | **+0,023333** |
| `turn_entry_speed` | viteza de intrare în viraj (m/s) | 1 | 1,000 | 18 | 6,269 | **+5,269** |
| `turn_exit_acceleration` | accelerația la ieșire (m/s²) | 0,2 | 0,200 | 6 | 1,500 | **+1,300** |
| `corner_cutting_bias` | tăierea virajului; deplasarea spre interior (m) | 0 | 0,000 | 1 | 0,900 | **+0,900** |
| `lateral_clearance` | spațiul lateral liber; manevra este permisă (1/0) | 0,1 | 1 | 3 | 0 | **−1** |
| `lateral_correction_deadband` | banda moartă; corecția este activă (1/0) | 0 | 1 | 0,6 | 0 | **−1** |

Numere suplimentare din raport: coridorul 049 este 0,9 m pe banda de 4 m (1,0 m pe compact); pasul
de rată la cheia 4 rad/s este exact 0,025000 rad/tick, adică 1,5 rad/s; plafonul de aderență este
6,268769 m/s pentru 2,5 m/s² și 7,483315 m/s pentru 8 m/s² (limitat de avizul 049); spațiul efectiv
este 2,0 m pentru sedan și 1,8 m pentru compact; la 1,5 m liberi nici cheia minimă nu permite
trecerea.

## Separarea cheilor

Raportul măsoară **56 de perechi** (fiecare din cele opt chei în celelalte șapte scenarii) și toate au
diferența **0,000**: nicio cheie nu este inertă în scenariul ei și nicio cheie nu schimbă rezultatul
altui scenariu. Nu există dependențe explicite între chei.

## Siguranță: coridor, rată, minim de spațiu și aderență

| Verificare | Scenariu | Rezultat |
| --- | --- | ---: |
| coridorul deplasării | cheia +1 m, sedan / compact | 0,900 m / 1,000 m |
| plafonul de rată | cheia 4 rad/s | 0,025000 rad/tick (1,5 rad/s), nu 0,066667 |
| minimul de spațiu | cheia minimă 0,1 m, sedan / compact | 2,000 m / 1,800 m |
| vetoul de spațiu | 1,5 m liberi, cheia minimă | `CLEARANCE_HOLD`, manevra interzisă |
| plafonul de aderență | grilă de 18 valori pe virajul de 15,719 m | maximum 6,268769 m/s, sub 18 m/s |
| proiecția inutilizabilă | observație discontinuă, toate cheile la maxim | `PROJECTION_UNUSABLE`, direcția 0 rad |
| proiecția veche | proiecția 049 din alt tick | `FOREIGN_OR_STALE_PROJECTION` |
| proiecția străină | proiecția 049 a altui actor | `FOREIGN_OR_STALE_PROJECTION` |
| banda moartă | abatere 0,3 m, banda 0,6 m, 12 tick-uri | corecție oprită, direcția −0,170107 rad |
| valorile din afara catalogului | cheia 2 m și 1 m | 2 m refuzat, 1 m admis și plafonat |

Un rezultat 049 inutilizabil, vechi sau străin este refuzat înaintea oricărei chei: comanda rămâne
`UNAVAILABLE`, cu direcția nemodificată și fără viteză de intrare sau accelerație de ieșire. Un
spațiu lateral sub minim este de asemenea refuzat indiferent de cheie. Banda moartă oprește doar
corecția de cross-track, niciodată urmărirea de geometrie a lui 049.

## Compatibilitate cu cheile M

Profilul poartă simultan cheia M `curve_lateral_accel` a lui 046 (m/s²) și cheia M
`desired_acceleration` a lui 047 (m/s²) plus cele opt chei 179. Cheile M își păstrează unitățile și
consecințele: plafonul de aderență urmează `curve_lateral_accel` (2,5 m/s² → 6,268769 m/s; 8 m/s² →
7,483315 m/s), iar plafonul de ieșire urmează `desired_acceleration` (1,5 m/s² → 1,500000 m/s²;
4 m/s² → 4,000000 m/s²). Pe 60 de tick-uri cu controllerul 049 real:

- **60/60 proiecții 049 identice** între cheile R neutre și cele active;
- **60/60 comenzi neutre** reproduc exact direcția 049 pe drumul drept;
- cu cheile active, **60 de tick-uri diferă**, cu până la **0,100000 rad** diferență de unghi.

## Determinism

Aceleași intrări și aceeași stare produc exact aceeași comandă. Seria de 8 tick-uri care parcurge cele
opt scenarii are amprenta `fnv1a32:3a40c2b1`, identică la o a doua rulare. Nu există ceas,
aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (382 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/lateral-policy-v2.test.ts` | 15 teste, 15 PASS, 0 fail |
| `npm test` | 3102 teste, 3102 PASS, 0 fail (101,3 s) |
| `npm run lateral:policy` | 19/19 verificări PASS, raport scris |
| `npm run lateral:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), inerția celorlalte șapte chei în
fiecare scenariu, coridorul 049 pentru deplasare și tăiere pe ambele clase, plafonul de rată,
minimul de spațiu și vetoul de clearance, plafonul de aderență pe o grilă de 18 valori, plafonul de
ieșire derivat din cheia M, banda moartă care nu oprește urmărirea, refuzul proiecției vechi, străine
sau inutilizabile, refuzul mecanicii și al stării din afara limitelor, geometria proprie a clasei
compact, determinismul și înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/lateral-policy-v2.ts` — contractul `179-lateral-policy-v2`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/lateral-policy-v2-reference.ts`, `tests/autonomy/lateral-policy-v2.test.ts`,
  `tests/autonomy/lateral-policy-v2-report.ts` — fixture-uri cu proiecții 049 reale, teste și
  oracolul raportului.
- `scripts/run-v2-lateral-policy-report.mjs`, `package.json` — raportul determinist `lateral:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/179-v2-lateral-policy/` — acest document, `report.json`, `report.md`.
- `PBI/Done/179-v2_policy_7.md` — PBI-ul finalizat și mutat fizic.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele opt chei au încă `implemented: false`, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI-urile de învățare și la actualizarea registrului.
- Ca și 046/047/048/049/050/051/052/053/167/169/171/173/175/177, stratul este un contract de politică
  neexecutat încă în bucla live de simulare; montarea lui în compoziție și proba de browser rămân
  pași separați.
- Observația este a apelantului: lumea trebuie să declare lățimea benzii, abaterea laterală semnată
  (pozitiv la dreapta) și obstacolul trecut (latură, centru semnat, lățime). Stratul nu face percepție
  și nu derivă aceste fapte din geometrie; proiecția 049 rămâne singura sursă pentru urmărire.
- Compoziția corectă cere ca apelantul să poarte latch-ul `state` (unghi commitat, țintă urmărită,
  tick-uri de timp mort rămase, flag de viraj). Fără el, timpul mort și detectarea ieșirii din viraj
  nu au continuitate; regula este impusă de contract, nu doar documentată.
- Plafonul de rată `1,5 rad/s`, podeaua de un tick a timpului mort, toleranța de 0,01 rad a țintei de
  direcție, marja de corp de 0,2 m și pragul de 40 m pentru viraj sunt constante de politică
  documentate în contract, nu chei de catalog.
- Performanța jocului integrat, browserul și hardware-ul nu sunt validate de acest PBI; nivelul de
  validare este „funcțional izolat” conform `Docs/validation-policy.md`.

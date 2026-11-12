# 169 — politică extinsă pentru accelerație și frânare

Contractul `169-accel-policy-v1` din [`src/autonomy/accel-policy.ts`](../../../src/autonomy/accel-policy.ts)
activează cele patru chei R longitudinale ca strat de stil peste rezultatul livrat de 047:
`braking_jerk` (m/s³), `throttle_release_delay` (s), `launch_intensity` (ratio) și `coasting_bias`
(ratio). Raportul determinist este [report.json](report.json), iar varianta umană
[report.md](report.md).

## Cum funcționează

Fiecare tick primește exact rezultatul `047-longitudinal-v1` și întoarce o comandă înghețată cu
throttle, brake, accelerația commitată și diagnosticile care au produs-o. Starea de actuare
(accelerație, throttle, brake, tick-uri de ținere rămase) este a apelantului și se returnează în
`actuation` pentru tick-ul următor. Valorile, unitățile și proveniența celor patru chei se citesc prin
`parsePublishableDrivingProfile`, deci intervalele rămân exact cele ale catalogului 092:
`braking_jerk` 0,2–20 m/s³, `throttle_release_delay` 0–3 s, `launch_intensity` 0–1 ratio,
`coasting_bias` 0–1 ratio. Catalogul nu este modificat.

- `braking_jerk` crește decelerația commitată cu `braking_jerk / 60` pe tick până la cererea 047.
  Momentul de început al frânării rămâne al lui 047, deci `brake_reaction_delay` nu se schimbă.
- `throttle_release_delay` ține accelerația și throttle-ul anterior când cererea 047 coboară la zero
  fără frânare, pentru `ceil(delay · 60)` tick-uri; orice cerere de frânare anulează imediat ținerea.
- `launch_intensity` scalează o cerere pozitivă sub 2 m/s între `0,35` și `1,0` din cererea 047.
- `coasting_bias` eliberează o cerere pozitivă mică (≤ 0,6 m/s²) peste 2 m/s, între cererea integrală
  și rularea liberă (throttle 0, fără frână).

**Separarea celor patru canale.** Frânarea (`cerere < 0`), ridicarea (`cerere = 0`), plecarea
(`viteză < 2 m/s`) și coasting-ul (`cerere pozitivă mică`, `viteză ≥ 2 m/s`) sunt disjuncte. În
tabelul de separare, fiecare cheie este inertă în scenariile celorlalte trei: diferența măsurată este
0,000 în toate cele șase perechi.

**Siguranța.** Stratul nu poate cere mai mult decât 047: factorii de plecare și coasting sunt în
`[0, 1]`, rampa de frânare are ca plafon cererea 047, iar throttle-ul ținut este ultimul throttle
produs de 047. O cerere de oprire sau un lider în interiorul a 5 m anulează throttle-ul, plecarea și
ținerea, iar o cerere de frânare este aplicată de la primul tick. Valorile mari schimbă confortul și
ritmul, nu limitele de siguranță.

## Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `braking_jerk` | cerere de frânare 2 m/s² (brake 0,25), 8 tick-uri | 0,2 | 0,027 m/s² | 20 | 2,000 m/s² | **1,973 m/s²** |
| `throttle_release_delay` | ridicare de la 1,5 m/s² și throttle 0,4, la 8 m/s | 0 | throttle 0,000 | 3 | throttle 0,400 | **0,400** |
| `launch_intensity` | plecare la 0,5 m/s, cerere 047 de 1,5 m/s² și throttle 0,4 | 0 | 0,525 m/s² | 1 | 1,500 m/s² | **0,975 m/s²** |
| `coasting_bias` | cerere mică de 0,4 m/s² (throttle 0,12), la 8 m/s | 0 | 0,400 m/s² | 1 | 0,000 m/s² | **0,400 m/s²** |

Numerele suplimentare din raport: ambele valori ale lui `braking_jerk` încep frânarea pe tick-ul 1
(întârzierea de reacție rămâne a lui 047), iar rampa de 20 m/s³ atinge cererea de 2 m/s² în 7
tick-uri; `throttle_release_delay` ține throttle-ul 0 tick-uri la 0 s și 180 de tick-uri la 3 s (60
Hz); `launch_intensity` 0 dă throttle 0,140, iar 1 dă 0,400; `coasting_bias` 1 produce throttle 0 și
fără frână.

## Separarea cheilor

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `launch_intensity` | scenariul de frânare, 8 tick-uri | 0 | 2,000 m/s² | 1 | 2,000 m/s² | 0,000 |
| `coasting_bias` | scenariul de plecare, 0,5 m/s | 0 | 1,500 m/s² | 1 | 1,500 m/s² | 0,000 |
| `throttle_release_delay` | scenariul de coasting, 8 m/s | 0 | 0,400 m/s² | 3 | 0,400 m/s² | 0,000 |
| `braking_jerk` | scenariul de plecare, 0,5 m/s | 0,2 | 1,500 m/s² | 20 | 1,500 m/s² | 0,000 |
| `braking_jerk` | scenariul de ridicare, 8 m/s | 0,2 | throttle 0,000 | 20 | throttle 0,000 | 0,000 |
| `coasting_bias` | scenariul de ridicare, 8 m/s | 0 | throttle 0,000 | 1 | throttle 0,000 | 0,000 |

## Siguranță: limitele 047 rămân dominante

| Verificare | Scenariu | Rezultat |
| --- | --- | ---: |
| oprire cerută | toate cheile la maxim, cerere de plecare 1,5 m/s² | throttle 0,000, veto activ |
| lider la 3 m | toate cheile la maxim, cerere de plecare 1,5 m/s² | throttle 0,000, veto activ |
| cerere de frânare | delay 3 s și oprire cerută, cerere −2 m/s² | brake 0,042 pe tick-ul de început, fără ținere |
| frânare maximă | `braking_jerk` 20 m/s³, 30 tick-uri de cerere 2 m/s² | 2,000 m/s², niciodată peste `comfort_deceleration` |
| plecare maximă | `launch_intensity` 1, cerere 047 de 1,5 m/s² | 1,500 m/s², egal cu `desired_acceleration` |
| cerere puternică | `coasting_bias` 1, cerere de 1,2 m/s² | 1,200 m/s², nu este eliberată |

## Compatibilitate cu cheile M

Un profil poartă simultan cele patru chei M ale lui 046, cele patru chei M ale lui 047 și cele patru
chei 169. Controlerul 047 real rulează aceeași secvență (accelerare 30 tick-uri, ridicare 12
tick-uri, frânare 58 tick-uri) cu cheile R neutre și cu ele active: **100/100 cereri 047** au aceleași
`accelerationMps2`, throttle, brake, fază și țintă. Primul tick de frânare 047 este **73** în ambele
variante, deci `brake_reaction_delay` nu este mutat. Cu cheile R neutre (`braking_jerk` 20 m/s³,
delay 0, plecare 1, coasting 0), traseul pozitiv și ridicarea sunt identice cu 047, iar rampa de
frânare se stabilizează la **−2,00 m/s²** și brake **0,25**, exact cererea `comfort_deceleration`.

Unitățile rămân cele ale catalogului: `desired_acceleration`, `comfort_deceleration` în m/s²,
`acceleration_jerk` și `braking_jerk` în m/s³, `brake_reaction_delay` și `throttle_release_delay` în
s, `launch_intensity` și `coasting_bias` în ratio.

## Determinism

Aceleași intrări și aceeași stare anterioară produc exact aceeași comandă. Seria de 60 de tick-uri cu
profilul de referință are amprenta `fnv1a32:912eb553`, identică la o a doua rulare. Nu există ceas,
aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (372 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/accel-policy.test.ts` | 10 teste, 10 PASS, 0 fail |
| `npm test` | 2983 teste, 2983 PASS, 0 fail (92,5 s) |
| `npm run accel:policy` | 19/19 verificări PASS, raport scris |
| `npm run accel:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), inerția fiecărei chei în
scenariile celorlalte, limita de siguranță a opririi și a liderului apropiat, dominanța frânării
asupra ținerii de throttle, plafonarea la cererea 047, compatibilitatea M pe controlerul 047 real,
refuzul valorilor din afara intervalului și al unității greșite, refuzul profilului incomplet,
diagnosticile pentru profil/observație/cerere străină sau veche, cererea inconsistentă, determinismul
și înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/accel-policy.ts` — contractul `169-accel-policy-v1`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/accel-policy.test.ts`, `tests/autonomy/accel-policy-reference.ts`,
  `tests/autonomy/accel-policy-report.ts` — teste, fixture-uri și oracolul raportului.
- `scripts/run-v2-accel-policy-report.mjs`, `package.json` — raportul determinist `accel:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/169-v2-accel-policy/` — acest document, `report.json`, `report.md`.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele patru chei au încă `implemented: false`, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI-urile de învățare și la actualizarea registrului.
- Ca și 046/047/048/167, stratul este un contract de politică neexecutat încă în bucla live de
  simulare; montarea lui în compoziție și proba de browser rămân pași separați.
- `braking_jerk` la valoarea maximă din catalog (20 m/s³) atinge o cerere de 2 m/s² în șapte
  tick-uri; aplicarea instantanee ar cere un jerk infinit, în afara catalogului. Echivalența „neutră”
  este deci o rampă mărginită, nu o identitate bit-cu-bit pe tick-urile de început.
- Pragurile de politică `launchSpeedMps = 2` și `coastingDemandMps2 = 0,6` sunt constante documentate
  în contract, nu chei de catalog; ele separă plecarea de coasting, nu înlocuiesc vreo cheie M.
- `coasting_bias` eliberează numai cereri mici; o cerere puternică rămâne integrală, pentru ca
  urmărirea și limitele de siguranță să nu fie slăbite.

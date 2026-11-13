# 185 — politică extinsă pentru pickup și confortul pasagerilor

Contract: `185-pickup-policy-v2` din [`src/autonomy/pickup-policy-v2.ts`](../../../src/autonomy/pickup-policy-v2.ts).
PBI: [185](../../../PBI/Done/185-v2_policy_10.md). Contractul de catalog: [11 § Politică extinsă pentru pickup și confortul pasagerilor](../../11-catalog-parametri.md).

Raportul determinist (`report.json` / `report.md`) din acest director este generat de
`npm run pickup:policy`; `npm run pickup:policy -- --check` refuză un raport neactualizat. Toate
numerele de mai jos sunt cele din raportul generat.

## Ce s-a implementat

`evaluatePickupPolicyV2` primește faptele observabile ale tick-ului și decide viteza de apropiere,
distanța la bordură, toleranța de oprire, staționarea, cele două scări cu pasager la bord și dacă
vehiculul poate pleca. Nu există un al doilea sistem de pickup sau dropoff: `062-pickup-v1` deține
zona marcată, pragul de staționare de 0,3 m/s și dwell-ul de îmbarcare de 180 de tick-uri,
`061-ride-fsm-v1` deține starea cursei care decide cabina ocupată, `032` deține poligonul și
ancora zonei de serviciu, `023` lățimea și aderența clasei („sedan" 1,80 m ecartament, priză 1,3;
„compact" 1,60 m, priză 1,5), iar `026` suprafețele livrate (`dry-asphalt`, `reduced-adhesion` cu
`tireGripScale` 0,35). `compilePickupPolicyProfile` citește valorile, unitățile și proveniența din
`parsePublishableDrivingProfile`; `Docs/driving-parameters.json` nu este modificat.

Fixture-ul nu inventează zona: rulează harta autorată `032` și ia poligonul, ancora și adâncimea
zonei reale a primei curse (`sz:0-0` pickup, `sz:1-0` dropoff, `sz:2-2` zonă numai CIVIL), iar
starea ocupată vine din ciclul real `061` (`TO_PICKUP` → `PICKUP` → `TO_DROPOFF` → `DROPOFF` →
`COMPLETED`). Poziția, viteza, distanța până la punctul marcat și timpul de staționare sunt ale
scenariului de politică, ca la celelalte straturi V2.

## Efectul izolat al fiecărei chei (opt chei, opt efecte)

Cheia scenariului este dusă la minimul și la maximul din catalog în aceeași scenă; celelalte șapte
rămân la valorile implicite. Rezultatul măsurat este cel al canalului cheii.

| Cheie | Scenariu | Joasă | Rezultat joasă | Ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `pickup_approach_speed` | zona reală `sz:0-0`, 7,75 m până la punctul marcat | 0,5 | 0,500 m/s | 8 | 5,568 m/s | 5,068 | m/s |
| `pickup_curb_distance` | oprit pe punctul marcat, caroserie la 0,50 m de bordură | 0,1 | 0,150 m | 2 | 1,200 m | 1,050 | m |
| `pickup_stop_precision` | același punct marcat, 1,00 s de staționare | 0,2 | 0,200 m | 5 | 2,750 m | 2,550 | m |
| `pickup_dwell_time` | oprit în zonă, îmbarcarea neconfirmată | 1 | 3,000 s | 10 | 10,000 s | 7,000 | s |
| `dropoff_approach_speed` | zona reală `sz:1-0`, cu pasager la bord | 0,5 | 0,500 m/s | 8 | 5,568 m/s | 5,068 | m/s |
| `dropoff_curb_distance` | oprit pe punctul marcat de dropoff | 0,1 | 0,150 m | 2 | 1,200 m | 1,050 | m |
| `occupied_acceleration_scale` | pasager la bord (`TO_DROPOFF`), drum liber | 0,3 | 0,450 m/s² | 1,5 | 2,000 m/s² | 1,550 | m/s² |
| `occupied_lateral_accel_scale` | același pasager la bord, fără serviciu | 0,3 | 0,750 m/s² | 1,5 | 2,500 m/s² | 1,750 | m/s² |

Viteza de apropiere este `min(cheie, sqrt(2 · comfort_deceleration · distanță))`: cu 7,75 m până
la punctul marcat și 2 m/s², plafonul este 5,567764 m/s, deci cheia de 8 m/s este tăiată. Distanța
la bordură este `clamp(cheie, 0,15 m, adâncime − lățime)`: în bay-ul real de 3,00 m, un sedan de
1,80 m are banda `[0,15 m, 1,20 m]`. Precizia este `clamp(cheie, 0,05 m, min(punct, lungime − punct))`:
0,05 m este dovada de poziție livrată de 062, iar 2,75 m este semilățimea punctului marcat.
Staționarea este `max(cheie, max(3 s, M stop_dwell_time))`.

## Separarea preferință / prag obligatoriu / stare ocupată

Cele trei categorii sunt **canale diferite**, nu trei nume pentru aceeași valoare.

| Categorie | Ce conține | De unde vine |
| --- | --- | --- |
| Preferință de serviciu | `pickup_approach_speed`, `pickup_curb_distance`, `pickup_stop_precision`, `pickup_dwell_time`, `dropoff_approach_speed`, `dropoff_curb_distance` | profilul jucătorului |
| Prag obligatoriu | zona autorată (unde clientul poate fi luat/lăsat), banda de bordură (nici pe bordura, nici în banda de circulație), staționarea de îmbarcare, confirmarea `061`, accesul TAXI | poligonul și ancora `032`, `062`, `061` |
| Stare ocupată | `occupied_acceleration_scale`, `occupied_lateral_accel_scale` | numai `TO_DROPOFF`/`DROPOFF` din `061` |

**O preferință nu forțează un prag.** Blocul `mandatory` al comenzii este calculat numai din fapte
și constante și este identic la minimul și maximul fiecărei preferințe:

| Cheie | Scenariu | Joasă | Ridicată | Bloc identic | Oprire permisă la ambele |
| --- | --- | ---: | ---: | --- | --- |
| `pickup_approach_speed` | `distanța la bordură (pickup)` | 0,5 | 8 | da | da |
| `pickup_curb_distance` | `distanța la bordură (pickup)` | 0,1 | 2 | da | da |
| `pickup_stop_precision` | `distanța la bordură (pickup)` | 0,2 | 5 | da | da |
| `pickup_dwell_time` | `distanța la bordură (pickup)` | 1 | 10 | da | da |

Pe o grilă de 3 valori × 4 preferințe × 2 scene (apropiere și oprire), **162/162** de combinații
păstrează oprirea permisă, banda de bordură, fereastra de precizie în bay, distanța de oprire sub
distanța până la punctul marcat și poarta de plecare închisă, cu **0** modificări ale blocului
obligatoriu. `stopAllowed` nu depinde de nicio cheie.

**Un prag nu este încălcat de nicio preferință.** Preferința este tăiată de prag, nu invers:
0,10 → 0,15 m și 2,00 → 1,20 m la bordură, 5 → 2,75 m la precizie, 8 → 5,567764 m/s la apropiere,
1 → 3 s la staționare. Trei blocaje reale refuză oprirea la toate cele patru extreme de preferință:

| Blocaj | Scenariu | Motiv | Oprire permisă | Inerție la orice preferință |
| --- | --- | --- | --- | --- |
| `civil-only` | zona reală `sz:2-2`, acces numai CIVIL | `ZONE_NOT_TAXI` | nu | da |
| `beyond-zone` | ego la 1,00 m după ieșirea din bay | `STOP_BEYOND_ZONE` | nu | da |
| `kind-mismatch` | fază DROPOFF pe o zonă autorată PICKUP | `ZONE_KIND_MISMATCH` | nu | da |

## Cele trei limite de siguranță

| Limită | Situație | Cheie joasă | Cheie ridicată | Verdict |
| --- | --- | ---: | ---: | --- |
| Precizie minimă | punct marcat la 2,75 m, bay de 5,50 m | 0,2 → 0,200 m | 5 → **2,750 m** | toleranța nu poate ieși din bay și nu poate coborî sub dovada fizică de 0,05 m |
| Plafon de confort (longitudinal) | pasager la bord, `desired_acceleration` 4 m/s² | 0,3 → 1,200 m/s² | 1,5 → **2,000 m/s²** | `min(cheie · 4, comfort 2, aderență 12,753)`; confortul taie |
| Plafon de aderență (longitudinal) | `reduced-adhesion`, `desired` 4, comfort 8 | 0,3 → 1,200 m/s² | 1,5 → **4,46355 m/s²** | anvelopa taie înaintea scării (cerut 6) |
| Plafon de aderență (lateral) | `reduced-adhesion`, `curve_lateral_accel` 8 | 0,3 → 2,400 m/s² | 1,5 → **4,46355 m/s²** | anvelopa taie înaintea scării (cerut 12) |
| Plafon cinematic de apropiere | 7,75 m până la punctul marcat | 0,5 → 0,500 m/s | 8 → **5,567764 m/s** | distanța de oprire nu depășește distanța până la punctul marcat |
| Minim de staționare | oprit în bay, îmbarcare neconfirmată | 1 → **3 s** | 10 → 10 s | niciun 10 s de staționare nu permite plecarea fără confirmarea `061` |

Poarta de plecare cere simultan: oprire în bay, confirmare `061`, staționare efectivă și viteză
sub 0,3 m/s. La 10 s de staționare cu îmbarcarea neconfirmată, plecarea rămâne refuzată cu
`SERVICE_NOT_CONFIRMED`; după confirmare, cheia de 1 s permite plecarea la 3,2 s, iar cheia de
10 s o ține pe loc cu `DWELL_PENDING`. În mișcare, plecarea este refuzată cu `NOT_STATIONARY`.

Formulele, cu constantele contractului:

1. **Precizie** — `clamp(cheie, 0,05 m, min(punct, lungime − punct))`; fereastra de oprire este
   `[punct − toleranță, punct + toleranță]` și rămâne în `[0, lungime]`.
2. **Bordură** — `clamp(cheie, 0,15 m, adâncime bay − lățime clasă)`; 0,15 m este rezerva de
   caroserie, iar partea de sus a benzii este marginea bay-ului, nu banda de circulație.
3. **Apropiere** — `min(cheie, sqrt(2 · comfort_deceleration · distanță))`.
4. **Staționare** — `max(cheie, max(180 tick-uri / 60 Hz, M stop_dwell_time))`.
5. **Pasager** — `min(cheie · M, plafon de confort, grip · tireGripScale · g)`, unde plafonul de
   confort este `comfort_deceleration` pentru accelerația longitudinală și `curve_lateral_accel`
   pentru cea laterală.

## Starea ocupată

| Stare 061 | Pasager la bord | Scală minimă (m/s²) | Scală maximă (m/s²) | Inertă fără pasager | Plafon |
| --- | --- | ---: | ---: | --- | --- |
| `TO_PICKUP` | nu | 1,5 | 1,5 | da | `NONE` |
| `PICKUP` | nu | 1,5 | 1,5 | da | `NONE` |
| `TO_DROPOFF` | da | 0,45 | 2 | nu | `COMFORT` |
| `DROPOFF` | da | 0,45 | 2 | nu | `COMFORT` |
| `COMPLETED` | nu | 1,5 | 1,5 | da | `NONE` |

Cabină goală: scara este inertă și rămâne valoarea M livrată. Pasager la bord: ambele scări sunt
aplicate și tăiate de confort și de aderență, oricare ar fi cheia.

## Compatibilitate cu cheile M

Patru chei M livrate sunt citite fără să fie rescrise; valorile moștenite sunt raportate separat de
contribuția R.

| `comfort_deceleration` (m/s²) | Plafon cinematic de apropiere (m/s) |
| ---: | ---: |
| 2 | 5,567764 |
| 2,5 | 6,224950 |
| 8 | 11,135529 |

| `stop_dwell_time` (s) | Efectiv la cheie 1 s | Efectiv la cheie 10 s |
| ---: | ---: | ---: |
| 0 | 3 | 10 |
| 1 | 3 | 10 |
| 4 | 4 | 10 |

| `desired_acceleration` (m/s²) | Scară 0,85 | Comandat (m/s²) | Plafon |
| ---: | ---: | ---: | --- |
| 0,5 | 0,85 | 0,425 | `NONE` |
| 1,5 | 0,85 | 1,275 | `NONE` |
| 4 | 0,85 | 2,000 | `COMFORT` |

| `curve_lateral_accel` (m/s²) | Scară 0,85 | Comandat (m/s²) | Plafon |
| ---: | ---: | ---: | --- |
| 1 | 0,85 | 0,850 | `NONE` |
| 2,5 | 0,85 | 2,125 | `NONE` |
| 8 | 0,85 | 6,800 | `NONE` |

Unitățile rămân cele ale catalogului: M `m/s²`, `s`; R `m/s`, `m`, `s`, `ratio`. Plafonul de
confort lateral este chiar preferința M `curve_lateral_accel`, deci scara peste 1 nu poate depăși
virajul livrat, iar pe `reduced-adhesion` anvelopa (4,463550 m/s²) taie și ea.

## Comenzi executate și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 erori, 0 avertismente |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!" |
| `npm run check:architecture` | exit 0, importuri PASS (388 fișiere TypeScript, inclusiv probele negative) |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized." |
| `npm test` | **3 209 teste, 3 209 trecute, 0 eșuate** (101,2 s) |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/pickup-policy-v2.test.ts` | **14 teste, 14 trecute, 0 eșuate** (fișierul țintă) |
| `npm run pickup:policy` | **19/19 verificări PASS**, 8 efecte, 56 perechi de separare, 0 cuplaje, 6 rânduri de siguranță, 162/162 cazuri în grilă, digest `fnv1a32:f9043488` |
| `npm run pickup:policy -- --check` | „Pickup policy report is current", „Pickup policy markdown is current" |

Digest de determinism: 16 decizii (cele opt scenarii, la minim și la maxim) → `fnv1a32:f9043488`,
identic la rulare repetată.

## Fișiere atinse

- Creat: `src/autonomy/pickup-policy-v2.ts` (contractul `185-pickup-policy-v2`).
- Modificat: `src/autonomy/index.ts` (un export nou, adăugat la finalul listei).
- Creat: `tests/autonomy/pickup-policy-v2-reference.ts` (zona reală 032, stările reale 061, scenariile).
- Creat: `tests/autonomy/pickup-policy-v2.test.ts` (14 teste).
- Creat: `tests/autonomy/pickup-policy-v2-report.ts` (raportul determinist).
- Creat: `scripts/run-v2-pickup-policy-report.mjs`.
- Modificat: `package.json` (scriptul `pickup:policy`, ultima intrare din blocul `scripts`).
- Modificat: `Docs/11-catalog-parametri.md` (secțiunea contractului, la final).
- Creat: `Docs/Evidence/185-v2-pickup-policy/` (`README.md`, `report.json`, `report.md`).
- Mutat: `PBI/To Do/185-v2_policy_10.md` → `PBI/Done/185-v2_policy_10.md`.

## Limitări

- Nivel determinist în Node: fără browser, GPU, fizică live sau input uman. Comenzile sunt calculate
  din faptele declarate ale tick-ului; contractul nu este încă legat la un consumator din joc, ca și
  PBI-urile 167–183.
- Zona, ancora, lungimea, adâncimea și accesul sunt reale (032), iar starea ocupată este reală (061),
  dar plasarea ego-ului (distanța până la punctul marcat, viteza, distanța curentă la bordură,
  timpul de staționare) este a scenariului, ca la celelalte straturi V2.
- Poligonul 032 nu declară o linie separată a bordurii: bordura este marginea exterioară a bay-ului
  autorat, iar adâncimea lui este banda în care caroseria trebuie să încapă. Rezerva de 0,15 m și
  toleranța fizică de 0,05 m sunt constante de politică documentate, nu chei de catalog.
- Pragul de staționare de 3 s este o constantă de politică egală cu cele 180 de tick-uri livrate de
  062; `autonomy` nu poate importa `fleet` (ar crea un ciclu de module), deci cele două constante
  trebuie ținute sincron. `M stop_dwell_time` are maximum 4 s, deci interacțiunea M asupra podelei
  de staționare este mărginită de acel maximum.
- Cheile de precizie și de staționare aparțin fazei de pickup; catalogul nu are chei de precizie sau
  staționare pentru dropoff, deci faza de dropoff folosește numai cheile ei de apropiere și bordură.
- Politica tratează **un** punct de serviciu pe tick. Alegerea între mai multe zone simultane și
  compunerea cu un controller longitudinal/lateral rămân ale consumatorului.
- Scările cu pasager sunt plafoane de comandă, nu un controller complet: consumatorul compune
  accelerația longitudinală și laterală cu celelalte politici livrate.
- Un bay prea îngust pentru lățimea clasei produce `BAY_TOO_NARROW`, iar un punct de oprire prea
  aproape de margine produce `STOP_WINDOW_TOO_TIGHT`; ambele sunt raportate, nu reparate de politică.

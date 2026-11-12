# 171 — raport politică de urmărire și distanțe

Generat de `scripts/run-v2-follow-policy-report.mjs` din contractul `171-follow-policy-v1`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.

## Episoadele

| Episod | Scenariu |
| --- | --- |
| cut-in | un vehicul nou se interpune la 18 m; ego 15 m/s, angajament anterior 12 m/s |
| timp până la contact | apropiere cu 6 m/s de un lider de 8 m/s aflat la 36 m |
| schimbarea liderului | liderul anterior părăsește banda; noul lider este la 60 m și mai rapid |
| histerezis | decalajul oscilează ±2 m în jurul decalajului dorit, fără apropiere, cu același lider |

## Efectul izolat al fiecărei chei

| Cheie | Episod | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `cutin_brake_response` | cut-in | 0.2 | 9.940 | 1 | 1.700 | -8.240 | m/s | aceeași intrare (lider la 18 m, ego 15 m/s): preferința 048 este 1.700 m/s, iar o reacție mai mare coboară ținta commitată spre ea |
| `closing_ttc_threshold` | timp până la contact | 0.3 | 15.260 | 8 | 11.875 | -3.385 | m/s | apropiere 6 m/s la 36 m: plafon 111.333 vs 11.875 m/s; preferința 048 este 15.260 m/s |
| `leader_change_delay` | schimbarea liderului | 0 | 1.000 | 2 | 121.000 | 120.000 | tick | primul tick în care ținta commitată atinge preferința noului lider 16.000 m/s, la 60 Hz |
| `following_hysteresis` | histerezis | 0 | 30.800 | 5 | 0.000 | -30.800 | m/s | variația totală a țintei commitate pe 12 tick-uri, cu decalajul oscilând ±2 m în jurul decalajului dorit |

## Separarea cheilor (fiecare cheie inertă în celelalte episoade)

| Cheie | Episod | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `closing_ttc_threshold` | cut-in | 0.3 | 4.790 | 8 | 4.790 | 0.000 | m/s | `closing_ttc_threshold` este inertă în episodul cut-in |
| `leader_change_delay` | cut-in | 0 | 4.790 | 2 | 4.790 | 0.000 | m/s | `leader_change_delay` este inertă în episodul cut-in |
| `following_hysteresis` | cut-in | 0 | 4.790 | 5 | 4.790 | 0.000 | m/s | `following_hysteresis` este inertă în episodul cut-in |
| `cutin_brake_response` | timp până la contact | 1 | 15.260 | 0 | 15.260 | 0.000 | m/s | `cutin_brake_response` este inertă în episodul timp până la contact |
| `leader_change_delay` | timp până la contact | 0 | 15.260 | 2 | 15.260 | 0.000 | m/s | `leader_change_delay` este inertă în episodul timp până la contact |
| `following_hysteresis` | timp până la contact | 0 | 15.260 | 5 | 15.260 | 0.000 | m/s | `following_hysteresis` este inertă în episodul timp până la contact |
| `cutin_brake_response` | schimbarea liderului | 1 | 16.000 | 0 | 16.000 | 0.000 | m/s | `cutin_brake_response` este inertă în episodul schimbarea liderului |
| `closing_ttc_threshold` | schimbarea liderului | 0.3 | 16.000 | 8 | 16.000 | 0.000 | m/s | `closing_ttc_threshold` este inertă în episodul schimbarea liderului |
| `following_hysteresis` | schimbarea liderului | 0 | 16.000 | 5 | 16.000 | 0.000 | m/s | `following_hysteresis` este inertă în episodul schimbarea liderului |
| `cutin_brake_response` | histerezis | 1 | 10.000 | 0 | 10.000 | 0.000 | m/s | `cutin_brake_response` este inertă în episodul histerezis |
| `closing_ttc_threshold` | histerezis | 0.3 | 10.000 | 8 | 10.000 | 0.000 | m/s | `closing_ttc_threshold` este inertă în episodul histerezis |
| `leader_change_delay` | histerezis | 0 | 10.000 | 2 | 10.000 | 0.000 | m/s | `leader_change_delay` este inertă în episodul histerezis |

## Siguranță: limitele 048 și podeaua de 5 m rămân dominante

| Cheie | Episod | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `oprire cerută` | siguranță | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | toate cheile la valoarea cea mai permisivă: oprirea cere tot 0 m/s |
| `podea de contact 3 m` | siguranță | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | un lider în interiorul podelei de 5 m cere 0 m/s, oricare ar fi cheile |
| `marja timpului până la contact` | siguranță | 0 | 0.000 | 8 | 0.125 | 0.125 | m/s | cu pragul maxim la 1 m în afara podelei, viteza de apropiere 0.125 m/s păstrează marja rămasă timp de 8.000 s |
| `confort la pragul maxim` | siguranță | 0 | 0.000 | 8 | 1.784 | 1.784 | m/s² | 12 m/s la 40 m cu lider oprit: plafonul 4.375 m/s cere 1.784 m/s², în limita comfort_deceleration 2 |
| `reducere în timpul ținerii` | siguranță | 0 | 3.700 | 2 | 3.700 | 0.000 | m/s | ambele valori ale întârzierii adoptă reducerea imediat (0 tick-uri rămase); o întârziere maximă nu amână niciodată o reducere sigură |
| `cut-in la reacție maximă` | siguranță | 0 | 9.625 | 1 | 1.700 | -7.925 | m/s | reacția se oprește exact la preferința 048 livrată (1.700 m/s), iar valoarea fără reacție rămâne mărginită de plafonul timpului până la contact |

## Compatibilitate cu cheile M

- Rezultate 048 identice cu cheile R neutre vs active: **60/60 tick-uri**.
- Tick-uri neutre care forwardează exact ținta 048: **60/60**.
- Tick-uri active care diferă de ținta 048: **40**, diferență maximă **4.200 m/s**.
- Unități M: `speed_delta_urban` m/s, `following_time_headway` s, `following_min_gap` m, `queue_standstill_gap` m, `following_speed_gain` 1/s.
- Unități R: `cutin_brake_response` ratio, `closing_ttc_threshold` s, `leader_change_delay` s, `following_hysteresis` m.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `cutin_brake_response` | ratio | 0 | 1 | 0.7 |
| `closing_ttc_threshold` | s | 0.3 | 8 | 3 |
| `leader_change_delay` | s | 0 | 2 | 0.2 |
| `following_hysteresis` | m | 0 | 5 | 1 |

## Determinism

- 6 tick-uri: `fnv1a32:d746186b`.
- Rulare repetată: `fnv1a32:d746186b`.

## Verificări

- PASS `key-cutin-effect`: 9.940 -> 1.700 m/s, exact preferința 048
- PASS `key-cutin-no-reaction`: reacția zero păstrează angajamentul anterior de 12 m/s
- PASS `key-ttc-effect`: 15.260 -> 11.875 m/s
- PASS `key-ttc-margin`: viteza de apropiere plafonată păstrează 8.000 s de marjă
- PASS `key-leader-delay-effect`: adoptat la tick-ul 1 față de tick-ul 121
- PASS `key-leader-delay-reduction`: o reducere este adoptată pe tick-ul de ținere (3.700 m/s)
- PASS `key-hysteresis-effect`: variația totală 30.800 -> 0.000 m/s
- PASS `separation-cutin`: doar cutin_brake_response acționează în episodul cut-in
- PASS `separation-ttc`: doar closing_ttc_threshold acționează în episodul timpului până la contact
- PASS `separation-leader-change`: doar leader_change_delay acționează în episodul schimbării liderului
- PASS `separation-hysteresis`: doar following_hysteresis acționează în episodul histerezisului
- PASS `safety-stop`: o cerere de oprire comandă 0 m/s cu toate cheile la valoarea cea mai permisivă
- PASS `safety-floor`: un lider în interiorul a 5 m comandă 0 m/s
- PASS `safety-ttc-comfort`: 1.784 m/s² necesari pentru pragul maxim, confort 2 m/s²
- PASS `safety-cutin-bound`: reacția maximă se oprește la preferința 048 livrată și niciodată sub ea
- PASS `safety-coverage`: fiecare țintă commitată rămâne în 0-30 m/s
- PASS `m-following-identical`: 60/60 rezultate 048 identice cu cheile R neutre vs active
- PASS `m-neutral-forwards`: 60/60 tick-uri neutre forwardează ținta 048; 40 tick-uri active diferă cu până la 4.200 m/s
- PASS `catalog-ranges`: cutin_brake_response 0-1 ratio, closing_ttc_threshold 0.3-8 s, leader_change_delay 0-2 s, following_hysteresis 0-5 m
- PASS `determinism`: digest fnv1a32:d746186b

**Sumar: 20/20 verificări, PASS.**

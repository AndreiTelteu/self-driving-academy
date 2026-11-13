# 181 — raport politică extinsă pentru trasee și recuperare

Generat de `scripts/run-v2-route-policy-report.mjs` din contractul `181-route-policy-v2`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei,
peste alternative reale produse de planificatorul livrat 041 (aceeași origine, aceeași destinație).

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| ponderea timpului | două coridoare reale între aceeași origine și destinație: `route-short` (scurt, 5 m/s) și `route-fast` (lung, 22 m/s), ambele cu exact un viraj perceput |
| ponderea distanței | aceleași două coridoare, cu preferința de distanță testată la extrem |
| penalizarea virajelor | două coridoare cu geometrie identică și același timp liber, dar cu 4, respectiv 1 viraj declarat de proprietarul hărții |
| penalizarea semafoarelor | aceleași două coridoare simetrice, cu 3, respectiv 0 semafoare declarate pe traseu |
| penalizarea congestiei | aceleași două coridoare simetrice, cu întârzierea reală de congestie pe `route-north` (10 s de trafic declarat pe fiecare din cele două benzi) și 0 s pe `route-south` |
| răbdarea la rerutare | ruta curentă `route-slow` este dominată în toate dimensiunile de `route-direct`, iar alternativa mai bună a fost văzută de 60 de tick-uri |
| disponibilitatea întoarcerii în U | ruta directă (`route-direct`, 10 m/s) față de o rută care cere o întoarcere în U către o arteră de 20 m/s, cu harta declarând întoarcerea permisă |
| durata recuperării prin marșarier | recuperare prin marșarier cerută de lume, cu spațiul din spate declarat liber: durata commitată a manevrei |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `route_time_weight` | timp | 0 | 113.295 (route-short) | 1 | 60.656 (route-fast) | -52.639 | s |
| `route_distance_weight` | distanță | 0 | 1094.427 (route-fast) | 1 | 666.476 (route-short) | -427.951 | m |
| `route_turn_penalty` | viraje | 0 | 4.000 (route-turn-heavy) | 20 | 1.000 (route-turn-light) | -3.000 | viraje |
| `route_signal_penalty` | semafoare | 0 | 3.000 (route-north) | 60 | 0.000 (route-south) | -3.000 | semafoare |
| `route_congestion_penalty` | congestie | 0 | 20.000 (route-north) | 2 | 0.000 (route-south) | -20.000 | s |
| `reroute_patience` | rerutare | 2 | 60.000 (route-direct) | 120 | 7140.000 (route-direct) | 7080.000 | ticks |
| `u_turn_willingness` | întoarcere | 0 | 66.056 (route-direct) | 1 | 40.049 (route-uturn) | -26.007 | s |
| `reverse_recovery_duration` | recuperare | 0 | 2.500 (—) | 8 | 8.000 (—) | 5.500 | s |

## Separarea cheilor

Cheia scenariului rămâne la valoarea implicită din catalog, iar fiecare altă cheie este dusă de la
minim la maxim. 54 de perechi sunt inerte; cele două cuplaje sunt schimbul explicit dintre
preferința de timp și cea de distanță.

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Separată |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `route_distance_weight` | ponderea timpului | 0 | 60.656 (route-fast) | 1 | 113.295 (route-short) | 52.639 | s | **cuplaj** |
| `route_turn_penalty` | ponderea timpului | 0 | 60.656 (route-fast) | 20 | 60.656 (route-fast) | 0.000 | s | inertă |
| `route_signal_penalty` | ponderea timpului | 0 | 60.656 (route-fast) | 60 | 60.656 (route-fast) | 0.000 | s | inertă |
| `route_congestion_penalty` | ponderea timpului | 0 | 60.656 (route-fast) | 2 | 60.656 (route-fast) | 0.000 | s | inertă |
| `reroute_patience` | ponderea timpului | 2 | 60.656 (route-fast) | 120 | 60.656 (route-fast) | 0.000 | s | inertă |
| `u_turn_willingness` | ponderea timpului | 0 | 60.656 (route-fast) | 1 | 60.656 (route-fast) | 0.000 | s | inertă |
| `reverse_recovery_duration` | ponderea timpului | 0 | 60.656 (route-fast) | 8 | 60.656 (route-fast) | 0.000 | s | inertă |
| `route_time_weight` | ponderea distanței | 0 | 666.476 (route-short) | 1 | 1094.427 (route-fast) | 427.951 | m | **cuplaj** |
| `route_turn_penalty` | ponderea distanței | 0 | 1094.427 (route-fast) | 20 | 1094.427 (route-fast) | 0.000 | m | inertă |
| `route_signal_penalty` | ponderea distanței | 0 | 1094.427 (route-fast) | 60 | 1094.427 (route-fast) | 0.000 | m | inertă |
| `route_congestion_penalty` | ponderea distanței | 0 | 1094.427 (route-fast) | 2 | 1094.427 (route-fast) | 0.000 | m | inertă |
| `reroute_patience` | ponderea distanței | 2 | 1094.427 (route-fast) | 120 | 1094.427 (route-fast) | 0.000 | m | inertă |
| `u_turn_willingness` | ponderea distanței | 0 | 1094.427 (route-fast) | 1 | 1094.427 (route-fast) | 0.000 | m | inertă |
| `reverse_recovery_duration` | ponderea distanței | 0 | 1094.427 (route-fast) | 8 | 1094.427 (route-fast) | 0.000 | m | inertă |
| `route_time_weight` | penalizarea virajelor | 0 | 1.000 (route-turn-light) | 1 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `route_distance_weight` | penalizarea virajelor | 0 | 1.000 (route-turn-light) | 1 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `route_signal_penalty` | penalizarea virajelor | 0 | 1.000 (route-turn-light) | 60 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `route_congestion_penalty` | penalizarea virajelor | 0 | 1.000 (route-turn-light) | 2 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `reroute_patience` | penalizarea virajelor | 2 | 1.000 (route-turn-light) | 120 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `u_turn_willingness` | penalizarea virajelor | 0 | 1.000 (route-turn-light) | 1 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `reverse_recovery_duration` | penalizarea virajelor | 0 | 1.000 (route-turn-light) | 8 | 1.000 (route-turn-light) | 0.000 | viraje | inertă |
| `route_time_weight` | penalizarea semafoarelor | 0 | 0.000 (route-south) | 1 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `route_distance_weight` | penalizarea semafoarelor | 0 | 0.000 (route-south) | 1 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `route_turn_penalty` | penalizarea semafoarelor | 0 | 0.000 (route-south) | 20 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `route_congestion_penalty` | penalizarea semafoarelor | 0 | 0.000 (route-south) | 2 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `reroute_patience` | penalizarea semafoarelor | 2 | 0.000 (route-south) | 120 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `u_turn_willingness` | penalizarea semafoarelor | 0 | 0.000 (route-south) | 1 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `reverse_recovery_duration` | penalizarea semafoarelor | 0 | 0.000 (route-south) | 8 | 0.000 (route-south) | 0.000 | semafoare | inertă |
| `route_time_weight` | penalizarea congestiei | 0 | 0.000 (route-south) | 1 | 0.000 (route-south) | 0.000 | s | inertă |
| `route_distance_weight` | penalizarea congestiei | 0 | 0.000 (route-south) | 1 | 0.000 (route-south) | 0.000 | s | inertă |
| `route_turn_penalty` | penalizarea congestiei | 0 | 0.000 (route-south) | 20 | 0.000 (route-south) | 0.000 | s | inertă |
| `route_signal_penalty` | penalizarea congestiei | 0 | 0.000 (route-south) | 60 | 0.000 (route-south) | 0.000 | s | inertă |
| `reroute_patience` | penalizarea congestiei | 2 | 0.000 (route-south) | 120 | 0.000 (route-south) | 0.000 | s | inertă |
| `u_turn_willingness` | penalizarea congestiei | 0 | 0.000 (route-south) | 1 | 0.000 (route-south) | 0.000 | s | inertă |
| `reverse_recovery_duration` | penalizarea congestiei | 0 | 0.000 (route-south) | 8 | 0.000 (route-south) | 0.000 | s | inertă |
| `route_time_weight` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 1 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `route_distance_weight` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 1 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `route_turn_penalty` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 20 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `route_signal_penalty` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 60 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `route_congestion_penalty` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 2 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `u_turn_willingness` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 1 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `reverse_recovery_duration` | răbdarea la rerutare | 0 | 1140.000 (route-direct) | 8 | 1140.000 (route-direct) | 0.000 | ticks | inertă |
| `route_time_weight` | disponibilitatea întoarcerii în U | 0 | 66.056 (route-direct) | 1 | 66.056 (route-direct) | 0.000 | s | inertă |
| `route_distance_weight` | disponibilitatea întoarcerii în U | 0 | 66.056 (route-direct) | 1 | 66.056 (route-direct) | 0.000 | s | inertă |
| `route_turn_penalty` | disponibilitatea întoarcerii în U | 0 | 66.056 (route-direct) | 20 | 66.056 (route-direct) | 0.000 | s | inertă |
| `route_signal_penalty` | disponibilitatea întoarcerii în U | 0 | 66.056 (route-direct) | 60 | 66.056 (route-direct) | 0.000 | s | inertă |
| `route_congestion_penalty` | disponibilitatea întoarcerii în U | 0 | 66.056 (route-direct) | 2 | 66.056 (route-direct) | 0.000 | s | inertă |
| `reroute_patience` | disponibilitatea întoarcerii în U | 2 | 66.056 (route-direct) | 120 | 66.056 (route-direct) | 0.000 | s | inertă |
| `reverse_recovery_duration` | disponibilitatea întoarcerii în U | 0 | 66.056 (route-direct) | 8 | 66.056 (route-direct) | 0.000 | s | inertă |
| `route_time_weight` | durata recuperării prin marșarier | 0 | 2.500 (—) | 1 | 2.500 (—) | 0.000 | s | inertă |
| `route_distance_weight` | durata recuperării prin marșarier | 0 | 2.500 (—) | 1 | 2.500 (—) | 0.000 | s | inertă |
| `route_turn_penalty` | durata recuperării prin marșarier | 0 | 2.500 (—) | 20 | 2.500 (—) | 0.000 | s | inertă |
| `route_signal_penalty` | durata recuperării prin marșarier | 0 | 2.500 (—) | 60 | 2.500 (—) | 0.000 | s | inertă |
| `route_congestion_penalty` | durata recuperării prin marșarier | 0 | 2.500 (—) | 2 | 2.500 (—) | 0.000 | s | inertă |
| `reroute_patience` | durata recuperării prin marșarier | 2 | 2.500 (—) | 120 | 2.500 (—) | 0.000 | s | inertă |
| `u_turn_willingness` | durata recuperării prin marșarier | 0 | 2.500 (—) | 1 | 2.500 (—) | 0.000 | s | inertă |

## Siguranță: interdicția de întoarcere în U și minimul de recuperare

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `u_turn_willingness` | întoarcere interzisă | 0 | 66.056 (route-direct) | 1 | 66.056 (route-direct) | 0.000 | s |
| `u_turn_willingness` | întoarcere nedeclarată | 0 | 66.056 (route-direct) | 1 | 66.056 (route-direct) | 0.000 | s |
| `reverse_recovery_duration` | recuperare | 2 | 2.500 (—) | 8 | 8.000 (—) | 5.500 | s |
| `reverse_recovery_duration` | recuperare blocată | 2 | 0.000 (—) | 8 | 0.000 (—) | 0.000 | s |

- Podeaua de recuperare este **2.5 s** (150 de tick-uri, 3 m la 1.2 m/s): niciun minim de catalog nu permite o recuperare instantanee.
- O întoarcere în U interzisă sau nedeclarată nu este admisă la nicio valoare a cheii; un spațiu din spate nedeclarat liber ține manevra.

## Normalizarea ponderilor și invarianța la scalare

- Coeficienții sunt cote dintr-un buget comun, cuantizate la 1e-12; suma este 1.
- Factori de scară aplicați tuturor celor cinci ponderi: 0.5, 1, 2, 5, 10.

| Factor | timp | distanță | viraj | semafor | congestie |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 | 0.071428571429 | 0.035714285714 | 0.238095238095 | 0.595238095238 | 0.059523809524 |
| 1 | 0.071428571429 | 0.035714285714 | 0.238095238095 | 0.595238095238 | 0.059523809524 |
| 2 | 0.071428571429 | 0.035714285714 | 0.238095238095 | 0.595238095238 | 0.059523809524 |
| 5 | 0.071428571429 | 0.035714285714 | 0.238095238095 | 0.595238095238 | 0.059523809524 |
| 10 | 0.071428571429 | 0.035714285714 | 0.238095238095 | 0.595238095238 | 0.059523809524 |

- Decizii comparate: **40**, cu alegere identică: **8 scenarii din 8**.
- Probă de aproape-egalitate (0.012 s diferență de congestie):
  îmbunătățirea brută este 0.006 la scara de bază și
  0.06 la ×10; regula naivă cu epsilon absolut
  0.01 dă KEEP / SWITCH (se schimbă),
  iar politica alege route-south / route-south și decide
  WAIT / WAIT (nu se schimbă).

## Compatibilitate cu cheile M

| Rută | Lungime (m) | Timp livrat (s) | Viteză liberă (m/s) | Viraje | Semafoare | Cost 041 (s) | Penalizări 041 (s) | Benzi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| route-short | 666.476152 | 113.29523 | 5.88265 | 1 | 0 | 104.79523 | 1.5 | 4 |
| route-fast | 1094.427191 | 60.655781 | 18.043246 | 1 | 0 | 52.155781 | 1.5 | 4 |
| route-turn-heavy | 600 | 60 | 10 | 0 | 0 | 51.5 | 1.5 | 4 |
| route-turn-light | 600 | 60 | 10 | 0 | 0 | 51.5 | 1.5 | 4 |
| route-north | 620.950973 | 62.095097 | 10 | 0 | 0 | 53.595097 | 1.5 | 4 |
| route-south | 620.950973 | 62.095097 | 10 | 0 | 0 | 53.595097 | 1.5 | 4 |
| route-slow | 765.685425 | 133.137085 | 5.751106 | 3 | 0 | 125.637085 | 2.5 | 6 |
| route-direct | 660.555128 | 66.055513 | 10 | 0 | 0 | 58.055513 | 2 | 5 |
| route-uturn | 600.975326 | 40.048766 | 15.006088 | 0 | 0 | 32.048766 | 2 | 5 |

- `route-short` (URBAN) cu delta 0 m/s: timp livrat 113.29523 s, timp de stil 113.29523 s.
- `route-short` (URBAN) cu delta 15 m/s: timp livrat 113.29523 s, timp de stil 31.915306 s.
- `route-slow` (RESIDENTIAL) cu delta 0 m/s: timp livrat 133.137085 s, timp de stil 133.137085 s.
- `route-slow` (RESIDENTIAL) cu delta 12 m/s: timp livrat 133.137085 s, timp de stil 43.13452 s.
- Alegerea pe perechea timp/distanță urmează delta M: 0 m/s -> route-fast, 15 m/s -> route-short.
- Unități M: `speed_delta_urban` m/s, `speed_delta_residential` m/s.
- Unități R: `route_time_weight` weight, `route_distance_weight` weight, `route_turn_penalty` s, `route_signal_penalty` s, `route_congestion_penalty` ratio, `reroute_patience` s, `u_turn_willingness` probability, `reverse_recovery_duration` s.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `route_time_weight` | weight | 0 | 1 | 0.6 |
| `route_distance_weight` | weight | 0 | 1 | 0.3 |
| `route_turn_penalty` | s | 0 | 20 | 2 |
| `route_signal_penalty` | s | 0 | 60 | 5 |
| `route_congestion_penalty` | ratio | 0 | 2 | 0.5 |
| `reroute_patience` | s | 2 | 120 | 20 |
| `u_turn_willingness` | probability | 0 | 1 | 0 |
| `reverse_recovery_duration` | s | 0 | 8 | 2 |

## Determinism

- 16 decizii: `fnv1a32:919aebb7`.
- Rulare repetată: `fnv1a32:919aebb7`.

## Verificări

- PASS `catalog`: route_time_weight 0-1 weight, route_distance_weight 0-1 weight, route_turn_penalty 0-20 s, route_signal_penalty 0-60 s, route_congestion_penalty 0-2 ratio, reroute_patience 2-120 s, u_turn_willingness 0-1 probability, reverse_recovery_duration 0-8 s
- PASS `units`: route_time_weight weight, route_distance_weight weight, route_turn_penalty s, route_signal_penalty s, route_congestion_penalty ratio, reroute_patience s, u_turn_willingness probability, reverse_recovery_duration s
- PASS `effects`: route_time_weight 113.295 -> 60.656; route_distance_weight 1094.427 -> 666.476; route_turn_penalty 4.000 -> 1.000; route_signal_penalty 3.000 -> 0.000; route_congestion_penalty 20.000 -> 0.000; reroute_patience 60.000 -> 7140.000; u_turn_willingness 66.056 -> 40.049; reverse_recovery_duration 2.500 -> 8.000
- PASS `separation`: 54/56 perechi inerte, 2 cuplaje (route_distance_weight în ponderea timpului, route_time_weight în ponderea distanței)
- PASS `normalization`: coeficienți identici pe factorii 0.5/1/2/5/10 (×10 dă exact aceiași coeficienți); suma 1
- PASS `scale-invariance`: 8/8 scenarii aleg aceeași rută la toți factorii 0.5/1/2/5/10 (40 decizii)
- PASS `scale-teeth`: regula naivă (epsilon absolut 0.01) trece de la KEEP la SWITCH la ×10; politica alege route-south și decide WAIT la ambele scări
- PASS `u-turn-forbidden`: interzis route-direct/route-direct, nedeclarat route-direct/route-direct
- PASS `reverse-floor`: 0 s -> 2.5 s / 150 tick-uri / 3.000 m; 8 s -> 8 s / 480 tick-uri / 9.600 m
- PASS `reverse-blocked`: fără spațiu liber: acțiune HOLD, durată null
- PASS `reroute`: răbdare 2 s -> 120 tick-uri (rămân 60), 120 s -> 7200 tick-uri (rămân 7140); la 200 de tick-uri scurse: COMMIT; rută indisponibilă: FORCED; rută curentă optimă: KEPT
- PASS `m-compatible`: timp livrat neschimbat de M; timp de stil route-short@0=113.29523, route-short@15=31.915306, route-slow@0=133.137085, route-slow@12=43.13452; unități M m/s/m/s
- PASS `planner-identity`: 9/9 rute respectă identitatea 041 (cost − timp de bandă = 0,5 s × legături)
- PASS `determinism`: digest fnv1a32:919aebb7
- PASS `admission`: manual NO_AUTO_AUTHORITY, observație veche FOREIGN_OR_STALE_OBSERVATION, fără alternative NO_ALTERNATIVES, duplicate DUPLICATE_ALTERNATIVE, profil lipsă MISSING_PROFILE, token străin REFUSED, așteptare în viitor REFUSED

**Sumar: 15/15 verificări, PASS.**

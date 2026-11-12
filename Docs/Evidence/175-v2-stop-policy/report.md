# 175 — raport politică extinsă pentru stop și prioritate

Generat de `scripts/run-v2-stop-policy-report.mjs` din contractul `175-stop-priority-policy-v1`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| rolling stop | viteza comandată prin zona STOP după o oprire completă omisă; plafonul de politică este 2.5 m/s, sub maximul de catalog de 5 m/s |
| revendicare la prioritate | cerința efectivă scade de la pragul M `yield_time_gap` 6 s spre podeaua de 3 s; separatorul declarat este 3 s, deci valoarea 0 refuză, iar valoarea 1 revendică |
| răbdare la all-way stop | al doilea vehicul la all-way stop, cu 4 s scurse de la îndeplinirea opririi proprii: 0 s eliberează imediat, 10 s ține oprirea suplimentară |
| intrare în intersecție fără spațiu confirmat | spațiu de ieșire nedeclarat și intersecție nedeclarată blocată: probabilitatea efectivă este plafonată la 0.5, iar eșantionul oportunității este 0.289662 |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `rolling_stop_speed` | rolling stop | 0.2 | 0.200 | 5 | 2.500 | 2.300 | m/s | viteza comandată prin zona STOP după o oprire completă omisă; plafonul de politică este 2.5 m/s, sub maximul de catalog de 5 m/s |
| `priority_assertiveness` | revendicare la prioritate | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | cerința efectivă scade de la pragul M `yield_time_gap` 6 s spre podeaua de 3 s; separatorul declarat este 3 s, deci valoarea 0 refuză, iar valoarea 1 revendică |
| `allway_stop_patience` | răbdare la all-way stop | 0 | 1.000 | 10 | 0.000 | -1.000 | ratio | al doilea vehicul la all-way stop, cu 4 s scurse de la îndeplinirea opririi proprii: 0 s eliberează imediat, 10 s ține oprirea suplimentară |
| `blocked_intersection_entry_probability` | intrare în intersecție fără spațiu confirmat | 0 | 0.000 | 1 | 1.000 | 1.000 | ratio | spațiu de ieșire nedeclarat și intersecție nedeclarată blocată: probabilitatea efectivă este plafonată la 0.5, iar eșantionul oportunității este 0.289662 |

## Separarea cheilor (fiecare cheie inertă în celelalte scenarii)

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `priority_assertiveness` | rolling stop | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `priority_assertiveness` este inertă în scenariul rolling stop |
| `allway_stop_patience` | rolling stop | 0 | 1.000 | 10 | 1.000 | 0.000 | ratio | `allway_stop_patience` este inertă în scenariul rolling stop |
| `blocked_intersection_entry_probability` | rolling stop | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `blocked_intersection_entry_probability` este inertă în scenariul rolling stop |
| `rolling_stop_speed` | revendicare la prioritate | 0.2 | 0.000 | 5 | 0.000 | 0.000 | ratio | `rolling_stop_speed` este inertă în scenariul revendicare la prioritate |
| `allway_stop_patience` | revendicare la prioritate | 0 | 0.000 | 10 | 0.000 | 0.000 | ratio | `allway_stop_patience` este inertă în scenariul revendicare la prioritate |
| `blocked_intersection_entry_probability` | revendicare la prioritate | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | `blocked_intersection_entry_probability` este inertă în scenariul revendicare la prioritate |
| `rolling_stop_speed` | răbdare la all-way stop | 0.2 | 1.000 | 5 | 1.000 | 0.000 | ratio | `rolling_stop_speed` este inertă în scenariul răbdare la all-way stop |
| `priority_assertiveness` | răbdare la all-way stop | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `priority_assertiveness` este inertă în scenariul răbdare la all-way stop |
| `blocked_intersection_entry_probability` | răbdare la all-way stop | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | `blocked_intersection_entry_probability` este inertă în scenariul răbdare la all-way stop |
| `rolling_stop_speed` | intrare în intersecție fără spațiu confirmat | 0.2 | 0.000 | 5 | 0.000 | 0.000 | ratio | `rolling_stop_speed` este inertă în scenariul intrare în intersecție fără spațiu confirmat |
| `priority_assertiveness` | intrare în intersecție fără spațiu confirmat | 0 | 0.000 | 1 | 0.000 | 0.000 | ratio | `priority_assertiveness` este inertă în scenariul intrare în intersecție fără spațiu confirmat |
| `allway_stop_patience` | intrare în intersecție fără spațiu confirmat | 0 | 0.000 | 10 | 0.000 | 0.000 | ratio | `allway_stop_patience` este inertă în scenariul intrare în intersecție fără spațiu confirmat |

## Siguranță: plafoanele și veto-ul rămân dominante

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `plafonul rolling stop` | 051 rolling stop, cheia la maximul de catalog 5 m/s | 0.2 | 0.200 | 5 | 2.500 | 2.300 | m/s | viteza comandată este plafonată la 2.5 m/s, sub maximul de catalog de 5 m/s, deci o rolling stop rămâne o traversare lentă |
| `veto intersecție blocată` | interior blocat declarat, cheia maximă | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | comanda rămâne BLOCKED_INTERSECTION_VETO pentru ambele capete ale cheii; veto-ul precede orice eșantion |
| `spațiu de ieșire insuficient` | 3 m de spațiu de ieșire, cheia maximă | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | sub 5 m de stocare ieșirea nu este sigură: EXIT_SPACE_INSUFFICIENT |
| `plafonul intrării blocate` | spațiu nedeclarat, cheia maximă | 0 | 0.000 | 1 | 0.500 | 0.500 | ratio | probabilitatea efectivă este plafonată la 0.5, nu la maximul de catalog 1 |
| `podeaua asertivității` | yield_time_gap 8 s, separator 2,9 s, asertivitate 1 | 2.9 | 1.000 | 3 | 0.000 | -1.000 | ratio | podeaua de 3 s nu este coborâtă; 2,9 s rămâne refuzat, 3 s este revendicat |
| `inertă sub podea` | yield_time_gap 0,2 s, separator 0,2 s, asertivitate 1 | 0.2 | 0.200 | 1 | 0.200 | 0.000 | ratio | pragul M rămâne 0.2 s, deci consecința lui 052 nu este rescrisă |
| `stopul 051 dominant` | 051 APPROACH cu toate cheile la maxim | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | intenția 051 rămâne STOP_REQUIRED; nicio cheie nu o transformă în trecere |
| `primul la all-way` | poziția 1 la all-way stop, răbdare 10 s | 0 | 0.000 | 10 | 0.000 | 0.000 | ratio | primul sosit nu este întârziat: PROCEED |
| `rezultat 052 indisponibil` | acoperire LOCAL_ONLY, asertivitate 1 | 0 | 1.000 | 1 | 1.000 | 0.000 | ratio | 052 UNKNOWN (UNAVAILABLE) rămâne YIELD_UNAVAILABLE; cheia nu inventează o revendicare |

## Compatibilitate cu cheile M

- Rezultate 051 identice cu cheile R neutre vs active: **60/60 tick-uri**.
- Rezultate 052 identice cu cheile R neutre vs active: **60/60 tick-uri**.
- Acțiuni neutre identice cu 051/052: **60/60**.
- Tick-uri active care diferă de comanda neutră: **18**, diferență maximă de viteză de rolling stop **1.500 m/s**.
- Unități M: `stop_full_probability` probability, `stop_dwell_time` s, `stop_line_offset` m, `yield_time_gap` s, `speed_delta_urban` m/s.
- Unități R: `rolling_stop_speed` m/s, `priority_assertiveness` ratio, `allway_stop_patience` s, `blocked_intersection_entry_probability` probability.

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `rolling_stop_speed` | m/s | 0.2 | 5 | 1 |
| `priority_assertiveness` | ratio | 0 | 1 | 0.3 |
| `allway_stop_patience` | s | 0 | 10 | 2 |
| `blocked_intersection_entry_probability` | probability | 0 | 1 | 0 |

## Determinism

- 6 tick-uri: `fnv1a32:7099b7c7`.
- Rulare repetată: `fnv1a32:7099b7c7`.

## Verificări

- PASS `key-rolling-effect`: 0.200 -> 2.500 m/s
- PASS `key-rolling-cap`: cheia 5 m/s comandă 2.500 m/s
- PASS `key-assertiveness-effect`: separator 3 s: refuz la 0 și revendicare la 1, cerință 3 s
- PASS `key-patience-effect`: eliberare la 0 s și oprire suplimentară la 10 s (1 -> 0)
- PASS `key-blocked-effect`: eșantion 0.289662: așteptare la 0 și intrare la 1 (plafon 0,5)
- PASS `safety-rolling-cap`: maximul comandat rămâne 2.5 m/s
- PASS `safety-blocked-veto`: intersecția blocată este veto absolut pentru orice valoare a cheii
- PASS `safety-exit-storage`: 3 m de spațiu de ieșire rămân sub pragul de stocare
- PASS `safety-blocked-cap`: probabilitatea efectivă maximă este 0.5
- PASS `safety-assertiveness-floor`: 2,9 s refuzat și 3 s revendicat la podeaua explicită
- PASS `safety-assertiveness-inert`: un `yield_time_gap` sub podea nu este rescris de asertivitate
- PASS `safety-stop-dominant`: intenția 051 rămâne stop cu toate cheile la maxim
- PASS `safety-first-arrival`: primul sosit la all-way stop nu este întârziat de răbdare
- PASS `safety-yield-unknown`: 052 indisponibil rămâne YIELD_UNAVAILABLE
- PASS `separation-rolling`: doar rolling_stop_speed acționează în scenariul de rolling stop
- PASS `separation-priority`: doar priority_assertiveness acționează în scenariul de revendicare
- PASS `separation-patience`: doar allway_stop_patience acționează în scenariul all-way
- PASS `separation-blocked`: doar blocked_intersection_entry_probability acționează în scenariul blocat
- PASS `m-identical-delivered-results`: 60/60 rezultate 051 și 60/60 rezultate 052 identice cu cheile R neutre vs active
- PASS `m-neutral-forwards`: 60/60 acțiuni neutre identice cu 051/052; 18 tick-uri active diferă, până la 1.500 m/s
- PASS `catalog-ranges`: rolling_stop_speed 0.2-5 m/s, priority_assertiveness 0-1 ratio, allway_stop_patience 0-10 s, blocked_intersection_entry_probability 0-1 probability
- PASS `determinism`: digest fnv1a32:7099b7c7

**Sumar: 22/22 verificări, PASS.**

# 173 — raport politică extinsă pentru semafoare

Generat de `scripts/run-v2-signal-policy-report.mjs` din contractul `173-signal-policy-v2`.
Fiecare rând compară aceeași scenă cu valoarea joasă și valoarea ridicată a unei singure chei.

## Scenariile

| Scenariu | Descriere |
| --- | --- |
| fezabilitate la galben | galben cu 7,875 s până la punctul de oprire, oprire fezabilă, eșantion per oportunitate |
| angajare la galben | galben cu 0,875 s până la punctul de oprire și 6 s de fază rămasă |
| gap pe roșu | roșu traversat de profilul 050, gap declarat de 5 s către conflict |
| plecare la verde | verde eliberat după întârzierea M, ego oprit la linie |

## Efectul izolat al fiecărei chei

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `yellow_stop_probability` | fezabilitate la galben | 0.2 | 0.158 | 1 | 1.000 | 0.842 | ratio | rata de oprire pe 120 de oportunități, cu condiția de conformitate M la 1 și oprirea fezabilă; la 1 fiecare oportunitate se oprește |
| `yellow_commit_time` | angajare la galben | 0.2 | 0.000 | 6 | 1.000 | 1.000 | ratio | timp până la punctul de oprire 0.875 s: cu orizontul 0,2 s oprirea rămâne fezabilă, cu 6 s vehiculul este deja angajat |
| `red_run_gap_acceptance` | gap pe roșu | 0.1 | 1.000 | 8 | 0.000 | -1.000 | ratio | gap declarat 5 s; cerința efectivă este max(cheie, 3 s) = 3.0 s, respectiv 8.0 s |
| `green_launch_acceleration` | plecare la verde | 0.2 | 0.200 | 6 | 6.000 | 5.800 | m/s² | accelerația comandată la plecarea de pe loc după întârzierea M: 10 m/s se ating în 50.000 s, respectiv 1.667 s, dacă accelerația este aplicată constant |

## Separarea cheilor (fiecare cheie inertă în celelalte scenarii)

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `yellow_commit_time` | fezabilitate la galben | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `yellow_commit_time` este inertă în scenariul fezabilitate la galben |
| `red_run_gap_acceptance` | fezabilitate la galben | 0.1 | 1.000 | 8 | 1.000 | 0.000 | ratio | `red_run_gap_acceptance` este inertă în scenariul fezabilitate la galben |
| `green_launch_acceleration` | fezabilitate la galben | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `green_launch_acceleration` este inertă în scenariul fezabilitate la galben |
| `yellow_stop_probability` | angajare la galben | 0.2 | 1.000 | 1 | 1.000 | 0.000 | ratio | `yellow_stop_probability` este inertă în scenariul angajare la galben |
| `red_run_gap_acceptance` | angajare la galben | 0.1 | 1.000 | 8 | 1.000 | 0.000 | ratio | `red_run_gap_acceptance` este inertă în scenariul angajare la galben |
| `green_launch_acceleration` | angajare la galben | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `green_launch_acceleration` este inertă în scenariul angajare la galben |
| `yellow_stop_probability` | gap pe roșu | 0.2 | 1.000 | 1 | 1.000 | 0.000 | ratio | `yellow_stop_probability` este inertă în scenariul gap pe roșu |
| `yellow_commit_time` | gap pe roșu | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `yellow_commit_time` este inertă în scenariul gap pe roșu |
| `green_launch_acceleration` | gap pe roșu | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | `green_launch_acceleration` este inertă în scenariul gap pe roșu |
| `yellow_stop_probability` | plecare la verde | 0.2 | 2.000 | 1 | 2.000 | 0.000 | ratio | `yellow_stop_probability` este inertă în scenariul plecare la verde |
| `yellow_commit_time` | plecare la verde | 0.2 | 2.000 | 6 | 2.000 | 0.000 | ratio | `yellow_commit_time` este inertă în scenariul plecare la verde |
| `red_run_gap_acceptance` | plecare la verde | 0.1 | 2.000 | 8 | 2.000 | 0.000 | ratio | `red_run_gap_acceptance` este inertă în scenariul plecare la verde |

## Siguranță: limitele 050 rămân dominante

| Cheie | Scenariu | Valoare joasă | Rezultat joasă | Valoare ridicată | Rezultat ridicată | Diferență | Unitate | Notă |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `plafonul de gap pe roșu` | cheia minimă 0,1 s, gap 2 s | 0.1 | 0.000 | 8 | 0.000 | 0.000 | ratio | podeaua explicită de 3 s nu acceptă un gap de 2 s nici la valoarea minimă a cheii |
| `gap necunoscut` | gap 5 s înlocuit de null | 0.1 | 0.000 | 8 | 0.000 | 0.000 | ratio | fără gap declarat, trecerea pe roșu este refuzată pentru ambele capete ale cheii |
| `stopul 050 dominant` | roșu cu conformitate 1 | 0.1 | 1.000 | 8 | 1.000 | 0.000 | ratio | comanda 050 (STOP_LINE_APPROACH) rămâne RED_STOP; cheia nu poate transforma un stop în trecere |
| `frânare târzie pe galben` | galben cu orizontul M atins | 0.2 | 1.000 | 0 | 1.000 | 0.000 | ratio | comanda 050 (LATE_RED_BRAKE) rămâne YELLOW_LATE_BRAKE și oprește chiar dacă probabilitatea galbenului este 0 |
| `galben fără intrare pe roșu` | 3 s până la linie, 1 s de faza galbenă | 0.2 | 1.000 | 6 | 1.000 | 0.000 | ratio | cu orizontul maxim de 6 s comanda rămâne YELLOW_STOP_RED_AHEAD, pentru că intrarea ar cădea după galben |
| `plafonul plecării` | plecare de pe loc cu cheia maximă | 0.2 | 0.200 | 6 | 6.000 | 5.800 | m/s² | accelerația comandată nu depășește plafonul de 6 m/s² al catalogului |
| `întârzierea M la verde` | verde încă în întârzierea de plecare | 0.2 | 0.000 | 6 | 0.000 | 0.000 | m/s² | comanda rămâne GREEN_START_DELAY și nu comandă accelerație până la expirarea întârzierii M |

## Compatibilitate cu cheile M

- Rezultate 050 identice cu cheile R neutre vs active: **60/60 tick-uri**.
- Acțiuni neutre identice cu 050: **60/60**.
- Tick-uri active care diferă de comanda neutră: **30**, diferență maximă de accelerație **5.800 m/s²**.
- Unități M: `red_stop_probability` probability, `green_start_delay` s, `red_stop_line_offset` m, `late_red_brake_threshold` s, `speed_delta_urban` m/s.
- Unități R: `yellow_stop_probability` probability, `red_run_gap_acceptance` s, `yellow_commit_time` s, `green_launch_acceleration` m/s².

## Parametrii din catalog

| Cheie | Unitate | Minim | Maxim | Default |
| --- | --- | ---: | ---: | ---: |
| `yellow_stop_probability` | probability | 0 | 1 | 0.8 |
| `red_run_gap_acceptance` | s | 0.1 | 8 | 2.5 |
| `yellow_commit_time` | s | 0.2 | 6 | 2 |
| `green_launch_acceleration` | m/s² | 0.2 | 6 | 1.5 |

## Determinism

- 6 tick-uri: `fnv1a32:d42cd88e`.
- Rulare repetată: `fnv1a32:d42cd88e`.

## Verificări

- PASS `key-yellow-probability-effect`: 0.158 -> 1.000 rata de oprire pe 120 de oportunități
- PASS `key-yellow-probability-sample`: aceeași oportunitate păstrează eșantionul 0.456287 la tick-uri diferite
- PASS `key-yellow-commit-effect`: angajare nu la 0,2 s și da la 6 s
- PASS `key-yellow-commit-red-ahead`: 3 s până la linie cu 1 s de galben: YELLOW_STOP_RED_AHEAD
- PASS `key-red-gap-effect`: gap 5 s: acceptat la 0,1 s (cerință 3 s) și refuzat la 8 s
- PASS `key-red-gap-floor`: gap 2 s refuzat chiar la valoarea minimă a cheii
- PASS `key-red-gap-unknown`: gap necunoscut refuză trecerea pe roșu
- PASS `key-launch-effect`: 0.200 -> 6.000 m/s²
- PASS `key-launch-delay`: întârzierea M de la verde nu este scurtată de cheia de plecare
- PASS `separation-yellow-feasibility`: doar yellow_stop_probability acționează în scenariul de fezabilitate
- PASS `separation-yellow-commit`: doar yellow_commit_time acționează în scenariul de angajare
- PASS `separation-red`: doar red_run_gap_acceptance acționează în scenariul de gap pe roșu
- PASS `separation-green`: doar green_launch_acceleration acționează în scenariul de plecare
- PASS `safety-red-stop-dominant`: comanda 050 STOP_LINE_APPROACH rămâne stop
- PASS `safety-late-brake`: orizontul M de frânare târzie oprește pe galben indiferent de cheia galbenului
- PASS `safety-tightens-red`: pe grila de gapuri, 173 nu transformă niciodată un stop 050 în trecere
- PASS `safety-launch-bound`: plecarea maximă comandă 6.000 m/s²
- PASS `m-signal-identical`: 60/60 rezultate 050 identice cu cheile R neutre vs active
- PASS `m-neutral-forwards`: 60/60 acțiuni neutre identice cu 050; 30 tick-uri active diferă, până la 5.800 m/s²
- PASS `m-yellow-probability-scaled`: cu red_stop_probability 0 galbenul nu se oprește, cu 1 se oprește la aceeași cheie a galbenului
- PASS `catalog-ranges`: yellow_stop_probability 0-1 probability, red_run_gap_acceptance 0.1-8 s, yellow_commit_time 0.2-6 s, green_launch_acceleration 0.2-6 m/s²
- PASS `determinism`: digest fnv1a32:d42cd88e

**Sumar: 22/22 verificări, PASS.**

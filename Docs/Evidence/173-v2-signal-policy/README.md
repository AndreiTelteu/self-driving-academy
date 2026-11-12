# 173 — politică extinsă pentru semafoare

Contractul `173-signal-policy-v2` din [`src/autonomy/signal-policy-v2.ts`](../../../src/autonomy/signal-policy-v2.ts)
activează cele patru chei R ale categoriei „Semafoare” ca strat de politică peste rezultatul livrat de
050: `yellow_stop_probability` (probabilitate), `red_run_gap_acceptance` (s), `yellow_commit_time` (s)
și `green_launch_acceleration` (m/s²). Raportul determinist este [report.json](report.json), iar
varianta umană [report.md](report.md).

## Cum funcționează

Fiecare tick primește exact rezultatul `050-signal-policy-v1` (cu cele patru chei M pe care le poartă)
și întoarce o comandă înghețată cu acțiunea, motivul, valorile de decizie și starea de semnal
moștenită. Stratul nu recalculează semaforul: 050 rămâne autoritatea pentru roșu, pentru întârzierea
de la verde și pentru frânarea târzie, iar 173 modelează doar cele patru chei R. Valorile, unitățile și
proveniența se citesc prin `parsePublishableDrivingProfile`, deci intervalele rămân exact cele ale
catalogului 092: `yellow_stop_probability` 0–1 probabilitate, `red_run_gap_acceptance` 0,1–8 s,
`yellow_commit_time` 0,2–6 s, `green_launch_acceleration` 0,2–6 m/s². Catalogul nu este modificat.

- `yellow_stop_probability` decide oprirea la galben când oprirea este fezabilă. Eșantionul este
  adresat de `deriveOpportunitySeed(seed, opportunityKey)` cu cheia fixă `yellow-stop`, deci o
  oportunitate are o singură valoare, indiferent de tick. Probabilitatea efectivă este
  `red_stop_probability · yellow_stop_probability`: cheia M de conformitate scalează probabilitatea
  galbenului, iar unitatea rămâne probabilitate.
- `yellow_commit_time` este orizontul de angajare: vehiculul intră dacă timpul până la punctul de
  oprire este în interiorul orizontului și dacă intrarea se produce înainte de sfârșitul fazei
  galbene. Un orizont mare nu poate autoriza o intrare care ar cădea după galben.
- `red_run_gap_acceptance` este gap-ul temporal cerut când profilul 050 traversează pe roșu. Trecerea
  este admisă numai dacă observația declară cel puțin gap-ul efectiv către traficul conflictual.
- `green_launch_acceleration` este accelerația comandată la plecarea de pe loc după expirarea
  întârzierii M de la verde, plafonată la maximul de catalog de 6 m/s².

**Scenarii separate.** Fezabilitatea la galben este scenariul `yellow_stop_probability`; angajarea la
galben este scenariul `yellow_commit_time`; gap-ul pe roșu este scenariul `red_run_gap_acceptance`;
plecarea de la verde este scenariul `green_launch_acceleration`. Tabelul de separare are 12 perechi,
câte trei chei inerte în fiecare scenariu, și toate diferențele sunt 0,000.

## Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `yellow_stop_probability` | fezabilitate la galben, 120 de oportunități, oprire fezabilă | 0,2 | 0,158 rată de oprire | 1 | 1,000 rată de oprire | **+0,842** |
| `yellow_commit_time` | angajare la galben, 0,875 s până la punctul de oprire, 6 s de fază | 0,2 | 0 (oprire) | 6 | 1 (angajat) | **+1,000** |
| `red_run_gap_acceptance` | gap pe roșu, gap declarat de 5 s | 0,1 | 1 (acceptat, cerință 3 s) | 8 | 0 (refuzat) | **−1,000** |
| `green_launch_acceleration` | plecare de pe loc la verde după întârzierea M | 0,2 | 0,200 m/s² | 6 | 6,000 m/s² | **+5,800 m/s²** |

Numerele suplimentare din raport: rata de oprire la probabilitatea 0,2 este 0,158 (19 opriri din 120
de oportunități), iar la 1 este 1,000; eșantionul oportunității de referință este 0,456287 și rămâne
identic la tick-uri diferite; timpul până la punctul de oprire în scenariul de angajare este 0,875 s;
la gap-ul de 5 s, cerința efectivă este 3,0 s pentru cheia 0,1 și 8,0 s pentru cheia 8; la plecarea cu
6 m/s², 10 m/s se ating în 1,667 s, iar la 0,2 m/s² în 50,000 s, dacă accelerația este aplicată
constant.

## Separarea cheilor

| Cheie | Scenariu | Rezultat | Diferență |
| --- | --- | ---: | ---: |
| `yellow_commit_time` | fezabilitate la galben | 1,000 | 0,000 |
| `red_run_gap_acceptance` | fezabilitate la galben | 1,000 | 0,000 |
| `green_launch_acceleration` | fezabilitate la galben | 1,000 | 0,000 |
| `yellow_stop_probability` | angajare la galben | 1,000 | 0,000 |
| `red_run_gap_acceptance` | angajare la galben | 1,000 | 0,000 |
| `green_launch_acceleration` | angajare la galben | 1,000 | 0,000 |
| `yellow_stop_probability` | gap pe roșu | 1,000 | 0,000 |
| `yellow_commit_time` | gap pe roșu | 1,000 | 0,000 |
| `green_launch_acceleration` | gap pe roșu | 1,000 | 0,000 |
| `yellow_stop_probability` | plecare la verde | 2,000 | 0,000 |
| `yellow_commit_time` | plecare la verde | 2,000 | 0,000 |
| `red_run_gap_acceptance` | plecare la verde | 2,000 | 0,000 |

## Siguranță: limitele 050 și plafonul de gap rămân dominante

| Verificare | Scenariu | Rezultat |
| --- | --- | ---: |
| plafonul de gap pe roșu | cheia minimă 0,1 s, gap 2 s | refuzat, cerință efectivă 3 s |
| gap necunoscut | gap `null` | refuzat pentru ambele capete ale cheii |
| stopul 050 dominant | roșu cu `red_stop_probability` 1 | 050 `STOP_LINE_APPROACH` rămâne `RED_STOP` |
| frânare târzie pe galben | galben cu orizontul M atins | 050 `LATE_RED_BRAKE` rămâne `YELLOW_LATE_BRAKE`, chiar la probabilitatea galbenului 0 |
| galben fără intrare pe roșu | 3,875 s până la linie, 1 s de fază | `YELLOW_STOP_RED_AHEAD` și cu orizontul maxim de 6 s |
| plafonul plecării | plecare de pe loc cu cheia maximă | 6,000 m/s², plafonul catalogului |
| întârzierea M la verde | verde încă în întârzierea de plecare | `GREEN_START_DELAY`, fără accelerație comandată |
| grila de înăsprire | 5 valori ale cheii × 9 gap-uri (45 de combinații) | niciun stop 050 nu devine trecere |

Plafonul explicit al lui `red_run_gap_acceptance` este podeaua de 3 s aplicată ca
`max(cheie, 3 s)`: nicio valoare admisă a catalogului nu poate accepta un gap sub 3 s. O valoare mare
a cheii cere un gap mai mare, deci doar înăsprește trecerea pe roșu; stratul nu poate transforma
niciodată un stop al lui 050 într-o trecere.

## Compatibilitate cu cheile M

Profilul poartă simultan cele patru chei M ale lui 050 (`red_stop_probability` probabilitate,
`green_start_delay` s, `red_stop_line_offset` m, `late_red_brake_threshold` s) plus cele patru chei
173. Cheile R nu schimbă rezultatul 050: pe 60 de tick-uri cu profilul 050 real, **60/60 rezultate
050 identice** între profilul neutru și cel activ. Cu cheile R neutre
(`yellow_stop_probability` 1, `red_run_gap_acceptance` 8, `yellow_commit_time` 0,2,
`green_launch_acceleration` 0,2), **60/60 acțiuni** coincid cu 050; cu cheile active, **30 de
tick-uri diferă**, cu până la **5,800 m/s²** la accelerația de plecare. `red_stop_probability` 0
lasă galbenul să treacă, iar 1 îl oprește la aceeași cheie a galbenului, deci consecința M este
păstrată probabilistic, nu suprascrisă.

Unitățile rămân cele ale catalogului: `yellow_stop_probability` în probabilitate,
`red_run_gap_acceptance` și `yellow_commit_time` în s, `green_launch_acceleration` în m/s²; cheile M
păstrează probabilitate, s și m.

## Determinism

Aceleași intrări și același seed produc exact aceeași comandă. Seria de 6 tick-uri care parcurge
scenariile are amprenta `fnv1a32:d42cd88e`, identică la o a doua rulare. Nu există ceas, aleatorism
ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (376 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/signal-policy-v2.test.ts` | 8 teste, 8 PASS, 0 fail |
| `npm test` | 3024 teste, 3024 PASS, 0 fail (125,9 s) |
| `npm run signal:policy` | 22/22 verificări PASS, raport scris |
| `npm run signal:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), inerția fiecărei chei în
celelalte trei scenarii, eșantionul unic per oportunitate, plafonul de 3 s al gap-ului pe roșu și
refuzul gap-ului necunoscut, dominanța stopului 050 și a frânării târzii pe galben, imposibilitatea
unei intrări după galben, plafonul plecării, păstrarea întârzierii M, scalarea galbenului cu
`red_stop_probability`, refuzul profilului/observației/rezultatului străin sau vechi, refuzul
valorilor din afara intervalului și al unității greșite, determinismul și înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/signal-policy-v2.ts` — contractul `173-signal-policy-v2`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/signal-policy-v2-reference.ts`, `tests/autonomy/signal-policy-v2.test.ts`,
  `tests/autonomy/signal-policy-v2-report.ts` — fixture-uri, teste și oracolul raportului.
- `scripts/run-v2-signal-policy-report.mjs`, `package.json` — raportul determinist `signal:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/173-v2-signal-policy/` — acest document, `report.json`, `report.md`.
- `PBI/Done/173-v2_policy_4.md` — PBI-ul finalizat și mutat fizic.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele patru chei au încă `implemented: false`, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI-ul de învățare 174 și la actualizarea registrului.
- Ca și 046/047/048/050/167/169/171, stratul este un contract de politică neexecutat încă în bucla
  live de simulare; montarea lui în compoziție și proba de browser rămân pași separați.
- Gap-ul conflictual și timpul rămas din fază vin din observație: stratul nu face percepție. Lumea
  trebuie să declare `conflictGapS` (altfel trecerea pe roșu este refuzată, conservator) și
  `phaseRemainingS`, care este derivabil din `nextChangeTick` al controlerului 036.
- Poziția în coadă nu este percepută: ca și întârzierea de la verde a lui 050, cheia de plecare
  presupune că apelantul raportează o plecare numai când subiectul este primul la linie.
- Podeaua de 3 s a gap-ului pe roșu și plafonul de 6 m/s² al plecării sunt constante de politică
  documentate în contract, nu chei de catalog.
- Orizontul de frânare târzie rămâne al lui 050: 173 nu îl înlocuiește și nu îl poate dezactiva.

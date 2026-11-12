# 175 — politică extinsă pentru stop și prioritate

Contractul `175-stop-priority-policy-v1` din [`src/autonomy/stop-priority-policy.ts`](../../../src/autonomy/stop-priority-policy.ts)
activează cele patru chei R ale categoriei „STOP și prioritate” ca strat de politică peste rezultatele
deja livrate de 051 și 052: `rolling_stop_speed` (m/s), `priority_assertiveness` (raport),
`allway_stop_patience` (s) și `blocked_intersection_entry_probability` (probabilitate). Raportul
determinist este [report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare tick primește exact rezultatul `051-stop-policy-v1` și exact rezultatul
`052-yield-interval-v1` (cu cele patru chei M pe care le poartă) și întoarce o comandă înghețată cu
acțiunea, motivul, valorile de decizie și diagnosticele moștenite. Stratul nu recalculează oprirea și
nici cedarea: 051 rămâne autoritatea pentru oprirea completă, durată și offset, iar 052 pentru
separatorul de cedare. Valorile, unitățile și proveniența se citesc prin
`parsePublishableDrivingProfile`, deci intervalele rămân exact cele ale catalogului 092:
`rolling_stop_speed` 0,2–5 m/s, `priority_assertiveness` 0–1 raport, `allway_stop_patience` 0–10 s,
`blocked_intersection_entry_probability` 0–1 probabilitate. Catalogul nu este modificat.

- `rolling_stop_speed` comandă viteza prin zona STOP când 051 a declarat `ROLL_THROUGH`. Plafonul
  explicit de politică este `rollingStopMaximumMps = 2,5 m/s`, deci maximul de catalog de 5 m/s
  nu poate transforma o rolling stop într-o trecere în viteză.
- `priority_assertiveness` revendică o oportunitate refuzată de 052 cu separator cunoscut. Cerința
  efectivă coboară proporțional de la pragul M `yield_time_gap` spre podeaua explicită de 3 s
  (`priorityMinimumGapS`), valoarea dovedită fără contact în calibrarea nativă 052; 0 reproduce
  exact 052, 1 revendică la podea, iar un prag M deja sub podea lasă cheia inertă.
- `allway_stop_patience` ține eliberarea după ce 051 a raportat `RELEASE` la un all-way stop unde
  subiectul nu este primul sosit, cât timp secundele scurse de la îndeplinirea opririi nu ating
  cheia. Primul sosit nu este întârziat, iar `APPROACH`/`HOLD` domină deja cheia.
- `blocked_intersection_entry_probability` intră când lumea nu declară spațiul de ieșire, cu un
  singur eșantion determinist per oportunitate (`deriveOpportunitySeed(seed, opportunityKey)` cu
  cheia fixă `blocked-entry`) și cu probabilitatea efectivă plafonată la
  `blockedEntryMaximumProbability = 0,5`.

**Scenarii separate.** Rolling stop-ul este scenariul `rolling_stop_speed`; revendicarea cu separator
cunoscut este scenariul `priority_assertiveness`; al doilea sosit la all-way stop este scenariul
`allway_stop_patience`; spațiul de ieșire nedeclarat este scenariul
`blocked_intersection_entry_probability`. Tabelul de separare are 12 perechi, câte trei chei inerte
în fiecare scenariu, și toate diferențele sunt 0,000.

## Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `rolling_stop_speed` | rolling stop 051, viteza comandată | 0,2 | 0,200 m/s | 5 | 2,500 m/s | **+2,300 m/s** |
| `priority_assertiveness` | revendicare, `yield_time_gap` 6 s, separator 3 s | 0 | 0 (refuz) | 1 | 1 (revendicat) | **+1,000** |
| `allway_stop_patience` | al doilea la all-way, 4 s de la oprire | 0 | 1 (eliberat) | 10 | 0 (ținut) | **−1,000** |
| `blocked_intersection_entry_probability` | spațiu de ieșire nedeclarat | 0 | 0 (așteaptă) | 1 | 1 (intră) | **+1,000** |

Numere suplimentare din raport: eșantionul oportunității de intrare este 0,289662 și rămâne identic
la tick-uri diferite; cerința efectivă la asertivitate 0, 0,5 și 1 este 6,0 s, 4,5 s și 3,0 s;
probabilitatea efectivă maximă de intrare este 0,5, nu 1; viteza maximă comandată prin rolling stop
este 2,5 m/s, nu 5 m/s.

## Separarea cheilor

| Cheie | Scenariu | Rezultat | Diferență |
| --- | --- | ---: | ---: |
| `priority_assertiveness` | rolling stop | 1,000 | 0,000 |
| `allway_stop_patience` | rolling stop | 1,000 | 0,000 |
| `blocked_intersection_entry_probability` | rolling stop | 1,000 | 0,000 |
| `rolling_stop_speed` | revendicare | 0,000 | 0,000 |
| `allway_stop_patience` | revendicare | 0,000 | 0,000 |
| `blocked_intersection_entry_probability` | revendicare | 0,000 | 0,000 |
| `rolling_stop_speed` | all-way stop | 1,000 | 0,000 |
| `priority_assertiveness` | all-way stop | 1,000 | 0,000 |
| `blocked_intersection_entry_probability` | all-way stop | 1,000 | 0,000 |
| `rolling_stop_speed` | intrare blocată | 0,000 | 0,000 |
| `priority_assertiveness` | intrare blocată | 0,000 | 0,000 |
| `allway_stop_patience` | intrare blocată | 0,000 | 0,000 |

## Siguranță: plafoanele și veto-ul rămân dominante

| Verificare | Scenariu | Rezultat |
| --- | --- | ---: |
| plafonul rolling stop | cheia la maximul de catalog 5 m/s | 2,500 m/s, sub 5 m/s |
| veto intersecție blocată | interior blocat declarat, cheia 1 | `BLOCKED_INTERSECTION_VETO`, fără eșantion |
| spațiu de ieșire insuficient | 3 m de spațiu, cheia 1 | `EXIT_SPACE_INSUFFICIENT` |
| plafonul intrării blocate | spațiu nedeclarat, cheia 1 | probabilitate efectivă 0,5 |
| podeaua asertivității | `yield_time_gap` 8 s, separator 2,9 s vs 3 s, asertivitate 1 | 2,9 s refuzat, 3 s revendicat |
| inerție sub podea | `yield_time_gap` 0,2 s, asertivitate 1 | cerința rămâne 0,2 s |
| stopul 051 dominant | `APPROACH` cu toate cheile la maxim | `STOP_REQUIRED` |
| primul la all-way | poziția 1, răbdare 10 s | `PROCEED`, fără ținere |
| rezultat 052 indisponibil | acoperire `LOCAL_ONLY`, asertivitate 1 | `YIELD_UNAVAILABLE`, fără revendicare |

Veto-ul intersecției blocate este absolut și este evaluat primul: dacă lumea declară interiorul
ocupat, comanda rămâne `STOP` pentru orice valoare a cheii. Un spațiu de ieșire cunoscut sub
`minimumExitStorageM` (5 m) produce `EXIT_SPACE_INSUFFICIENT`, iar un spațiu confirmat produce
`EXIT_SPACE_CONFIRMED`, ambele independent de cheie. Un separator sub podeaua de 3 s rămâne refuzat
chiar la asertivitate 1, iar un rezultat 051 sau 052 `UNKNOWN` este propagat ca `UNKNOWN`. Valorile
mari schimbă astfel ritmul și marja, nu limitele de siguranță.

## Compatibilitate cu cheile M

Profilul poartă simultan cele trei chei M ale lui 051 (`stop_full_probability` probabilitate,
`stop_dwell_time` s, `stop_line_offset` m) și cheia M a lui 052 (`yield_time_gap` s) plus cele patru
chei 175. Cheile R nu schimbă rezultatele livrate: pe 60 de tick-uri cu straturile 051 și 052 reale,
**60/60 rezultate 051 identice** și **60/60 rezultate 052 identice** între profilul neutru și cel
activ. Cu cheile R neutre (`rolling_stop_speed` 1, `priority_assertiveness` 0,
`allway_stop_patience` 0, `blocked_intersection_entry_probability` 0), **60/60 acțiuni** coincid cu
051/052; cu cheile active, **18 tick-uri diferă**, cu până la **1,500 m/s** la viteza de rolling
stop. `yield_time_gap` rămâne pragul de cedare până la revendicarea R, iar un prag sub podea nu este
rescris.

Unitățile rămân cele ale catalogului: `rolling_stop_speed` în m/s, `priority_assertiveness` în
raport, `allway_stop_patience` în s, `blocked_intersection_entry_probability` în probabilitate;
cheile M păstrează probabilitate, s și m.

## Determinism

Aceleași intrări, același seed și aceeași oportunitate produc exact aceeași comandă. Seria de 6
tick-uri care parcurge scenariile are amprenta `fnv1a32:7099b7c7`, identică la o a doua rulare. Nu
există ceas, aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (378 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/stop-priority-policy.test.ts` | 9 teste, 9 PASS, 0 fail |
| `npm test` | 3047 teste, 3047 PASS, 0 fail (99,9 s) |
| `npm run stop:policy` | 22/22 verificări PASS, raport scris |
| `npm run stop:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), inerția fiecărei chei în
celelalte trei scenarii, plafonul de 2,5 m/s al rolling stop-ului, podeaua de 3 s și inerția sub ea,
plafonul de 0,5 și veto-ul absolut al intrării blocate, spațiul de ieșire insuficient, ținerea
all-way doar pentru un sosit care nu este primul, dominanța intenției 051, păstrarea rezultatelor
051/052 cu chei R neutre și active, eșantionul unic per oportunitate, refuzul profilului,
observației sau rezultatului străin/vechi, refuzul valorilor din afara intervalului și al unității
greșite, determinismul și înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/stop-priority-policy.ts` — contractul `175-stop-priority-policy-v1`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/stop-priority-policy-reference.ts`, `tests/autonomy/stop-priority-policy.test.ts`,
  `tests/autonomy/stop-priority-policy-report.ts` — fixture-uri, teste și oracolul raportului.
- `scripts/run-v2-stop-policy-report.mjs`, `package.json` — raportul determinist `stop:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/175-v2-stop-policy/` — acest document, `report.json`, `report.md`.
- `PBI/Done/175-v2_policy_5.md` — PBI-ul finalizat și mutat fizic.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele patru chei au încă `implemented: false`, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI-urile de învățare și la actualizarea registrului.
- Ca și 046/047/048/050/051/052/167/169/171/173, stratul este un contract de politică neexecutat încă
  în bucla live de simulare; montarea lui în compoziție și proba de browser rămân pași separați.
- Observația este a apelantului: lumea trebuie să declare poziția la all-way stop, secundele scurse
  de la îndeplinirea opririi, spațiul de ieșire și starea de blocare a intersecției. Stratul nu face
  percepție și nu derivă aceste fapte din geometrie.
- Plafonul de 2,5 m/s al rolling stop-ului, podeaua de 3 s a asertivității, pragul de 5 m de spațiu
  de ieșire și plafonul de 0,5 al intrării blocate sunt constante de politică documentate în
  contract, nu chei de catalog.
- Veto-ul se aplică numai când lumea declară explicit interiorul blocat; un spațiu de ieșire
  nedeclarat rămâne o decizie probabilă plafonată, nu o dovadă de siguranță.
- Performanța jocului integrat, browserul și hardware-ul nu sunt validate de acest PBI; nivelul de
  validare este „funcțional izolat” conform `Docs/validation-policy.md`.

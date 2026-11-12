# 164 — pietoni autonomi și traversări

Transcript determinist generat de `scripts/run-pedestrian-report.mjs`; comanda comisă este `npm run pedestrians:report`.
Machine-readable: [report.json](report.json). Contract: `164-pedestrians-v1`.

Regula oracolului: O cedare este numărată numai când un vehicul observabil era în apropiere în timpul traversării și a fost văzut oprit; o traversare liberă cere enumerare completă și zero conflicte; fără numitor real, rata rămâne null cu lacună declarată.

## Sumar

- Scenarii: **6/6** trecute, verdict **PASS**.
- Pietoni în configurația implicită: **96**.
- Traversări pornite: **336**, finalizate: **323**.
- Traversări libere: **276**; cu cedare: **1**; fără cedare: **1**; neobservate: **45**.
- Conflicte observate: **4**; opriri reale: **1**; opriri în timpul traversării: **1**; contacte: **1**.
- Amprenta SHA-256 a rulării de determinism: `aee3db57b40c8b3e480506dee567cf7d6b86928517f8b67dae9e279706322ff8` (2 rulări, identice: DA).

## Rețeaua derivată din hartă

| Indicator | Valoare |
| --- | ---: |
| Hartă | neighbourhood-compact-v1 |
| Trecări declarate | 80 |
| Legături de pietoni | 48 |
| Trecări fără trotuar derivat | 32 × NO_SIDEWALK |
| Pietoni ceruți / creați | 48 / 48 |
| Benzi legate de o trecere | 64 |
| Benzi fără linie de trecere | 0 |
| Lungime traversare min/medie/max (m) | 10.00 / 12.47 / 17.40 |
| Pietoni pe trecere (configurație) | 1 |

Ținta scenariilor: `cw:0-1:E`, bandă `lane:01W0` (168.8 m din 172.4 m), traversare de 10.0 m.

## Scenarii

| Scenariu | Pași | Pietoni | Pornite | Finalizate | Libere | Cu cedare | Fără cedare | Neobservate | Conflicte | Opriri | Contacte | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| crossing-free | 1100 | 48 | 48 | 48 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | PASS |
| conflict-yield | 900 | 48 | 48 | 45 | 44 | 1 | 0 | 0 | 1 | 1 | 0 | PASS |
| conflict-no-yield | 900 | 48 | 48 | 45 | 44 | 0 | 1 | 0 | 1 | 0 | 0 | PASS |
| contact-impact | 900 | 48 | 48 | 44 | 44 | 0 | 0 | 0 | 1 | 0 | 1 | PASS |
| coverage-incomplete | 900 | 48 | 48 | 45 | 0 | 0 | 0 | 45 | 1 | 0 | 0 | PASS |
| density-default | 1100 | 96 | 96 | 96 | 96 | 0 | 0 | 0 | 0 | 0 | 0 | PASS |

### Stări finale

| Scenariu | Stări |
| --- | --- |
| crossing-free | ON_SIDEWALK 0 · WAITING 0 · CROSSING 0 · CROSSED 0 · WITHDRAWN 48 |
| conflict-yield | ON_SIDEWALK 0 · WAITING 0 · CROSSING 3 · CROSSED 3 · WITHDRAWN 42 |
| conflict-no-yield | ON_SIDEWALK 0 · WAITING 0 · CROSSING 3 · CROSSED 3 · WITHDRAWN 42 |
| contact-impact | ON_SIDEWALK 0 · WAITING 0 · CROSSING 3 · CROSSED 3 · WITHDRAWN 42 |
| coverage-incomplete | ON_SIDEWALK 0 · WAITING 0 · CROSSING 3 · CROSSED 3 · WITHDRAWN 42 |
| density-default | ON_SIDEWALK 0 · WAITING 0 · CROSSING 0 · CROSSED 0 · WITHDRAWN 96 |

### Verificări per scenariu

| Scenariu | Verificare | Trecut | Detaliu |
| --- | --- | --- | --- |
| crossing-free | FREE_CROSSINGS_COMPLETED | DA | traversări libere finalizate: 48 |
| crossing-free | NO_CONFLICT_WITH_EMPTY_ROAD | DA | conflicte pe drum gol: 0 |
| crossing-free | YIELD_RATE_WITHOUT_DENOMINATOR | DA | rata de cedare null (MISSING) |
| conflict-yield | PEDESTRIAN_WAITED | DA | traversări angajate după așteptare: 1 |
| conflict-yield | OBSERVABLE_CONFLICT | DA | conflicte cu timp până la conflict numeric: 1 |
| conflict-yield | YIELD_OBSERVED | DA | traversări cu cedare: 1, opriri în timpul traversării: 1 |
| conflict-no-yield | NO_YIELD_OBSERVED | DA | traversări fără cedare: 1, opriri: 0 |
| conflict-no-yield | MINIMUM_DISTANCE_RECORDED | DA | distanță minimă 0.10 |
| contact-impact | CONTACT_RECORDED | DA | contacte înregistrate: 1 |
| contact-impact | WITHDRAWN_BY_IMPACT | DA | stare finală WITHDRAWN (IMPACT) |
| contact-impact | INTERRUPTED_NOT_COMPLETED | DA | traversări întrerupte: 1 |
| coverage-incomplete | INCOMPLETE_COVERAGE_REPORTED | DA | 900/900 pași incompleți |
| coverage-incomplete | NO_FAKE_FREE_CROSSING | DA | traversări neobservate: 45, libere: 0 |
| density-default | DEFAULT_DENSITY | DA | 96 pietoni |
| density-default | BOUNDED_EVALUATION | DA | 96 pietoni creați, 96 retrași cu motiv |

## Conflicte observate

Distanța este cea măsurată de la vehicul la linia de trecere a benzii; timpul până la conflict este
distanța împărțită la viteză, iar timpul de traversare rămas este lungimea rămasă împărțită la viteza
pietonului.

| Scenariu | Tick | Distanță (m) | Viteză (m/s) | Timp până la conflict (s) | Timp de traversare rămas (s) | Distanță minimă (m) | Rezultat | Tick oprire |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| conflict-yield | 206 | 9.40 | 6.00 | 1.57 | 6.83 | 7.20 | YIELDED | 250 |
| conflict-no-yield | 206 | 9.40 | 6.00 | 1.57 | 6.83 | 0.10 | CROSSED_WITHOUT_YIELD | — |
| contact-impact | 206 | 9.40 | 6.00 | 1.57 | 6.83 | 0.10 | CROSSED_WITHOUT_YIELD | — |
| coverage-incomplete | 206 | 9.40 | 6.00 | 1.57 | 6.83 | 0.10 | CROSSED_WITHOUT_YIELD | — |

## Opriri reale în apropierea trecerii

| Scenariu | Tick | Distanță (m) | Viteză (m/s) | În timpul traversării |
| --- | ---: | ---: | ---: | --- |
| conflict-yield | 250 | 7.20 | 0.13 | DA |

## Refuzuri de intrare

| Caz | Rezultat | Mesaj |
| --- | --- | --- |
| unknown-option | REFUZAT | Unknown pedestrian option |
| non-integer-seed | REFUZAT | Expected uint32 pedestrian seed |
| missing-seed | REFUZAT | Expected finite number in range |
| stale-tick | REFUZAT | Stale pedestrian step tick |
| duplicate-vehicle | REFUZAT | Duplicate pedestrian vehicle observation |
| unknown-lane | REFUZAT | Vehicle lane is not part of the pedestrian map |
| vehicle-capacity | REFUZAT | Pedestrian vehicle capacity exceeded |
| contact-unknown-pedestrian | REFUZAT | Contact references an unknown pedestrian |
| contact-foreign-tick | REFUZAT | Pedestrian contact does not belong to this step |

## Cost structural

| Indicator | Valoare |
| --- | ---: |
| Pași măsurați | 600 |
| Evaluări de pietoni | 54456 |
| Evaluări de vehicule | 600 |
| Vârf pietoni activi pe pas | 96 |
| Vârf vehicule pe pas | 1 |

## Limitări

- Nivel determinist în Node: fără browser, GPU, fizică live sau input uman; mișcarea vehiculelor este scriptată de fixture.
- Contactele sunt fapte autoritare ale proprietarului coliziunilor; modulul nu detectează fizic impactul.
- Trotuarul este banda derivată din harta 032 de layout-ul PBI 042; apropierea este un segment drept, nu un graf de trotuare.
- Trecerea de pietoni este perpendiculară pe banda de referință; o geometrie de hartă nealiniată este refuzată explicit, nu aproximată.
- Trecările de la marginea hărții nu au trotuar derivat și rămân fără pietoni, raportate ca lacună NO_SIDEWALK.
- Pragurile numerice (viteză de mers, răbdare, marjă) sunt seedate și raportate per pieton, nu calibrate pentru gameplay.
- Costul local de mai sus este structural (numărători deterministe), nu o măsurare de FPS sau de hardware.

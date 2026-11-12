# 164 — pietoni autonomi și traversări

PBI 164 adaugă pietoni cu deplasare pe trotuar și traversări cu conflict. Contractul este
[`164-pedestrians-v1`](../../../src/world/pedestrians.ts); raportul determinist este
[report.json](report.json), iar varianta umană [report.md](report.md).

Regula oracolului: o **cedare** este numărată numai când un vehicul observabil era în apropiere în
timpul traversării și a fost văzut oprit; o **traversare liberă** cere enumerare completă a
vehiculelor și zero conflicte; fără un numitor real, rata rămâne `null` cu lacună declarată.

## Sumar real

| Indicator | Valoare |
| --- | ---: |
| Scenarii deterministe | **6/6** PASS |
| Pietoni în configurația implicită | **96** (48 de treceri × 2) |
| Trecări declarate de hartă / legături de pietoni | **80 / 48** |
| Trecări fără trotuar derivat | **32** (`NO_SIDEWALK`) |
| Traversări pornite / finalizate | **336 / 323** |
| Traversări libere | **276** |
| Traversări cu cedare / fără cedare | **1 / 1** |
| Traversări neobservate (acoperire incompletă) | **45** |
| Conflicte observate | **4** |
| Opriri reale / dintre care în timpul traversării | **1 / 1** |
| Contacte autoritare | **1** |
| Determinism | 2 rulări, **identice**, SHA-256 `aee3db57b40c8b3e480506dee567cf7d6b86928517f8b67dae9e279706322ff8` |
| Verdict | **PASS** |

## Cum sunt modelați pietonii

**ID stabil și ciclu de viață.** ID-ul este derivat din sesiune, epoca lumii, harta, trecere și
slotul din trecere (`createStableId('pedestrian', …)`), deci nu depinde de tick și nu se schimbă
între rulări. Stările sunt un vocabular închis — `ON_SIDEWALK`, `WAITING`, `CROSSING`, `CROSSED`,
`WITHDRAWN` — iar tranzițiile sunt doar cele din tabelă:

```
ON_SIDEWALK -> WAITING | WITHDRAWN
WAITING     -> CROSSING | WITHDRAWN
CROSSING    -> CROSSED | WITHDRAWN
CROSSED     -> WITHDRAWN
WITHDRAWN   -> (niciuna)
```

Fiecare schimbare de stare produce un eveniment `STATE_CHANGED` cu `from`, `to`, motiv închis și
tick real. Retragerea are motiv `ROUTE_COMPLETE` sau `IMPACT`; nu există dispariție fără urmă.

**Traseul din geometrie reală.** Pentru fiecare trecere 039, axa de traversare este perpendiculara pe
banda de referință măsurată din linia de trecere autorată, capetele sunt proiecțiile poligonului pe
acea axă, iar apropierea pe trotuar este ancorată în banda `SIDEWALK` derivată de layout-ul 042.
Rezultatul măsurat pe harta reală: traversări de 10,00 m (min), 12,47 m (medie), 17,40 m (max);
64 de benzi au o linie de trecere folosită ca punct de cedare, zero benzi fără linie.

Cele 32 de treceri fără trotuar derivat sunt la marginea hărții, unde layout-ul 042 nu are cvartal;
sunt refuzate cu motiv `NO_SIDEWALK` și raportate ca lacună, nu aproximate cu geometrie inventată.

**Mișcarea.** Pietonul merge cu o viteză derivată din seed (1,1–1,6 m/s), cu răbdare (0,5–4 s) și
marjă de siguranță (0,5–2 s) proprii, expuse în snapshot. Pasul folosește `FIXED_TICK_HZ`; aceleași
intrări produc aceiași oameni, aceleași momente și aceleași decizii.

## Cum arată o traversare cu conflict

Pietonul ajunge la bordură (`WAITING`) și evaluează vehiculele observabile din apropiere. Dacă
timpul până la linia de trecere este mai mic decât timpul de eliberare a traversării plus marja, el
așteaptă. După `patienceTicks` se angajează oricum (`ASSERTED`) și creează o oportunitate reală de
cedare.

Fragmentul măsurat în scenariul `conflict-yield` (pietonul traversează 10 m cu 1,46 m/s, vehicul la
9,40 m cu 6,00 m/s):

| Fapt | Valoare |
| --- | ---: |
| Tick-ul conflictului | 206 |
| Distanță până la linia de trecere | 9,40 m |
| Viteză vehicul | 6,00 m/s |
| Timp până la conflict (distanță ÷ viteză) | 1,57 s |
| Timp de traversare rămas | 6,83 s |
| Distanță minimă observată | 7,20 m |
| Rezultat | `YIELDED` |
| Oprire reală | tick 250, la 7,20 m, în timpul traversării |

Aceleași intrări fără frână produc `CROSSED_WITHOUT_YIELD` cu distanță minimă **0,10 m** și zero
opriri: conflictul este la fel de observabil, dar nu devine cedare. Conflictul este deci **numărat din
date** (distanță, viteză, timp), nu presupus din apropierea unui pieton.

## Cum sunt numărate opririle și cedările fără denominatoare fictive

| Numărătoare | Sursa reală |
| --- | --- |
| traversări pornite | tranziția `WAITING -> CROSSING`, o dată per pieton |
| traversări finalizate / întrerupte | `CROSSING -> CROSSED` / `WITHDRAWN(IMPACT)` |
| traversări libere | finalizate, acoperire completă, zero conflicte |
| conflicte | un vehicul observabil cu distanță pozitivă în timpul traversării |
| opriri | tranziție reală a vitezei observate peste pragul de standstill în apropierea liniei |
| opriri în timpul traversării | oprirea reală care coincide cu un pieton `CROSSING` pe aceeași trecere |
| cedări | traversare finalizată cu cel puțin un conflict `YIELDED` |
| contacte | fapt autoritar al proprietarului coliziunilor |

Fiecare traversare finalizată intră exact într-o clasă: `FREE`, `YIELDED`, `WITHOUT_YIELD` sau
`UNOBSERVED`. Suma claselor este egală cu traversările finalizate (verificat în teste), deci nu
există dublă numărare. Rata de cedare are ca numitor **doar** traversările cu acoperire completă și
conflict observat; când lipsește, `value` este `null`, `status` este `MISSING` și motivul apare în
`gaps`:

- `NO_COMPLETE_CONFLICT_EPISODE` — niciun conflict complet observat (scenariul „drum gol”);
- `INCOMPLETE_VEHICLE_COVERAGE` — apelantul a declarat enumerare incompletă (45 de traversări
  neobservate în scenariul dedicat, zero „libere”);
- `REFUSED_CROSSWALK_LINK` — 32 de treceri fără trotuar derivat;
- `MISSING_CROSSING_LINE` — o bandă fără linie autorată nu poate produce conflict (0 pe harta reală);
- `PEDESTRIAN_CAPACITY_TRUNCATED` — plafonul de pietoni a tăiat crearea (raportat, nu ascuns);
- `NO_CROSSWALK` — harta nu declară nicio trecere.

Un drum gol produce deci `yieldRate.value = null`, nu „0 % cedări”, iar o enumerare incompletă nu
produce „traversare liberă”.

## Scenarii executate

| Scenariu | Pași | Pietoni | Pornite | Finalizate | Libere | Cu cedare | Fără cedare | Neobservate | Conflicte | Opriri | Contacte |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| crossing-free | 1100 | 48 | 48 | 48 | 48 | 0 | 0 | 0 | 0 | 0 | 0 |
| conflict-yield | 900 | 48 | 48 | 45 | 44 | 1 | 0 | 0 | 1 | 1 | 0 |
| conflict-no-yield | 900 | 48 | 48 | 45 | 44 | 0 | 1 | 0 | 1 | 0 | 0 |
| contact-impact | 900 | 48 | 48 | 44 | 44 | 0 | 0 | 0 | 1 | 0 | 1 |
| coverage-incomplete | 900 | 48 | 48 | 45 | 0 | 0 | 0 | 45 | 1 | 0 | 0 |
| density-default | 1100 | 96 | 96 | 96 | 96 | 0 | 0 | 0 | 0 | 0 | 0 |

`crossing-free` dovedește traversarea fără trafic și faptul că rata de cedare rămâne `MISSING`.
`conflict-yield`, `conflict-no-yield` și `contact-impact` folosesc aceeași apropiere (30 m, 6 m/s) și
diferă doar prin decizia scriptată a vehiculului și prin faptul de contact. `coverage-incomplete`
folosește aceeași apropiere cu enumerare incompletă. `density-default` rulează configurația implicită
(96 de pietoni) și dovedește costul structural mărginit.

## Cost structural

Măsurat pe configurația implicită (96 de pietoni), 600 de pași, cu un vehicul observat per pas:

| Indicator | Valoare |
| --- | ---: |
| Pași măsurați | 600 |
| Evaluări de pietoni | 54 456 |
| Evaluări de vehicule | 600 |
| Vârf pietoni activi pe pas | 96 |
| Vârf vehicule pe pas | 1 |
| Timp local de generare a raportului (8 lumi + 6 scenarii) | ≈ 4,1–4,4 s |

Costul per pas este O(pietoni activi + vehicule × treceri de pe banda lor); `step` nu mai construiește
snapshot-uri (pozițiile se cer explicit prin `getPedestrians()`), iar plafoanele pentru pietoni,
vehicule, conflicte, opriri și contacte sunt explicite. Timpul de perete este o observație locală de
dezvoltare, nu o dovadă de FPS sau de hardware (PBI-ul nu are `performance_checks`).

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 erori, 0 warning-uri |
| `npm run format:check` | PASS, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 367 fișiere TypeScript, probe negative 6+4+3, lifecycle |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | 2924 teste, 2924 trecute, 0 eșuate, 0 sărite, 97 483 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/world/pedestrians.test.ts"` | 15 teste, 15 trecute, 0 eșuate |
| `npm run pedestrians:report` | 6/6 scenarii PASS, 96 pietoni, 336 traversări pornite, 4 conflicte, 1 cedare, 1 fără cedare, 1 contact, determinism identic, overall PASS |
| `npm run pedestrians:report -- --check` | „Pedestrian report is current” + „Pedestrian markdown is current” |

Două rulări independente ale scenariului de determinism produc aceeași amprentă:
`aee3db57b40c8b3e480506dee567cf7d6b86928517f8b67dae9e279706322ff8`.

## Fișiere atinse

- [`src/world/pedestrians.ts`](../../../src/world/pedestrians.ts) — contractul `164-pedestrians-v1`:
  rețeaua de treceri, entitățile, FSM-ul închis, decizia de traversare, conflictele, opririle,
  contactele, inspecția fără numitori ficși.
- [`src/world/index.ts`](../../../src/world/index.ts) — exportul public al modulului.
- [`tests/world/pedestrians-fixture.ts`](../../../tests/world/pedestrians-fixture.ts) — harta reală
  (cartier), ținta deterministă și eșantionarea benzii.
- [`tests/world/pedestrians-suite.ts`](../../../tests/world/pedestrians-suite.ts) — cele 6 scenarii,
  refuzurile, determinismul și raportul.
- [`tests/world/pedestrians.test.ts`](../../../tests/world/pedestrians.test.ts) — 15 teste de
  contract, stări, cedare, conflict, numărători, refuz și determinism.
- [`scripts/run-pedestrian-report.mjs`](../../../scripts/run-pedestrian-report.mjs) — raportul
  determinist cu `--check`.
- [`package.json`](../../../package.json) — intrarea `pedestrians:report`, ultima din blocul
  `scripts`.
- [`Docs/20-extensii-si-mers-pe-jos.md`](../../20-extensii-si-mers-pe-jos.md) — secțiunea
  „Pietoni autonomi și traversări (PBI 164)”.
- `Docs/Evidence/164-pedestrians/{README.md,report.json,report.md}` — aceste dovezi.

## Limitări

- Nivel determinist în Node: fără browser, GPU, fizică live sau input uman. Mișcarea vehiculelor este
  scriptată de fixture; integrarea vizuală și playtestul rămân ale gate-urilor de release.
- Contactele sunt fapte autoritare ale proprietarului coliziunilor. Modulul le validează și le
  contabilizează, dar **nu** detectează fizic impactul; un contact inventat din apropiere ar fi o
  dovadă falsă.
- Trotuarul este banda derivată de layout-ul 042, iar apropierea este un segment drept, nu un graf de
  trotuare. Pietonii nu ocolesc mobilier și nu urmează rețeaua completă de trotuare.
- Trecările de la marginea hărții (32 din 80) nu au trotuar derivat și rămân fără pietoni; sunt
  raportate ca lacună, nu completate cu geometrie inventată.
- Pragurile numerice (viteză de mers, răbdare, marjă) sunt seedate și raportate per pieton; nu sunt
  calibrate pentru gameplay și nu intră în catalogul de parametri.
- Timpul local de generare a raportului nu este o măsurare de performanță hardware: PBI 164 nu are
  `performance_checks`, iar costul raportat este structural.

# 151 — suita completă de scenarii V1

Implementarea PBI 151 leagă autonomia, cursele, învățarea și campania într-o suită reproductibilă,
executată pe contractele livrate. Comanda unică este `npm run scenarios:v1`; transcriptul
machine-readable este [report.json](report.json), iar varianta umană [report.md](report.md).

Regula oracolului: fiecare rezultat așteptat este contractul publicat (oracolul 050, formula 101,
tabelul de tranziții 061, identitatea recompensei 125), nu o copie a valorii observate. Seed fix 151,
zero ceas de perete și zero aleator în transcript.

## Familii și scenarii

| Familie | Scenarii | Pozitive | Negative | NOT_RUN | Trecute/executate |
| --- | ---: | ---: | ---: | ---: | ---: |
| AUTONOMY | 4 | 3 | 1 | 1 | 3/3 |
| RIDES | 3 | 2 | 1 | 0 | 3/3 |
| LEARNING | 3 | 2 | 1 | 0 | 3/3 |
| CAMPAIGN | 3 | 2 | 1 | 0 | 3/3 |

Total: 13 scenarii, 12 executate, 12 PASS, 0 FAIL, 1 NOT_RUN.

## Numerele reale per scenariu

| Scenariu | Polaritate | Pași | Verificări | Rezultat real |
| --- | --- | ---: | ---: | --- |
| `autonomy-green-start-delay` | POSITIVE | 1 | 6 | `START_DELAY`/`GREEN_START_DELAY`, `stopRequested=true`, `green_start_delay=0.7 s` |
| `autonomy-green-delay-boundary` | POSITIVE | 1 | 6 | la borna exactă `PROCEED`/`GREEN_RELEASE`, `stopRequested=false` |
| `autonomy-stale-observation` | NEGATIVE | 1 | 6 | observație veche de 20 tick-uri (> 6): `UNKNOWN`/`UNAVAILABLE`, `sampledUnit=null`, fapt FSM `null` |
| `rides-full-lifecycle` | POSITIVE | 5 | 11 | traseu `TO_PICKUP→PICKUP→TO_DROPOFF→DROPOFF→COMPLETED`, 5 tranziții, 1 eliberare la tick 14, taxi `AVAILABLE`, 1 cursă finalizată, 0 active |
| `rides-duplicate-terminal-event` | POSITIVE | 6 | 4 | `duplicate=true`, 1 eliberare, 1 cursă, 5 tranziții |
| `rides-illegal-dropoff-before-pickup` | NEGATIVE | 2 | 5 | `Illegal ride transition TO_PICKUP -> COMPLETED`, stare `TO_PICKUP`, 1 tranziție, 0 eliberări, taxi `ASSIGNED` |
| `learning-single-episode-bounded` | POSITIVE | 1 | 7 | greutate `0.15`, valoare `1.875 m/s`, `APPLIED`, `changed=true`, `published=false` |
| `learning-repeated-evidence` | POSITIVE | 16 | 8 | greutate `0.6`, valoare `3 m/s`, 16 episoade efective |
| `learning-contradiction-holds-profile` | NEGATIVE | 1 | 7 | interval `[5, 3]`: `HELD_CONTRADICTION`, `SEVERE`, valoare `1.5` neschimbată, `estimate=null` |
| `campaign-first-mission` | POSITIVE | 1 | 15 | `GRANTED`, 2 recompense, 100 XP, deblocare `challenge:first-demonstration`, ledger 2/100 |
| `campaign-chain-unlocks-next` | POSITIVE | 1 | 4 | 1 finalizată, 1 disponibilă; misiunea 2 `AVAILABLE`, misiunea 3 `LOCKED` cu prerechizita `campaign-2-first-demonstration` |
| `campaign-duplicate-settlement-refused` | NEGATIVE | 2 | 8 | `DUPLICATE`, 0 recompense, 0 XP, motiv `COMPLETION_ALREADY_SETTLED`, totaluri neschimbate 2/100 |
| `integration-browser-playtest` | POSITIVE | — | — | `NOT_RUN`: cere browser real, GPU și input uman; rămâne gate-urilor 153/235 |

## Toleranțe declarate

- `EXACT` — stări, motive, liste de deblocare, contoare întregi (tranziții, eliberări, curse) și
  condiții booleene; orice diferență este eșec.
- `ABSOLUTE 1e-12 s`/`m` — ecourile profilului proiectat din registrul de parametri.
- `ABSOLUTE 1e-4 m/s` și `1e-4 ratio` — pasul 101, care rotunjește la 4 zecimale.
- `ABSOLUTE 1e-6 episoade` — numărul efectiv de episoade complet expuse.
- `ABSOLUTE 0` — contoare de contract (de exemplu 0 eliberări la un refuz); limita este declarată,
  nu lăsată implicită.

Nu există „aprox egal”: o valoare numerică fără toleranță declarată nu poate intra în transcript, iar
testul respinge textul vag din regulile de toleranță.

## Cazuri negative

Fiecare familie are cel puțin un refuz explicit, nu doar traseul fericit:

- autonomie: observație de semafor expirată → decizie `UNKNOWN` și niciun fapt inventat pentru FSM;
- curse: dropoff înainte de pickup → tranziție ilegală, stare/istoric/claim neschimbate;
- învățare: interval de estimator inversat → contradicție severă, profil neschimbat, nimic publicat;
- campanie: aceeași finalizare rejucată → `DUPLICATE`, zero XP și zero recompense noi.

Un scenariu care nu poate rula (playtestul în browser) este `NOT_RUN` cu motiv, are zero verificări și
nu este numărat la treceri; testul demonstrează că `passed + fail + notRun = scenarios`.

## Ce s-a refolosit

- **216-v1-regression** (`Docs/Evidence/216-v1-regression/report.json`): rândurile B5–B8 pentru daily
  211/212 și XP 213, amprenta XP fără pierderi (`85df901a…3112e3cc`), 29 de rânduri, 0 FAIL, 2
  NOT_RUN cu motiv și graful fără cicluri. Suita 151 le citează ca dovadă comisă, nu le reexecută.
- **056-auto-scenarios** (`Docs/Evidence/056-auto-scenarios/report.json`): cele 12 scenarii de
  autonomie, cele 10 cazuri negative și cele 5 probe de mutație. 151 adaugă doar `green_start_delay`,
  borna ei exactă și fereastra de observație, care nu sunt acoperite de 056.

Verificările refolosite sunt în `reuse` în raport, cu sursa, rândurile citate și dovada pe disc.

## Reproductibilitate

Două rulări independente ale `npm run scenarios:v1` au produs același fișier:

- rularea 1: `D56435127DA3DFDB8E50350F35CCF8EDBB598115A24F7134F5E395E90BB7FAC6`
- rularea 2: `D56435127DA3DFDB8E50350F35CCF8EDBB598115A24F7134F5E395E90BB7FAC6`

Amprenta SHA-256 a scenariilor din transcript este
`602a17e79db6d8ce70ebf75541df35b0f56778226ae7adbcd384f81a01789838`. Testul compară două apeluri
independente ale suitei, iar `--check` compară fișierele comise cu o rulare proaspătă.

## Comenzi executate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 erori, 0 warning-uri |
| `npm run format:check` | PASS, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS (354 fișiere TypeScript, probe negative 6+4+3, lifecycle) |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | 2619 teste, 2619 trecute, 0 eșuate, 0 sărite, 87 478 ms |
| `node --import ./scripts/register-typescript.mjs --test "tests/scenarios/v1-suite.test.ts"` | 6 teste, 6 trecute, 0 eșuate |
| `npm run scenarios:v1` | 13 scenarii, 12 executate, 12 PASS, 0 FAIL, 1 NOT_RUN, 4 familii, 9 pozitive, 4 negative, 2 surse refolosite, overall PASS |
| `npm run scenarios:v1 -- --check` | „Scenario suite report is current” + „Scenario suite markdown is current” |

## Fișiere atinse

- `tests/scenarios/scenario-suite-support.ts` — tipuri, toleranțe, verdict derivat, sinteze, digest.
- `tests/scenarios/scenario-suite-autonomy.ts` — familia AUTONOMY pe politica 050.
- `tests/scenarios/scenario-suite-rides.ts` — familia RIDES pe ciclul 061 și flota 057/059/060.
- `tests/scenarios/scenario-suite-learning.ts` — familia LEARNING pe poarta 100 și pasul 101.
- `tests/scenarios/scenario-suite-campaign.ts` — familia CAMPAIGN pe tracker-ul 116 și ledgerul 125.
- `tests/scenarios/v1-suite.ts` — asamblarea suitei, refolosirea 216/056, NOT_RUN, limitări.
- `tests/scenarios/v1-suite.test.ts` — 6 teste de contract, determinism și transcriere comisă.
- `scripts/run-scenario-suite-report.mjs` — raport determinist cu `--check`.
- `package.json` — intrarea `scenarios:v1`, ultima din blocul `scripts`.
- `Docs/18-validare-si-release.md` — secțiunea „Suita de scenarii V1 (PBI 151)”.
- `Docs/Evidence/151-scenario-suite/{README.md,report.json,report.md}` — aceste dovezi.

`src/` nu a fost modificat; nu a fost găsit niciun defect de business în contractele exercitate.

## Limitări

- Nivel determinist în Node: fără browser real, GPU, input uman, FPS sau hardware de referință;
  playtestul rămâne `NOT_RUN` și este preluat de gate-urile 153/220/224/235.
- Condusul de autonomie este politica 050 evaluată pe observații authoreză, nu fizica Babylon/Rapier
  live.
- Cursa folosește fixture-ul real 057/059/060 din `tests/fleet`, nu o hartă generată în browser.
- Învățarea este pasul candidat 101; publicarea profilului și joburile worker rămân ale modulelor
  109/112 și nu sunt republicate aici.
- Campania folosește catalogul authoreză 116/125; misiunile zilnice 211 și XP 213 sunt refolosite din
  transcriptul 216, nu reexecutate.
- Suita nu a fost comparată cu un playtest uman și nu pretinde performanță de cadru.

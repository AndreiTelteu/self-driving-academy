# Dovezi 233 — reluare, recorduri și recompense pentru provocări

Contract: `233-challenge-experience-v1` · snapshot: `233-challenge-experience-state-v1` · panou:
`233-challenge-panel-v1` · module: **`src/missions/`** (`challenge-experience.ts`) și **`src/ui/`**
(`challenge-panel.ts`, `challenge-panel-format.ts`) · nivel de validare: `targeted`.

## Ce s-a livrat

Un singur strat de experiență peste contractele deja livrate: catalogul și replicile 231, directorul și
verdictul 232, ledgerul 213 și ziua/dimensiunea zilnică 211. Modulul nu are ceas de perete,
`Math.random`, DOM, renderer sau un al doilea registru de XP; toate deciziile pornesc de la valori
explicite primite de la apelant.

| Componentă | Ce face exact | Ce nu face |
| --- | --- | --- |
| `credit` | acordă XP o singură dată per `(familie, zi locală)` prin `PlayerProgress.creditMission` | nu creează un ledger paralel, nu debitează, nu plătește replay/refuz/eșec |
| `record` | compară rezultatul cu recordul versionat al șablonului și rescrie doar strict mai bine | nu scade recordul, nu declară egalitatea drept record nou |
| `challengeFastRetry` | reia imediat o provocare `FAILED` prin `232 restart`, cu identitate nouă | nu dublează recompensa, nu depășește opt încercări |
| `challengeDailyVariety` | alege exact trei provocări 231, familii variate, minimum un MANUAL | nu regenerează setul 211, nu propune obiectivul Haos |
| `challengeDailyConnection` | numește exact ce intră în 211 și ce rămâne la evaluatorii 231 | nu pretinde că toate șabloanele sunt obiective 116 |
| `challengeReaction` | derivă replica comică din rezultatul real, cu ton/efect/afirmație XP închise | nu promite upload, pierdere de XP sau insultă |
| `createChallengePanel` | buton nativ, dialog, focus mutat și readus, `Escape`, zero listeners globali | nu acceptă, nu refuză, nu reia și nu creditează nimic |

## Credit idempotent — numere reale

Cheia este `challenge-reward(family, dailyDate)` (exemplu din raport:
`id-v1:16:challenge-reward27:233-challenge-experience-v19:PRECISION10:2026-11-12`). Ea nu conține
`instanceId`, deci o rerulare nu poate produce o cheie nouă; deduplicarea finală rămâne a ledgerului
213.

| Scenariu | Status | Motiv | Familie | Data | Calendar | XP autorat | XP creditat | Sold | Intrări |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `academy_first_completion` | `CREDITED` | — | `PRECISION` | 2026-11-12 | `NEW_DAY` | 80 | 80 | 80 | 1 |
| `academy_same_family_same_day` | `DUPLICATE` | `FAMILY_REWARDED_TODAY` | `PRECISION` | 2026-11-12 | `SAME_DAY` | 80 | 0 | 80 | 1 |
| `calendar_rollback` | `SKIPPED` | `CALENDAR_ROLLBACK` | `PRECISION` | 2026-11-11 | `ROLLBACK` | 80 | 0 | 80 | 1 |
| `declined_offer` | `SKIPPED` | `NOT_COMPLETED` | `EXPERIMENT` | 2026-11-12 | `SAME_DAY` | 0 | 0 | 80 | 1 |
| `deadline_failure` | `SKIPPED` | `NOT_COMPLETED` | `EFFICIENCY` | 2026-11-12 | `SAME_DAY` | 0 | 0 | 80 | 1 |
| `haos_completion` | `SKIPPED` | `LOCAL_RECORD_ONLY` | `PRECISION` | 2026-11-12 | `NEW_DAY` | 0 | 0 | 0 | 0 |
| `academy_same_family_next_day` | `CREDITED` | — | `PRECISION` | 2026-11-13 | `NEW_DAY` | 80 | 80 | 160 | 2 |

Rezultat: 7 cereri de credit, 2 credite reale (80 + 80 XP), 1 duplicat oprit înaintea ledgerului, 4
refuzuri fără XP. Soldul este exact suma intrărilor, iar ledgerul 213 rămâne singura sursă de adevăr
(`storage.ledgerEntries` = 1 pentru sesiunea de stocare).

## Recorduri personale

Rangul versionat compară lexicografic: progres, timpul relativ al încercării
(`completedAtTick - activatedAtTick`), incidente, apoi calitatea familiei.

| Scenariu | Comparație | Timp încercare | Cel mai bun | Îmbunătățit | Rang |
| --- | --- | --- | --- | --- | --- |
| `first_record` | `FIRST_RECORD` | 300 | 300 | true | `1, -300, 0` |
| `slower_run` | `WORSE` | 900 | 300 | false | `1, -300, 0` |
| `equal_run` | `EQUAL` | 300 | 300 | false | `1, -300, 0` |
| `faster_run` | `BETTER` | 120 | 120 | true | `1, -120, 0` |

Un eșec este consemnat în `attempts`/`lastResult`, dar nu devine record (`best` rămâne `null`).
Snapshotul refuză un rang care nu este derivat din propriul scor; un snapshot modificat nu atinge
starea curentă.

## Reluare rapidă

| Status | Cod | Încercare | Același șablon | Identitate nouă | XP |
| --- | --- | --- | --- | --- | --- |
| `RESTARTED` | — | 2 | true | true | 0 |
| `REFUSED` | `NOT_FAILED` | 2 | true | false | 0 |

După reluare, prima reușită a plătit 80 XP, iar o altă reușită a aceleiași familii în aceeași zi a
întors `FAMILY_REWARDED_TODAY`. Plafonul de opt încercări per șablon este testat până la `ATTEMPT_LIMIT`.

## Varietate daily și puntea 211

| Data | Șabloane | Familii | MANUAL | Exact trei | Unice | Fără Haos | Fără repetare |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | city-copies-me, forgot-something, influencer-no-spill | 3 | 2 | true | true | true | true |
| 2026-11-10 | city-tour-backwards, valet-with-style, maternity-run | 3 | 3 | true | true | true | true |
| 2026-11-11 | influencer-parking-drift, last-minute-airport, influencer-no-spill | 3 | 3 | true | true | true | true |
| 2026-11-12 | influencer-single-frame, city-copies-me, maternity-run | 3 | 2 | true | true | true | true |
| 2026-11-13 | last-minute-airport, toilet-sos, influencer-parking-drift | 3 | 3 | true | true | true | true |

Puntea `231-challenge-daily-bridge-v1` rămâne intrarea externă a generatorului 211: 3 șabloane sunt
expresabile ca obiective 116 (`challenge-maternity-run`, `challenge-last-minute-airport`,
`challenge-city-copies-me`), iar 9 șabloane au evaluatori proprii 231 și rămân deschise pentru 233, nu
pentru daily. Catalogul are 12 șabloane.

## Reacții comice

| Trigger | Ton | Efect | XP | Autorată | Observație |
| --- | --- | --- | --- | --- | --- |
| `OFFER` | `NEUTRAL` | `NONE` | `XP_PENDING` | true | premisa autorată a șablonului |
| `PROGRESS` | `NEUTRAL` | `NONE` | `XP_PENDING` | true | replica de progres |
| `SUCCESS` | `CELEBRATION` | `CELEBRATION` | `XP_PENDING` | true | reușită fără credit cerut încă |
| `SUCCESS` | `CELEBRATION` | `CELEBRATION` | `XP_CREDITED` | true | prima reușită a familiei azi |
| `SUCCESS` | `CELEBRATION` | `CELEBRATION` | `RECORD_ONLY` | true | a doua reușită: record, fără XP |
| `DECLINE` | `SHRUG` | `SHRUG` | `NO_XP_LOSS` | false | replică închisă, fără insultă |
| `FAILURE` | `COMMISERATION` | `COMMISERATION` | `NO_XP_LOSS` | true | replica de eșec a șablonului |

Toate cele 12 șabloane au fost parcurse pentru textul de ofertă, iar parserul public refuză o replică
cu „upload/Instagram”, o modificare de sold (`xpDelta != 0`) și un ton nepotrivit trigger-ului.

## Comenzi executate și rezultate reale

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, zero avertismente |
| `npm run format:check` | „All matched files use Prettier code style!”, exit 0 |
| `npm run check:architecture` | PASS (363 fișiere TypeScript), probe negative PASS |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.”, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test tests/missions/challenge-experience.test.ts tests/missions/challenge-experience-report.test.ts tests/ui/challenge-panel.test.ts` | 31 teste, 31 pass, 0 fail, 1,1 s |
| `npm test` | 2 751 teste, 2 751 pass, 0 fail, 91,2 s, exit 0 |
| `npm run missions:challenge-experience` | `SUMMARY checks 55/55, overall PASS`; `report.json` + `report.md` scrise |
| `npm run missions:challenge-experience -- --check` | „Challenge experience report is current”, exit 0 |
| `PBI/Validate-Board.ps1` (după mutarea în In Progress) | `Valid: true`, `In Progress: 1` |
| `PBI/Validate-Board.ps1 -RequireDone '233'` | vezi raportul final al agentului |

## Fișiere atinse

- `src/missions/challenge-experience.ts` — nou: credit idempotent, recorduri, reluare, varietate daily, reacții.
- `src/missions/index.ts` — exporturile publice, adăugate la finalul listei existente.
- `src/ui/challenge-panel.ts` — nou: panoul read-only, acțiunile native și accesibilitatea.
- `src/ui/challenge-panel-format.ts` — nou: snapshotul de panou, parserul strict și proiecția.
- `src/ui/index.ts` — exporturile publice, adăugate la finalul listei existente.
- `tests/missions/challenge-experience-fixture.ts` — directorul real 232, ledgerul real 213, calendarul explicit.
- `tests/missions/challenge-experience.test.ts` — 16 teste deterministe.
- `tests/missions/challenge-experience-report.ts` — transcriptul determinist + markdown.
- `tests/missions/challenge-experience-report.test.ts` — 3 teste care verifică raportul comis.
- `tests/ui/challenge-panel-fixture.ts` — DOM determinist peste contractele reale.
- `tests/ui/challenge-panel.test.ts` — 12 teste de accesibilitate și proiecție.
- `scripts/run-challenge-experience-report.mjs` — scriptul de raport, cu `--check` și `--output`.
- `package.json` — `missions:challenge-experience`, ultima intrare din blocul `"scripts"`.
- `Docs/28-provocari-random-si-revenire.md` — secțiunea „Contract implementat în V1 (PBI 233)”.
- `Docs/Evidence/233-challenge-experience/README.md`, `report.json`, `report.md`.
- `PBI/Done/233-challenge_experience.md` — mutat fizic din `In Progress`.

## Performanță (`performance_checks: ui, storage, frame`)

Aplicat nivelul `targeted` din [politica de validare](../../validation-policy.md): corectitudine
izolată, cost structural local și integrare UI deterministă, fără benchmark hardware și fără a
pretinde playtest uman.

- **ui**: panoul `233-challenge-panel-v1` are zero listeners globali, o citire per deschidere și una
  per `refresh()` acceptat, iar un `refresh()` pe panoul închis nu citește nimic. Nu se înscrie în
  bucla 3D: nu are cale per tick. Dialogul folosește `min(92vw, 46rem)` și `max-height: min(90vh, 40rem)`
  pentru viewport mic; focusul intră pe prima acțiune activă și revine la buton, `Tab` rămâne în dialog,
  `Escape` îl închide.
- **storage**: snapshot 1 116 bytes cu 1 record și 1 cheie de recompensă; capacitatea finită este 32 de
  rânduri de record și 64 de chei de recompensă (cheia cea mai veche este aruncată cu contor, iar
  ledgerul 213 deduplică în continuare). `challengeHistoryEntries` este `null` în
  [manifest](../../performance-budgets.json): PBI-ul stabilește capacitatea finită provizorie și
  raportează lacuna de calibrare, fără să pretindă un buget calibrat.
- **frame**: panoul nu adaugă lucru pe tick și nu atinge rendererul; bugetul de referință rămâne cel
  din manifest (desktop `frameP95Ms` 18,5; laptop 35). Măsurarea de frame este
  `NOT_MEASURED_DEV`, pentru că un PBI `targeted` nu certifică performanța jocului integrat.

## Limitări

- Reluarea imediată este definită pentru eșec: după un succes, 232 închide instanța `COMPLETED` și
  refuză `RESTART`. „Mai încearcă" este dezactivat cu motivul afișat, iar o nouă încercare vine din
  următoarea ofertă a directorului; 233 nu inventează o tranziție peste contractul 232.
- Panoul este livrat cu port de host și testat peste contractele reale, dar nu este montat în shell-ul
  aplicației: compunerea din `src/app` nu aparține acestui PBI (la fel ca panourile 126/210).
- Creditul folosește calendarul explicit al terminalului, ca în 211. Un host care ar minți data ar
  putea muta creditul pe altă zi; contractul nu poate verifica singur ceasul real fără să citească un
  ceas de perete, ceea ce ar rupe determinismul.
- Măsurătorile de frame și playtestul de retenție rămân pentru gate-urile 156/220/235; acest PBI
  `targeted` nu le închide.

# Dovezi 232 — directorul de provocări random

Contract: `232-challenge-director-v1` · snapshot: `232-challenge-director-state-v1` · modul ales:
**`src/missions/`** (`src/missions/director.ts`) · nivel de validare: `targeted`.

## Ce s-a livrat

Un singur director determinist peste catalogul și evaluatorii livrați la 231. Directorul nu are ceas de
perete, `Math.random`, DOM, renderer, dispecer sau ledger de XP: primește un snapshot explicit de lume
și un port de rută mărginit, iar rezultatul fiecărei operații este înghețat.

| Componentă | Ce face exact | Ce nu face |
| --- | --- | --- |
| `offer` | alege determinist un șablon eligibil, derivă seed-ul, ținta, marja, deadline-ul, bugetul și zonele, apoi creează **o** ofertă vizibilă | nu atinge assignment-ul sau pasagerul, nu deschide a doua ofertă |
| `accept` | rezervă taxiul jucătorului, suspendă dispatchul lui și expune un `rideRequestId` comun pentru pickup/dropoff | nu accepta cu pasager la bord sau cu taxi dispecerizat |
| `decline` | închide oferta cu `DECLINED`, fără XP, recompensă sau reputație | nu penalizează și nu blochează reluarea după cooldown |
| `activate` / `evaluate` | ancorează deadline-ul la tick-ul de activare și judecă faptele cu evaluatorul 231 | nu finalizează pe text HUD, nu acordă XP |
| `advance` / `expire` | mișcă ceasul simulat, oprește timpul în pauză, expiră ofertele și eșuează deadline-urile | nu sondează rute și nu re-planifică per frame |
| `restart` | `R` anulează instanța și pornește una nouă, cu seed și identitate noi | nu depășește opt încercări per șablon |
| `changeVehicle` | confirmă legătura cu taxiul rezervat | nu duplică instanța sau recompensa |
| `setOffersEnabled` | oprește ofertele noi și retractează oferta vizibilă | nu atinge o instanță deja activă |
| `snapshot` / `restore` | transportă seed-ul, obiectivul, deadline-ul, sesiunea și epoch-ul lumii | nu rerandomizează oferta sau recompensa |
| `stats` / `history` | contorizează per stare, pe viață și curent, plus istoricul plafonat | nu crește cu timpul de joc |

## Cum oferă o provocare fără să întrerupă cursa

Oferta este read-only față de cursa reală. În raport, scenariul `offer_during_ride` pornește cu un
assignment real și cu pasager la bord, iar rezultatul este `OFFERED` cu ecoul exact
`ride:assignment:fixture:1`, `passenger:customer:fixture:1` și cu `rideCancelled: false`,
`assignmentChanged: false`, `passengerMoved: false`. Snapshotul de lume este înghețat, deci directorul
nu poate muta pasagerul sau assignment-ul nici accidental.

Acceptarea cere un taxi liber. Cu pasager la bord răspunsul este `PASSENGER_ABOARD`, cu un taxi
dispecerizat este `TAXI_ASSIGNED`; în ambele cazuri oferta rămâne `OFFERED` și cursa existentă
continuă. Acceptarea reușită întoarce o rezervare cu `dispatchSuspended: true`, `taxiId`,
`pickupZoneId`, `dropoffZoneId` și `rideRequestId`, astfel încât pickup/dropoff să folosească
lifecycle-ul 059/060 existent, nu un sistem paralel.

## O singură ofertă, cooldown și anti-repetiție plafonată

- Cel mult o ofertă vizibilă și o instanță vie. A doua cerere în aceeași fereastră este refuzată
  nominal: `OFFER_ALREADY_ACTIVE` și `INSTANCE_ALREADY_ACTIVE`; acceptarea repetată întoarce
  `duplicate: true`, fără o a doua rezervare.
- Cooldown-ul este un termen în tick-uri simulate: 10 800 tick-uri (trei minute active la 60 Hz)
  după orice rezultat terminal, inclusiv refuz. În raport, `cooldown_after_decline` raportează
  `COOLDOWN_ACTIVE` cu 10 800 tick-uri rămase.
- Istoricul anti-repetiție evită ultimele trei șabloane cât timp există o alternativă (10 șabloane
  distincte în cele 24 de intrări reținute). Plafonul este simultan în intrări (24) și în unități de
  cod (4 096); după 30 de oferte, istoricul are exact 24 de intrări, 6 au fost aruncate explicit, iar
  identitățile ocupă 1 071 de unități de cod.
- `challengeHistoryEntries` este `null` în [manifest](../../performance-budgets.json). PBI-ul
  stabilește plafonul finit de admitere de mai sus și raportează lacuna de calibrare, fără să
  pretindă un buget calibrat.

## Preflight-ul dinaintea ofertei

Înainte de a oferi, directorul verifică: sesiunea (`SESSION_INVALID`), un transfer de sesiune în curs
(`SESSION_TRANSFER_IN_PROGRESS`), existența unui taxi liber (`NO_FREE_TAXI`), eligibilitatea 231 pe
capabilități, accesibilitatea fiecărei zone concrete a obiectivului (`ROUTE_UNREACHABLE`), estimarea
reală de rută prin port și fezabilitatea deadline-ului (`DEADLINE_INFEASIBLE`). Estimarea trebuie să
încăpă în durata autorată plus marjă, minus 5 secunde de rezervă.

Un catalog mic folosește un fallback stabil: un singur parcurs determinist, pornit la indexul derivat
din seed, fără buclă de rerandomizare. Cu un snapshot „lean” rămân două șabloane ofertabile; ambele
sunt oferite, apoi fallback-ul continuă stabil, iar după opt încercări per șablon refuzul este
`NO_ELIGIBLE_TEMPLATE` cu `ATTEMPT_LIMIT:` pentru fiecare.

## Seed salvat și reload identic

Fiecare ofertă are propriul seed uint32, fie derivat din seed-ul directorului și indexul ofertei, fie
dat explicit. Instanța persistă seed-ul, încercarea, snapshot-ul obiectivului, deadline-ul,
`sessionId` și `worldEpoch`. În raport, oferta cu seed `987654` pe
`challenge-last-minute-airport` este acceptată, activată și avansată 600 de tick-uri, apoi snapshot-ul
trece printr-un reload JSON: obiectivul este identic octet cu octet (`samePlan: true`), timpul simulat
rămas este identic (`sameDeadline: true`), amprenta verdictului este identică
(`sameFingerprint: true`), iar identitatea recompensei este identică (`sameRewardKey: true`). Un
snapshot modificat este refuzat cu `SNAPSHOT_INVALID` și nu atinge starea curentă.

## Pauză, deadline, R, reset și duplicate

- `advance({ ticks, paused: true })` îngheață ceasul: 10 000 000 de tick-uri în pauză nu expiră nicio
  instanță. Reluarea și depășirea deadline-ului produc `FAILED` cu motivul directorului
  `DEADLINE_EXPIRED`, la tick-ul exact al deadline-ului, cu `penalty: NONE`.
- O ofertă fără răspuns expiră după 2 700 de tick-uri (45 s active) cu `EXPIRED` / `OFFER_EXPIRED` și
  pornește cooldown-ul.
- `R` anulează instanța curentă (`RESTART`) și pornește alta, cu seed și identitate noi; a noua
  încercare este refuzată cu `ATTEMPT_LIMIT`, fără o instanță duplicată.
- Resetul orașului anulează cu `CITY_RESET`, fără XP; acceptarea și evaluarea repetate întorc
  explicit `duplicate: true` / `DUPLICATE`.
- Schimbarea mașinii: același taxi → `UNCHANGED` cu zero instanțe și zero recompense duplicate; alt
  taxi → `BOUND_TO_TAXI`.

## Toggle și refuz fără penalizare

`setOffersEnabled(false)` oprește ofertele noi (`OFFERS_DISABLED`), retractează oferta vizibilă
(`EXPIRED`, motiv `OFFERS_DISABLED`, cu `xpDelta: 0`) și lasă o instanță activă neatinsă. Refuzul
jucătorului întoarce `DECLINED` cu `penalty: 'NONE'`, `xpDelta: 0`, `reputationDelta: 0`,
`rewardGranted: false`, iar outcome-ul are `xpEligible: false`, `academyXp: 0` și `rewardKey: null`.
Creditul XP rămâne la 233; un outcome terminal notează doar politica autorată și `claimed: false`.

## Lifecycle numeric

Graful este închis: `OFFERED → ACCEPTED → ACTIVE → COMPLETED/FAILED/CANCELLED`, plus
`OFFERED → DECLINED/EXPIRED`. Orice altă tranziție este refuzată cu `INVALID_STATE`, iar o stare
terminală nu reînvie.

| Stare | Total pe viață | Explicație |
| --- | --- | --- |
| `OFFERED` | 7 | fiecare scenariu pornește de la o ofertă |
| `ACCEPTED` | 3 | trei oferte au fost acceptate |
| `ACTIVE` | 3 | trei instanțe au primit deadline ancorat |
| `COMPLETED` | 1 | evaluatorul 231 a confirmat ținta |
| `FAILED` | 1 | deadline depășit în ceasul simulat |
| `CANCELLED` | 1 | anulare explicită a jucătorului |
| `DECLINED` | 3 | refuzuri fără penalizare |
| `EXPIRED` | 1 | ofertă fără răspuns |

Din cele șapte instanțe, exact una este eligibilă pentru XP (finalizarea în Academie), cu 60 XP
autorat și `claimed: false`.

## Numere reale (din `report.json`)

| Scenariu | Numere |
| --- | --- |
| contract | 8 stări, 5 terminale, 18 coduri de refuz, 6 motive de anulare, 56 de verificări |
| preflight | 17 scenarii, 15 refuzuri, 12+ coduri de refuz exercitate |
| curse | ofertă în timpul cursei păstrată, `PASSENGER_ABOARD`, `TAXI_ASSIGNED`, `BOUND_TO_TAXI` |
| lifecycle | 7 instanțe, totaluri `OFFERED=7, ACCEPTED=3, ACTIVE=3, COMPLETED=1, FAILED=1, CANCELLED=1, DECLINED=3, EXPIRED=1` |
| reload | seed `987654`, plan egal `true`, deadline egal `true`, amprentă egală `true`, cheie de recompensă egală `true` |
| istoric | 24/24 intrări, 6 aruncate, 1 071/4 096 unități de cod, 10 șabloane distincte |
| performanță | 6 oferte, 6 sonde de rută, maximum 1 sondă per ofertă, 0 sonde la `advance` |
| memorie | snapshot 1 892 bytes, istoric 2 843 bytes, plafon 32 de outcome-uri reținute |
| storage | 16 câmpuri de snapshot, 27 de câmpuri de instanță, `232-challenge-director-state-v1` |

## Comenzi executate și rezultate reale

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, zero avertismente |
| `npm run format:check` | „All matched files use Prettier code style!”, exit 0 |
| `npm run check:architecture` | PASS (360 fișiere TypeScript), probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.”, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/challenge-director.test.ts" "tests/missions/challenge-director-report.test.ts"` | 29 teste, 29 pass, 0 fail |
| `npm test` | 2 720 teste, 2 720 pass, 0 fail, 95,8 s, exit 0 |
| `npm run missions:challenge-director` | `SUMMARY checks 56/56, overall PASS`; `report.json` + `report.md` scrise |
| `npm run missions:challenge-director -- --check` | „Challenge director report is current”, exit 0 |
| `PBI/Validate-Board.ps1` (după mutarea în In Progress) | `Valid: true`, `In Progress: 1` |
| `PBI/Validate-Board.ps1 -RequireDone '232'` | vezi raportul final al agentului |

## Fișiere atinse

- `src/missions/director.ts` — nou: directorul, graful de stări, preflight-ul, rezervarea, snapshot-ul.
- `src/missions/index.ts` — exporturile publice, adăugate la finalul listei existente.
- `tests/missions/challenge-director-fixture.ts` — lumea, portul de rută și faptele deterministe.
- `tests/missions/challenge-director.test.ts` — 26 de teste deterministe.
- `tests/missions/challenge-director-report.ts` — transcriptul determinist + markdown.
- `tests/missions/challenge-director-report.test.ts` — 3 teste care verifică raportul comis.
- `scripts/run-challenge-director-report.mjs` — scriptul de raport, cu `--check` și `--output`.
- `package.json` — `missions:challenge-director`, ultima intrare din blocul `"scripts"`.
- `Docs/28-provocari-random-si-revenire.md` — secțiunea „Contract implementat în V1 (PBI 232)”.
- `Docs/Evidence/232-challenge-director/README.md`, `report.json`, `report.md`.
- `PBI/Done/232-random_challenge_director.md` — mutat fizic din `In Progress`.

## Performanță (`performance_checks: simulation, memory, storage`)

Aplicat nivelul `targeted` din [politica de validare](../../validation-policy.md): corectitudine
izolată și cost structural local, fără benchmark hardware și fără a pretinde playtest uman.

- **simulation**: 6 oferte, 6 sonde de rută, maximum 1 sondă per ofertă; `advance` nu sondează și nu
  re-planifică (0 sonde după ofertă). Selecția rulează numai la cerere, cu un parcurs mărginit la 8
  candidați, deci nu există rerandomizare per frame și nu se rulează lumi suplimentare. Ceasul de
  perete este `NOT_MEASURED`.
- **memory**: snapshot 1 892 bytes, istoric 2 843 bytes; plafoane finite: 24 de intrări / 4 096 de
  unități de cod pentru istoric, 32 de outcome-uri reținute / 16 384 de unități de cod. Baseline-ul
  înainte este catalogul 231 (fără director), care rămâne neschimbat.
- **storage**: snapshotul are 16 câmpuri, instanța 27; `restore` validează fiecare câmp înainte de a
  aplica ceva, iar un document modificat este refuzat cu `SNAPSHOT_INVALID`. Timpul de scriere pe disc
  este `NOT_MEASURED`: adapterul durabil rămâne la 234, iar aici se măsoară forma și mărimea
  documentului.
- **frame / GPU / heap**: `NOT_MEASURED` — modulul nu are randare, meshuri, texturi, worker-e sau buclă
  de frame.
- **Vizual**: `N/A` — contractul nu are UI; offer card-ul, panoul și feedbackul rămân la 233.

## Limitări

- Costul este structural: nu s-au măsurat timpi de perete, FPS, heap exact sau hardware. Un număr de
  operații determinist nu este prezentat ca debit real.
- Portul de rută este un contract, nu plannerul 041 real: compoziția trebuie să îl lege de plannerul
  existent. În dovezi și teste este un dublu determinist.
- Rezervarea și suspendarea dispatchului sunt expuse ca date (`dispatchSuspended: true`,
  `rideRequestId`); aplicarea lor pe dispecerul 060 real aparține stratului de compoziție, pentru că
  acest PBI nu are voie să modifice `src/fleet/`.
- `challengeHistoryEntries` este `null` în manifest; plafonul de 24 de intrări / 4 096 de unități de
  cod este o admitere provizorie, nu un buget calibrat.
- Creditul XP, recordurile de reluare, panoul de provocări și conectarea la daily rămân la 233; aici
  outcome-ul notează doar politica autorată și `claimed: false`.
- Nu s-a executat un playtest uman; duratele, cooldown-ul și recompensele rămân propuneri de
  calibrare.

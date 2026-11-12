# Dovezi 231 — catalog de provocări și evaluatori

Contract: `231-challenge-catalog-v1` · catalog: `231-challenge-templates-v1` · evaluatori:
`231-challenge-evaluators-v1` · prerechizite: `231-challenge-capabilities-v1` · modul ales:
**`src/missions/`** (`src/missions/challenges.ts`) · nivel de validare: `targeted`.

## Ce s-a livrat

Un singur contract determinist pentru catalogul de 12 provocări și pentru evaluatorii lor. Nu
există un al doilea sistem de obiective: fiecare șablon are un `objectiveKind` din vocabularul închis
și un evaluator pur peste fapte reale (checkpointuri, zone, dropoff, confort 085/139, parcare, drift,
obiecte distruse, LEARNING). Modulul nu conține director de oferte, lifecycle de instanță, UI, istoric
sau credit XP; acelea rămân la 232/233.

| Componentă | Ce face exact | Ce nu face |
| --- | --- | --- |
| `createChallengeTemplateCatalog` | livrează cele 12 șabloane versionate, cu sesiuni, zone, deadline, buget de incidente, `rewardPolicy`, reguli R/reluare și dialog legat de evenimente | nu planifică oferte și nu creează instanțe |
| `challengePrerequisitesMissing` | numește fiecare prerechizită lipsă: sesiune, control, clasă, zonă, capabilitate, cheie LEARNING, progres de campanie | nu inventează o zonă sau o clasă lipsă |
| `eligibleChallengeTemplates` | separă șabloanele ofertabile de cele excluse, pentru un snapshot real | nu rerandomizează până „iese” un șablon |
| `planChallengeAttempt` | derivă din seed explicit ținta, marja, deadline-ul, bugetul, zonele concrete și pragurile versiunii | nu citește ceasul, profilul sau `Math.random` |
| `evaluateChallenge` | judecă faptele într-o fereastră explicită de tick-uri 60 Hz și întoarce un verdict înghețat, cu motiv închis și amprentă | nu finalizează pe text HUD și nu acordă XP |
| `challengeDailyFamilies` | expune cele trei șabloane cu obiectiv 116 real ca intrare versionată pentru generatorul 211 | nu slăbește evaluatorul celorlalte nouă |

## Cele 12 șabloane și familiile

| Familie | Șabloane | Obiectiv |
| --- | --- | --- |
| EFFICIENCY | `challenge-maternity-run`, `challenge-last-minute-airport` | dropoff la spital/terminal înainte de deadline, cu buget de incidente |
| EXPLORATION | `challenge-toilet-sos`, `challenge-forgot-something`, `challenge-city-tour-backwards` | alegerea unei toalete, două puncte în ordine, trei checkpointuri în ordine ciudată |
| DISCIPLINE | `challenge-influencer-no-spill`, `challenge-cake-delivery` | accelerație și jerk sub pragurile de confort 139 |
| PRECISION | `challenge-influencer-single-frame`, `challenge-influencer-parking-drift`, `challenge-valet-with-style` | checkpointuri în ordine, timp de drift valid, oprire cu viteză și orientare |
| CONTROLLED_DESTRUCTION | `challenge-influencer-demolition` | cinci obiecte distincte în aleea de demolare, exclusiv Haos |
| EXPERIMENT | `challenge-city-copies-me` | publicare LEARNING și observarea efectului în flotă |

Titlurile sunt unice, iar semnătura de obiectiv (familie, obiectiv, evaluator, zone, ținte, deadline,
praguri) este unică pentru toate cele 12. Un catalog sub 12 șabloane, fără toate cele șase familii sau
cu două șabloane identice este refuzat.

## Cum este calculabil un obiectiv

`planChallengeAttempt` produce un `ChallengeObjectiveSnapshot` cu evaluator și versiune, țintă,
pragurile complete ale versiunii, zonele concrete în ordinea vizitei, deadline-ul absolut în tick-uri,
bugetul de incidente și cheia LEARNING (doar pentru obiectivul LEARNING). `evaluateChallenge` citește
doar fapte reale și aplică o precedență fixă: excludere (sesiune/control/zonă), buget de incidente,
încălcare dură a obiectivului, ținta atinsă înainte de deadline, deadline-ul, apoi progresul.

Evaluatorii livrați:

| Evaluator | Prag versionat | Regulă |
| --- | --- | --- |
| `checkpoint-sequence` | `stopToleranceS` (2 s implicit) | checkpointuri în ordine; o traversare care sare peste următorul este `ORDER_VIOLATION`; o oprire peste toleranță este `STOP_TOO_LONG` |
| `zone-order` | `anyOf` (0/1) | prefix în ordinea cerută sau „oricare dintr-o listă eligibilă”; o vizită în afara ordinii este `ORDER_VIOLATION` |
| `timed-dropoff` | — | dropoff în zona cerută înainte de deadline, cu bugetul de incidente |
| `comfort-budget` | `maxAccelerationMps2`, `maxJerkMps3` (maxim sursa 139) | pasager la bord; un vârf peste prag este `COMFORT_LIMIT`; un prag mai permisiv decât 139 este refuzat de validator |
| `parking-precision` | `maxSpeedMps`, `maxHeadingErrorRad`, `minDwellS` | oprire în zonă, sub viteză, sub eroarea de orientare și peste durata minimă |
| `drift-accumulation` | `minSpeedMps` ≥ 3, `minSlipAngleRad` ≥ 0,1, `minSeconds` | doar eșantioane din zona de drift, la viteză și unghi minime, fără impuls de coliziune |
| `distinct-destruction` | — | obiecte distincte rupte în alee; duplicatele și obiectele din altă zonă nu contorizează; doar Haos |
| `learning-observation` | `maxObservationDelayTicks` | cheie suportată, activare și observare a efectului în fereastra declarată |

## Cum excluzi un șablon cu prerechizite lipsă

Snapshotul de capabilități este explicit: sesiune (`ACADEMY`/`CHAOS`), moduri de control, clase de
vehicul, zone concrete cu tip, capabilități închise, chei LEARNING implementate și progres de
campanie. `challengePrerequisitesMissing` întoarce liste ca `SESSION:ACADEMY`,
`VEHICLE_CLASS:sedan`, `ZONE:HOSPITAL`, `CAPABILITY:DESTRUCTIBLE_DECOR`,
`LEARNING_KEY:speed_delta_urban`, `CAMPAIGN:1`. `eligibleChallengeTemplates` exclude șablonul înainte
de ofertă, iar `planChallengeAttempt` refuză explicit planificarea lui. Un snapshot „lean” (compact, fără
zone, fără chei, fără progres, fără decor destructibil) lasă ofertabile doar cele două șabloane de
confort, care nu cer nimic din cele lipsă; adăugarea spitalului realizează imediat urgența la
maternitate.

Vocabularul de capabilități nu conține pietoni V2 sau mers V3. Un șablon care ar cere
`PEDESTRIANS_V2` este refuzat cu mesaj explicit, nu acceptat și apoi eșuat în scenă.

## Cum garantez determinismul evaluatorilor

Nu există ceas de perete, `Math.random`, DOM, renderer sau citire de profil. Fereastra de fapte are
ambele capete explicite, iar orice fapt în afara ferestrei este refuzat. Evaluatorii sortează listele
după tick (și după identitate la egalitate), deci o listă permutată produce același verdict. Verdictul
este înghețat și are o amprentă FNV-1a peste evaluator, versiune, status, motiv, progres, țintă,
deadline, buget și valorile măsurate. În raport, 1 200 de evaluări (100 pe șablon) produc exact 12
amprente distincte, iar o clonă de reload și o listă inversată produc aceiași octeți.

## Drumul R/reluare și recompensa

Fiecare șablon declară aceleași reguli închise: `R` repornește cu instanță nouă
(`NEW_INSTANCE`), rezultatul unei reluări este o identitate nouă, resetul orașului și părăsirea
sesiunii închid încercarea fără pierdere de XP, iar reload-ul restaurează deadline-ul. `rewardPolicy`
are `academyXp` propus (0 pentru șablonul exclusiv Haos), `LOCAL_RECORD_ONLY` în Haos, cheie de
recompensă pe familie și dată, doar prima familie a zilei poate plăti XP și `replayXp = 0`. Creditul
efectiv rămâne la 233.

## Driftul nu se acumulează prin rotire pe loc sau impuls

Trei scenarii deterministe, câte 240 de tick-uri:

| Caz | Secunde valide | Tick-uri raportate |
| --- | --- | --- |
| drift valid (8 m/s, 0,4 rad) | 4 | — |
| rotire pe loc (0,2 m/s, 1,3 rad) | 0 | 240 `rotationOnlyTicks` |
| impuls de coliziune (12 m/s, 60 N·s) | 0 | 240 `collisionTicks` |
| în afara zonei de drift | 0 | — |

Pragurile minime sunt impuse de validator (`minSpeedMps ≥ 3`, `minSlipAngleRad ≥ 0,1`), deci un
catalog extern nu le poate slăbi ca să farmeze drift.

## Distrugerea și Haos

Un șir cu 7 evenimente pe 4 obiecte distincte (plus un obiect din altă zonă) raportează
`distinctDestroyed = 4` și rămâne `INCOMPLETE`; cinci obiecte distincte produc `PASSED`. Evaluarea
aceluiași obiectiv cu sesiunea `ACADEMY` este `EXCLUDED` / `SESSION_NOT_ALLOWED`. Șablonul este
singurul cu sesiunea `CHAOS`, cere `DESTRUCTIBLE_DECOR` și are `academyXp = 0`.

## Dialog, filmare și validator

Fiecare șablon are patru replici (ofertă, progres, succes, eșec); replicile de progres, succes și
eșec sunt legate de evenimente de observare existente, iar eșecul de `DEADLINE_EXPIRED` sau
`INCIDENT`. Cele patru șabloane „influencer” declară `filming.premise = true` și
`capture = INTERNAL_REPLAY`; `socialUpload` este literal `false`, iar un text care promite upload sau
o rețea socială este refuzat.

Validatorul mai respinge: evaluator necunoscut sau nepotrivit, tip de zonă neacceptat, plan de rută
lipsă/prea scurt, țintă peste numărul de zone, deadline peste fereastra de 1–4 minute, praguri de
confort prea permisive, praguri de drift sub podea, reguli R/reluare invalide, cheie LEARNING pe un
obiectiv MANUAL, cheie nesuportată, demolarea în Academie, pietoni/mers, catalog prea mic și două
șabloane cu același obiectiv.

## Numere reale (din `report.json`)

| Scenariu | Numere |
| --- | --- |
| catalog | 12 șabloane, 6 familii, 8 evaluatori, 48 de replici, 4 șabloane cu premisa de filmare, 15 praguri declarate, 925 XP propus în Academie, 1 șablon exclusiv Haos |
| eligibilitate | lean: 2 ofertabile / 10 excluse cu 15 motive distincte; Academie completă: 11 / 1 (demolition); Haos complet: 11 / 1 (experimentul LEARNING); cu spital: 3 ofertabile |
| evaluări | 12/12 fixture realiste `PASSED`, 12/12 fixture invalide refuzate (11 `FAILED`, 1 `EXCLUDED`), 8+ motive distincte |
| drift | valid 4 s; rotire 0 s / 240 tick-uri; coliziune 0 s / 240 tick-uri; în afara zonei 0 s |
| distrugere | 4 distincte deduplicate → `INCOMPLETE`; 5 distincte → `PASSED`; Academie → `EXCLUDED` |
| determinism | 1 200 evaluări, 12 amprente distincte, permutare egală `true`, clonă de reload egală `true` |
| compatibilitate 211 | catalogul livrat `211-daily-templates-v1` cu 6 familii neschimbat; bridge `231-challenge-daily-bridge-v1` cu 3 familii; generatorul produce 3 misiuni cu 3 identități distincte |
| performanță | 1 200 evaluări pure, 22 200 rânduri de fapte examinate, maximum 200 rânduri/verdict, maximum 200 eșantioane de drift |
| memorie | catalog 19 272 bytes, cel mai mare plan 1 152 bytes, cel mai mare document de fapte 20 661 bytes, cel mai mare verdict 455 bytes; capacitate finită 32 de șabloane |

## Comenzi executate și rezultate reale

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, zero avertismente |
| `npm run format:check` | „All matched files use Prettier code style!”, exit 0 |
| `npm run check:architecture` | PASS (358 fișiere TypeScript), probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.”, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/challenge-catalog.test.ts" "tests/missions/challenge-catalog-report.test.ts"` | 17 teste, 17 pass, 0 fail |
| `npm test` | 2 672 teste, 2 672 pass, 0 fail, 90,66 s, exit 0 |
| `npm run missions:challenges` | `SUMMARY checks 66/66, templates 12, families 6, overall PASS`; `report.json` + `report.md` scrise |
| `npm run missions:challenges -- --check` | `Challenge catalog report is current`, exit 0 |
| `PBI/Validate-Board.ps1` (după mutarea în In Progress) | `Valid: true`, `In Progress: 1` |
| `PBI/Validate-Board.ps1 -RequireDone '231'` | `Valid: true`, `Done: 178`, `In Progress: 0` |

## Fișiere atinse

- `src/missions/challenges.ts` — nou: catalogul, prerechizitele, planul, faptele și cei 8 evaluatori.
- `src/missions/index.ts` — exporturile publice, adăugate la finalul listei existente.
- `tests/missions/challenge-catalog-fixture.ts` — snapshoturi reale, planuri, fixture realiste și invalide.
- `tests/missions/challenge-catalog.test.ts` — 14 teste deterministe.
- `tests/missions/challenge-catalog-report.ts` — transcriptul determinist + markdown.
- `tests/missions/challenge-catalog-report.test.ts` — 3 teste care verifică raportul comis.
- `scripts/run-challenge-catalog-report.mjs` — scriptul de raport, cu `--check` și `--output`.
- `package.json` — `missions:challenges`, ultima intrare din blocul `"scripts"`.
- `Docs/28-provocari-random-si-revenire.md` — secțiunea „Contract implementat în V1 (PBI 231)”.
- `Docs/Evidence/231-challenge-catalog/README.md`, `report.json`, `report.md`.
- `PBI/Done/231-random_challenge_catalog.md` — mutat fizic din `In Progress`.

## Performanță (`performance_checks: simulation, memory`)

Aplicat nivelul `targeted` din [politica de validare](../../validation-policy.md): corectitudine
izolată și cost structural local, fără benchmark hardware și fără a pretinde playtest uman.

- **simulation**: 1 200 de evaluări pure (100 pe șablon), 22 200 de rânduri de fapte examinate,
  maximum 200 de rânduri/verdict și maximum 200 de eșantioane de drift într-un document. Ceasul de
  perete este `NOT_MEASURED`: raportul este determinist și nu pretinde debit sau FPS. Baseline-ul
  înainte este catalogul 211 (6 familii, 3 misiuni pe zi), care rămâne neschimbat și funcționează cu
  bridge-ul de 3 familii.
- **memory**: documentul catalogului are 19 272 bytes, cel mai mare plan 1 152 bytes, cel mai mare
  document de fapte 20 661 bytes, cel mai mare verdict 455 bytes. Capacitatea este finită: 32 de
  șabloane, liste de fapte plafonate (32 vizite, 16 checkpointuri, 20 000 eșantioane de drift/comfort,
  128 distrugeri). `challengeHistoryEntries` este `null` în [manifest](../../performance-budgets.json);
  lacuna este raportată explicit, iar istoricul durabil rămâne la 232/234.
- **frame / GPU / heap**: `NOT_MEASURED` — modulul nu are randare, meshuri, texturi, worker-e sau
  buclă de frame; nu se revendică FPS, latență, heap exact sau soak.
- **Vizual**: `N/A` — contractul nu are UI; panoul, offer card-ul și feedbackul rămân la 233.

## Limitări

- Nu s-a executat un playtest uman: umorul și calibrarea pragurilor rămân propuneri, marcate
  `PROVISIONAL_UNCALIBRATED`; validarea retenției este 235. Dialogul este verificat ca legătură la
  evenimente reale și ca premisă internă, nu ca reacție măsurată a jucătorilor.
- Zonele sunt declarate ca tipuri, iar snapshotul de capabilități furnizează ID-urile concrete.
  Fezabilitatea reală a rutei pe graful hărții și selectarea ofertei rămân la 232; 231 verifică
  structura, deadline-ul pozitiv și numărul de zone.
- Nu există credit XP, istoric durabil, panou sau reluare persistentă; acestea sunt explicit lăsate
  pentru 233. `challengeHistoryEntries` rămâne `null` în manifest, cu plafon propriu de catalog.
- Costul este structural: nu s-au măsurat timpi de perete, FPS, heap exact sau hardware. Un număr de
  operații determinist nu este prezentat ca debit real.
- Cele nouă șabloane fără obiectiv 116 nu trec prin bridge-ul zilnic; ele au evaluatori proprii și se
  conectează la 233. Bridge-ul nu slăbește niciun obiectiv ca să încapă în vocabularul 116.

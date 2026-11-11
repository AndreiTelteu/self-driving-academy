# 142 — rerulare din snapshot cu profil ales

Contract `142-experiment-rerun-v1`. Scenariul este rulat din nou, din starea restaurată a snapshotului 140, cu un seed de bază explicit și cu două profile publicate. Oportunitățile sunt re-decise de politicile reale 050 (semnale) și 051 (STOP); modulul nu are un al doilea motor de decizie și nu reconstituie lumea din transformări.

## Cum pornește rerularea din snapshot

Rerularea nu are un format propriu de start. `runExperimentRerun` primește cererea 140 completă și o încarcă prin `runExperimentSnapshot` cu exact porturile 206 injectate de compoziție (`captureWorldSnapshot`, `readWorldSnapshot`, `decodeWorldCheckpoint`). Dacă 140 refuză, rerularea se oprește în etapa `SNAPSHOT` cu `SNAPSHOT_REFUSED` și codurile 140 nemodificate; nu există continuare tacită.

Snapshotul folosit este cel real al fixture-ului 206: 70 de vehicule (30 taxiuri + 40 civile), 30 de pasageri, 8 semafoare, 64 de oportunități, 3 segmente, dispecer cu 3 joburi `PENDING` + 1 rezultat acceptat.

| Fapt de start | Valoare |
| --- | --- |
| tick | 60 |
| bytes | 64 378 |
| checksum `SHA-256` | `c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5` |
| intrări de secțiune comparate de 140 | 287 |
| **câmpuri frunză comparate de 140** | **3 080** |
| diferențe stocate vs restaurate | **0** |
| `ticksAdvanced` | 0 |
| `worldEpoch` / `profileId` / `learningEpoch` | 1 / `profile-1` / 2 |
| seed RNG din snapshot | 6 221 086 (`0x5eed1e`) |
| numărători pe secțiuni | 70 vehicule, 70 controlleri, 30 curse, 30 pasageri, 3 segmente, 64 oportunități, 8 semafoare, 4 rânduri de dispecer, 3 joburi de learning |

Identitatea stării de start este raportată identic pentru ambele rulări (`sameState: true`), iar cererea are un singur `requestDigest` (`sameRequest: true`): snapshot, seed de bază, orizont și instanțe de oportunitate sunt aceleași; singurul lucru care diferă este profilul.

## Seed explicit și reproductibil

| Nivel | Zecimal | Hex |
| --- | ---: | --- |
| seed de bază | 142 000 | `00022ab0` |
| seed de scenariu | 1 360 032 776 | `51107408` |

Derivarea este cea a adresării 006, deja livrată: `deriveScenarioSeed(baseSeed, scenarioId)` → `deriveVehicleSeed(scenarioSeed, vehicleId)` → `deriveOpportunitySeed(vehicleSeed, opportunityKey)`. Ultimul pas este exact eșantionul folosit de 050 (`red-compliance`) și 051 (`full-stop`), deci tabelul de adresare din rezultat (`vehicleSeed`, `opportunitySeed` pentru fiecare oportunitate) reproduce complet rularea.

Identitatea profilului **nu** intră în seed (`profileIdentityInSeed: false`). Consecința este măsurată: pentru toate cele 24 de oportunități, `sampledUnit` este identic între profile, iar `SEED_DIVERGENCE` este 0. O diferență nu poate fi deci confundată cu o reeșantionare.

## Cele două profile și ce diferă

Profilele sunt cele două profile cunoscute 105 (`PRUDENT`, `IMPULSIVE`), publicate prin granița reală 041 cu exact cele șapte chei citite de 050/051.

| Parametru | `prudent-142@1` | `impulsive-142@1` |
| --- | ---: | ---: |
| `red_stop_probability` | 1 | 0.75 |
| `green_start_delay` | 0.9 | 0.35 |
| `red_stop_line_offset` | 1.2 | 0.6 |
| `late_red_brake_threshold` | 2.6 | 1.4 |
| `stop_full_probability` | 1 | 0.6 |
| `stop_dwell_time` | 1.4 | 0.5 |
| `stop_line_offset` | 1.1 | 0.8 |

| Profil | Decizii | Cer stop | Continuă | Pe acțiune | Digest trasare |
| --- | ---: | ---: | ---: | --- | --- |
| `prudent-142@1` | 24 | 20 | 4 | `APPROACH` 7, `HOLD` 3, `PROCEED` 2, `RELEASE` 2, `STOP` 10 | `daf459fc` |
| `impulsive-142@1` | 24 | 12 | 12 | `APPROACH` 5, `PROCEED` 5, `RELEASE` 3, `ROLL_THROUGH` 4, `STOP` 7 | `525ff680` |

## Divergența oportunităților

24 de oportunități comparate: **16 identice**, **8 divergente**. Distribuția cauzelor: 7 `PROBABILITY_THRESHOLD`, 1 `GEOMETRY_PARAMETER`, **0** `SEED_DIVERGENCE`, **0** `UNCLASSIFIED`. Fiecare divergență numește parametrul care o explică, iar parametrul este numit numai dacă valoarea lui diferă efectiv între profile.

| Oportunitate | Tip | Tick | Vehicul | Stânga | Dreapta | Cauză | Parametru | Eșantion |
| --- | --- | ---: | --- | --- | --- | --- | --- | ---: |
| `opportunity-04` | STOP | 65 | `taxi-05` | `HOLD`/`DWELL_IN_PROGRESS` | `ROLL_THROUGH`/`ROLLING_STOP_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `stop_full_probability` | 0.923773 |
| `opportunity-06` | STOP | 67 | `taxi-07` | `APPROACH`/`STOP_APPROACH` | `ROLL_THROUGH`/`ROLLING_STOP_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `stop_full_probability` | 0.733001 |
| `opportunity-07` | SIGNAL | 68 | `taxi-08` | `STOP`/`STOP_LINE_APPROACH` | `PROCEED`/`CROSS_RED_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `red_stop_probability` | 0.881389 |
| `opportunity-08` | STOP | 69 | `taxi-09` | `APPROACH`/`STOP_APPROACH` | `ROLL_THROUGH`/`ROLLING_STOP_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `stop_full_probability` | 0.788191 |
| `opportunity-12` | STOP | 73 | `taxi-13` | `HOLD`/`DWELL_IN_PROGRESS` | `RELEASE`/`DWELL_SATISFIED` | `GEOMETRY_PARAMETER` | `stop_dwell_time` | 0.246634 |
| `opportunity-15` | SIGNAL | 76 | `taxi-16` | `STOP`/`STOP_LINE_APPROACH` | `PROCEED`/`CROSS_RED_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `red_stop_probability` | 0.848123 |
| `opportunity-20` | STOP | 81 | `taxi-21` | `HOLD`/`DWELL_IN_PROGRESS` | `ROLL_THROUGH`/`ROLLING_STOP_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `stop_full_probability` | 0.833924 |
| `opportunity-21` | SIGNAL | 82 | `taxi-22` | `STOP`/`STOP_LINE_APPROACH` | `PROCEED`/`CROSS_RED_BY_PROFILE` | `PROBABILITY_THRESHOLD` | `red_stop_probability` | 0.983588 |

Atribuirea are o ordine documentată, verificată de teste dedicate care mișcă **un singur** parametru: `red_stop_line_offset` (ambele profile se opresc, dar punctul de oprire diferă) și `late_red_brake_threshold` (niciunul nu se oprește pentru roșu, dar orizontul de frânare decide între `LATE_RED_BRAKE` și `CROSS_RED_BY_PROFILE`).

## Divergență fără promisiune bit-exact

`EXPERIMENT_RERUN_REPRODUCIBILITY` este declarat, nu implicit: `scope: 'SAME_PLATFORM_SAME_SEED'`, `crossPlatformBitExactness: false`. Reproductibilitatea este promisă numai pe aceeași platformă, cu același snapshot și același seed de bază. Rerularea citește flotanții produși de platforma care a scris snapshotul, deci identitatea bit cu bit între browsere, GPU-uri sau backenduri de fizică diferite nu este promisă. Divergența este raportată ca fapt per oportunitate, cu tick, acțiune, motiv și parametru — nu ca demonstrație că un singur parametru a cauzat toate diferențele.

Repetarea aceleiași cereri produce aceleași rezultate: `repeatable: true`, cu digeste de trasare identice (`daf459fc`, `525ff680`).

## Izolarea ledger-elor

Rerularea refolosește izolarea 140: experimentul primește doar `fingerprint`, `fork`, `write` (refuzat) și `verify`, fără mutator al rândurilor live. Amprenta este `SHA-256`-ul formei canonice a read model-ului real și este recalculată înainte și după.

| Ledger | Amprentă |
| --- | --- |
| learning (093) | `5f9bdd0d3962f6e8f25b1d4264d0cccb4bcde4f22369479e7fe1aaeac1409a51` |
| rewards (125) | `719e691629d32c21b2582bfa63ce9ef292e9a500f4848beb29374aa133bbf1b6` |
| kpi (137), înainte și după | `0be4b6ba31b22957f3141cbab7b433423604e0aa7373b597be4fbbed8b94d10c` |

`unchanged: true`, `liveWrites: 0`, `refusedWrites: 0`, `copyWrites: 0`. Proba de control folosește un port care se schimbă la a doua citire: rerularea este refuzată cu `LEDGER_CHANGED` în etapa `LEDGER` și calea `ledger.KPI`, deci verificarea nu este o constantă. Nu se scrie în profil, XP, revenue sau misiuni: modulul nu are acces la un store de profil și nici la un scriitor de recompense.

## Probe de refuz

| Probă | Etapă | Coduri | Căi |
| --- | --- | --- | --- |
| snapshot incompatibil (engine + fizică + hartă) | `SNAPSHOT` | `SNAPSHOT_REFUSED` (`ENGINE_VERSION_MISMATCH`, `PHYSICS_BACKEND_MISMATCH`, `MAP_VERSION_MISMATCH`) | — |
| profil fără `stop_full_probability` | `PROFILE` | `PROFILE_INCOMPLETE` | `profiles[0].profile.parameters.stop_full_probability` |
| oportunitate peste orizont | `SCENARIO` | `TICK_OUT_OF_HORIZON` | `scenario.opportunities[0].decisionTick` |
| două rulări cu aceeași versiune de profil | `PROFILE` | `PROFILE_DUPLICATE` | `profiles[1].profile.versionId` |
| ledger care se schimbă în timpul rulării | `LEDGER` | `LEDGER_CHANGED` | `ledger.KPI` |

Testele acoperă suplimentar `OPPORTUNITY_UNKNOWN`, `VEHICLE_UNKNOWN`, `SIGNAL_UNKNOWN` și `PROFILE_PARAMETER_OUT_OF_RANGE`, toate raportate simultan cu toate căile afectate.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | PASS (0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (346 fișiere TypeScript; toate probele negative trec) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | 2 511 teste, 2 511 trecute, 0 eșuate, 0 sărite (70,4 s) |
| `node --import ./scripts/register-typescript.mjs --test "tests/experiments/experiment-rerun.test.ts"` | 10 teste, 10 trecute, 0 eșuate |
| `npm run experiment:rerun` | 25/25 verificări, 5 probe de refuz, 24 oportunități, 8 divergențe, PASS |
| `npm run experiment:rerun -- --check` | „Experiment rerun report is current” |

Raportul complet, determinist: [report.json](report.json) și [report.md](report.md). Niciun pas nu folosește ceas de perete, `Math.random` sau măsurători ale mașinii, deci `--check` este o comparație exactă, nu o proiecție.

## Fișiere atinse

- `src/experiments/experiment-rerun.ts` — contractul 142 (cererea de scenariu, lanțul de seed, rularea prin 050/051, comparația și atribuirea divergenței, refuzurile).
- `src/experiments/index.ts` — un singur export adăugat, la finalul listei.
- `tests/experiments/experiment-rerun-fixture.ts` — fixture determinist (lumea 206/140, profilele reale 105 publicate prin 041, scenariul de 24 de oportunități, porturile de control).
- `tests/experiments/experiment-rerun.test.ts` — 10 teste deterministe.
- `tests/experiments/experiment-rerun-report.ts` — raportul determinist cu verificări și tabel markdown.
- `scripts/run-experiment-rerun-report.mjs` — scriptul cu `--check` și `--output`.
- `package.json` — intrarea `experiment:rerun`, ultima din blocul `"scripts"`.
- `Docs/14-experimente-si-indicatori.md` — secțiunea contractului, adăugată la finalul fișierului.
- `Docs/Evidence/142-experiment-rerun/` — acest README, `report.json`, `report.md`.

## Limitări

- Nivelul de validare este funcțional izolat, conform [politicii](../../validation-policy.md): fixture determinist, fără browser, GPU sau măsurători de cost. Nu se pretinde identitate bit cu bit între platforme.
- Rerularea re-decide oportunitățile din starea restaurată; nu rulează pipeline-ul complet Babylon/randare și nu avansează fizica. Geometria de apropiere (`distanceToStopLineM`, `speedMps`, faza semaforului) este intrare de scenariu, identică pentru ambele profile și raportată în cerere; identitatea oportunității, vehiculul și semaforul sunt validate față de snapshot.
- Compoziția (teste și raport) injectează funcțiile 206 și ledger-ele reale; `src/experiments` nu importă `src/persistence`, pentru că politica de arhitectură interzice unui modul de domeniu să depindă de adaptor. Nu există legare în `src/app` în acest PBI.
- Digestul de trasare este `FNV-1a` pe 32 de biți peste textul canonic al deciziilor: este un detector de egalitate determinist, nu un hash criptografic.
- Atribuirea numește un singur parametru, în ordinea documentată din contract; când niciun parametru nu diferă, cauza rămâne `UNCLASSIFIED`, ca să nu inventeze o explicație. Pe fixture-ul de referință `UNCLASSIFIED` este 0.

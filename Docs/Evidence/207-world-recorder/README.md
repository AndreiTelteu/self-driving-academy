# 207 — Recorder pentru replay taxiuri, civile și incidente AUTO

Dovezi pentru PBI 207 (modulul Telemetrie/replay, release V1). Contractul implementat este
`207-world-recorder-v1` / `207-world-replay-chunk-v1`; regulile sunt descrise în
[Docs/09](../../09-telemetrie-si-oportunitati.md) (secțiunea „Fluxuri separate de înregistrare”) și
[Docs/14](../../14-experimente-si-indicatori.md) (secțiunea „Recorder pentru replay-ul lumii”).

## Rezultatul implementării

Un recorder de lume reală, mărginit, care înregistrează toate taxiurile și civilele — inclusiv cele
din afara camerei și cele în `AUTO` — ca o fereastră fixată în jurul incidentelor, cu tick exact pe
fiecare fapt și cu ferestre parțiale declarate explicit. Nu este renderer, nu este runner de
experimente, nu este adaptor de persistență și nu produce nimic pentru LEARNING.

- `src/replay/world-recorder.ts` (nou) — `createWorldRecorder`: inel circular cu capacitate fixă,
  plafon de bytes pe RAM, rată de scriere pe secundă simulată, rezervă de chunkuri fixate și plafon
  de incidente pe minută. Fiecare refuz este contorizat; recorder-ul nu aruncă și nu blochează
  simularea. `recordEvent` păstrează tick-ul exact și este idempotent după `eventId`;
  `recordCheckpoint` ancoră chunkurile pe snapshotul complet 206; `sealIncident`/`finalize` închid
  fereastra și produc un chunk `207-world-replay-chunk-v1` verificabil cu `SDA-CJSON-1` + `SHA-256`;
  `readWorldReplayChunk` verifică checksumul, numărul de bytes canonic, cadența eșantioanelor,
  tick-urile evenimentelor, anchorul 206, declarația de completitudine și interdicția de artefact
  LEARNING. `readReplaySample` decodează un tick observat, iar `interpolateReplayPose` declară
  interpolarea (`LINEAR` pentru poziție, `NLERP` pentru rotație) fără a pretinde fizică.
- `src/replay/index.ts` (nou) — entry point public al modulului.
- `tests/replay/world-recorder-fixtures.ts` (nou) — lumea deterministă de 40 de vehicule (20 taxiuri,
  20 civile, 6 semafoare), fără ceas și fără aleator; fiecare poziție este o funcție pură de tick.
- `tests/replay/world-recorder.test.ts` (nou) — 22 de teste țintă.
- `tests/replay/world-recorder-report.ts` (nou) — transcrierea deterministă (104 verificări) și
  măsurarea reală a costului.
- `scripts/run-world-recorder-report.mjs` (nou) — CLI `--check`, `--output`, `--cost`, `--samples`.
- `package.json` — scriptul `world:recorder`, adăugat la finalul blocului `scripts`.
- `Docs/09-telemetrie-si-oportunitati.md` — secțiunea contractului 207.
- `Docs/14-experimente-si-indicatori.md` — câmpurile reale ale chunkului și trimiterea la dovezi.

## Ce am păstrat, ce am schimbat în draftul întrerupt

Draftul existent (≈96 KB) avea deja modelul de date, inelul, plafoanele și cititorul. Am păstrat
structura, constantele de buget, vocabularul de respingere și cititorul. Am schimbat, cu motiv:

1. **Cheia incidentelor.** `sealIncident` căuta după `eventId`, dar `recordEvent`,
   `sealReadyIncidents` și `finalize` raportau `sessionId:incident:eventId`; un apel cu valoarea
   primită eșua cu `UNKNOWN_INCIDENT`. Harta folosește acum identitatea completă a incidentului.
2. **Ceasul recorder-ului.** `firstTick`/`lastTick`/`ticksAccepted` avansau înainte de procesarea
   faptelor de ciclu de viață, deci un cadru respins (capacitate de identități) avansa timpul și
   putea bloca tickurile următoare. Avansează numai după un cadru citit, ordonat și admis.
3. **Removal explicit vs. inferat.** Un cadru care anunța eliminarea unui vehicul încă prezent în
   listă producea `REMOVED` + `CREATED` inferat în același tick, apoi încă un `REMOVED` inferat.
   Eliminarea explicită este autoritară pentru tickul ei: nu mai resuscitează entitatea și nu mai
   este dublată de inferență.
4. **Anchorul.** Anchorul era ales pentru `pinnedFromTick` cerut, nu pentru fereastra chiar stocată,
   deci un clip care începea târziu sau era tăiat la plafonul de bytes raporta fals
   `CHECKPOINT_MISSING`. Anchorul este ales după clampare și după trimmare.
5. **Re-sigilarea.** `sealIncident` pe un incident deja sigilat, dar al cărui chunk fusese evacuat,
   re-construia tăcut un al doilea chunk din rânduri dispărute. Acum răspunde `CHUNK_EVICTED`.
6. **`finalize` repetat.** Al doilea apel raporta liste goale; acum raportează setul real de
   incidente sigilate (`chunkStatus` este ținut pe plan).
7. **Cititorul de chunk.** Verifică acum și `pinned`, integritatea declarată (`SHA-256` peste
   `SDA-CJSON-1`), numărul de bytes canonic, fereastra incidentului, anchorul fără referință,
   cadența declarată, declarația LEARNING (altfel `LEARNING_ARTIFACT`) și `camera.filterApplied`
   (altfel `INVALID_CHUNK`).
8. **Interpolarea.** Declarația spunea `TRANSFORMS`, dar exista doar interpolare de poziție. Am
   adăugat `rotationInterpolation: 'NLERP'`, `interpolateReplayRotation` și `interpolateReplayPose`,
   plus garda „aceeași entitate”.
9. **`sealTick` și statistici.** `sealTick` exista în payload dar nu în tip; `retainedSeconds` se
   calcula din primul eșantion al sesiunii, nu din inel; `entitiesKnown` raporta entitățile vii, nu
   tabela de identități.

## Verificări executate și rezultat

Toate comenzile au fost rulate în worktree-ul `.worktrees/recorder-207-01`, pe branch-ul
`loop-pbi/recorder-207-01`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (fără erori, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (307 TypeScript files)`, plus cele 4 seturi de probe negative |
| `npm run check:parameter-catalog` | PASS (`Parameter catalog is synchronized.`) |
| `npm test` (suita completă) | PASS — `tests 2125`, `pass 2125`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 67870.9597` |
| `node --import ./scripts/register-typescript.mjs --test tests/replay/world-recorder.test.ts` | PASS — `tests 22`, `pass 22`, `fail 0`, `duration_ms 2649.3793` |
| `npm run world:recorder` | PASS — `SUMMARY checks 104/104, overall PASS` |
| `npm run world:recorder -- --check` | PASS — `World recorder report is current: …\Docs\Evidence\207-world-recorder\report.json` |
| `npm run world:recorder -- --cost --samples 15` | PASS — `cost.json` / `cost.md` scrise pe această mașină |

Cele 22 de teste țintă:

1. toate taxiurile, civilele și vehiculele `AUTO` sunt înregistrate, inclusiv în afara camerei;
2. tick-ul exact al evenimentelor și cadența de transformări declarată;
3. fereastră completă = clip complet; închidere devreme = clip parțial declarat;
4. o captură care începe după fereastra cerută declară prefixul lipsă;
5. fereastra fixată în jurul incidentului și clasificarea citită dintr-un eșantion declarat;
6. incident numai `AUTO` în afara camerei, reținut ca atare;
7. chunk verificat `SDA-CJSON-1` + `SHA-256`; un rând modificat este refuzat;
8. un chunk fără anchorul 206 nu poate pretinde checkpointul;
9. inelul evacuează la plafonul de bytes și nu depășește bugetul RAM;
10. presiunea aruncă rânduri, dar nu oprește simularea și nu pierde evenimente exacte;
11. rezerva de chunkuri fixate este plafonată, cu evacuare deterministă;
12. rata de incidente pe minută este plafonată și refuzul este contorizat;
13. plafonul de bytes al chunkului taie rândurile vechi și declară tăierea;
14. crearea/eliminarea exactă și cea inferată sunt declarate ca atare;
15. evenimentele duplicate, străine și necunoscute sunt refuzate fără să strice chunkul;
16. o discontinuitate din fereastră (`WORLD_RESET`) este declarată;
17. recorder-ul este structural și comportamental în afara traseului LEARNING;
18. bus-ul 007 poate alimenta recorder-ul fără să schimbe contractul;
19. interpolarea este declarată, mărginită și doar între două observații ale aceleiași entități;
20. un crash pierde doar bufferul RAM, nicio promisiune durabilă și niciun chunk inventat;
21. un rând care nu poate fi ținut este refuzat cu motiv contorizat;
22. bugetele din contractul de performanță mărginesc modulul.

### Scenariile cerute de PBI

| Scenariu | Dovadă în `report.json` |
| --- | --- |
| incident numai `AUTO` în afara camerei | `window.autoOnly: true`, `window.visibility: OUTSIDE_CAMERA`, `window.classifiedFromTick: 498`; 40 de vehicule decodate la tickul incidentului, inclusiv `taxi-02` (`AUTO`, în afara camerei) |
| retenție | 468 eșantioane reținute (0–1401 la cadență 3), 18 720 rânduri de vehicul, inelul 1 894 464 bytes din plafonul de 15 728 640 |
| crash | `crash.chunksBefore: 0`, `crash.chunksAfterNewRecorder: 0`, `crash.samplesAfterNewRecorder: 0`, `crash.oldIncidentSealAfterRestart: UNKNOWN_INCIDENT`; sesiunea nouă se ancoră pe un checkpoint 206 nou (`rebuiltAnchorTick: 300`) și chunkul refăcut este `ACCEPTED` |
| chunk parțial | `partial.earlySealStatus: PARTIAL` cu `CAPTURE_FINALIZED_EARLY`; `partial.lateCaptureStatus: PARTIAL` cu `CAPTURE_STARTED_LATE`; `partial.trimmedStatus: PARTIAL` cu `CHUNK_BYTE_CAP` (19 135 bytes din 20 000) |
| presiune fără oprirea simulării | `pressure.admittedTicks: 340` din 340 oferite, `pressure.rejectedTicks: 0`, 74 rânduri aruncate, 50 evenimente înregistrate, 0 pierdute, 49 tickuri exacte păstrate; clipul declară `PRESSURED_ROWS_EVICTED` |

## Numere reale

Transcrierea deterministă este în [report.json](report.json) și [report.md](report.md): 104
verificări, fără ceas de perete, fără aleator. Se re-verifică cu `npm run world:recorder -- --check`.

| Metrică | Valoare reală |
| --- | --- |
| Vehicule înregistrate per tick | 40 (20 taxiuri + 20 civili) + 6 semafoare |
| Eșantioane reținute în scenariul principal | 468 · 18 720 rânduri · 2 340 în cameră / 16 380 în afara camerei |
| Rânduri `AUTO` | 11 232 |
| Fereastra incidentului | 0–1400 ticks (15 s înainte + 15 s după), 467 eșantioane, acoperire 1.0 înainte și după |
| Chunk (fereastră completă, 40 vehicule) | 831 905 bytes · 35 653 bytes per secundă simulată |
| Vârf de memorie facturată | 2 727 009 bytes din 25 165 824 (108‰) |
| Vârf de rată de scriere | 80 960 bytes/s din plafonul de 524 288 |
| Inel sub plafonul de bytes (2 MiB RAM) | 1 307 504 din 1 310 720 bytes, 78 evacuări, 16.1 s retenți |
| Rânduri refuzate de plafonul de rată (4 KiB/s) | 38, clip `PARTIAL` |
| Incidente | 2 înregistrate, 1 refuzat de plafonul de 2/minută |
| Ciclu de viață | 40 creări inferate, 1 eliminare exactă (tick 210), 1 eliminare inferată (tick 213) |
| Integritate | `SHA-256` `28370886…30eeb93`, 831 905 bytes, re-citire `ACCEPTED`, re-semnare/alterare refuzată cu codurile așteptate |

## Cost real (singura măsurătoare cu ceas de perete)

[cost.json](cost.json) și [cost.md](cost.md): 15 eșantioane, 1001 tickuri înregistrate cu 40 de
vehicule, un `COLLISION` la tick 590, sigilare explicită la tick 1000, `performance.now`.

| Fază | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| Înregistrare 1001 tickuri (0.041 ms/tick median) | 36.009 | 40.915 | 65.237 |
| Sigilarea unui chunk (606 KB) | 50.134 | 65.385 | 85.4 |
| Verificarea unui chunk sigilat | 28.378 | 38.298 | 66.197 |

Costul pe tick este sub 0.05 ms median, deci sub 1% din bugetul de tick autoritativ de 5.5 ms. Sigilarea
este operația scumpă (60–85 ms) și este plătită o dată per incident, la cererea apelantului.

## Fișiere atinse

- `src/replay/world-recorder.ts` (nou)
- `src/replay/index.ts` (nou)
- `tests/replay/world-recorder-fixtures.ts` (nou)
- `tests/replay/world-recorder.test.ts` (nou)
- `tests/replay/world-recorder-report.ts` (nou)
- `scripts/run-world-recorder-report.mjs` (nou)
- `package.json` (scriptul `world:recorder`, ultima intrare din `scripts`)
- `Docs/09-telemetrie-si-oportunitati.md` (secțiunea contractului 207)
- `Docs/14-experimente-si-indicatori.md` (câmpurile reale ale chunkului)
- `Docs/Evidence/207-world-recorder/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`
- `PBI/In Progress/207-world_recorder.md` → `PBI/Done/207-world_recorder.md`

## Limitări

- Sigilarea este sincronă: 50–85 ms pentru un chunk de 606 KB la 40 de vehicule, măsurat aici. Nu
  rulează în bucla de frame decât dacă apelantul o cere; mutarea pe un worker este ownership-ul
  221/222, nu al acestui contract.
- Recorder-ul nu are încă un consumator în joc: integrarea cu bucla fixed-tick, camera reală și
  bus-ul 007 rămâne de făcut la nivel de aplicație; aici contractul și testele sunt native, fără
  browser.
- Nu există persistență durabilă a chunkurilor: `takeChunk` predă chunkul, iar storage-ul
  (`optionalReplayStorageBytes`, 128 MiB) aparține modulelor de persistență/worker. Un crash pierde
  bufferul RAM — comportament intenționat și testat.
- Bugetele de RAM/rată sunt cele provizorii din `Docs/performance-budgets.json`
  (`recorderRamBytes` 32 MiB); măsurătorile de cost sunt ale acestei mașini, nu ale unei ținte de
  hardware și nu certifică performanța jocului integrat.
- Contorizarea de memorie este un contor de proprietate (bytes facturați per rând), nu o citire a
  heap-ului; supralicitează intenționat ca plafonul să nu fie subestimat.

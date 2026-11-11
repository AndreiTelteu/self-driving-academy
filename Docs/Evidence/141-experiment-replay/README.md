# 141 — replay vizual din stări înregistrate

Contract `141-experiment-replay-v1`. Replay-ul citește un clip sigilat `207-world-replay-chunk-v1`, ancorat pe snapshotul complet 206, și îl proiectează: nu rulează din nou politica de conducere, nu recalculează fizica și nu scrie nicio stare live. Rerularea rămâne o funcție distinctă.

## Ce redă recorderul

- **Surse reale, nu fixture-uri scrise de mână.** Clipul complet este produs de `createWorldRecorder` pe fixture-ul de 40 de vehicule al lui 207 (20 taxiuri + 20 civile), cu un eveniment 007 `COLLISION` real la tickul 400 între `taxi-02` și `taxi-03` — ambele `AUTO`, ambele în afara camerei. Fereastra fixată este 340..520 (1 s înainte, 2 s după), iar clipul are **129 377 bytes** și checksum-ul determinist `ff37f798e578fc928ef6d5660613843ff51e639b2bbea8349bc86692a4ded218`. Este re-citit prin `readWorldReplayChunk` înainte de orice proiecție.
- **Eșantioane observate.** 60 de rânduri la 20 Hz (342..519), 40 de vehicule în fiecare rând; camera este înregistrată (`filterApplied: false`), niciodată folosită ca filtru.
- **Incident AUTO, invizibil.** `autoOnly: true`, `controlModes: ['AUTO','AUTO']`, `visibility: OUTSIDE_CAMERA`, `invisible: true`, clasificare citită din tickul 399 (`classifiedFromTick`), `inCamera: false` pentru ambele entități.
- **Ciclul de viață, exact.** `civil-01` este creat la tickul 380 (prima linie observată: 381); `civil-03` este eliminat la tickul 406 (prezent pe linia 405). Niciun cadru de după 406 nu îl mai conține: **0 reînvieri**.

## Ce se întâmplă exact la seek

`player.seek()` (fără argument) țintește tickul incidentului 400. Tickul 400 nu cade pe cadența de 20 Hz, deci aterizarea este pe ultimul rând observat, **399**:

- `requestedTick: 400`, `landedTick: 399`, `exact: false`, `atIncident: true`;
- `missing: [{ reason: 'TICK_NOT_OBSERVED', fromTick: 400, toTick: 400 }]`;
- fereastra raportată: cerută 340..520, stocată 340..520, incident 400;
- poziția: `index 19` din 60, `firstObservedTick 342`, `lastObservedTick 519`.

Poza la tickul 400 este declarată `INTERPOLATED` (`LINEAR`, între rândurile adiacente 399 și 402, alpha 1/3) și este identică cu rezultatul helper-ului real al lui 207 (`interpolateReplayPose`), deci proiecția nu are o a doua formulă. Peste un gol de captură sau peste o creare/eliminare, poza este `ABSENT`, niciodată interpolată.

## Ce se întâmplă exact la pauză

`player.pause()` schimbă doar flagul:

- tickul rămâne 399, indexul rămâne 19;
- cadrul este **byte-identic** înainte/după (`frameIdentical: true`);
- poziția diferă doar prin `paused: true`;
- `play()` în timpul pauzei răspunde `PAUSED` cu `advancedTicks: 0`, iar `resume()` întoarce exact același cadru.

## Cum se demonstrează imutabilitatea

Amprentele sunt cele canonice, refolosite, nu reinventate:

| Fapt | Sursa amprentei |
| --- | --- |
| profil | `computeProfileVersionChecksum` al contractului de profil (`fnv1a64:883e718e91bbcbd5`) |
| venit | read model-ul 209 din digestia `kpi` |
| rating | read model-ul 209 din digestia `kpi` |
| misiuni | read model-ul 125 din digestia `rewards` |
| XP | read model-ul 122 din digestia `rewards`, plus `xpGranted` din 125 |

Ledger-ele sunt portul 140 (`ExperimentLedgerPort`), iar digestia este `SHA-256` peste forma canonică `SDA-CJSON-1`, exact rețeta lui 140:

- learning `5f9bdd0d3962f6e8f25b1d4264d0cccb4bcde4f22369479e7fe1aaeac1409a51`
- rewards `1e4092d867943b66ef2dcef9103fdb0271a6ac0c827097ec28375aaf8e5de1ef`
- kpi `715c118ae2024171eabcb1eae9e69d6eef649767be327054252433a566eea146`

Fiecare operație (`SEEK`, `PAUSE`, `RESUME`, `SEEK`, `PLAY`, `REPLAY`) își compară propriul înainte/după: toate rămân identice, `liveWrites: 0`, `changed: []`. Probele de control arată că detectorul nu este o constantă: o scriere reală de venit schimbă **numai** digestia `kpi`, iar activarea altui profil schimbă checksum-ul de profil.

## Cum se declară lipsa datelor

- **Clip sigilat devreme:** `PARTIAL`, `declaredPartial: true`, motiv `CAPTURE_FINALIZED_EARLY`, fereastra stocată se termină la 430, iar intervalul lipsă declarat este **431..520**.
- **Captură cu gol:** `PARTIAL`, intervalul pierdut **441..468** (10 poziții de cadență) este raportat ca `TICK_NOT_OBSERVED`; un pas peste gol listează exact ce a sărit, iar `poseAt(455)` este `ABSENT/TICK_NOT_OBSERVED`.
- **Vehicul creat/eliminat:** `poseAt(379, civil-01)` este `ABSENT/ENTITY_NOT_YET_CREATED`, `poseAt(406, civil-03)` este `ABSENT/ENTITY_REMOVED`.

## Refuzuri demonstrate (7)

| Probă | Etapă | Cod |
| --- | --- | --- |
| checksum corupt | `SOURCE` | `CHECKSUM_MISMATCH` |
| versiune de chunk necunoscută | `SOURCE` | `INVALID_SOURCE` |
| chunk ne-fixat (`pinned: false`) | `SOURCE` | `INVALID_SOURCE` |
| altă sesiune (re-semnată) | `IDENTITY` | `FOREIGN_SOURCE` |
| altă epocă de lume (re-semnată) | `IDENTITY` | `FOREIGN_SOURCE` |
| cerere incompletă | `REQUEST` | `INVALID_REQUEST` |
| seek în afara ferestrei | `SEEK` | `SEEK_OUT_OF_WINDOW` |

Un refuz nu produce player și nu atinge ledger-ele.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | PASS (0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (346 fișiere TypeScript; toate probele negative trec) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | 2 517 teste, 2 517 trecute, 0 eșuate, 0 sărite (84,6 s) |
| `node --import ./scripts/register-typescript.mjs --test "tests/experiments/experiment-replay.test.ts"` | 16 teste, 16 trecute, 0 eșuate |
| `npm run experiment:replay` | 74/74 verificări, 7 probe de refuz, 41 cadre, 60 eșantioane, PASS |
| `npm run experiment:replay -- --check` | „Experiment replay report is current” |

Raportul complet, determinist: [report.json](report.json) și [report.md](report.md). Transcriptul nu conține ceas de perete, `Math.random` sau măsurători ale mașinii, deci `--check` este o comparație exactă.

## Fișiere atinse

- `src/experiments/experiment-replay.ts` — contractul 141 (proiecție din stări înregistrate, seek, pauză, ciclu de viață, absențe declarate, imutabilitate).
- `src/experiments/index.ts` — export adăugat la finalul listei.
- `tests/experiments/experiment-replay-fixture.ts` — fixture determinist: clipurile reale 207 (complet, parțial, cu gol) și read model-urile live reale 093/122/125/137/209 plus profilul canonic.
- `tests/experiments/experiment-replay.test.ts` — 16 teste deterministe.
- `tests/experiments/experiment-replay-report.ts` + `scripts/run-experiment-replay-report.mjs` — raportul determinist cu `--check`.
- `Docs/14-experimente-si-indicatori.md` — secțiune nouă la final.
- `package.json` — `experiment:replay` la finalul blocului `scripts`.

## Limitări

- Replay-ul este o **proiecție de transformări decimate la 20 Hz**, nu o redare fizică: `physicsFidelity: false` și evenimentele păstrează tickul exact. Nu pretinde fidelitate fizică între eșantioane.
- Nu există încă un renderer vizual (Babylon) pentru clip; contractul livrează proiecția de date, pozițiile, semafoarele, ciclul de viață și declarațiile de absență pe care un view le poate desena. Randarea propriu-zisă rămâne în stratul de prezentare.
- Bufferul recorderului trăiește în RAM: replay-ul poate citi doar clipuri sigilate și păstrate; un clip evacuat nu poate fi re-sigilat (comportamentul 207).
- Costul de memorie/timp al proiecției nu este măsurat aici; PBI-ul nu are `performance_checks`, iar proiecția nu lucrează pe tick/frame în simularea live.

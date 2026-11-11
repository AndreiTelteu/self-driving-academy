# 222 — Pipeline plafonat pentru recorder, checkpoint și autosave

Dovezi pentru PBI 222 (modulul Persistență, release V1). Contractul implementat este
`222-bounded-pipeline-v1`, descris în [Docs/15](../../15-salvare-si-import-export.md) (secțiunea
„Contract implementat V1 (PBI 222)”) și ancorat în bugetele din
[Docs/25](../../25-performanta-contracte-si-benchmark.md) / `Docs/performance-budgets.json`
(`203-initial-1`). Recordul de replay rămâne al lui 207, documentul de checkpoint rămâne al lui 206.

## Rezultatul implementării

Un strat de integrare care ține captura pe tick și mută encode-ul, copia, transferul și commitul în
afara lui, cu **cel mult o generație în pregătire și una în commit** și cu un registru protejat care
nu pierde nimic la coalescing.

- `src/persistence/bounded-pipeline.ts` (nou) — `createBoundedPipeline`: mașina de stări
  `IDLE`/`PREPARING`/`COMMITTING`/`DISPOSED`, cele cinci etape măsurate separat cu ceas injectat,
  slotul unic de pregătire, banda unică de commit (checkpoint și chunkuri), coalescing cu un singur
  slot `pending`, registru protejat plafonat în bytes (`COMMERCIAL_EVENT`, `REWARD`,
  `LEARNING_INVALIDATION`, `OPPORTUNITY_TICK`), fereastră de replay plafonată în bytes cu evacuare
  deterministă și raport de vârstă a stării nesalvate în tick-uri.
- `src/persistence/bounded-pipeline-store.ts` (nou) — adaptorul durabil peste 127: faptele protejate
  devin rânduri `progress` cu identitate stabilă și generația ca revizie, scrise **înainte** de
  rândul unic de checkpoint al sesiunii; `recoverBoundedPipeline` citește ce a supraviețuit unui
  crash între generații. Adaptorul nu are `handoffChunk`, pentru că schema 127 nu are store de
  replay; pipeline-ul raportează atunci `replay.durable: false` în loc să pretindă persistență.
- `src/persistence/index.ts` — exporturile publice, adăugate la finalul fișierului.
- `tests/persistence/bounded-pipeline-fixtures.ts` (nou) — lumea 206 de 30 taxiuri + 40 civile
  (workload-ul maxim V1) alimentează și recorder-ul 207 real, prin același tick; adaptoare
  deterministe pentru sursă, evenimente, chunkuri și un store dublu care poate fi lent (promisiune
  ținută), plin (refuz închis) sau complet.
- `tests/persistence/bounded-pipeline.test.ts` (nou) — 22 de teste țintă.
- `tests/persistence/bounded-pipeline-report.ts` (nou) — transcrierea deterministă (67 de
  verificări) și măsurarea reală a costului.
- `scripts/run-bounded-pipeline-report.mjs` (nou) — CLI `--check`, `--output`, `--cost`, `--samples`.
- `package.json` — scriptul `pipeline:bounded`, adăugat la finalul blocului `scripts`.
- `Docs/15-salvare-si-import-export.md` — secțiunea contractului 222.

## Cum funcționează

**Separarea etapelor.** `capture` este citirea sincronă a lumii la limita de tick; este singura
etapă care rulează înainte ca `offerTick` să returneze și atinge ceasul exact de două ori.
`encode` (validare + `SDA-CJSON-1` + `SHA-256` prin 206), `copy` (imaginea de octeți deținută, a
cărei lungime trebuie să egaleze `bytes`-ul encodat), `transfer` (intrarea sincronă în adaptor, care
preia proprietatea imaginii) și `commit` (`await` pe tranzacția scurtă) rulează în microtask-uri,
după tick. Fiecare generație raportează cele cinci valori plus totalul lor.

**Generații și coalescing.** Un singur slot de pregătire și un singur slot de commit. Un tick care
sosește cât timp generația se encodează intră în slotul `pending` (cel mai nou câștigă); un tick mai
nou decât o generație pregătită dar neîncepută o înlocuiește; o generație care așteaptă banda de
commit este înlocuită la eliberarea ei dacă există un tick mai nou, astfel încât checkpointul scris
să fie cel mai proaspăt. Tick-urile mai vechi sunt refuzate cu `TICK_ORDER`.

**Ce nu se pierde.** Registrul protejat este independent de snapshot și de fereastra de replay. Un
fapt se atașează următoarei generații doar dacă `tick`-ul lui este ≤ tickul generației și este
eliberat numai după ce stocarea îl raportează durabil; un commit refuzat îl păstrează în așteptare,
iar retry-ul îl duce mai departe. La plafon, faptul este refuzat explicit (`PROTECTED_OVERFLOW`) și
pipeline-ul intră în `suspended`; nu se aruncă nimic tacit.

**Limite în bytes.** Generația pregătită ≤ `maxRecordBytes` (1 MiB), ingressul de transfer ≤
`pendingWorkerPayloadBytes` (16 MiB), registrul protejat ≤ `maxBodyBytes` (256 KiB), fereastra de
replay ≤ `optionalReplayStorageBytes` (128 MiB). Fereastra de replay evacuează determinist cea mai
veche secvență, declară `partial` și refuză cu `CHUNK_TOO_LARGE` un chunk mai mare decât fereastra
întreagă; evacuarea nu atinge checkpointul sau datele protejate.

**Stocare lentă, quota plină, crash.** Tick-ul nu așteaptă niciodată stocarea: un commit lent lasă
tick-urile să se coalesceze, iar vârsta nesalvată este raportată în tick-uri. `STORAGE_FULL` este
contorizat, faptele rămân în așteptare și următorul autosave reușit le eliberează. Faptele sunt
scrise înaintea checkpointului; un crash între ele lasă faptele durabile, checkpointul anterior
intact și raportează faptele orfane, fără să activeze vreodată o generație parțială.

## Verificări executate și rezultat

Toate comenzile au fost rulate în worktree-ul `.worktrees/pipeline-222-01`, pe branch-ul
`loop-pbi/pipeline-222-01`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (fără erori, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (325 TypeScript files)`, plus cele 6+4+3+1 seturi de probe negative |
| `npm run check:parameter-catalog` | PASS (`Parameter catalog is synchronized.`) |
| `npm test` (suita completă) | PASS — `tests 2299`, `pass 2299`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 78485.5386` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/bounded-pipeline.test.ts` | PASS — `tests 22`, `pass 22`, `fail 0`, `duration_ms 810.1684` |
| `npm run pipeline:bounded` | PASS — `SUMMARY checks 67/67, overall PASS` |
| `npm run pipeline:bounded -- --check` | PASS — `Bounded pipeline report is current: …\Docs\Evidence\222-bounded-pipeline\report.json` |
| `npm run pipeline:bounded -- --cost --samples 20` | PASS — `cost.json` / `cost.md` scrise pe această mașină |

Cele 22 de teste țintă acoperă: captura ca singura etapă din tick (exact două citiri de ceas),
mașina de stări cu un slot pregătit și unul în commit, coalescing-ul în timpul encode-ului,
înlocuirea unei generații pregătite de un tick mai nou, supraviețuirea faptelor protejate la
coalescing (fiecare fapt eliberat o singură dată), refuzul explicit la plafonul registrului,
refuzul transferului fără blocarea tick-ului, quota plină cu retry care duce faptele mai departe,
vârsta commitului la stocare lentă, plafonul și evacuarea deterministă a replay-ului, commitul
chunkurilor prin banda unică, eșecul unui chunk declarat parțial, chunkul real sigilat de recorder,
identitatea dintre imaginea de octeți și corpul encodat, o captură invalidă care nu blochează
pipeline-ul, refuzul unui tick în pas și al unui tick mai vechi, `dispose`, potrivirea bugetelor cu
manifestul, supraviețuirea generației durabile la crash, crash-ul între fapte și checkpoint, lipsa
store-ului de replay în schema 127 și două sesiuni pe același tick.

### Cele cinci scenarii cerute (numere reale din `report.json`)

| Scenariu | Rezultat |
| --- | --- |
| Condus cu recorder + autosave simultan (30 taxiuri / 40 civile) | 900 tick-uri simulate, 15 cereri de autosave (la 60 de tick-uri), 15 generații capturate și 15 comise, 0 refuzate, 966 677 bytes scriși (checkpoint 64 425 bytes), 1 chunk sigilat și comis, 60 de fapte protejate comise, vârsta finală a commitului 0 tick-uri |
| Intervenție lungă | 1 800 tick-uri, 1 890 de fapte protejate înregistrate și 1 890 comise, 0 în așteptare, vârf de registru 116 872 bytes din 262 144, 6 chunkuri sigilate, vârf de replay 866 187 bytes din 878 625 (fereastră de test), 2 evacuări, 3 chunkuri refuzate ca prea mari, replay `PARTIAL` |
| Stocare lentă | 7 tick-uri oferite, 3 generații capturate, 5 tick-uri coalesced, 1 generație în commit (tick 60) și cel mai nou tick (420) în slotul `pending`, vârsta nesalvată 420 tick-uri, 0 tick-uri blocate, 2 generații comise, vârsta finală 0, faptul protejat păstrat |
| Quota plină | 5 cereri, 2 commituri refuzate cu `STORAGE_FULL`, 3 generații comise după recuperare, 5 fapte înregistrate și 5 comise, 0 pierdute, retry-ul a dus 1 fapt în așteptare, 0 tick-uri blocate |
| Crash între generații | generația durabilă 1 (tick 60), 0 generații parțiale, 3 fapte orfane durabile din generația 2 (nepublicată), generația 2 a trăit doar în RAM |

**Sacadare.** În tick nu rulează nimic altceva decât captura: `offerTick` citește ceasul exact de
două ori (verificat), iar munca de stocare din tick este 0 ms. Costul real al capturii este
0,014/0,017/0,027 ms (min/median/max), adică ~0,3 % din bugetul de tick autoritar al desktopului
(5,5 ms) și ~0,2 % din cel al laptopului (8 ms).

**Memorie.** Contorii sunt de proprietate, nu citiri de heap: vârful ingressului de transfer
rămâne sub 65 KiB pentru o generație (plafon 16 MiB), vârful registrului protejat 116 872 bytes din
262 144, iar fereastra de replay nu depășește niciodată plafonul ei.

**Vârsta commitului.** Este raportată în tick-uri: 0 la finalul fiecărui scenariu stabil, 420 tick-uri
de stare nesalvată în scenariul de stocare lentă, fără ca tick-ul să fie blocat.

## Cost real (singura măsurătoare cu ceas de perete)

[cost.json](cost.json) și [cost.md](cost.md): 20 de generații, lume de 70 de vehicule, snapshot de
64 669 bytes, `performance.now`, rulare locală (`2026-11-11T09:53:36Z`).

| Fază | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| capture (în tick) | 0.014 | 0.017 | 0.027 |
| encode | 3.481 | 3.918 | 6.219 |
| copy | 1.042 | 1.111 | 2.36 |
| transfer | 0.003 | 0.003 | 0.038 |
| commit | 0.001 | 0.001 | 0.003 |
| total | 4.565 | 5.163 | 8.322 |

Captura este sub 1 % din bugetul de tick pe această mașină; encode-ul este etapa dominantă și
rulează în afara tick-ului. Commitul măsoară dublul în memorie, nu un IndexedDB real (vezi
limitările), deci valoarea lui nu este o dovadă de stocare durabilă.

## Fișiere atinse

- `src/persistence/bounded-pipeline.ts` (nou)
- `src/persistence/bounded-pipeline-store.ts` (nou)
- `src/persistence/index.ts` (append la finalul fișierului)
- `tests/persistence/bounded-pipeline-fixtures.ts` (nou)
- `tests/persistence/bounded-pipeline.test.ts` (nou)
- `tests/persistence/bounded-pipeline-report.ts` (nou)
- `scripts/run-bounded-pipeline-report.mjs` (nou)
- `package.json` (scriptul `pipeline:bounded`, ultima intrare din `scripts`)
- `Docs/15-salvare-si-import-export.md` (secțiunea contractului 222)
- `Docs/Evidence/222-bounded-pipeline/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`
- `PBI/In Progress/222-bounded_data_pipeline.md` → `PBI/Done/222-bounded_data_pipeline.md`

## Limitări

- Nivelul de validare este `targeted` (politica 2026-10-08): corectitudine izolată în Node, fără
  browser, fără backend GPU și fără hardware țintă. Nu este un gate `full` și nu certifică
  performanța jocului integrat.
- Costurile reale sunt o singură mașină și 20 de eșantioane, nu un p95 și nu o certificare de
  hardware. Commitul măsoară dublul sincron din memorie, nu un IndexedDB real; un commit de browser
  va fi mai scump și rămâne de măsurat la gate-ul integrat (220/224).
- `encode` este sincron în microtask, nu feliat într-un worker: pipeline-ul nu pretinde felii de
  10 ms. Trecerea encode-ului pe worker/`WorkerResourceGovernor` (221) este un adaptor al portului
  `handoff`/`encode`, nu o schimbare de contract; aici nu a fost cablată.
- Schema 127 nu are store de replay, deci chunkurile sunt doar în fereastra RAM plafonată
  (`optionalReplayStorageBytes`), iar adaptorul implicit nu le persistă. Persistența durabilă a
  replay-ului rămâne a modulelor 228/234; portul `handoffChunk` este locul unde se va cupla.
- `twoSessionCheckpointBytes` din manifest este `null`: pipeline-ul măsoară și raportează bytes
  celor două sesiuni pe același tick (64 378 bytes fiecare, aceeași checksum), dar nu impune un
  plafon inventat. `totalHeapBytes` rămâne indisponibil; contorii de proprietate nu sunt heap.
- Fereastra de replay din scenariul „intervenție lungă” este dimensionată din primul chunk real
  (≈0,88 MB, două chunkuri) ca să exercite evacuarea; plafonul de producție este 128 MiB și este
  verificat separat față de manifest. Chunkurile care depășesc fereastra întreagă sunt refuzate
  (`CHUNK_TOO_LARGE`), nu trunchiate.
- `field`-urile de tip „commit age” sunt nule înainte de primul commit (nu există încă o referință),
  iar vârsta se măsoară în tick-uri, nu în timp de perete.

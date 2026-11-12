# 228 — Feedback audio-vizual și replay al distrugerii

Contract: `228-destruction-feedback-v1` (feedback) și `228-destruction-replay-v1` (replay), în
`src/audio/destruction-feedback.ts`, exportate prin `src/audio/index.ts`. Modulul consumă evenimentul
real `DESTRUCTIBLE_BROKEN` al lui 227, motorul 148 și chunk-ul sigilat 207; nu adaugă un cue, un
buffer, un pool de voci sau o a doua sursă de adevăr.

## Ce s-a implementat

- **Reacție derivată din eveniment.** `createDestructionCatalog` citește definițiile reale 227, iar
  `deriveDestructionReaction` derivă materialul din arhetip, intensitatea din
  `impulseNs / breakImpulseNs` (`LIGHT` sub 0,85, `HEAVY` peste) și poziția din transformarea
  autorată. Funcția este pură: același eveniment produce aceeași amprentă, fără ceas, fără
  `Math.random` și fără sunet per cadru.
- **Sunet distinct fără sistem paralel.** Șase arhetipuri → șase profiluri distincte pe cue-ul 148
  `impact`: gard `WOOD` 0,82, con `PLASTIC` 1,25, ladă `WOOD` 0,70, pubelă `METAL` 1,05, indicator
  `GLASS` 1,45, mobilier `METAL` 0,60. Metoda nouă `playDestructionImpact` a motorului 148 aplică
  playback rate-ul și gain-ul de material în același pool de 4 voci `impact`, cu aceleași plafoane și
  același mute.
- **Companion vizual și fragmente cosmetice.** Fiecare reacție are simbol, text, atribute `data-*` și
  variantă (`FRAGMENT_BURST` / `SHOCK_RING`). Pool-ul are plafon 192 și durată 120 tick-uri;
  fragmentele declară structural `blocksTraffic: false`, `producesScore: false`,
  `createsCollisions: false`. `intensity`, `preset` și `visualAlternative` schimbă doar prezentarea.
- **Replay fidel.** `createDestructionReplay` citește chunk-ul 207 prin portul real
  `readWorldReplayChunk`, păstrează `DESTRUCTIBLE_BROKEN` și `WORLD_RESET` în ordinea înregistrată și
  derivă fiecare reacție din exact același payload și catalog. Proiecția de stare este construită din
  evenimente; un reset golește starea și deschide o generație nouă. Nu se stepă simularea, nu se
  reevaluează politica, nu se acordă recompense și nu se produc artefacte de învățare.
- **Absența este tăcere.** Un eveniment care nu există în înregistrare nu are intrare în plan, deci nu
  produce reacție, sunet sau fragmente. Un obiect fără definiție 227 este `ABSENT`
  (`UNKNOWN_OBJECT`/`NO_CATALOG`). Un chunk străin, modificat, cu ordine inversă sau fără date este
  refuzat cu `FOREIGN_SOURCE`, `CHECKSUM_MISMATCH`, `EVENT_ORDER` sau `INVALID_SOURCE`.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (ambele proiecte TypeScript) |
| `npm run lint` | PASS, 0 warnings |
| `npm run format:check` | PASS, toate fișierele conform Prettier |
| `npm run check:architecture` | PASS, 358 fișiere TypeScript, 6+4+3 probe negative |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `node --import ./scripts/register-typescript.mjs --test tests/audio/destruction-feedback.test.ts` | 13 teste, 13 pass, 0 fail (787 ms) |
| `npm test` | 2668 teste, 2668 pass, 0 fail (94,2 s) |
| `npm run world:destruction-feedback` | 20/20 verificări, overall PASS |
| `npm run world:destruction-feedback -- --check` | PASS, „report is current” |

## Numere din raportul determinist

- Materiale: **6 profiluri distincte / 6 arhetipuri**, **4 materiale** (`WOOD`, `PLASTIC`, `METAL`,
  `GLASS`).
- Live: **5 evenimente → 5 reacții**, **1 listener**, **4 voci impact redate / 1 refuzată de plafonul
  de 4**, **1 buffer**, **10 fragmente active** (vârf 10, plafon 192, durată 120 tick-uri).
- Gest: înainte **IDLE**, **0 contexte**, **0 voci**, **0 redate / 1 refuzată**; după **RUNNING**,
  **1 context**, **1 voce**, **1 redată**.
- Replay: chunk **3851 B**, checksum `17079dcb…d7f05ac5`, **3/3 evenimente** redate în aceeași
  ordine, **3 reacții** cu amprente identice cu derivarea live, **0** reacții inventate, **0** pași de
  simulare, **0** recompense, **0** artefacte de învățare; proiecție **3 obiecte BROKEN**.
- Reset înregistrat: **1 eveniment `WORLD_RESET`**, **generația 1**, **1 obiect BROKEN** post-reset,
  **2 reacții**.
- Eveniment absent: **3 distrugeri live**, **2 înregistrate**, **2 reacții** redate, **1 obiect fără
  sunet/efect**.
- Reset local: voci **2 → 0**, fragmente **4 → 0**, **1 buffer** cache-uit (nu o voce), **3 reacții**
  după generația nouă.
- Burst: **30 evenimente publicate → 24 reacții**, **6 refuzate** de plafonul per incident, **4 voci
  impact** simultane, **48 fragmente** active.
- Buget: manifest `203-initial-1`, `destructionBodies: null`, `totalHeapBytes: null`, **3 lacune**
  declarate. FPS, heap și hardware **nu** sunt pretinse.

## Fișiere atinse

- `src/audio/destruction-feedback.ts` (nou — contractul 228).
- `src/audio/engine.ts` (`playDestructionImpact` și tipul `DestructionImpactRequest`; pool-ul 148
  rămâne neschimbat).
- `src/audio/index.ts` (export).
- `tests/audio/destruction-feedback.test.ts` (13 teste țintă).
- `tests/audio/destruction-feedback-fixture.ts` (harness 227+148+228, inclusiv epoch nou pentru reset).
- `tests/audio/destruction-feedback-report.ts` (raport determinist).
- `scripts/run-destruction-feedback-report.mjs` (script cu `--check`).
- `package.json` (script `world:destruction-feedback`, ultima intrare din bloc).
- `Docs/26-joaca-libera-haos-si-distrugere.md` și `Docs/16-asseturi-vizual-si-audio.md` (secțiuni noi).
- `Docs/Evidence/228-destruction-feedback/report.json`, `report.md`, acest README.
- `PBI/To Do/228-destruction_feedback.md` → `PBI/Done/228-destruction_feedback.md`.

## Limitări

- Meshurile, materialele și randarea efectelor rămân la 146: contractul livrează descriptorul vizual
  și planul de fragmente, nu desenează. Nu s-a executat un playtest uman sau o captură de browser.
- `seek`-ul și proiecția transformărilor rămân ale modulului 141; replay-ul 228 citește același chunk
  207 și nu reimplementează seek-ul.
- Sunetul distinct este obținut prin playback rate și gain pe bufferul procedural `impact` al lui 148,
  nu prin înregistrări finale de material; înlocuirea asseturilor nu schimbă contractul.
- Bugetele de distrugere și heap sunt `null` în manifest; plafoanele 228 (24 reacții/incident, 192
  fragmente, 1 listener, 256 identități, 4096 evenimente) sunt locale și declarate. Nivelul de
  validare este `targeted`.

# 131 — Autosave periodic și închiderea sesiunii

Dovezi pentru PBI 131 (modulul Persistență, release V1). Contractul implementat este
`131-autosave-v1`, descris în [Docs/15](../../15-salvare-si-import-export.md) (secțiunea „Contract
implementat V1 (PBI 131)”) și ancorat în bugetele din
[Docs/25](../../25-performanta-contracte-si-benchmark.md) / `Docs/performance-budgets.json`
(`203-initial-1`). Nivel de validare: `targeted`, conform
[politicii proporționale](../../validation-policy.md) — corectitudine izolată, cost local, fără
browser real, FPS, Rapier sau hardware.

Salvarea periodică refolosește pipeline-ul 222; starea jucătorului refolosește salvarea 130. PBI-ul
nu introduce o a doua cale de scriere și nu inventează un store paralel.

## Rezultatul implementării

- `src/persistence/session-autosave.ts` (nou) — `createSessionAutosave`: autosave periodic în
  **tick-uri** (900 tick-uri = 15 s la 60 Hz), un singur slot `deferred` pentru fereastra care se
  suprapune cu o scriere, ciclu `progres 130 → checkpoint 222`, contract de închidere explicit
  (`SAVED`/`PARTIAL`/`FAILED`/`NOTHING_TO_SAVE`/`ALREADY_CLOSED`), proiecție de stare pentru UI
  (`PENDING`/`SUCCESS`/`ERROR` cu `claimsCompletedSave`) și cost pe etape cu ceas injectat.
- `src/persistence/index.ts` — exporturile publice, **append la finalul listei**, fără reordonare.
- `tests/persistence/autosave-fixtures.ts` (nou) — lumea 206 de 30 taxiuri + 40 civile, harness-ul
  real 130 (tracker 116 + ledger 125), store-ul 222 scriptat (lent/refuz) și un store 130 care poate
  refuza.
- `tests/persistence/autosave.test.ts` (nou) — 20 de teste deterministe.
- `tests/persistence/autosave-report.ts` (nou) — transcriptul determinist (61 de verificări) și
  măsurarea reală a costului.
- `scripts/run-autosave-report.mjs` (nou) — CLI `--check`, `--output`, `--cost`, `--samples`.
- `package.json` — scriptul `autosave:session`, adăugat ca **ultima** intrare din blocul `scripts`.
- `Docs/15-salvare-si-import-export.md` — secțiunea contractului 131, adăugată la final.
- `Docs/Evidence/131-autosave/README.md`, `report.json`, `report.md`, `cost.json`, `cost.md`.

## Cum funcționează (punctele cerute)

### 1. La ce interval se salvează și de ce

`AUTOSAVE_INTERVAL_TICKS = 900`, adică **15 s** la `FIXED_TICK_HZ = 60`. Valoarea este cea propusă în
Docs/15 („salvarea periodică propusă este la 15 secunde”), exprimată în tick-uri pentru ca execuția să
fie deterministă și independentă de ceasul de perete. Ferestrele sunt ancorate la multiplii
intervalului: 900, 1 800, 2 700. Un tick care nu este scadent costă o comparație, **zero citiri de
ceas** și zero octeți; `onTick` nu capturează. În scenariul de 900 de tick-uri: 899 tick-uri sărite,
1 cerere, 1 generație capturată și comisă.

Bugetul consumat, cu numere reale:

| Resursă | Valoare |
| --- | --- |
| Capturi per interval | 1 (0,0011 capturi/tick) |
| Checkpoint scris | 64 425 bytes (sub plafonul de 1 048 576) |
| Rânduri de progres (130) | 8 429 bytes în scenariul de raport |
| Ingress de transfer (222) | vârf sub o generație, plafon 16 777 216 bytes |
| Generații în pregătire / commit | 1 / 1 |
| Medie scrisă | ≈ 4,3 KiB/s la 60 Hz (64 425 bytes / 15 s) |

### 2. Suprapunerea cu o scriere în curs

Cât timp o generație se encodează sau se comite, fereastra scadentă intră într-un **singur** slot
`deferred` (cel mai nou tick câștigă), nu într-o coadă. Nu se pornește o a doua captură, iar
pipeline-ul 222 păstrează exact o generație în pregătire și una în commit. Când banda se eliberează,
prima graniță de tick salvează starea curentă o singură dată. În scenariul de stocare lentă
(interval 60, 181 tick-uri): 1 cerere amânată, 1 catch-up, 2 generații predate (60 și 181), 0 citiri
de ceas în tick-urile amânate; 180 de tick-uri nesalvate cât timp stocarea este blocată, 0 după
catch-up. Ferestrele sărite nu produc scrieri suplimentare, iar registrul protejat al lui 222 nu este
atins: recompensele și invalidările se eliberează numai după un commit durabil.

### 3. Ce se întâmplă exact la închidere

`close()`:

1. trece sesiunea în `CLOSING` și refuză ferestrele periodice noi;
2. așteaptă banda 222 (`drain`), deci o închidere în timpul unei scrieri **nu deschide un al doilea
   scriitor** — se scrie după commitul în curs;
3. scrie progresul 130 (tracker, jurnal de campanie, setări) într-o singură tranzacție;
4. cere și așteaptă generația finală de checkpoint la tickul de închidere (fapte protejate, apoi
   rândul de checkpoint);
5. întoarce un rezultat explicit: status, starea fiecărei părți, tick durabil, `unsavedTicks`, cod,
   mesaj, `retryable`, cost și `attempt`.

Ordinea este deliberată: progresul (recompense, verdicte, setări) este durabil înaintea
checkpointului care l-ar proba. Dacă scrierea progresului eșuează, checkpointul este **SKIPPED** și
nu se publică o lume mai nouă peste recompense vechi; perechea durabilă anterioară rămâne baza de
recuperare. Eșecul este raportat ca `FAILED` sau `PARTIAL` (niciodată `SAVED`), payload-ul rămâne în
RAM pentru `retryClose()`, iar starea UI trece pe `ERROR`. Dacă pagina moare înainte de retry,
recuperarea folosește ultimul commit confirmat: shutdownul nu garantează un autosave final, exact cum
spune Docs/25.

Scenarii reale:

| Scenariu | Rezultat |
| --- | --- |
| Închidere în timpul unei scrieri (tick 60 blocat, close la 75) | 1 generație predată înainte de eliberare, apoi 60 și 75; `SAVED`, progres `COMMITTED`, checkpoint `COMMITTED`, tick durabil 75, 0 nesalvate |
| Închidere cu progres eșuat (`STORAGE_FULL`) | `FAILED`, progres `REJECTED`, checkpoint `SKIPPED`, `retryable`, etapă `PROGRESS`, 30 tick-uri nesalvate; retry → `SAVED`, tick durabil 30, 2 încercări |
| Închidere doar cu checkpoint (fără payload 130) | `SAVED`, progres `NOT_REQUESTED`, checkpoint `COMMITTED`, tick 40 |

### 4. Costul pe tick măsurat

Separat de encode/commit, cu ceas injectat. Transcriptul scriptat (`STUB_CLOCK`, valori în ms):
capture 1, encode 4, copy 1, transfer 1, commit 2 (din care progres 1 și checkpoint 1), total 9.
Tick-urile sărite au **0 citiri de ceas** și 0 ms de muncă sincronă în afara capturii; o captură
citește ceasul exact de două ori.

Costul real al acestei mașini ([cost.json](cost.json), 20 de eșantioane, lume de 70 de vehicule,
`performance.now`):

| Fază | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| capture (în tick) | 0.024 | 0.027 | 0.082 |
| encode | 4.058 | 4.342 | 5.339 |
| copy | 1.090 | 1.232 | 2.193 |
| transfer | 0.001 | 0.001 | 0.002 |
| progres (în commit) | 2.552 | 2.818 | 4.104 |
| checkpoint (în commit) | 3.876 | 4.313 | 5.517 |
| commit | 6.526 | 7.098 | 8.899 |
| total | 12.079 | 12.806 | 14.889 |

Captura este 0,027 ms median, adică ~0,5 % din bugetul de tick autoritar al desktopului (5,5 ms) și
~0,3 % din cel al laptopului (8 ms). Restul etapelor rulează în afara tick-ului. Commitul măsoară
dublul în memorie, nu un IndexedDB real (vezi limitările).

### 5. Ce arată numeric scenariile

| Scenariu | Numere din [report.json](report.json) |
| --- | --- |
| Autosave periodic (900 tick-uri) | 1 cerere, 1 captură, 1 commit, 1 commit de progres, 899 tick-uri sărite, 64 425 bytes checkpoint, 8 429 bytes progres, 0 tick-uri nesalvate, rândul de tracker durabil înainte de checkpoint |
| Coalescing (stocare lentă) | 181 tick-uri, 2 capturi, 1 cerere amânată, 1 catch-up, generații 60 și 181, max 0 în pregătire și 1 în commit, 180 tick-uri nesalvate în stall, 0 după catch-up, 0 citiri de ceas în tick-urile amânate |
| Închidere în scriere | tick 75, 1 predare înainte de eliberare, ordine 60 → 75, `SAVED`, 0 nesalvate |
| Închidere eșuată | `FAILED`, `STORAGE_FULL`, etapă `PROGRESS`, checkpoint `SKIPPED`, 30 nesalvate, retry `SAVED` la tick 30 |
| Reload după autosave și după close | checkpoint 900, checkpoint 950, digest de tracker identic (`c3f00b5a…`), 2 rânduri de progres, setări `STORED` |
| Starea UI | pending nu pretinde salvare, succes pretinde salvare, eroare nu pretinde; etichete `SAVING`, `SAVED`, `SAVE_FAILED` |

## Verificări executate și rezultat real

Toate comenzile au fost rulate în worktree-ul `.worktrees/autosave-131-01`, pe branch-ul
`loop-pbi/autosave-131-01`.

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (exit 0, ambele configurații tsconfig) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, fără avertismente) |
| `npm run format:check` | PASS (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | PASS — `Architecture imports: PASS (331 TypeScript files)`, plus probele negative 6+4+3 și verificarea lifecycle |
| `npm run check:parameter-catalog` | PASS (`Parameter catalog is synchronized.`) |
| `npm test` | PASS — `tests 2376`, `pass 2376`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 80309.4534` |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/autosave.test.ts` | PASS — `tests 20`, `pass 20`, `fail 0`, `duration_ms 1110.0512` |
| `node --import ./scripts/register-typescript.mjs scripts/run-autosave-report.mjs` | PASS — `SUMMARY checks 61/61, overall PASS` |
| `node --import ./scripts/register-typescript.mjs scripts/run-autosave-report.mjs --check` | PASS — `Autosave report is current: …\Docs\Evidence\131-autosave\report.json` |
| `node --import ./scripts/register-typescript.mjs scripts/run-autosave-report.mjs --cost --samples 20` | PASS — `cost.json` / `cost.md` scrise pe această mașină |

Cele 20 de teste țintă acoperă: autosave exact la tick-ul de interval (și zero citiri de ceas
înainte), intervalul de producție 900 tick-uri = 15 s, un singur slot amânat cât timp o scriere rulează,
înlocuirea ferestrei amânate fără coadă, închiderea în timpul unei scrieri (ordinea generațiilor),
eșecul de progres la închidere cu retry, eșecul de checkpoint după progres durabil (`PARTIAL`), ordinea
progres → checkpoint, reload după autosave, reload după close, baza de recuperare după close eșuat,
proiecția de stare pending/succes/eroare, separarea timpului simulat de timpul salvării, `saveNow`
între ferestre, close fără muncă, sesiune doar cu checkpoint, validarea intervalului și a tickului,
`dispose`, payload-ul de progres fără store și folosirea exclusivă a store-ului 130 real.

## Fișiere atinse

- Create: `src/persistence/session-autosave.ts`, `tests/persistence/autosave-fixtures.ts`,
  `tests/persistence/autosave.test.ts`, `tests/persistence/autosave-report.ts`,
  `scripts/run-autosave-report.mjs`, `Docs/Evidence/131-autosave/` (`README.md`, `report.json`,
  `report.md`, `cost.json`, `cost.md`).
- Modificate: `src/persistence/index.ts` (exporturi adăugate la finalul fișierului), `package.json`
  (scriptul `autosave:session`, ultima intrare), `Docs/15-salvare-si-import-export.md` (secțiune nouă
  la final), `PBI/In Progress/131-autosave.md` → `PBI/Done/131-autosave.md`.

## Limitări

- Nivelul de validare este `targeted`: corectitudine izolată în Node, fără browser real, fără backend
  GPU, FPS, Rapier, soak sau hardware țintă. Nu este un gate `full` și nu certifică performanța
  jocului integrat.
- Contractul de stare pentru UI (`PENDING`/`SUCCESS`/`ERROR`, `claimsCompletedSave`, etichete și
  detalii) este livrat și testat, dar montarea lui într-un panou DOM nu face parte din ownership-ul
  acestui PBI: `src/ui` este read-only conform brief-ului. Un HUD care afișează aceste valori trebuie
  cablat la pașii de compunere.
- Persistarea este verificată pe dublul determinist în memorie peste porturile 127, nu pe IndexedDB-ul
  unui browser real. Un commit de browser va fi mai scump decât valorile din `cost.md`.
- `encode` rulează sincron într-un microtask, nu feliat într-un worker; pipeline-ul 222 nu pretinde
  felii de 10 ms, iar 131 nu schimbă această decizie.
- O închidere eșuată poate fi reluată numai cât timp pagina trăiește (`retryClose`). Dacă pagina moare
  înainte de retry, payload-ul din RAM se pierde, iar baza de recuperare este ultimul commit confirmat;
  contractul nu promite o salvare finală garantată la shutdown.
- Testele folosesc intervale mai mici (30/60 de tick-uri) pentru a exercita coalescing-ul în câteva
  sute de tick-uri; intervalul de producție (900) este verificat separat în scenariul periodic și în
  testul de buget. Plafoanele în bytes rămân cele din manifest.
- `twoSessionCheckpointBytes` rămâne `null` în manifest: contractul raportează bytes per sesiune, dar
  nu impune un plafon inventat; `totalHeapBytes` rămâne indisponibil.

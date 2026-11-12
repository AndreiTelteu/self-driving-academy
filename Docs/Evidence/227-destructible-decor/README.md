# Dovezi PBI 227 — decor destructibil și zone de joacă

Contract: `227-destructible-decor-v1` · modul ales: **`src/world/`** (`src/world/destructible-decor.ts`) ·
nivel de validare: `targeted`.

## Ce s-a livrat

Un singur contract determinist pentru decorul care cedează și pentru cele trei locuri de joacă. Nu
există un al doilea sistem de fizică: modulul primește contactul fizic al proprietarului real, aplică
o singură cale de impact și întoarce reacția, tranzițiile de stare și evenimentul deja contractat de
028.

| Componentă | Ce face exact | Ce nu face |
| --- | --- | --- |
| `applyImpact` | rezolvă un contact fizic din impuls, punct, instigator și sursă de control; acumulează deteriorarea și trece `INTACT → MOVED → BROKEN` | nu citește sursa de control pentru rezultat, nu inventează un contact |
| `DESTRUCTIBLE_BROKEN` | un eveniment per obiect și generație, cu instigator real (vehicul sau obiect din lanț) | nu acordă credit de jucător pentru impacturile AI |
| `queryObstacles` | raportează obstacolele mari, inclusiv cele deplasate, fără niciun input de cameră | nu filtrează după vizibilitate sau ocluzie |
| `createDestructiblePlayground` | derivă parcarea de derapaje, rampa și aleea demolării din layout-ul 042, cu intrări, rute, repere și politici de margine | nu creează meshuri, materiale sau sunete |
| `capture`/`restore`/`reset` | păstrează/refac decorul și readmite corpurile; respectă `resetPolicy` | nu atinge profilul, XP, economia sau checkpointul 206/226 |
| `getStats` | contoare de proprietate: obiecte, corpuri, collidere, fragmente, intrări în index, obiecte evaluate, evenimente | nu raportează heap sau FPS |

## Rezultate reale (`report.json`)

- Verificări deterministe: **24/24 PASS**, `summary.pass = true`.
- Zone: **3** (`DRIFT_PAD 1`, `RAMP 1`, `DEMOLITION_ALLEY 1`), **6** intrări, **6/6** intrări pe o
  suprafață conducibilă (accesibile fără mers pe jos), **6** rute, **3** repere, **35** destructibile,
  **6** arhetipuri, **0** probleme de verificare.
- Rampă: **12 m** lungime, **3,2 m** lățime, **0,6 m** înălțime. Alee: `zone:alley:walk:blk:3-0:N`.
- Tranziții pe un con izolat: impact slab `0,5 N·s` → `INTACT`; contact continuu `0,5 + 0,5 + 0,5`
  → `INTACT → MOVED → MOVED`; impact puternic `40 N·s` → `BROKEN` cu `DESTRUCTIBLE_BROKEN`;
  `BROKEN` terminal, **1** impact duplicat fără eveniment.
- Paritate MANUAL/LEARNING/AUTO: **true**, aceeași amprentă pentru toate cele trei surse
  (`fnv1a32:…` comună; `state=BROKEN`, `damageNs=120`, același `eventId`, payload și reacție).
- Lanț: `cone:1 → crate:2` (`BROKEN`), instigator real `cone:1`, evenimentul conține ambii ID-i.
- Deduplicare: **4** impacturi, **1** eveniment, **1** eveniment reținut în magistrală, reluare
  `duplicate`, **3** impacturi pe obiectul deja rupt fără eveniment.
- Obiect ușor: con lovit cu `60 N·s` → reacție **60 N·s**, **0,042857 m/s** pe vehiculul de referință
  de 1400 kg, `blocking = false`.
- Obstacol mare: gard deplasat **1,6909 m** până pe banda `lane:31E0`, raportat de
  `queryObstacles`, `cameraInputAccepted = false` (câmpul `camera` este refuzat).
- Structural: **467** ID-uri structurale, **35** destructibile, **0** suprapuneri, layout neatins
  după **20** cicluri rupere/reset.
- Checkpoint: **6152 bytes**, checksum `fnv1a32:fb2bccd1`; refăcute **1 BROKEN** și **1 MOVED**.
  Reset: corpuri **33 → 35**.
- 20 cicluri: corpuri `[35]`, collidere `[35]`, fragmente `[0]`, intrări în index `[43]`,
  **20** evenimente distincte, **1** amprentă de baseline.
- Preseturi: `LOW` `BROKEN` cu **1** fragment vs `HIGH` `BROKEN` cu **3**, gameplay identic **true**.
- Refuzuri închise: obiect duplicat, obiect structural, zonă necunoscută, plasare în afara suprafeței,
  prag invalid, capacitate depășită — **6/6** refuzate cu mesaj explicit.

## Comenzi executate și rezultate

| Comandă | Rezultat real |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`, zero erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`, zero avertismente) |
| `npm run format:check` | PASS după formatare („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (355 fișiere TypeScript; 6 + 4 + 3 probe negative; entry point-uri reale) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test tests/world/destructible-decor.test.ts tests/world/destructible-decor-report.test.ts` | **14/14 PASS** |
| `node --import ./scripts/register-typescript.mjs scripts/run-destructible-decor-report.mjs` | **24/24 verificări, PASS**; `report.json` + `report.md` scrise |
| `node --import ./scripts/register-typescript.mjs scripts/run-destructible-decor-report.mjs --check` | PASS („Destructible decor report is current”) |
| `npm test` | **2627 teste, 2627 pass, 0 fail**, 97,2 s |
| `PBI/Validate-Board.ps1` (după mutarea în In Progress) | `Valid: true`, `In Progress: 1` |
| `PBI/Validate-Board.ps1 -RequireDone '227'` | `Valid: true`, `Done: 175`, `In Progress: 0` |

## Fișiere atinse

- `src/world/destructible-decor.ts` — nou: contractul `227-destructible-decor-v1`.
- `src/world/index.ts` — exporturile publice, adăugate după blocul existent.
- `tests/world/destructible-decor-fixture.ts` — fixture pe harta reală `neighbourhood-compact-v1`.
- `tests/world/destructible-decor.test.ts` — 11 teste deterministe.
- `tests/world/destructible-decor-report.ts` — transcriptul determinist + markdown.
- `tests/world/destructible-decor-report.test.ts` — dovada că raportul comis este cel curent.
- `scripts/run-destructible-decor-report.mjs` — scriptul de raport, cu `--check` și `--output`.
- `package.json` — `world:destructibles`, ultima intrare din blocul `"scripts"`.
- `Docs/26-joaca-libera-haos-si-distrugere.md` — secțiunea „Contract implementat V1 (PBI 227)”.
- `Docs/04-oras-si-retea-rutiera.md` — referința la zonele de joacă în secțiunea de repere.
- `Docs/Evidence/227-destructible-decor/README.md`, `report.json`, `report.md`.
- `PBI/Done/227-environment_destruction.md` — mutat fizic din `In Progress`.

## Performanță (`performance_checks: simulation, assets, memory, frame`)

Aplicat nivelul `targeted` din [politica de validare](../../validation-policy.md): corectitudine
izolată și cost structural local, fără benchmark hardware și fără a pretinde playtest uman.

- **simulation**: cost structural măsurat — **35** obiecte, **43** intrări în index pe **17** celule la
  baseline, **1** obiect evaluat pentru lanțul demonstrat, **8** vecini maxim per impact, adâncime de
  lanț **3**, rază **2,6 m**. După ruperea din lanț rămân **33** corpuri și **40** intrări. Plafoane
  finite: **96** obiecte/corpuri, **1** collider per obiect, **192** fragmente active.
- **assets**: **0** texturi și **0** meshuri adăugate de acest modul; fragmentele sunt buget de
  prezentare, iar meshurile/sunetul rămân la 146/228.
- **memory**: **6152 bytes** pentru snapshotul decorului (35 obiecte), corpuri **35**, collidere
  **35**, fragmente **0** după reset; heap-ul exact este `null` și nu este inventat.
- **frame**: `NOT_MEASURED` — nu s-a măsurat FPS, p95/p99 de cadru sau latență input→comandă pe
  hardware. Costul structural nu este prezentat ca FPS.
- **Buget**: `destructionBodies` este `null` în [manifest](../../performance-budgets.json), deci lacuna
  este raportată explicit; plafonul propriu de **96** respectă politica de capacitate finită
  (`nullCapacityPolicy`) și se aliniază cu `obstacles = 96` din contractul de admitere a fizicii 021.
  Nu s-a modificat manifestul și nu s-a declarat un buget hardware.
- **Vizual**: `N/A` pentru acest contract — modulul nu creează meshuri, materiale sau efecte, deci nu
  există o schimbare vizuală de verificat aici; sceneta și feedbackul rămân la 146/228. Nu se
  pretinde playtest sau verificare în browser.

## Limitări

- Meshurile, materialele, sunetul și fragmentele vizuale nu sunt implementate aici (146/228); PBI-ul
  livrează contractul de date și starea, nu prezentarea.
- Corpurile Rapier și colliderele native rămân ale stratului de compoziție 021; modulele primesc
  admiterea logică (96 obiecte, 1 collider fiecare), nu o lume fizică proprie.
- Pragurile sunt marcate `PROVISIONAL_UNCALIBRATED`: sunt derivate din masă și viteza obiectului și
  așteaptă playtest-ul și gate-ul 224; nu s-a executat un playtest uman.
- Nu s-a măsurat FPS, timp de cadru, latență de input sau heap pe hardware; `frame` este
  `NOT_MEASURED`, iar memoria este raportată ca bytes de document și contoare de proprietate.
- Rotația obiectelor deplasate nu este simulată (doar translația deterministă); unghiul rămâne cel
  inițial. Coliziunea dintre fragmente și trafic este exclusă prin contract, ca să nu producă scor sau
  contacte suplimentare.
- Zonele oferă datele (intrări, rute, repere ca ID-uri reale), dar trasarea lor vizuală și camera de
  încercare repetată rămân ale modulelor de randare/UI; nu sunt modificate în acest PBI.
- Adaptorul durabil al checkpointului rămâne al stratului de compoziție: aici este livrat documentul
  determinist cu checksum, nu scrierea în IndexedDB.

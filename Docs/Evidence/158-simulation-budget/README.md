# PBI 158 — optimizarea simulării și a estimării

Trei componente sunt măsurate separat, pe aceeași probă, înainte și după optimizare: **decizii** (044
publicat la 10 Hz plus slotul 219), **estimare** (cerere 103 → blend 101 → rezultat) și **transfer**
(pachete 221 și payloaduri encodate). Fiecare componentă produce un **digest SHA-256 peste toate
ieșirile**; baseline-ul și rularea optimizată trebuie să dea exact același digest. Bugetele sunt
citite din [`Docs/performance-budgets.json`](../../performance-budgets.json) și **nu** au fost
modificate. Raportul derivat este [report.json](report.json) / [report.md](report.md); măsurătorile
brute sunt [baseline.json](baseline.json) și [measurement.json](measurement.json).

**Rezultat: `MEASURED_EQUIVALENT_OPTIMIZATION_PASS`.** Decizii, estimare și transferuri sunt în buget,
echivalența semantică este `IDENTICAL` pe toate cele trei componente, iar copiile de payload scad de la
2 la 0 per estimare. Gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`: proba este headless
(Node), fără renderer.

## Ce s-a implementat

- `tests/harness/simulation-budget.ts` — contractul de măsurare și de raportare:
  - **decizii**: fixture-ul comis 044 (110 vehicule, 96 obstacole, 256 zone), cu publicarea 044 la
    fiecare 6 tick-uri (10 Hz) și deciziile distribuite pe 6 sloturi după `entityId`, exact ca
    scheduler-ul 219; costul de tick = publicare (când e rândul) + contextele slotului;
  - **estimare**: bucla reală `encodeLearningEstimateRequest` → `decodeLearningEstimateRequest` →
    `blendProfileValue` → `encodeLearningEstimateResult` → `decodeLearningEstimateResult`, pe 3 chei
    reale (16 episoade) plus cazul de plafon (4096 episoade);
  - **transfer**: `parsePacket` → `sendPacket` → `parsePacket` → `control` pe 1000 de mesaje × 3
    repetări × 3 treceri, cu numărarea copiilor prin `ArrayBuffer.prototype.slice` (fără să schimbe
    codul măsurat);
  - protocol 155/156/220: fiecare repetare își păstrează distribuția, iar valoarea raportată este
    **mediana** a 3 treceri × 3 repetări;
  - `buildSimulationBudgetReport` / `verifySimulationBudgetReport` / `simulationBudgetMarkdown`:
    derivare deterministă, verdict pe fiecare buget citit din manifest, refuz al unui PASS fără
    măsurătoare sau cu digesturi diferite.
- `tests/harness/simulation-budget.test.ts` — 11 teste deterministe: digests identice între două
  rulări ale aceleiași fixture, verdictul general, eșecul de echivalență pe fiecare componentă,
  depășirea bugetului de tick și a feliei worker, cerința ca transferurile să scadă strict (nu doar
  „un aparat mai rapid”), randarea Markdown, plus teste de echivalență pentru fiecare optimizare
  (encoding byte-cu-byte, envelope-ul de pachet, bufferul de control partajat, scurtătura de istoric
  gol din blend).
- `scripts/run-simulation-budget-report.mjs` — raport determinist: `--baseline` a măsurat
  implementarea dinainte de optimizare (istoric, nu se reexecută pe codul optimizat), `--measure`
  măsoară implementarea curentă, rularea implicită derivează `report.json` + `report.md`, `--check`
  compară artefactele comise.
- `package.json` — intrarea `perf:simulation-budget`, ultima din blocul `"scripts"`.

### Optimizările (fără schimbarea semanticii)

1. `src/autonomy/road-context.ts`
   - **amprenta cadrului 044 nu mai este construită la fiecare publicare**: `JSON.stringify(frame)`
     rula pentru fiecare cadru, deși șirul canonic este folosit doar când sosește un cadru cu
     **același tick** (verificarea „conflicting frame”). Acum se materializează exclusiv în acea
     ramură; admiterea rămâne mărginită de `estimatedUnits`, calculat înainte de copiere. Un cadru
     duplicat este în continuare acceptat identic, iar unul contradictoriu este în continuare
     respins cu aceeași eroare.
   - **semnalele rutierii** se caută într-o mapă imbricată `intersectionId → movementId → signal`
     construită o dată per cadru, în loc de `Array.find` peste toate semnalele pentru fiecare
     vehicul; duplicatele `(intersectionId, movementId)` erau deja respinse, deci selecția este
     identică. Existența unui program pentru intersecție este un `Set` construit o dată per engine.
2. `src/learning/estimator-task.ts` — `encodeLearningEstimateRequest` / `encodeLearningEstimateResult`
   folosesc direct bufferul produs de `TextEncoder` (offset 0, lungime exactă) în loc să-l mai copieze
   cu `ArrayBuffer.prototype.slice`; fallback-ul păstrează contractul pentru orice alt view. Se
   elimină astfel o copie completă de payload per cerere și per rezultat (2 → 0), inclusiv 404 829 B
   per cererea de plafon cu 4096 de episoade.
3. `src/learning/profile-blend.ts` — istoricul gol este un array înghețat partajat, nu un array nou
   alocat pentru fiecare estimare; conținutul și rezultatul sunt identice.
4. `src/workers/protocol.ts`
   - `parsePacket` recunoaște envelope-urile deja validate și înghețate și le întoarce fără a le mai
     copia și revalida; verificarea bufferului (lungime, detach, resizable) rămâne obligatorie la
     fiecare apel, deci un buffer transferat este în continuare respins;
   - pachetele de control folosesc un singur `ArrayBuffer` gol partajat, în loc de o alocare per
     mesaj.

## Configurația măsurată

| Câmp | Valoare |
| --- | --- |
| Hardware | AMD Ryzen 7 7735U with Radeon Graphics, 16 fire logice (laptopul identificat în 203/220) |
| Runtime | Node 24.19.0, Windows, **headless, fără renderer** |
| Protocol | 3 treceri × 3 repetări × (120 tick-uri warmup + 360 măsurate); publicare 044 la 6 tick-uri; 6 sloturi de decizie |
| Estimare | 3 treceri × 3 repetări × (20 + 200) estimări pe 3 chei; plafon 4096 episoade |
| Transfer | 3 treceri × 3 repetări × 1000 mesaje |
| Statistică | mediana percentilelor per repetare (protocol 155/156/220) |
| Baseline | `546fa29e` + harness 158, capturat `2026-11-12T06:13:11.707Z` |
| După | `546fa29e` + optimizările din working tree, capturat `2026-11-12T06:13:41.024Z` |
| Coloană de bugete | `laptop` (manifestul `203-initial-1`) |

Ambele artefacte poartă sufixul `-dirty` în `commit` pentru că schimbarea nu era încă comisă la
momentul măsurării: baseline-ul a rulat cu fișierele de producție readuse la `546fa29e` (harness-ul
158 era nou), iar măsurătoarea „după” a rulat cu optimizările aplicate. Commit-ul final este cel din
raportul de încheiere al PBI-ului.

## Baseline față de după, pe componente

| Componentă | Metrică | Înainte | După | Δ |
| --- | --- | ---: | ---: | ---: |
| Decizii | tick p95 (publicare + slot) | 6,9296 ms | 6,3242 ms | −8,8 % |
| Decizii | publicare 044 p95 | 6,3779 ms | 4,8106 ms | −24,6 % |
| Decizii | derivare slot p95 | 3,0996 ms | 3,3785 ms | +9,0 % (zgomot) |
| Estimare | submit sincron main-thread p95 | 0,0171 ms | 0,0145 ms | −15,2 % |
| Estimare | felie worker p95 | 0,0534 ms | 0,0460 ms | −13,9 % |
| Estimare | submit 4096 episoade p95 | 1,6334 ms | 2,1253 ms | +30,1 % (zgomot, vezi mai jos) |
| Transfer | cost per mesaj p95 | 0,0234 ms | 0,0176 ms | −24,8 % |
| Transfer | send p95 | 0,0089 ms | 0,0063 ms | −29,2 % |
| Transfer | receive p95 | 0,0038 ms | 0,0002 ms | −94,7 % |
| Transfer | control p95 | 0,0105 ms | 0,0109 ms | +3,8 % (zgomot) |

Determinist și independent de încărcarea mașinii:

| Metrică | Înainte | După |
| --- | ---: | ---: |
| Copii de payload per estimare | 2 | 0 |
| Bytes copiați per estimare | 2 199,627 B | 0 B |
| Copie eliminată pentru cererea de plafon (4096 episoade) | 404 829 B | 0 B |
| Alocări de buffer per pachet de control | 1 | 0 |
| Payload de cerere / rezultat | 1 971 B / 229 B | 1 971 B / 229 B |
| Bytes livrate în proba de transfer | 2 304 000 B | 2 304 000 B |

**De ce scade timpul.** Publicarea 044 plătea un `JSON.stringify` de ~90 KB pentru fiecare cadru,
deși șirul era folosit doar la comparația pe același tick; dispariția lui se vede direct în p95
publicării (−24,6 %). Pe transferuri, `parsePacket` revalida și copia obiectul de două ori pe drum
(main thread → transport și transport → consumator), iar fiecare cerere/rezultat de estimare era
copiat încă o dată după `TextEncoder`; `receive` scade cu ~95 %, iar costul total per mesaj cu ~25 %.

**Zgomotul rămas.** Mașina este partajată cu alt agent, iar timpii de perete variază între treceri.
Derivarea slotului și admiterea celor 4096 de episoade sunt cele mai sensibile: un A/B deliberat
(cod de decizie revenit vs. optimizat, aceeași probă) a dat pentru slot p50 1,94 / 1,98 ms înainte și
1,91 / 2,13 ms după, adică fără regresie sistematică. Toate cele trei valori rămân în buget
(≤ 8 ms tick, ≤ 10 ms felie de worker), iar verdictul nu se sprijină pe ele: se sprijină pe copii,
bytes și digests, care sunt exacte.

## Echivalența semantică

| Componentă | Ieșiri acoperite de digest | Baseline | După | Status |
| --- | ---: | --- | --- | --- |
| Decizii | 26 400 de contexte complete (toate câmpurile) | `de269794…5cf07b` | `de269794…5cf07b` | IDENTICAL |
| Estimare | 1 320 de rezultate + blend-uri 101 | `05d0a9d1…5c1173` | `05d0a9d1…5c1173` | IDENTICAL |
| Transfer | 6 000 de mesaje + suma de bytes a payloadului | `ed6c2c14…ad8370` | `ed6c2c14…ad8370` | IDENTICAL |

Digestul acoperă obiectul întreg returnat de fiecare componentă (nu doar un ID sau un total), deci
aceleași intrări produc aceleași decizii, aceleași estimări și aceleași mesaje. În plus:

- testele existente ale modulelor atinse trec neschimbate: `tests/autonomy/road-context.test.ts`
  (16 teste, inclusiv oracolul exhaustiv 044 și faptul că un cadru duplicat/contradictorios nu
  schimbă `getStats()`), `tests/workers/protocol.test.ts` (9 teste, inclusiv respingerea unui buffer
  detașat), `tests/learning/estimator-worker.test.ts` și `tests/learning/profile-blend.test.ts`;
- `tests/harness/simulation-budget.test.ts` dovedește că encoding-ul rămâne byte-cu-byte JSON-ul
  canonic, că envelope-ul validat se întoarce neschimbat, că un buffer detașat este în continuare
  respins și că scurtătura de istoric gol din blend dă exact același rezultat ca `history: []`.
- fizica, seed-urile și XP nu sunt atinse: PBI-ul nu modifică `src/vehicles`, `src/world`,
  `src/missions` sau vreun seed; A/B pentru XP rămâne cel din 143, fără proxy.

## Diagnostic schimbat (declarat)

`RoadContextEngine.getStats().fingerprintCodeUnits` raporta dimensiunea șirului canonic păstrat
pentru fiecare cadru. Șirul nu mai este păstrat (se materializează doar la comparația pe același
tick), deci câmpul raportează `0`. Este un diagnostic, nu o ieșire de decizie: digestul de decizii
este identic, iar testul de atomicitate al admiterii (stats neschimbate după un cadru respins) trece
neschimbat.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0 (0 erori, 0 warning-uri) |
| `npm run format:check` | exit 0 („All matched files use Prettier code style!”) |
| `npm run check:architecture` | exit 0 („Architecture imports: PASS”) |
| `npm run check:parameter-catalog` | exit 0 („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test "tests/harness/simulation-budget.test.ts"` | 11 teste, 11 trecute |
| `node --import ./scripts/register-typescript.mjs --test "tests/autonomy/road-context.test.ts" "tests/workers/protocol.test.ts" "tests/learning/estimator-worker.test.ts" "tests/learning/profile-blend.test.ts"` | 49 teste, 49 trecute |
| `npm run perf:simulation-budget -- --baseline` | baseline 3×3 repetări scris în `baseline.json` |
| `npm run perf:simulation-budget -- --measure` | 3×3 repetări, digests identice cu baseline-ul |
| `npm run perf:simulation-budget` | 12 rânduri: 9 PASS, 3 REPORTED; verdict general PASS |
| `npm run perf:simulation-budget -- --check` | „report is current” + „markdown is current” |
| `npm test` | 2841 teste, 2841 trecute, 0 eșuate, 0 sărite, 103 726 ms |

## Fișiere atinse

- `src/autonomy/road-context.ts` (amprentă leneșă, mapă de semnale, `Set` de intersecții semnalizate)
- `src/learning/estimator-task.ts` (fără copia suplimentară a payloadului)
- `src/learning/profile-blend.ts` (istoric gol partajat)
- `src/workers/protocol.ts` (envelope deja validat, buffer de control partajat)
- `tests/harness/simulation-budget.ts` (nou)
- `tests/harness/simulation-budget.test.ts` (nou)
- `scripts/run-simulation-budget-report.mjs` (nou)
- `package.json` (intrarea `perf:simulation-budget`, ultima din `"scripts"`)
- `Docs/14-experimente-si-indicatori.md` (secțiune nouă la final)
- `Docs/Evidence/158-simulation-budget/` (acest README, `baseline.json`, `measurement.json`,
  `report.json`, `report.md`, `.gitattributes`)
- `PBI/To Do` → `PBI/Done` (fișierul 158)

## Limitări

- Proba este **headless**: nu măsoară randarea, frame-ul, GPU-ul, paint-ul DOM sau pacing-ul real; nu
  închide gate-ul hardware al jocului complet.
- Costurile sunt per componentă, pe fixture-ul 044 de 110 vehicule/96 obstacole/256 zone; ele nu
  sunt tick-ul autoritar complet (fizica și restul sistemelor nu sunt în probă).
- Baseline-ul este o măsurătoare reală dinaintea optimizării păstrată ca artefact istoric; nu se
  reexecută pe codul optimizat și nu se reclasifică.
- Timpii de perete rămân sensibili la încărcarea mașinii (±10–30 % între treceri pe componentele
  mici); copiile, bytes și digesturile sunt deterministe și sunt baza verdictului.
- Nu s-a optimizat validarea de admitere 044 (descompunerea descriptorilor, copierea și sortarea
  cadrului) și nici proiecția de bandă din `src/world`: sunt contracte de siguranță, respectiv module
  în afara scope-ului acestui PBI (alt agent lucrează în `src/rendering`, iar `src/world` nu este
  deținut aici). Costul lor rămâne dominant în tick-ul de decizii.
- Coloana `desktop` a manifestului nu se împrumută; este aplicată doar coloana `laptop`.

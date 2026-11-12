# PBI 157 — bugetul de randare: instanțiere, LOD, umbre și picking

Probe structurale deterministe pe contractele reale de prezentare (`createCityScene`, `createCityDecorScene`, `createDaylight`, `BabylonCellBatches` + `VehiclePickingRegistry`), rulare în Babylon `NullEngine`, fără renderer hardware. Bugetele sunt citite din `Docs/performance-budgets.json` (`203-initial-1`) și **nu** au fost modificate; o probă fără măsurătoare este `NOT_MEASURED`, nu 0.

## Ce s-a optimizat efectiv

| Metrică (aceeași probă, același commit de fixture) | Înainte (`546fa29e`) | După | Buget citat |
| --- | ---: | ---: | --- |
| Draw calls ale layout-ului 042 | 155 | **12** | `drawCalls` 128 |
| Mesh-uri / obiecte Babylon ale scenei orașului | 155 | **12** | `babylonObjects` 4096 |
| Instanțe thin ale orașului | 0 | **78** | `instances` 8192 |
| Draw calls totale (oraș 042 + decor 146) | 191 | **48** | `drawCalls` 128 |
| Batchuri statice (celule decor + hosturi thin) | 36 | 40 | `batches` 512 |
| Draw calls ale decorului 146 (control) | 36 | 36 | neschimbat |
| Materiale înghețate ale orașului | 0 | 12 | contract 223 |
| Vârfuri / triunghiuri ale layout-ului | 19 172 / 10 054 | 18 580 / 9 314 | — |
| Abaterea maximă a limitelor unui element | — | **2,9 × 10⁻⁵ m** | 1 × 10⁻⁴ m |
| Casters esențiali în shadow map la MEDIUM | 0 / 1 | **1 / 1** | ≥ 1 |
| Casters admiși la MEDIUM / HIGH / LOW | 48 / 71 / 0 | 48 / 71 / 0 | plafon 016 |
| Raze cu aceeași identitate înainte/după instanțiere | 32 / 32 | 32 / 32 | 32 |
| Oscilații LOD în banda de histerezis (400 eșantioane × 3 preseturi) | 0 | 0 | 0 |

Sursa ambelor capturi este aceeași probă (`npm run perf:render-budget`). `before.json` a fost capturat pe sursa neatinsă din `546fa29e`: fișierele modificate au fost restaurate din git, proba a rulat, apoi fișierele optimizate au fost repuse. `after.json` este captura pe sursa PBI 157 (baza `546fa29e` plus modificările acestui PBI, în arborele de lucru), motiv pentru care metadatele ambelor capturi indică baza; `--check` reexecută proba pe sursa comisă și refuză un artefact învechit. Ordinea temporală a celor două fișiere nu este relevantă: `before.json` a fost recapturat după ce proba a primit unirea limitelor lămpii, tot pe sursa neatinsă.

## Cum arată baseline-ul față de după

- **Înainte**: 923 elemente de layout randate în 155 de mesh-uri — 96 de suprafețe de bandă, 26 de carcase de semafor cu două cutii fiecare și 26 de lămpi, plus 7 batchuri pe material. Decorul 146 adăuga 36 de celule. Total 191 de draw calls pe scena de referință, peste plafonul indicativ de 128 al manifestului.
- **După**: aceleași 923 de elemente, 12 mesh-uri. Benzile sunt un singur mesh de asfalt (interval de vârfuri per element), iar semafoarele sunt 78 de instanțe thin ale unei cutii unitare (26 stâlpi, 26 carcase, 26 lămpi împărțite pe trei hosturi de stare). Total 48 de draw calls, sub plafon.

## Cum s-a verificat echivalența instanțelor

1. **Limite de element, înainte/după.** Proba înregistrează, pentru fiecare element randat, AABB-ul în coordonate de lume. Înainte venea din `meshFor(id)` + `lampFor(id)`; după vine din `elementBounds(id)` (interval de vârfuri pentru elementele fuzionate, matrice de instanță pentru semafoare). Abaterea maximă este **2,9 × 10⁻⁵ m**, adică limita de reprezentare `float32` (0,029 mm).
2. **Vârfuri de bandă.** Digest-urile FNV ale pozițiilor fiecărei benzi (96) sunt identice: fuziunea copiază aceleași valori în același interval.
3. **Matrice de instanță.** Testul `tests/rendering/city-scene.test.ts` verifică pentru fiecare cap de semafor, pe stâlp și carcasă: translația (poziția declarată), scara pe cele trei axe (dimensiunile cutiei) și axa locală `+X` (rotația `atan2(cos(facingRad), sin(facingRad))`), la 0,1 mm — exact compoziția `T · R · S` folosită anterior de `pushBox`.
4. **Identitate.** `getRenderedElementIds()` are aceleași 923 ID-uri, iar `createCityLayoutReport` raportează zero elemente lipsă, necunoscute sau fantomă.

## Cum funcționează LOD-ul la margine

Contract declarat în `src/rendering/lod-policy.ts`, aplicat de `BabylonCellBatches.updateLod`:

- prag nominal = `lodDistance` din preset (LOW 45 m, MEDIUM 90 m, HIGH 150 m), măsurat la **marginea cea mai apropiată** a batchului (`distanța la centru − raza conservatoare`, inclusiv scară/shear);
- `NEAR → FAR` doar peste `prag + 5 m`, `FAR → NEAR` doar la `prag − 5 m` sau sub el; la egalitate se păstrează nivelul curent;
- un proxy îndepărtat cu sfera mai mică de 95 % din sfera sursei detaliate este **respins** la admitere, deci comutarea nu poate micșora vizibil obiectul;
- exact un nivel este activ la orice distanță — fără cadru în care să lipsească sau să se dubleze geometria.

Cazul de margine documentat: un batch lat (celulă de decor de 120 m, rază ~100 m) păstrează geometria detaliată pentru că marginea apropiată rămâne în banda NEAR; un obiect mare nu comută niciodată cât timp ocupă ecranul. Testat: 2000 de eșantioane de dither în bandă dau 0 oscilații; traversarea pragului dă exact o comutare; balaria 0 → 4×prag dă o singură tranziție.

## Ce intră în shadow map

Prioritate explicită, plafon neschimbat din contractul 016 (LOW 0, MEDIUM 48, HIGH 96):

| Intră | Nu intră |
| --- | --- |
| vehiculul selectat (`essential`) | layout-ul static 042 (doar `receiveShadows`) |
| traficul simulat (`standard`) | decorul 146 |
| decor mic declarat (`optional`) | marcaje și lămpi emisive (materiale unlit) |
| | orice mesh neînregistrat |

Dovada: proba înregistrează 70 de vehicule `standard` și taxiul selectat **ultimul**, ca `essential`. La MEDIUM (48 de locuri) baseline-ul excludea taxiul (`essentialAdmitted 0`); după, taxiul intră primul și iese ultimul caster standard (`essentialAdmitted 1`, `admitted 48`). La HIGH intră toate cele 71. La LOW harta este dezactivată prin contract, deci nimic nu intră și `essentialDropped` rămâne 0.

## Cum s-a dovedit că pickingul rămâne corect după instanțiere

`tests/rendering/render-instancing.test.ts` construiește aceleași 70 de vehicule de două ori: ca mesh-uri obișnuite (forma dinainte de instanțiere) și ca batch thin în spatele `VehiclePickingRegistry`. Aceleași 48 de raze pe grilă de ecran trebuie să întoarcă exact aceleași ID-uri:

- toate cele 48 de raze sunt identice, iar 8 dintre ele nimeresc efectiv un vehicul (celelalte cad pe fundal, unde ambele variante întorc `null`);
- după o reordonare cu același număr de instanțe, după eliminarea a două vehicule și după comutarea pe hostul LOD îndepărtat, rezultatul rămâne identic;
- mutarea exclusivă a transformărilor schimbă rezultatul (dovada că razele chiar ating geometria mutată);
- în oraș, mesh-urile instanțiate rămân `isPickable = false`: grila de raze nu selectează niciun cap de semafor, iar registry-ul rămâne gol.

## Ce nu a putut fi măsurat

| Metrică | Motiv | Măsurat în schimb |
| --- | --- | --- |
| interval de cadru p95 / p99 | proba rulează în `NullEngine`, fără renderer hardware; un cadru software/headless nu este dovadă pentru FPS (Docs/25) | draw calls, instanțe, obiecte Babylon, vârfuri, bugete de umbre |
| lucru GPU p95 | fără context GPU nu există timer; valoarea rămâne `null`, nu 0 | idem, plus declarația explicită a pragului 28 ms din manifest |
| memorie GPU exactă | API neportabil | număr de mesh-uri/geometrii și octeți de buffer de matrice raportați de contract |

Gate-ul hardware al jocului complet rămâne `NOT_VALIDATED`; 157 nu înlocuiește 224 și nici soak-ul din 159.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run perf:render-budget -- --measure --capture=before` (pe sursa `546fa29e`) | 155 draw calls, 0 instanțe, MEDIUM esențial 0/1 |
| `npm run perf:render-budget -- --measure --capture=after` | 12 draw calls, 78 instanțe, MEDIUM esențial 1/1 |
| `npm run perf:render-budget` | **17 PASS, 0 FAIL, 2 NOT_MEASURED**, gate `STRUCTURAL_PASS` |
| `npm run perf:render-budget -- --check` | captura curentă, `report.json` curent, `report.md` curent (exit 0) |
| `npm run typecheck` | fără erori (`tsc --noEmit` + `tsconfig.tests.json`) |
| `npm run lint` | fără erori, `--max-warnings 0` |
| `npm run format:check` | toate fișierele conforme |
| `npm run check:architecture` | PASS (365 fișiere TS, probe negative incluse) |
| `npm run check:parameter-catalog` | sincronizat |
| `npm test` | **2849 teste, 2849 pass, 0 fail** (92 s) |

Teste țintă: `tests/rendering/city-scene.test.ts` (6 pass), `tests/rendering/lod-policy.test.ts` (7 pass), `tests/rendering/render-instancing.test.ts` (4 pass), `tests/rendering/lighting.test.ts` (8 pass), `tests/harness/render-budget.test.ts` (6 pass).

## Fișiere atinse

- `src/rendering/babylon/city-scene.ts` — benzi fuzionate, semafoare instanțiate, materiale statice înghețate, API de identitate (`elementGeometry`, `instanceIndexFor`, `signalHostFor`, `elementBounds`).
- `src/rendering/lod-policy.ts` — contract LOD declarat (praguri, histerezis, admiterea proxy-ului).
- `src/rendering/babylon/cell-batches.ts` — folosește contractul LOD, metrici `drawnHosts`/`nearBatches`, admiterea sursei îndepărtate.
- `src/rendering/babylon/daylight.ts` — admitere pe prioritate, `getShadowBudget()`, `SHADOW_MAP_CONTENT`.
- `src/rendering/index.ts`, `src/rendering/babylon/index.ts` — exporturi.
- `tests/harness/render-budget.ts`, `tests/harness/render-budget.test.ts` — proba și raportul.
- `tests/rendering/city-scene.test.ts`, `tests/rendering/lighting.test.ts` — contracte actualizate.
- `tests/rendering/lod-policy.test.ts`, `tests/rendering/render-instancing.test.ts` — teste noi.
- `scripts/run-render-budget-report.mjs`, `package.json` (`perf:render-budget`, ultima intrare).
- `Docs/city-visual.md`, `Docs/17-webgpu-si-performanta.md`, `Docs/lighting-quality.md` — secțiuni noi de contract.
- `Docs/Evidence/157-render-budget/` — `before.json`, `after.json`, `report.json`, `report.md`, acest README.

## Limitări

- Măsurarea este structurală; frame p95/p99 și GPU rămân `NOT_MEASURED` până la un gate hardware real (224), iar rezultatul nu certifică performanța jocului integrat.
- Starea lămpii de semafor este per host thin: schimbarea stării unui singur cap la runtime ar cere mutarea instanței între hosturi și nu este expusă; semafoarele rămân statice în layout, ca înainte.
- LOD-ul rămâne la nivel de batch, nu per element de layout; un batch cu o singură siluetă mare nu comută niciodată (comportament intenționat, documentat).
- Decorul 146 nu a fost modificat (36 de celule, 36 de draw calls) — era deja fuzionat pe celulă; câștigul lui 157 este în layout-ul 042.
- Instanțierea vehiculelor rămâne la latitudinea composition root-ului: contractele (`BabylonCellBatches`) sunt verificate, dar `src/main.ts` compune în continuare bootstrap-ul de randare, nu o cursă completă.

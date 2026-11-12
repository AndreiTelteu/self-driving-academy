# Dovezi PBI 160 — build de producție, CI și livrare statică

Buildul de producție este configurat explicit, fiecare artefact este măsurat, iar `dist/` este servit
printr-un server static minimal și verificat prin HTTP. Verificările obligatorii, gate-ul 224 și
buildul rulează într-o singură comandă CI, cu livrarea ultima: un pas eșuat oprește pipeline-ul
înainte de publicarea artefactului.

Rapoartele generate: [report.json](report.json) și [report.md](report.md) (artefacte, mărimi, WASM,
livrare statică, buget). Rularea CI: [ci-pipeline.json](ci-pipeline.json). Dovada negativă:
[negative/ci-pipeline.json](negative/ci-pipeline.json).

## Ce s-a implementat

- `vite.config.ts` — build de producție cu `base: './'` (referințe relative, servire din orice
  director static), `sourcemap: false`, `emptyOutDir`; nu atinge `src/`.
- `scripts/build-report.mjs` — raport determinist: build de două ori (reproductibilitate),
  inventar de artefacte cu mărimi/gzip/SHA-256, verificarea excluderilor de debug, coerența WASM cu
  pachetul și cu manifestul 150, servire statică prin HTTP și bugetul citit din manifest.
  `--check` compară raportul cu fișierele comise.
- `scripts/ci/run-release-pipeline.mjs` — pipeline-ul CI: verificări statice, teste, plan, board,
  manifest de asseturi, gate 224, build și livrare, cu `fail fast`, cod de ieșire corect și artefact
  `ci-pipeline.json`. Benzile `--lane=verify` (implicit) și `--lane=release`.
- `package.json` — intrări noi la finalul blocului `"scripts"`: `build:report`, `ci:verify`,
  `ci:release`.
- `Docs/18-validare-si-release.md` — secțiune nouă la finalul fișierului.
- `Docs/Evidence/160-build-delivery/` — acest README, raportul, rularea CI și dovada negativă.

`src/` nu a fost modificat, `Docs/performance-budgets.json` nu a fost modificat, iar probele
155/156/157/158/159/224 sunt **apelate**, nu editate.

## Artefactul buildului

Revizia curentă: 130 de fișiere, produse de `vite build` cu `base: './'`.

| Categorie | Fișiere | Bytes | Gzip |
| --- | ---: | ---: | ---: |
| JS | 126 | 3 478 683 | 864 492 |
| WASM | 2 | 2 646 596 | 898 104 |
| CSS | 1 | 43 917 | 6 922 |
| HTML | 1 | 2 882 | — |
| **Total** | **130** | **6 172 078** (5,89 MiB) | **1 769 518** |

JS+WASM împreună au **6 125 279 B**, adică **73,02 %** din capacitatea de 8 388 608 B
(`proposedCapacities.criticalJsWasmTransferBytes`, manifest `203-initial-1`). Bugetul este citit la
rulare din `Docs/performance-budgets.json`; raportul declara `WITHIN`, fără să modifice pragul.

Cele mai mari chunk-uri JS:

| Fișier | Bytes | Gzip |
| --- | ---: | ---: |
| `assets/index-CKTUUkAQ.js` | 1 342 577 | 324 482 |
| `assets/openpbrMaterial.pure-D5-b4fhI.js` | 141 120 | 31 722 |
| `assets/pbrMaterial.pure-Bdqi0dXe.js` | 135 852 | 25 553 |
| `assets/thinEngine.pure-6EYX9WhP.js` | 127 864 | 30 942 |
| `assets/pbr.fragment-BEZ30aNp.js` | 97 264 | 18 058 |

**Reproductibilitate.** Scriptul construiește artefactul de două ori, independent (în `dist/` și
într-un director temporar șters la final), și compară amprenta SHA-256 a arborilor: **130 de
artefacte, digest `81e33b1d8c54a53b97087288dac3b7cf1f9f833f66eef07b108a23dc2042d3a9` în ambele
rulări.**

## Ce este exclus în producție

Măsurat pe textele emise, nu presupus:

| Excludere | Valoare măsurată |
| --- | ---: |
| Source maps (`.map`) | 0 |
| Instrucțiuni `debugger` | 0 |
| Apeluri `console.log/debug/info/trace` | 0 |
| Chunk-uri de inspector Babylon | 0 |
| `import.meta.env` neînlocuit | 0 |

Inspectorul rămâne dependență de dezvoltare (`@babylonjs/inspector`) și nu ajunge în bundle;
`import.meta.env.DEV` este înlocuit la build, deci ramura de inspector din `src/main.ts` dispare.

## WASM și asseturi

| Id manifest 150 | Fișier pachet | Bytes pachet | Fișier emis | Bytes emis | Wire manifest | Coerent |
| --- | --- | ---: | --- | ---: | --- | --- |
| `runtime:wasm:glslang` | `node_modules/@babylonjs/core/assets/glslang/glslang.wasm` | 943 680 | `assets/glslang-G7Yt_-32.wasm` | 943 680 | 943 680 / `IDENTITY` | DA |
| `runtime:wasm:twgsl` | `node_modules/@babylonjs/core/assets/twgsl/twgsl.wasm` | 1 702 916 | `assets/twgsl-CB--yrSG.wasm` | 1 702 916 | 1 702 916 / `IDENTITY` | DA |

Fiecare modul emis este identic byte cu fișierul din pachet (SHA-256 comparat) și cu `wire.rawBytes`
din `Docs/Evidence/150-asset-manifest/asset-manifest.json`. Modulele JS de încărcare sunt și ele
emise: `assets/glslang-DqqdIFnr.js` (16 030 B) și `assets/twgsl-DqdFeK3J.js` (74 555 B). Bundle-ul
le referă prin `new URL('glslang-G7Yt_-32.wasm', import.meta.url)` și `new URL('twgsl-CB--yrSG.wasm',
import.meta.url)`, deci căile relative rămân valide la servire statică din orice director.

Rapier nu produce un `.wasm` separat: modulul său este inline base64 în `dist/rapier.mjs`, exact cum
îl contabilizează manifestul 150 (`BASE64_INLINE`). În V1 nu există GLB final; geometria și audio-ul
procedurale sunt generate la runtime, deci nu se pot „pierde la copiere”. Verificarea că nu se pierde
nimic este făcută pe totalul de 130 de artefacte, nu doar pe WASM.

## Livrare statică

`scripts/build-report.mjs` pornește un server `node:http` minimal (fără Vite dev server, fără
middleware de dezvoltare), cere `index.html`, toate cele 130 de artefacte și rădăcina `/`, și
compară pentru fiecare răspuns: statusul, mărimea, SHA-256 și `Content-Type`.

- **132 de cereri**, **130 de artefacte verificate**, **0 eșecuri**.
- Referințele din `index.html` sunt relative (`./assets/...`), nu absolute.
- WASM-ul este servit cu `Content-Type: application/wasm`; JS cu `text/javascript`, CSS cu `text/css`.

| Cerere | Status | Bytes | Content-Type |
| --- | ---: | ---: | --- |
| `/index.html` | 200 | 2 882 | `text/html; charset=utf-8` |
| `/assets/glslang-DqqdIFnr.js` | 200 | 16 030 | `text/javascript; charset=utf-8` |
| `/assets/glslang-G7Yt_-32.wasm` | 200 | 943 680 | `application/wasm` |
| `/assets/index-DdXCknGo.css` | 200 | 43 917 | `text/css; charset=utf-8` |
| `/assets/twgsl-CB--yrSG.wasm` | 200 | 1 702 916 | `application/wasm` |
| `/assets/twgsl-DqdFeK3J.js` | 200 | 74 555 | `text/javascript; charset=utf-8` |

Tabelul complet al cererilor și hash-urile fiecărui artefact sunt în [report.json](report.json).

## CI

`npm run ci:verify` (banda implicită) rulează în ordine, cu `fail fast`:

| Pas | Comandă | Rezultat |
| --- | --- | --- |
| `preflight:typecheck` | `npm run typecheck` | exit 0 |
| `preflight:lint` | `npm run lint` | exit 0 |
| `preflight:format` | `npm run format:check` | exit 0 |
| `preflight:architecture` | `npm run check:architecture` | exit 0 |
| `preflight:parameter-catalog` | `npm run check:parameter-catalog` | exit 0 |
| `tests:full` | `npm test` | exit 0, 2 888 teste, 2 888 pass, 0 fail |
| `plan:validate` | `PBI/Validate-Plan.ps1` | exit 1 → `DEBT` preexistent, publicat |
| `board:validate` | `PBI/Validate-Board.ps1` | exit 0 |
| `assets:manifest` | `npm run assets:manifest -- --check` | exit 0, 17/17 verificări |
| `gate:224` | `npm run perf:gate -- --check` | exit 0, structural `PASS`, release `NOT_VALIDATED` |
| `build:production` | `npm run build` | exit 0, 130 artefacte |
| `delivery:static` | `npm run build:report -- --check` | exit 0, 6 verificări, raport curent |

Livrarea este ultimul pas: dacă orice verificare obligatorie sau gate-ul 224 pică, buildul și
verificarea statică nu mai rulează, iar artefactul CI consemnează `NOT_DELIVERED`. Codurile de
ieșire, duratele reale și verdictul fiecărui pas sunt în [ci-pipeline.json](ci-pipeline.json).

Verdictul acestei revizii: **`PASSED_WITH_PLAN_DEBT`**, gate 224 **structural `PASS`, release
`NOT_VALIDATED`**, livrare **`STATIC_VERIFIED`**. Banda `npm run ci:release` refolosește jobul 224 cu
`--require=release`: fără o măsurătoare FPS pe hardware real, pe aceeași revizie, iese cu cod 1 și nu
declară livrare. FPS headless/software nu este acceptat ca substitut.

### Dovada negativă (criteriul 2)

Un fișier neformatat a fost adăugat temporar în `scripts/ci/` și pipeline-ul a fost rulat cu
`--out=Docs/Evidence/160-build-delivery/negative`. Rezultatul real, păstrat în
[negative/ci-pipeline.json](negative/ci-pipeline.json):

- `preflight:typecheck` exit 0, `preflight:lint` exit 0, `preflight:format` **exit 1**;
- pipeline-ul s-a oprit la `preflight:format`, cu `outcome: FAILED`, `failedStep:
  preflight:format`, `delivery.staticVerified: false`, `delivery.state: NOT_DELIVERED`;
- buildul și livrarea **nu au rulat**; procesul a ieșit cu cod 1.

Fișierul temporar a fost șters imediat; rularea verde de mai sus este cea comisă în
`ci-pipeline.json`.

## Datoria de plan, publicată

`PBI/Validate-Plan.ps1` este pe commitul de bază `c566a584` în stare roșie din cauza a șase linkuri
locale rupte, în fișiere care nu aparțin acestui PBI:

| Fișier | Link | Corecție minimă |
| --- | --- | --- |
| `Docs/map-integrity.md` | `../Evidence/043-map-integrity/README.md` | `Evidence/043-map-integrity/README.md` |
| `Docs/Evidence/133-export-profile/README.md` | `../../../../Docs/29-savefile-si-integritate.md` | `../../29-savefile-si-integritate.md` |
| `Docs/Evidence/148-audio-engine/README.md` | `../../../../Docs/16-asseturi-vizual-si-audio.md` | `../../16-asseturi-vizual-si-audio.md` |
| `PBI/Done/067-mode_toggle.md` | `../../Docs/Evidence/067-mode-controls/main-check.log` | fișierul nu este comis (`.log` ignorat) |
| `PBI/Done/145-vehicle_assets.md` | `Docs/Evidence/145-vehicle-assets/README.md` | `../../Docs/Evidence/145-vehicle-assets/README.md` |
| `PBI/Done/146-city_assets.md` | `Docs/Evidence/146-city-assets/README.md` | `../../Docs/Evidence/146-city-assets/README.md` |

Regulile boardului interzic modificarea altor PBI, iar 067 are nevoie de un fișier de log care nu
este în repo; de aceea datoria este **raportată, nu ascunsă**. Pipeline-ul o clasifică `DEBT` numai
când fișierul care conține linkul nu este atins de această schimbare. Regula a fost verificată în
ambele sensuri în timpul lucrului:

- un link rupt într-un fișier **neatins** (`Docs/map-integrity.md`) → `DEBT`, pipeline-ul continuă și
  publică datoria;
- un link rupt într-un fișier **modificat de acest PBI** (secțiunea din `Docs/18` referea acest
  README înainte ca fișierul să existe) → **blocant**, pipeline-ul s-a oprit cu `FAILED` înainte de
  build, fără livrare.

Un board invalid și orice altă eroare de plan rămân blocante în ambele cazuri.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 warnings |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0 |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm test` | exit 0, 2 888 teste, 2 888 pass, 0 fail |
| `npm run build` | exit 0, 130 artefacte, 6 172 078 B |
| `npm run build:report` | exit 0, 6 verificări PASS, raport scris |
| `npm run build:report -- --check` | exit 0, „Raport de build curent” |
| `npm run ci:verify` | exit 0, `PASSED_WITH_PLAN_DEBT`, gate 224 structural `PASS`, livrare `STATIC_VERIFIED` |
| `node scripts/ci/run-release-pipeline.mjs --out=…/negative` | exit 1, `FAILED`, `NOT_DELIVERED` (dovada negativă) |
| `npm run perf:gate -- --check` | exit 0, 17 rânduri, structural `PASS`, release `NOT_VALIDATED` |
| `npm run assets:manifest -- --check` | exit 0, 17/17 verificări, manifest curent |
| `pwsh -File ./PBI/Validate-Board.ps1` | exit 0, board valid |
| `pwsh -File ./PBI/Validate-Plan.ps1` | exit 1, link preexistent în `Docs/map-integrity.md` (datoria de mai sus) |

## Fișiere atinse

- `vite.config.ts` (nou)
- `scripts/build-report.mjs` (nou)
- `scripts/ci/run-release-pipeline.mjs` (nou)
- `package.json` (trei intrări la finalul blocului `"scripts"`)
- `Docs/18-validare-si-release.md` (secțiune nouă, la final)
- `Docs/Evidence/160-build-delivery/` (acest README, `report.json`, `report.md`,
  `ci-pipeline.json`, `negative/ci-pipeline.json`)
- `PBI/Done/160-build_delivery.md` (mutat fizic din `PBI/In Progress`)

## Limitări

- FPS-ul, frame p95/p99 și lucrul GPU pe hardware real rămân `NOT_VALIDATED` la gate-ul 224; acest
  PBI nu închide un criteriu hardware și nu substituie o măsurătoare reală cu una headless.
- Verificarea livrării este la nivel HTTP (status, mărime, SHA-256, MIME), nu o rulare completă de
  browser cu GPU pe `dist/`; partea de randare reală aparține probelor 154/155/220/224.
- `dist/` nu este comis (este în `.gitignore`); artefactul este reproductibil din `npm run build`, iar
  dovezile păstrează mărimile și hash-urile.
- Datoria de plan rămâne deschisă; corecțiile minime sunt listate mai sus, dar trec prin PBI-urile
  care dețin acele fișiere.
- Configurația HTTPS/CDN, cache-ul de producție și service worker-ul nu fac parte din scope.

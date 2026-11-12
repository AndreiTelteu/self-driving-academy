# Dovezi PBI 154 — matrice browsere WebGPU și WebGL 2

Matricea a rulat pe **un singur GPU real** (AMD Radeon Graphics, arhitectură RDNA-2, iGPU-ul Ryzen 7
7735U) și pe **un singur OS** (Windows 11 Home, build 10.0.26300), în **Chromium 156.0.8078.4**:
9 combinații reale, **9 PASS, 0 FAIL**, plus **11 verificări deterministe fără GPU, 11 PASS** și
**11 combinații declarate `NOT_RUN`** cu motiv explicit. Backendul efectiv este raportat de
contractele reale din `src/rendering` (`rendererKind`), nu dedus din user-agent.

Raportul generat: [report.json](report.json) și [report.md](report.md). Observațiile brute, cu
capabilitățile fiecărui context și statisticile capturilor: [browser.json](browser.json).

## Ce s-a implementat

- `tests/harness/compat-matrix.ts` — contractul determinist: matricea declarată, derivarea
  backendului așteptat din capabilități, verdictul pe fiecare combinație, raportul JSON/Markdown și
  verificarea de consistență a raportului.
- `tests/harness/compat-deterministic.ts` — 6 verificări de fallback pe politica reală
  `initializeBackend` (WebGPU, WebGL 2, ambele lipsă, doar WebGL 1) și 5 verificări de recuperare pe
  mașina de stări reală `createRendererRecovery`.
- `tests/harness/compat-matrix.test.ts` — 7 teste deterministe: ordinea politicii, `unknown` pentru
  driver ascuns, cele 11 verificări, raportul, lista `NOT_RUN` și respingerea unui raport inconsistent.
- `tests/browser/compat-154/` — pagina de harness: capabilități, probe de backend cu cub iluminat și
  recuperare cu pierdere nativă de dispozitiv/context.
- `scripts/run-compat-matrix-report.mjs` — raportul: `npm run qa:compat` derivează raportul din
  `browser.json` + verificările deterministe, `--check` compară fișierele comise, `--browser` reface
  probele în Chromium (necesită Playwright prin `PLAYWRIGHT_MODULE`).
- `package.json` — intrarea `qa:compat`, ultima din blocul `"scripts"`.
- `Docs/18-validare-si-release.md` — secțiune nouă la final.

`src/` nu a fost modificat. Nu au fost atinse `src/missions/`, `src/ui/`, `Docs/28`, `Docs/23`,
`tests/qa/`, `tests/scenarios/`, `tests/e2e/`, `tests/browser/qa-ui-153/`, `Docs/README.md` sau
`PBI/README.md`.

## Matricea executată

| ID | Scenariu | Intrare | Browser / canal | OS | GPU raportat de driver | Backend efectiv | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `production-headed-auto` | AUTO | `src/main.ts` | Chromium 156.0.8078.4 / headed | Windows 11 Home (10.0.26300) | `amd · rdna-2 · ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)` | **WEBGPU** | PASS |
| `production-headed-webgpu-off` | WEBGPU_UNAVAILABLE | `src/main.ts` | idem | idem | `ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11)` | **WEBGL2** | PASS |
| `production-headed-no-backend` | NO_BACKEND | `src/main.ts` | idem | idem | `unknown` | **NONE** | PASS |
| `production-headed-webgl1-only` | WEBGL1_ONLY | `src/main.ts` | idem | idem | `unknown` | **NONE** | PASS |
| `production-headless-auto` | AUTO | `src/main.ts` | Chromium 156.0.8078.4 / headless | idem | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` | **WEBGL2** | PASS |
| `harness-headed-auto` | AUTO | contracte `src/rendering` | Chromium 156.0.8078.4 / headed | idem | `amd · rdna-2 · ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) ...)` | **WEBGPU** | PASS |
| `harness-headless-auto` | AUTO | contracte `src/rendering` | Chromium 156.0.8078.4 / headless | idem | `ANGLE (Google, Vulkan ... SwiftShader driver)` | **WEBGL2** | PASS |
| `harness-headed-recovery-webgpu` | RECOVERY_LOSS | contracte 020 | Chromium 156.0.8078.4 / headed | idem | `amd · rdna-2 · ANGLE (AMD, ... Direct3D11 ...)` | **WEBGPU** | PASS |
| `harness-headless-recovery-webgl2` | RECOVERY_LOSS | contracte 020 | Chromium 156.0.8078.4 / headless | idem | `ANGLE (Google, Vulkan ... SwiftShader driver)` | **WEBGL2** | PASS |

`production` este intrarea reală `src/main.ts` (lifecycle 012 + recuperare 020 + view-ul real);
`compat-harness` apelează direct aceleași contracte pentru probe de backend și pierdere de dispozitiv.
Fiecare combinație are verificările `backend-efectiv`, `fara-ecran-gol`, `erori-de-pagina` și, pentru
harness, `randare-activa`; recuperarea adaugă verificarea `recuperare`. Detaliile per verificare sunt
în [report.md](report.md#verificările-fiecărei-combinații).

## Fallback forțat

- **WebGPU eliminat înainte de încărcarea modulelor** (`navigator.gpu` override) pe GPU real:
  aplicația de producție a ales **WebGL 2** (`ANGLE ... Direct3D11`), cu status
  `Bootstrap pregătit · Babylon.js · WEBGL2` și context WebGL 2 activ — fără ecran gol.
  Captură: [production-headed-webgpu-off.png](production-headed-webgpu-off.png).
- **Chromium headless** (fără adapter WebGPU utilizabil): tot **WebGL 2**, pe **SwiftShader**
  (Vulkan software). Captură: [production-headless-auto.png](production-headless-auto.png).
- **WebGPU și WebGL 2 lipsă**: producția afișează mesajul explicit
  „Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca.”, butonul
  **Reîncearcă** este vizibil, iar pagina are titlu și text — nu un canvas gol.
  Captură: [production-headed-no-backend.png](production-headed-no-backend.png).
- **Doar WebGL 1**: politică refuză explicit (`WebGL 1 is unsupported`), fără fallback ascuns; același
  mesaj + buton. Captură: [production-headed-webgl1-only.png](production-headed-webgl1-only.png).
- Determinism: `initializeBackend` alege `WEBGPU` când suportul există, `WEBGL2` când WebGPU lipsește,
  preferința `WEBGL2` nu consultă deloc WebGPU, iar cazul fără backend aruncă
  `RenderingInitializationError` cu mesajul românesc și cauzele agregate
  (`WebGPU unavailable | WebGL 2 context unavailable`).

## Recuperare după pierderea dispozitivului

Ambele backenduri au fost pierdute **nativ**, nu simulat prin evenimente sintetice:

| Backend | Semnal injectat | Generații | Tick înainte/după pierdere/după reluare | Secvența stărilor | Verdict |
| --- | --- | --- | --- | --- | --- |
| WebGPU | `GPUDevice.destroy()` | 1 → 2 → 5 | 417 / 417 / 417 | `RECOVERING → READY → RECOVERING → READY → RECOVERING → ERROR → RECOVERING → ERROR → RECOVERING → READY` | PASS |
| WebGL 2 (SwiftShader) | `WEBGL_lose_context.loseContext()` | 1 → 2 → 5 | 417 / 417 / 417 | idem | PASS |

După pierdere, scena este reconstruită din același checkpoint RAM: tick-ul 417 rămâne neschimbat,
mesh-ul de probă este activ (`activeMeshes = 1`) și cadrele avansează. Am forțat apoi **două eșecuri
de reconstrucție** (`Injected compat reconstruction failure`): starea devine `ERROR`, renderer-ul
defect este eliberat, mesajul este vizibil și butonul **Reîncearcă** apare; bucla de cadre continuă în
`ERROR` (6 cadre măsurate), deci UI-ul nu îngheață. A doua reîncercare revine în `READY`, cu același
checkpoint și tick 417. Capturi per backend:
[ready](harness-headed-recovery-webgpu-ready.png),
[error](harness-headed-recovery-webgpu-error.png),
[retry](harness-headed-recovery-webgpu-retry.png); pentru WebGL 2:
[ready](harness-headless-recovery-webgl2-ready.png),
[error](harness-headless-recovery-webgl2-error.png),
[retry](harness-headless-recovery-webgl2-retry.png).

Verificările deterministe acoperă aceeași mașină de stări fără GPU: `recuperare-pornire`,
`recuperare-pierdere`, `recuperare-esec-mesaj`, `recuperare-checkpoint-stabil`, `recuperare-reluare`
— toate PASS.

## Verificările deterministe (fără GPU)

| ID | Rezultat | Detaliu real |
| --- | --- | --- |
| `fallback-webgpu-disponibil` | PASS | backend efectiv WEBGPU |
| `fallback-webgpu-lipsa` | PASS | backend efectiv WEBGL2; nu s-a încercat WebGPU |
| `fallback-webgl2-fortat` | PASS | backend efectiv WEBGL2; suportul WebGPU nu a fost consultat |
| `fallback-preferinta-webgpu` | PASS | backend efectiv WEBGL2 |
| `fallback-fara-backend` | PASS | `RenderingInitializationError` cu mesajul „WebGPU și WebGL 2 nu sunt disponibile”; cauze `WebGPU unavailable | WebGL 2 context unavailable` |
| `fallback-doar-webgl1` | PASS | `RenderingInitializationError`; cauze `WebGPU unavailable | WebGL 1 is unsupported` |
| `recuperare-pornire` | PASS | `RECOVERING → READY` |
| `recuperare-pierdere` | PASS | `RECOVERING → READY → RECOVERING → READY`, generația +1, tick 417 |
| `recuperare-esec-mesaj` | PASS | `... → ERROR`, mesaj și reîncercare disponibile, renderer eliberat |
| `recuperare-checkpoint-stabil` | PASS | două eșecuri păstrează același checkpoint RAM |
| `recuperare-reluare` | PASS | `... → ERROR → RECOVERING → READY` fără reset |

## Combinații declarate `NOT_RUN`

11 combinații de referință nu pot fi rulate pe mașina aceasta și sunt declarate explicit, nu presupuse:
Firefox stable, WebKit/Safari, Edge stable, Chrome stable separat, Windows NVIDIA, Windows Intel,
macOS/Metal, Linux/Vulkan, Chrome Android, Safari iOS și Chromium headless cu WebGPU nativ. Motivele și
responsabilul fiecăreia sunt în [report.md](report.md#combinații-declarate-neexecutate-not_run) și în
`COMPAT_DECLARED_MATRIX` din contract.

## Gate de release

Acoperit acum: 9 combinații reale (9 PASS, 0 FAIL), 4 medii distincte (Chromium headed pe AMD, Chromium
headless pe SwiftShader, Chromium headed fără WebGPU, Chromium fără niciun backend), plus 11 verificări
deterministe. Rămân pentru **220/224/235**: hardware de referință NVIDIA/Intel și macOS/Linux,
Firefox/WebKit/Safari/Edge, FPS-ul și senzația de condus, soak-ul de 60 de minute și paritatea vizuală
completă. PBI 154 nu certifică performanța jocului integrat.

## Comenzi executate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (exit 0, `src` + `tests`) |
| `npm run lint` | PASS (exit 0, 0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (360 fișiere TypeScript, probe negative 6+4+3, lifecycle) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | 2 749 teste, 2 749 trecute, 0 eșuate, 0 sărite, 93 548 ms |
| `node --import ./scripts/register-typescript.mjs --test tests/harness/compat-matrix.test.ts` | 7 teste, 7 trecute, 0 eșuate |
| `npm run qa:compat` | 9 combinații, 9 PASS, 0 FAIL, 11 NOT_RUN, determinist 11/11, verdict PASS |
| `npm run qa:compat -- --check` | „Compat matrix report is current” + „Compat matrix markdown is current” |
| `npm run qa:compat -- --browser` | Chromium 156.0.8078.4; 9 combinații capturate, 13 PNG (`browser.json` scris) |

`--browser` a rulat cu `PLAYWRIGHT_MODULE` pointing at Playwright 1.64.1; fără el comanda afișează
explicit `SKIP` și nu pretinde că browserul a rulat.

## Fișiere atinse

- `tests/harness/compat-matrix.ts` (nou), `tests/harness/compat-deterministic.ts` (nou),
  `tests/harness/compat-matrix.test.ts` (nou)
- `tests/browser/compat-154/index.html`, `tests/browser/compat-154/main.ts` (nou)
- `scripts/run-compat-matrix-report.mjs` (nou)
- `package.json` (intrarea `qa:compat`, ultima din `"scripts"`)
- `Docs/18-validare-si-release.md` (secțiune nouă la final)
- `Docs/Evidence/154-compat-matrix/` (acest README, `report.json`, `report.md`, `browser.json`,
  13 PNG)
- `PBI/In Progress/154-compat_matrix.md` → `PBI/Done/154-compat_matrix.md`

## Constatare neblocantă (defect de copy, raportat nu reparat)

Mesajul de eroare din view-ul real dublează prefixul: `RenderingInitializationError` are deja textul
„Randarea nu a pornit. …”, iar `createRenderingView` îl prefixează din nou, rezultând
„Randarea nu a pornit. Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca.”
Este vizibil în [production-headed-no-backend.png](production-headed-no-backend.png). `src/` nu a
fost modificat; pentru reparare este nevoie de un PBI care deține `src/ui/rendering-view.ts` sau
`src/rendering/backend-policy.ts`.

## Limitări

- **Un singur GPU real și un singur OS**: AMD Radeon Graphics (RDNA-2, iGPU Ryzen 7 7735U) pe Windows
  11. NVIDIA, Intel, macOS/Metal și Linux/Vulkan rămân `NOT_RUN`.
- **Un singur runtime**: Chromium 156 din Playwright. Firefox, WebKit/Safari și Edge stable nu au
  fost rulate; nu se pretinde paritate pe ele.
- **Headless este software**: WebGL 2 pe SwiftShader dovedește fallback-ul, contextul și mesajele, nu
  FPS, latența sau senzația de condus pe GPU.
- **Pierderea este injectată**: `GPUDevice.destroy()` / `WEBGL_lose_context.loseContext()`, nu o
  defectare hardware observată. Nu am măsurat timpul de recompilare a shader-elor sau durata până la
  primul cadru după recuperare.
- **Scena de probă este un cub iluminat**, nu gameplay-ul complet; paritatea vizuală și costul de
  cadru rămân ale gate-urilor 220/224/235.
- **WebGPU nativ în headless** nu a putut fi testat; `navigator.gpu` există pe localhost, dar nu
  expune un adapter utilizabil, deci combinația este `NOT_RUN`.

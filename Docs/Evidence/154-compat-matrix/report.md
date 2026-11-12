# Matricea de compatibilitate WebGPU și WebGL 2 (PBI 154)

Generat de `scripts/run-compat-matrix-report.mjs` la `2026-11-12T03:37:38.549Z`. Comanda: `npm run qa:compat`.

Gazdă: **Windows 11 Home (10.0.26300)**, AMD Ryzen 7 7735U with Radeon Graphics, 16 fire, 14 GiB RAM, Node 24.19.0, Chromium 156.0.8078.4.

## Matricea executată

| ID | Scenariu | Intrare | Browser | Canal | OS | GPU raportat de driver | Backend efectiv | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| production-headed-auto | AUTO | production | Chromium 156.0.8078.4 | headed | Windows 11 Home (10.0.26300) | amd · rdna-2 · ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11) | WEBGPU | PASS |
| production-headed-webgpu-off | WEBGPU_UNAVAILABLE | production | Chromium 156.0.8078.4 | headed | Windows 11 Home (10.0.26300) | ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11) | WEBGL2 | PASS |
| production-headed-no-backend | NO_BACKEND | production | Chromium 156.0.8078.4 | headed | Windows 11 Home (10.0.26300) | unknown | NONE | PASS |
| production-headed-webgl1-only | WEBGL1_ONLY | production | Chromium 156.0.8078.4 | headed | Windows 11 Home (10.0.26300) | unknown | NONE | PASS |
| production-headless-auto | AUTO | production | Chromium 156.0.8078.4 | headless | Windows 11 Home (10.0.26300) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | WEBGL2 | PASS |
| harness-headed-auto | AUTO | compat-harness | Chromium 156.0.8078.4 | headed | Windows 11 Home (10.0.26300) | amd · rdna-2 · ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11) | WEBGPU | PASS |
| harness-headless-auto | AUTO | compat-harness | Chromium 156.0.8078.4 | headless | Windows 11 Home (10.0.26300) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | WEBGL2 | PASS |
| harness-headed-recovery-webgpu | RECOVERY_LOSS | compat-harness | Chromium 156.0.8078.4 | headed | Windows 11 Home (10.0.26300) | amd · rdna-2 · ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001681) Direct3D11 vs_5_0 ps_5_0, D3D11) | WEBGPU | PASS |
| harness-headless-recovery-webgl2 | RECOVERY_LOSS | compat-harness | Chromium 156.0.8078.4 | headless | Windows 11 Home (10.0.26300) | ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | WEBGL2 | PASS |

### Verificările fiecărei combinații

- **production-headed-auto** — Bootstrap de producție — AUTO alege backendul disponibil
  - PASS `backend-efectiv`: așteptat WEBGPU, observat WEBGPU
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **production-headed-webgpu-off** — Fallback forțat — navigator.gpu eliminat înainte de module
  - PASS `backend-efectiv`: așteptat WEBGL2, observat WEBGL2
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **production-headed-no-backend** — Fără WebGPU și fără WebGL 2 — mesaj explicit, fără ecran gol
  - PASS `backend-efectiv`: așteptat NONE, observat NONE
  - PASS `fara-ecran-gol`: conținut vizibil true, mesaj explicit true, reîncercare vizibilă true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **production-headed-webgl1-only** — Doar WebGL 1 — refuz explicit, fără fallback ascuns
  - PASS `backend-efectiv`: așteptat NONE, observat NONE
  - PASS `fara-ecran-gol`: conținut vizibil true, mesaj explicit true, reîncercare vizibilă true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **production-headless-auto** — Bootstrap de producție headless — WebGL 2 pe SwiftShader
  - PASS `backend-efectiv`: așteptat WEBGL2, observat WEBGL2
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **harness-headed-auto** — Contractele reale apelate direct — backend AUTO pe GPU real
  - PASS `backend-efectiv`: așteptat WEBGPU, observat WEBGPU
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `randare-activa`: mesh-uri active 1, cadre avansate true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **harness-headless-auto** — Contractele reale apelate direct — backend AUTO pe WebGL 2 software
  - PASS `backend-efectiv`: așteptat WEBGL2, observat WEBGL2
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `randare-activa`: mesh-uri active 1, cadre avansate true
  - PASS `erori-de-pagina`: nicio eroare de pagină
- **harness-headed-recovery-webgpu** — Pierdere reală de dispozitiv WebGPU, eșec repetat și reluare
  - PASS `backend-efectiv`: așteptat WEBGPU, observat WEBGPU
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `randare-activa`: mesh-uri active 1, cadre avansate true
  - PASS `erori-de-pagina`: nicio eroare de pagină
  - PASS `recuperare`: semnal GPUDevice.destroy, generații 1→2→5, tick 417/417/417
- **harness-headless-recovery-webgl2** — Pierdere reală de context WebGL 2 (SwiftShader), eșec repetat și reluare
  - PASS `backend-efectiv`: așteptat WEBGL2, observat WEBGL2
  - PASS `fara-ecran-gol`: conținut vizibil true, context activ true
  - PASS `randare-activa`: mesh-uri active 1, cadre avansate true
  - PASS `erori-de-pagina`: nicio eroare de pagină
  - PASS `recuperare`: semnal WEBGL_lose_context.loseContext, generații 1→2→5, tick 417/417/417

## Fallback și recuperare, determinist (fără GPU)

| ID | Verificare | Rezultat | Detaliu |
| --- | --- | --- | --- |
| fallback-webgpu-disponibil | WebGPU disponibil → backend efectiv WebGPU | PASS | backend efectiv WEBGPU |
| fallback-webgpu-lipsa | WebGPU absent → fallback automat pe WebGL 2 | PASS | backend efectiv WEBGL2 |
| fallback-webgl2-fortat | Preferința WebGL 2 nu consultă WebGPU | PASS | backend efectiv WEBGL2 |
| fallback-preferinta-webgpu | Preferința WebGPU fără suport → WebGL 2 | PASS | backend efectiv WEBGL2 |
| fallback-fara-backend | Niciun backend → eroare explicită, nu ecran gol | PASS | backend NONE; RenderingInitializationError: Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca. (cauze: WebGPU unavailable \| WebGL 2 context unavailable) |
| fallback-doar-webgl1 | Doar WebGL 1 → refuz explicit, fără fallback ascuns | PASS | backend NONE; RenderingInitializationError: Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca. (cauze: WebGPU unavailable \| WebGL 1 is unsupported) |
| recuperare-pornire | Pornirea ajunge în READY pe primul renderer | PASS | stări: RECOVERING → READY |
| recuperare-pierdere | Pierderea de dispozitiv reconstruiește din același tick | PASS | stări: RECOVERING → READY → RECOVERING → READY |
| recuperare-esec-mesaj | Eșecul repetat afișează mesaj și reîncercare | PASS | stări: RECOVERING → READY → RECOVERING → READY → RECOVERING → ERROR |
| recuperare-checkpoint-stabil | Reîncercarea păstrează același checkpoint RAM | PASS | stări: RECOVERING → READY → RECOVERING → READY → RECOVERING → ERROR → RECOVERING → ERROR |
| recuperare-reluare | Reîncercarea explicită restaurează READY fără reset | PASS | stări: RECOVERING → READY → RECOVERING → READY → RECOVERING → ERROR → RECOVERING → ERROR → RECOVERING → READY |

## Combinații declarate, neexecutate (NOT_RUN)

| ID | Browser | OS | GPU | Motiv | Responsabil |
| --- | --- | --- | --- | --- | --- |
| firefox-stable | Firefox stable | oricare | oricare | Runtime Firefox nu este instalat în ms-playwright (există doar chromium-1248); nu a fost rulat. | 154 (mașină separată sau instalare Playwright Firefox) |
| webkit-safari | WebKit / Safari | oricare | oricare | Runtime WebKit nu este instalat, iar Safari nu există pe Windows. | 154 (hardware macOS) |
| edge-stable | Microsoft Edge stable | Windows 11 | oricare | Canalul Edge stable nu este instalat; Chromium de test acoperă motorul, nu integrarea Edge. | 154 (instalare Edge) |
| chrome-stable | Google Chrome stable | Windows 11 | oricare | Nu există o instalare Chrome stable separată; Chromium 156 din Playwright este singurul runtime. | 154 (instalare Chrome) |
| windows-nvidia | Chromium 156 | Windows 11 | NVIDIA (GeForce) | Mașina are un iGPU AMD; nu există GPU NVIDIA pentru proba driverului proprietar. | 220 / 224 |
| windows-intel | Chromium 156 | Windows 11 | Intel (Arc / Iris Xe) | Nu există GPU Intel pe mașină. | 220 / 224 |
| macos-metal | Safari / Chromium | macOS | Apple Metal | Nu există hardware macOS; WebGPU pe Metal și fallback-ul WebGL 2 nu pot fi rulate aici. | 224 / 235 |
| linux-vulkan | Chromium / Firefox | Linux | AMD / Intel Vulkan | Nu există hardware Linux; driverul Vulkan și compozitorul nu pot fi verificate aici. | 224 / 235 |
| android-chrome | Chrome Android | Android | SoC mobil | Nu există dispozitiv Android; suportul WebGPU mobil rămâne nevalidat. | 224 / 235 |
| ios-safari | Safari iOS | iOS / iPadOS | Apple Metal | Nu există dispozitiv iOS; WebGPU și fallback-ul pe WebKit mobil rămân nevalidate. | 224 / 235 |
| chromium-headless-webgpu | Chromium 156 headless | Windows 11 | SwiftShader | Chromium headless nu expune un adapter WebGPU utilizabil; pe această configurație se verifică doar fallback-ul WebGL 2 software. | 154 (flag-uri headless sau GPU real) |

## Gate de release

Acoperit acum: 9 combinații reale (9 PASS, 0 FAIL), 4 medii distincte, pe Windows 11 Home (10.0.26300). Verificări deterministe fără GPU: 11/11 trecute. Rămâne pentru gate-urile 220/224/235: hardware de referință NVIDIA/Intel și macOS/Linux, Firefox/WebKit/Safari/Edge, FPS și senzația de condus, soak-ul de 60 de minute și paritatea vizuală completă.

## Metodă

- Backendul efectiv este raportat de contractele reale din `src/rendering` (`rendererKind`), nu dedus din user-agent.
- Combinația browser/OS/GPU vine din `navigator.userAgent`, versiunea raportată de Chromium și driverul expus de `navigator.gpu` / `WEBGL_debug_renderer_info`; când driverul ascunde numele, valoarea este `unknown`.
- `production` înseamnă intrarea reală `src/main.ts` (lifecycle 012 + recuperare 020 + view-ul real); `compat-harness` înseamnă aceleași contracte apelate direct, pentru probe de backend și pierdere de dispozitiv.
- Fallback forțat: `navigator.gpu` este eliminat înainte de încărcarea modulelor, apoi `AUTO` trebuie să aleagă WebGL 2; cazul fără niciun backend cere un mesaj explicit și buton de reîncercare.
- Recuperarea este declanșată nativ: `GPUDevice.destroy()` pe WebGPU și `WEBGL_lose_context.loseContext()` pe WebGL 2, apoi reconstrucția din același checkpoint RAM.
- Verificările deterministe (fără GPU) rulează pe contractele pure de politică a backendului și de recuperare; `--check` compară raportul derivat cu fișierele comise.

## Limitări

- Un singur GPU real (AMD Radeon Graphics / RDNA-2, iGPU-ul Ryzen 7 7735U) și un singur OS (Windows 11). NVIDIA, Intel, macOS/Metal și Linux/Vulkan rămân NOT_RUN.
- Chromium 156 este singurul runtime Playwright instalat; Firefox, WebKit/Safari și Edge stable nu au fost rulate.
- Chromium headless rulează WebGL 2 pe SwiftShader (software); rezultatul dovedește fallback-ul și mesajele, nu FPS sau senzația de condus pe GPU.
- Pierderea de dispozitiv este injectată deliberat (destroy / lose-context), nu o defectare hardware observată; recuperarea nu măsoară timpul de recompilare a shader-elor.
- Scena de probă este un cub iluminat, nu gameplay-ul complet; paritatea vizuală și costul de cadru rămân ale gate-urilor 220, 224 și 235.

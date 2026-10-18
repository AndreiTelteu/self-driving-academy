# PBI052 — diagnostic RAF_ONLY: localizarea stall-ului (2026-10-18)

Diagnostic reutilizat `tests/browser/raf-scheduling-diagnostic` (3 faze × 40 s, port 5215, viewport real
1920×1080 DPR1 verificat cu `window.innerWidth/innerHeight`). Valoare doar diagnostică: `performanceAcceptance`
și `hardwareFullAcceptance` rămân false. Nu înlocuiește nicio probă și nu validează performanța.

## Sesiuni

| Folder | Conținut | Rezultat |
| --- | --- | --- |
| `raf-scheduling-20261018T194259673Z` | AUTO | `INCOMPLETE_DIAGNOSTIC`, 0 waits („diagnostic dimensions changed”, fereastra nu avea 1920×1080) |
| `raf-scheduling-20261018T194430232Z` | AUTO (WebGPU) | `COMPLETE_DIAGNOSTIC`, 7183 waits |
| `raf-scheduling-20261018T194902703Z` | WEBGL2 | `COMPLETE_DIAGNOSTIC`, 7194 waits |

Ambele sesiuni complete au trecut `verify.mjs --build-only`
(`DIAGNOSTIC_BUILD_ONLY_PASS`, `source cc147f36…`, `artifact 37c91fd7…`, `native 02dc6a4e…`).
Identitatea de build e identică între cele două sesiuni complete.

## Rezultate pe faze (maxWait = callback−request; maxStampGap = delta între stampile RAF)

| Fază | AUTO (WebGPU) | WEBGL2 |
| --- | --- | --- |
| `RAF_ONLY` (fără renderer, fără native) | 2397 waits, maxWait **19.0 ms**, gap **17.3 ms** | 2397 waits, 18.9 ms, 17.6 ms |
| `EMPTY_RENDERER` (canvas GPU, scenă goală) | 2387 waits, maxWait **214.0 ms**, gap **200.2 ms** | 2398 waits, **17.8 ms**, 17.6 ms |
| `NATIVE_RENDERER_SETUP` | 1 wait, 0.1 ms | 1 wait, 0.2 ms |
| `NATIVE70` (70 mașini) | 2398 waits, 16.9 ms, 17.4 ms | 2398 waits, 17.2 ms, 17.9 ms |
| Longtasks | **0** | 1 × 51 ms (la 97800.9, granița setup/NATIVE70) |
| waits care se suprapun unui longtask | 0 | 1 |

## Interpretare

- **`RAF_ONLY` este curat pe ambele backenduri** (max ≤19 ms). Browserul livrează corect frame-urile când nu
  există un canvas cu context GPU → nu e o problemă generală de scheduler/compositor.
- Stall-ul de ~200 ms apare pe **WebGPU** în faza `EMPTY_RENDERER`, cu **scenă goală** (deci fără muncă de
  aplicație, fără simulare) și cu **zero longtask** → firul principal nu e blocat; e o întârziere de
  **prezentare a canvas-ului WebGPU** (swap-chain/present), nu cost de aplicație.
- WEBGL2 nu a avut niciun stall în nicio fază (max ≤17.9 ms), deci problema e specifică căii WebGPU pe acest
  iGPU AMD (Radeon 680M, Chrome 155).
- Se confirmă astfel atribuirea din `stall-attribution.md` și se exclude „browser/compositor general”:
  RAF_ONLY curat + scenă goală în stall ⇒ GPU-canvas WebGPU.

## Limite

- Câte o singură probă per backend; stall-ul e intermitent și faza în care apare variază (în smoke a apărut în
  `NATIVE70`/măsurat, aici în `EMPTY_RENDERER`). Atribuirea „pe fază” este per apariție, nu deterministică.
- Fixtura adaugă overhead propriu de observare (per-RAF, timer 50 ms, observer) și nu e probă de performanță.
- Cauza ultimă rămâne nedeterminată (driver AMD vs. Chrome/Dawn vs. memorie GPU); probele locale nu au arătat
  TDR, crash sau throttling.
- Nu se schimbă statusul PBI, nu se bifează criterii, nu se declară PASS de hardware/full.

## Reproductibilitate

`raf-scheduling-run-20261018*` conțin logurile serverului. Driverul CDP (`drive-raf.mjs`) fixează viewportul real
la 1920×1080 (redimensionare fereastră, fallback pe emulare) și așteaptă re-activarea butonului, adică ACK-ul
exportului. Sumarizarea pe faze: `raf-summarize.mjs`.

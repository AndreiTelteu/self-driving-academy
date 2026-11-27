# 280 — camera first-person din poziția șoferului

Status: implementare live în compunerea V3, verificată determinist și în browser pe WEBGL2 și WEBGPU.
PBI-ul rămâne In Progress până când orchestratorul îl integrează și îl mută fizic în Done.

## Ce este montat

- `C` folosește bindingul 009 `camera` (remapabil în 080). Comută numai preferința de prezentare
  `CHASE ↔ FIRST_PERSON`; nu avansează un tick și nu scrie autoritate, poziție, viteză sau segment.
- FIRST_PERSON se publică numai cât timp jucătorul conduce mașina: intrarea, preluarea și schimbarea
  vehiculului pornesc camera din scaunul șoferului; ieșirea revine la camera de urmărire a
  personajului. O selecție doar de cameră a altei mașini rămâne CHASE până la preluarea explicită.
- Ancoră calibrată din geometria 145: sedan `(-0.343, 1.460, 0.058)` m, compact
  `(-0.317, 1.477, -0.014)` m în cadrul autoritativ de la sol. Poziția este transformată prin yaw-ul
  mașinii; camera nu are întârziere care să traverseze caroseria.
- FOV-ul este exact `ControlPreferences.fov` (60/75/100° măsurate la repaus); la viteză, contractul
  017 existent adaugă extensia lui de max +8° (77,29–77,32° la ~5,7 m/s).
- Caroseria mașinii conduse este ascunsă numai în FIRST_PERSON (15 meshuri vizibile → 0 → 15), iar
  `minZ` coboară de la 0,10 m la 0,05 m. Nu există interior modelat în V3, deci tot shellul exterior
  al mașinii conduse este ascuns; orașul, traficul, luminile și celelalte mașini rămân randate.
- Camera 194 de urmărire este calculată în continuare în fiecare tick, dar nu este publicată cât timp
  FIRST_PERSON este activ. La revenirea pe CHASE nu există un al doilea owner sau o poziție veche.
- Preferința este scrisă în store-ul 009 și într-o singură cheie `localStorage`
  (`009-camera-mode-v1`). Reload-ul o citește înainte de prima compunere; 278 nu este extins.
- G intrare/ieșire este acum o graniță 069 reală: intrarea deschide segmentul MANUAL, ieșirea îl
  închide cu `RETURN_TO_AUTO`, iar schimbarea vehiculului îl închide cu `VEHICLE_SWITCH`. Fără
  această legare, ieșirea după o preluare producea `Intervention accepted physical phase mismatch`.

## Verificări

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm test` | 3797 teste, 3783 pass, 14 skip, 0 fail |
| `npm run build` | PASS |
| `npm run check:architecture` | PASS (486 fișiere TypeScript) |
| `npm run composition:report -- --check` | PASS |
| `npm run docs:check -- --check` | PASS |
| `npm run camera:first-person` | 5/5 scenarii PASS, digest `7a47aa66c92c8728982dca887fcca8643c762b8bb80c2e1d83f1ec944a200e4c` |
| `npm run camera:first-person:probe` | Chrome 157 headed, 1280×720, **WEBGL2 PASS 12/12**, **WEBGPU PASS 12/12** |

Raportul determinist este [report.json](report.json) / [report.md](report.md); proba de browser este
[browser.json](browser.json) / [browser.md](browser.md), cu capturi în `screenshots/`.

## Numerele probei de browser

- FOV setat prin suprafața reală 081/279 la **75°**; first-person la repaus măsoară **75,0000°** pe
  ambele backenduri. La condus: **77,2905°** (WEBGL2, 5,73 m/s) și **77,2595°** (WEBGPU, 5,65 m/s).
- Ancoră first-person: `(9.857600, 1.460000, 2.393200)` m; `distanceM = 0`; look-at la 1 m înainte.
- Meshuri vizibile ale mașinii conduse: **15** în CHASE → **0** în FIRST_PERSON → **15** la revenire.
- `minZ`: **0,10 m** în CHASE → **0,05 m** în FIRST_PERSON.
- Autoritate înainte/după `C`: `VEHICLE:taxi-01`; segment `271-live-three-modes:segment:1`, start
  tick **60** (WEBGL2) / **59** (WEBGPU), neschimbat; viteză **0** la comutarea de repaus.
- Ieșire: autoritate `CHARACTER:player-character`, cameră CHASE pe personaj; reintrare: FIRST_PERSON
  pe `taxi-01`. Reload: store `FIRST_PERSON`, cameră `FIRST_PERSON` fără nicio apăsare `C`.
- Cost local tick (Node 24, o compunere, 120 warmup + 600 tickuri × 3 repetări alternate): CHASE p95
  median **0,0864 ms**, FIRST_PERSON **0,0944 ms**, delta **+0,0080 ms**. Nu este FPS/GPU/hardware.
- Zero erori de pagină în ambele backenduri.

## Backenduri

- **WEBGL2:** PASS 12/12, capturi `webgl2-01..07`.
- **WEBGPU:** PASS 12/12, capturi `webgpu-01..07`.
- Proba a rulat Chrome 157 **headed** (implicit) pentru a evita pauza `overload` a tickului fix sub
  headless WebGPU; `PLAYWRIGHT_HEADLESS=1` este opt-in și raportează `NOT_RUN` dacă un backend nu
  poate rula. Nu este un playtest uman și nu măsoară FPS/GPU/hardware.

## Limitări

- Nu există interior complet modelat; first-person ascunde shellul exterior al mașinii conduse.
- Mouse look, recenter și pointer lock rămân contractul fixture-ului 017; PBI 280 montează `C`,
  ancora, FOV-ul, tranzițiile și preferința salvată.
- Raportul de cost este local, nu înlocuiește gate-ul de performanță 203/287.
- Proba este Chrome headless/headed automat, nu un playtest uman; senzația subiectivă rămâne
  `NOT_RUN`.

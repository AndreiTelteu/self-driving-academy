# 271 — cele trei moduri live

Implementarea locală a matricii AUTO/MANUAL/LEARNING peste compunerea V3. Owner-ul este
`src/app/live-three-modes.ts`; compunerea rămâne singurul owner al tick-ului, fizicii și vehiculelor.

## Ce s-a livrat

- `createLiveModeSegments` montează ciclul real 069 (`createInterventionLifecycle`, record store,
  event transport și intake) peste autoritatea `InputAuthorityArbiter` a compunerii V3.
- Fiecare tick pregătește o singură graniță 069; compunerea aplică modul și settlează exact tick-ul
  acceptat. Nu există un al doilea ledger, store sau model de simulare.
- `M` = AUTO ↔ MANUAL și LEARNING → AUTO; `L` = AUTO/MANUAL → LEARNING și LEARNING → MANUAL.
  Tastele reale, butonul HUD `M`, butonul HUD `L` și butonul `L` din panoul `Flotă` folosesc aceeași
  funcție `requestModeAction`.
- Segmentele MANUAL au `learningEligible=false`; segmentele LEARNING eligibile sunt expuse ca read
  model pentru 272 (`workspace: TELEMETRY_272`) cu `profilePublications: 0`, fără job/estimator.
- HUD-ul afișează textele cerute: „Conduce AI-ul” (`AI`), „Conduci · învățare oprită” (`M`) și
  „Conduci · orașul învață” (`L`).
- Tranziția nu rescrie viteza, yaw-ul sau poziția cu un salt. AUTO reia poziția fizică printr-un
  tick de coast, apoi reproiectează pe graful de benzi.
- Un singur scaun `PLAYER`; vehiculul părăsit revine în AUTO cu ruta păstrată. Sesiunea/reluarea
  retrage segmentul deschis cu motiv terminal, iar un reload pornește fără segmente orfane.

## Dovezi deterministe

`npm run modes:live` scrie:

- [report.json](report.json) — 12 tranziții (șase pe taxi, șase pe civil), segmentele 069 închise și
  deschise, poziția/ruta/clasa/profilul, un scaun `PLAYER`, delta de viteză/heading/pas.
- [report.md](report.md) — tabelul lizibil.

Rezultat: **12 tranziții, 4 segmente LEARNING expuse, 0 publicări de profil, 0 eșecuri**.

## Dovezi de browser

`npm run modes:live:probe` a rulat buildul real în Chrome 157 (HeadlessChrome, WEBGL2, 1440×900) și
a trecut **11/11** verificări: panoul flotei, preluarea `M`, toate cele șase tranziții cu `L`/`M`,
un singur scaun, HUD-ul LEARNING, expunerea pentru 272 fără publicare și revenirea AUTO.

Artefacte: [browser.json](browser.json), [browser.md](browser.md), capturi în `screenshots/`.

## Verificări

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm test` | 3690 PASS, 0 FAIL, 14 skipped |
| `npm run build` | PASS |
| `npm run check:architecture` | PASS |
| `npm run composition:report -- --check` | PASS |
| `npm run docs:check -- --check` | PASS |
| `npm run modes:live` | 12 tranziții, 0 eșecuri |
| `npm run modes:live:probe` | 11/11 PASS |

## Teste țintă

- `tests/app/live-three-modes.test.ts` — șase tranziții pe taxi și civil, eligibilitate, pauză,
  HUD, un scaun `PLAYER`, reluarea AUTO și expunerea LEARNING.
- `tests/app/live-fleet-selection.test.ts` — contractul 263 actualizat pentru `L` și continuitatea
  fizică la preluare.
- `tests/app/vehicle-mode-hud.test.ts` — contractul 257 AUTO/MANUAL rămâne verde.

## Limitări

- `G` intrare/ieșire rămâne traseul 195/196/198; nu deschide un segment 069 separat. Segmentele 069
  live sunt deschise de `M`/`L`, de butoanele HUD și de preluarea/eliberarea din panoul `Flotă`.
- AUTO reia exact primul tick din poziția condusă, dar reproiectarea completă pe bandă și reintrarea
  off-lane rămân 054/282.
- Capacitatea 069 este 64 de segmente per ciclu de viață; o sesiune foarte lungă trebuie recreată la
  granița de sesiune.
- Proba de browser este un drum scurt, nu un playtest complet; nu măsoară FPS/GPU/hardware.
- Telemetria, joburile, estimatorul și profilul live rămân 272/273.

# Dovezi 212 — progresul live și interfața misiunilor zilei

Status: implementare și validare deterministă locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost structural UI), conform [politicii proporționale](../../validation-policy.md).
Nu se revendică FPS, GPU, soak sau hardware; gate-urile integrate rămân 155/159/220/224.

## Ce s-a livrat

- `src/missions/daily-progress.ts` — consumatorul `212-daily-progress-v1`: filtrează `sessionId`/
  `worldEpoch`, urmărește intervalele `PICKUP`..`DROPOFF`, atribuie modul real, numără refuzurile
  explicit, aplică fereastra/bugetul autorate și refolosește recompensa 211. Expune un read model
  (`DailyProgressRead`) și un checkpoint (`snapshot()` / `restoreDailyProgress`).
- `src/missions/index.ts` — exporturi aditive, adăugate la finalul listei existente.
- `src/ui/daily-progress-format.ts` — `212-daily-progress-panel-v1`: parser strict peste read model-ul
  212 și proiecție deterministă (etichete, procente, XP, fus orar, reset, motive).
- `src/ui/daily-progress.ts` — panoul read-only: buton nativ, dialog, focus mutat/readus, Escape, Tab
  în panou, zero listeners globali, o citire per deschidere.
- `src/ui/index.ts` — exporturi aditive.
- `tests/ui/daily-progress-fixture.ts`, `tests/ui/daily-progress.test.ts` — 16 teste deterministe.
- `tests/ui/daily-progress-report.ts` + `scripts/run-daily-progress-report.mjs` — raport determinist,
  26 de verificări, suport `--check`.
- `package.json` — `missions:daily-progress`, ultima intrare din blocul `scripts`.
- [Docs/23-misiuni-zilnice-si-experienta.md](../../23-misiuni-zilnice-si-experienta.md) — secțiunea
  „Contract implementat în V1 (PBI 212)”.
- [Docs/08-interfata-camera-si-control.md](../../08-interfata-camera-si-control.md) — secțiunea
  „Panoul misiunilor zilei (PBI 212)”.
- `Docs/Evidence/212-daily-progress/report.json` și `report.md` — transcriptul real.
- `PBI/Done/212-daily_progress_ui.md` — taskul mutat fizic în Done.

## Cum urmăresc evenimentele live și cum filtrez `sessionId`/`worldEpoch`

1. **Timpul este un parametru.** `ingest({ event, observedAtMs })` primește evenimentul 007 validat
   (`parseSimulationEvent`) și momentul real care l-a observat. Modulul nu are `Date.now()`, deci
   fereastra zilei se calculează din `[dayStartMs, expiresAtMs)` cu 211.
2. **Fiecare eveniment aparține unei lumi.** Consumatorul este legat de `(sessionId, worldEpoch)`.
   Alt `sessionId` → `FOREIGN_SESSION`; alt `worldEpoch` → `STALE_EPOCH`. Ambele sunt numărate în
   `rejections`, ultimul apare în `lastRejection`, iar UI afișează motivul. Replay-ul, experimentele
   și Haos rulează în altă sesiune, deci nu pot îndeplini daily Academie.
3. **Ce se întâmplă cu cele străine.** Nu se ignoră tacit: `counters.rejected` crește, rândul
   `rejections` se actualizează, niciun obiectiv nu primește progres. În raport: 2 ×
   `FOREIGN_SESSION` (replay și Haos), 1 × `STALE_EPOCH`, 1 × `IRRELEVANT` (tip neconsumat), 1 ×
   `NO_RIDE` (livrare fără îmbarcare), plus 1 duplicat; 0 progres pe toate obiectivele.
4. **Idempotență.** Ledgerul de evenimente (FIFO mărginit, persistat în checkpoint) face un al doilea
   delivery `DUPLICATE`; o identitate cu alt tick/tip este refuzată ca eroare de contract.

## Cum verific modul și intervalele cursei

O cursă este intervalul real `PICKUP`..`DROPOFF` al unui `rideId`, cu `pickupTick`, `dropoffTick` și
`durationSeconds = (dropoffTick - pickupTick) / 60`. Modul cursei este modul în vigoare pentru
vehicul: `MANUAL_START` (`MANUAL`/`LEARNING`) îl deschide, `MANUAL_END` revine la `AUTO`, iar o
schimbare de mod în interiorul intervalului îl face `MIXED`.

- `MANUAL_DROPOFFS` cere mod `MANUAL`; `CLEAN_DROPOFFS` cere un interval fără `COLLISION`;
  `DROPOFFS` acceptă modul declarat de `controlRequirement`; `FULL_STOPS`, `LANE_CHANGES`,
  `LEADER_ACQUIRED` sunt atribuite modului vehiculului la tick-ul evenimentului;
  `PROFILE_ACTIVATE` este `LEARNING`.
- Un eveniment de tip potrivit refuzat pe mod crește `modeMismatches`, nu este ignorat. În raport,
  obiectivul MANUAL are 2 curse MANUAL numărate și 1 refuz pe mod (cursa AUTO), iar obiectivul `ANY`
  numără cursa AUTO și cursa mixtă.

## Cum garantez recompensa unică și coerența la expirare/limita zilei

- **O singură recompensă.** La îndeplinire se apelează `recordDailyReward` din 211, cu identitatea
  `dailyRewardId(playerId, instanceId)` — politica 125 (`replayGrants: false`). Nu există al doilea
  ledger. Un rând `COMPLETED` nu mai primește progres; evenimentele ulterioare cresc
  `afterCompletionEvents`. Rezultatul real: 2 recompense (200 XP din 300 promis), reload 1 → 1
  recompensă, replay `DUPLICATE`, eveniment nou pe obiectiv încheiat cu 0 recompense.
- **Expirare.** `expiresAtMs` este exclusiv: la `expiresAtMs - 1` evenimentul este `ACCEPTED` și
  completează; exact la `expiresAtMs` este `REJECTED` cu `OUTSIDE_DAY` și faza `EXPIRED`. Obiectivele
  neîncheiate apar `EXPIRED` cu motivul `EXPIRED`, iar cel încheiat rămâne `COMPLETED`.
- **Limita de zi.** Următoarea zi generează 3 obiective noi (3 rânduri create, 3 eliminate), XP 0 pe
  ziua nouă și recompensele vechi păstrate în registrul 211 (1).
- **Limitele autorate.** `windowTicks` pornește la primul eveniment și închide obiectivul cu
  `WINDOW_CLOSED` (termen 900, progres înghețat la 1 din 2); `incidentBudget` numără coliziunile și
  oprește obiectivul cu `INCIDENT_BUDGET_EXCEEDED` (1 incident din buget 0).

## Cum arată UI-ul fiecare stare

| Stare | Sursa reală | Ce scrie panoul |
| --- | --- | --- |
| Activ | rând `ACTIVE` | „În desfășurare”, „0 din 1”, „100 XP promis”, modul cerut și modurile înregistrate |
| Progres parțial | 1 din 2 | „1 din 2”, bară 50%, ultima cursă cu interval și mod |
| Îndeplinit | `COMPLETED` | „Îndeplinit”, „2 din 2”, „100 XP acordat”, identitatea recompensei |
| Expirat | faza zilei `EXPIRED` | „Expirat”, motiv „ziua s-a încheiat înainte de îndeplinire” |
| Neeligibil | buget depășit | „Neeligibil”, motiv „bugetul de incidente a fost depășit” |
| Refuzat | `lastRejection` | „Evenimente respinse: 1 × NO_RIDE (livrare fără îmbarcare…)”, cu ultimul eveniment |

Dialogul are `data-date`, `data-phase`, `data-instances`, `data-active`, `data-completed`,
`data-expired`, `data-ineligible`, `data-rewards`, `data-promised-xp`, `data-granted-xp`,
`data-rejections`, `data-last-rejection`, `data-reads` și `data-empty`; fiecare obiectiv are
`data-state`, `data-reason`, `data-satisfied` și `data-slot`. Fusul și resetul sunt formatate din
`utcOffsetSeconds` și `expiresAtMs`, fără fusul hostului: „Zi locală: 2026-11-11
(Europe/Bucharest (UTC+02:00))”, „Reset: 2026-11-12 00:00”.

Accesibilitate (real, din raport): 3 listeners (buton, Închide, dialog), 0 listeners globali, focus
mutat de 2 ori (deschidere și redeschidere), restaurat 1 dată, Escape 1, Tab wrap 1, 4 citiri și 3
randări pentru două deschideri; închis → `SKIPPED_CLOSED`, neschimbat → `SKIPPED_UNCHANGED`.

## Numere reale (din `report.json`)

| Mărime | Rezultat |
| --- | --- |
| verificări raport | 26/26, 0 eșecuri, overall PASS |
| obiective / sloturi | 3 (`MANUAL_DROPOFFS` țintă 2 MANUAL, `CLEAN_DROPOFFS` țintă 2 ANY, `LEARNING_ACTIVATIONS` țintă 1 LEARNING) |
| XP | 300 promis, 200 acordat, 2 recompense unice |
| curse numărate | 4 (3 MANUAL, 1 AUTO, 0 mixte) |
| progres parțial | 1 din 2 = 50% |
| ultima cursă reală | `ride:212:manual-2`, 840 → 1080 tick-uri, 4 s, MANUAL |
| refuzuri | 5 (2 `FOREIGN_SESSION`, 1 `STALE_EPOCH`, 1 `IRRELEVANT`, 1 `NO_RIDE`), 1 duplicat |
| limita zilei | `1794348000000` → `1794434400000`; −1 ms `COMPLETED`, la limită `OUTSIDE_DAY`, 2 expirate |
| reload | 1 → 1 recompensă, 100 XP, replay `DUPLICATE`, eveniment nou 0 recompense, `regenerated 0` |
| ziua următoare | `NEW_DAY` 2026-11-12, 3 create, 3 eliminate, 0 XP, 1 recompensă păstrată |
| limite | fereastră termen 900 (`WINDOW_CLOSED`), buget 1 incident (`INCIDENT_BUDGET_EXCEEDED`) |
| panou | 61 elemente, 44 noduri text, 3 listeners, 0 globali |
| determinism | 2 rulări, egale `true` |

## Comenzi rulate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `Architecture imports: PASS (332 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2352 teste, 2352 pass, 0 fail, ~76,7 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/ui/daily-progress.test.ts"` | 16 teste, 16 pass, 0 fail |
| `npm run missions:daily-progress` | `SUMMARY checks 26/26, rewards 2, XP 200/300, rejected 5, determinism 2/true, overall PASS` |
| `npm run missions:daily-progress -- --check` | `Daily progress report is current`, exit 0 |

## Limite

- Nivel `funcțional izolat` + cost structural UI: DOM propriu determinist, fără Playwright, fără
  măsurătoare FPS/GPU pe hardware. Gate-urile integrate rămân 155/159/220/224.
- Consumatorul nu scrie ledgerul XP `PlayerProgress` și nici KPI-urile 209; expune creditele
  idempotente 211 pe care stratul de progres le consumă.
- `LEARNING_ACTIVATIONS` numără activări reale `PROFILE_ACTIVATE` din sesiunea Academiei; cheia 092
  din obiectiv este subiectul autorat afișat, nu o valoare re-derivată din payload, pentru că 007 nu
  poartă cheia de parametru.
- Panoul nu montează butonul în HUD și nu pornește nimic: hostul deține compoziția read model-ului,
  bindingul de input și `pauseFocus.setSurface('panel', open)`; `src/app/` nu a fost atins.
- Stilurile sunt inline, intenționat, ca să nu modifice foaia globală în afara ownership-ului 212.
- Suma de 100 XP rămâne propunerea de calibrare a 211, nu o valoare certificată.

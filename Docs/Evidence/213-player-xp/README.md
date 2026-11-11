# Dovezi 213 — XP din misiuni și timp activ al jucătorului

Status: implementare și validare deterministă locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost structural), conform [politicii proporționale](../../validation-policy.md).
Nu se revendică FPS, GPU, soak sau hardware; gate-urile integrate rămân 155/159/220/224.

## Ce s-a livrat

- `src/missions/player-progress.ts` — `213-player-progress-v1`: ledgerul XP (`XpEntry`), soldul,
  nivelul derivat (`213-xp-levels-v1`), timpul activ cu fracțiuni exacte și checkpointul
  (`213-xp-rules-v1`). Trei intrări: creditul de misiune 125, creditul zilnic 211, fereastra de timp
  activ.
- `src/missions/index.ts` — exporturi aditive, adăugate la finalul listei existente.
- `tests/missions/player-xp-fixture.ts` — fixture pe contracte reale: catalog 116, ledger 125, set și
  calendar 211, KPI/review 209, store 109.
- `tests/missions/player-xp.test.ts` — 14 teste deterministe (fără ceas de perete, fără browser).
- `tests/missions/player-xp-report.ts` + `scripts/run-player-xp-report.mjs` — raport determinist cu
  29 de verificări și suport `--check`.
- `package.json` — `missions:player-xp`, ultima intrare din blocul `scripts`.
- [Docs/23-misiuni-zilnice-si-experienta.md](../../23-misiuni-zilnice-si-experienta.md) — secțiunea
  „Contract implementat în V1 (PBI 213)”.
- `Docs/Evidence/213-player-xp/report.json` și `report.md` — transcriptul real.
- `PBI/Done/213-player_xp.md` — taskul mutat fizic în Done.

## Cum separ XP-ul de `DrivingProfile`

`PlayerProgress` are propriul `playerId` și propriul ledger; `DrivingProfile` (109) păstrează doar
stilul. Modulul nou nu importă `src/profiles`, nu primește și nu întoarce un profil, iar read model-ul
raportează structural `profileWrites: 0` și nu conține niciun câmp de profil. Suprafața publică este
închisă: `version`, `playerId`, `ruleVersion`, `creditMission`, `creditDaily`, `observeActiveTime`,
`read`, `entry`, `checkpoint`, `stats`, iar obiectul este înghețat.

Testul `213 a reset, import or new driving profile never resets XP` folosește store-ul real 109:
creează un profil de bază, acordă XP, apoi face `clear()` și importă o altă versiune de bază. XP-ul
rămâne 100,5 (100 500 000 micro-XP), nivelul rămâne 2, iar checkpointul restaurat are aceleași
identități de credit și aceleași contoare. Nu e o afirmație: soldul este citit din noul obiect după
import.

## Cum garantez XP o singură dată

- **Misiuni.** `creditMission` consumă rezultatul real al ledgerului 125 (`ledger.settle(...)`), nu o
  instanță 116 brută. Plătesc numai rândurile `kind: 'XP'` cu `status: 'GRANTED'`, iar `causeId` este
  exact identitatea publicată de 125, `missionRewardId(namespace, missionId, definitionVersion,
  rewardId)`. Cheia intrării este `xpEntryId(playerId, 'MISSION_REWARD', causeId)`, deci o livrare
  repetată este `DUPLICATE`, iar o reluare reală 116 (finalizare nouă) primește de la 125
  `REWARD_ALREADY_GRANTED` și plătește 0 XP. Nu există un al doilea mecanism de idempotență.
- **Zile.** `creditDaily` primește recordul 211 și instanța autorată; verifică
  `record.rewardId === dailyRewardId(playerId, instanceId)` și `instance.rewardXp === 100`, deci
  identitatea și suma vin din 211, nu din apelant.
- **Timp.** Identitatea este fereastra reală: `activeTimeCreditId(playerId, startedAtMs, endedAtMs)`.
  Un reload care re-livrează aceeași fereastră primește `DUPLICATE`, iar contorizarea continuă de la
  cursorul restaurat (`accountedThroughMs`), nu de la un început pierdut.

## Ce nu acordă XP și cum e testat fiecare cale

| Cale | Cum este exclusă | Dovada |
| --- | --- | --- |
| Pauză | `paused: true` → `PAUSED` | 1 fereastră, 0 XP |
| Focus pierdut | `focused: false` → `NOT_FOCUSED` | 1 fereastră, 0 XP |
| Fereastră în background | `visible: false` → `BACKGROUND` | 1 fereastră, 0 XP |
| AFK | `afk: true` → `AFK` | 1 fereastră, 0 XP, prag publicat 120 000 ms |
| Replay | `scope: 'REPLAY'` → `OUTSIDE_ACADEMY` | 1 fereastră, 0 XP |
| Experimente | `scope: 'EXPERIMENT'` → `OUTSIDE_ACADEMY` | 1 fereastră, 0 XP |
| Haos | `scope: 'HAOS'` → `OUTSIDE_ACADEMY` | 1 fereastră, 0 XP |
| Timp offline | golul dintre cursor și fereastră nu se creditează | gol 3 570 000 ms, creditat 30 000 ms |
| Fereastră prea lungă | `> maxObservationWindowMs` → `WINDOW_TOO_LONG` | 3 600 000 ms refuzați, 0 XP |

AUTO **poate** conta: fereastra cere focus, vizibilitate, fără pauză și fără AFK, iar
`controlMode` este păstrat ca dovadă, nu ca filtru. Decizia de produs este că a observa activ orașul
este joc, deci AUTO, MANUAL și LEARNING au aceeași regulă de timp. Replay-ul, experimentele și Haos
rulează în alt scope și nu pot acorda XP Academie.

## De ce soldul și nivelul nu scad

Nu există nicio operație de debit, penalizare, refund sau reset, iar o sumă negativă este refuzată la
validare. `xpBalance` și `lifetimeXpEarned` sunt aceeași sumă, `debits: 0`, iar nivelul este o funcție
pură de sold peste un tabel monoton (nivel 2 = 100 XP, 3 = 300 XP, 50 = 122 500 XP).

Testul `213 revenue, ratings, incidents, failed or refused missions and a missed day never lower XP`
parcurge fiecare cale reală și compară soldul și nivelul: KPI 209 cu o cursă eșuată (venit 0, rating
1), o misiune 116 `FAILED` pe fereastra de evaluare (ledgerul 125 refuză settlementul), o recompensă
211 refuzată (duplicat) și o zi ratată (`FORWARD_JUMP`, 1 zi sărită). Soldul rămâne 200,5 și nivelul
2; singura mișcare este în sus, +0,5 XP după o fereastră validă.

## Cum arată numeric soldul, nivelul și istoricul

| Scenariu | Sold | Nivel | Istoric |
| --- | --- | --- | --- |
| Misiune 125 finalizată și decontată | 100 XP | 2 | 1 intrare (`MISSION_REWARD`, 100 XP) |
| Aceeași finalizare livrată din nou | 100 XP | 2 | 1 intrare, 0 XP plătit |
| Replay real 116 | 100 XP | 2 | 1 intrare, 0 XP plătit |
| Recompensă zilnică 211 | 100 XP | 2 | 1 intrare (`DAILY_REWARD`, 100 XP) |
| 160 000 ms activi (10 ferestre) | 2,666666 XP | 1 | 10 intrări, suma 2 666 666 micro-XP |
| Misiune + 30 s + daily | 200,5 XP | 2 | 3 intrări, suma 200 500 000 micro-XP |
| Reload după 30 s, apoi încă 30 s | 1 XP | 1 | 2 intrări, identice cu rularea fără reload |

Fiecare intrare are sursa, momentul real (`realTimeMs`), tick-ul autorativ când există, identitatea
cauzei, suma în micro-XP și soldul după ea. Soldul este suma verificabilă a intrărilor; checkpointul
nu conține sold sau nivel, iar `parsePlayerProgress` refuză un sold curent falsificat, o identitate
inventată și timp creditat dincolo de cursor.

Fracțiunile: `1 XP = 1 000 000 micro-XP`, acumularea este diferența exactă
`microXp(total + fereastră) − microXp(total)` cu `microXp(ms) = ms × 50 / 3` în operații întregi.
30 s este exact 0,5 XP, 70 s este exact 1,166666 XP, 1 ms este 16 micro-XP, iar restul sub un
micro-XP rămâne în milisecunde și se plătește mai târziu (nu se rotunjește).

## Numere reale (din `report.json`)

| Mărime | Rezultat |
| --- | --- |
| verificări raport | 29/29, 0 eșecuri, overall PASS |
| misiune 125 | 100 XP acordat din 100 autorat, livrare repetată 0 XP, replay 0 XP, sold 100, nivel 2, 1 intrare |
| daily 211 | 100 XP acordat, duplicat 0 XP, sold 100, identitate `dailyRewardId` respectată |
| timp activ | 10 ferestre, 160 000 ms = 2 666 666 micro-XP = 2,666666 XP; jumătate de minut = 0,5 XP |
| ferestre excluse | `PAUSED` 1, `NOT_FOCUSED` 1, `BACKGROUND` 1, `AFK` 1, `OUTSIDE_ACADEMY` 3, `WINDOW_TOO_LONG` 1 |
| gol offline | 3 570 000 ms neobservați, 1 gol, 0 XP pentru ei |
| AUTO | 0,5 XP creditat, modul păstrat în dovezi |
| monotonie | sold 200,5 → 200,5, nivel 2 → 2; KPI 1 cursă eșuată, venit 0, rating 1; settlement de misiune eșuată refuzat; recompensă refuzată 0 XP; zi ratată `FORWARD_JUMP` 1 |
| reload | 1 000 000 = 1 000 000 micro-XP, 2 intrări, fereastra re-livrată `DUPLICATE` |
| reset/import de stil | 100 500 000 micro-XP păstrat, 1 versiune 109 după import, nivel 2 → 2 |
| istoric | 3 intrări, sold 200 500 000 micro-XP, suma intrărilor 200 500 000, fiecare explicată |
| determinism | 2 rulări, egale `true` |

## Comenzi rulate și rezultat

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, 0 avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `Architecture imports: PASS (336 TypeScript files)`, probe negative PASS (6 + 4 + 3 respinse), exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2401 teste, 2401 pass, 0 fail, ~65,8 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/player-xp.test.ts"` | 14 teste, 14 pass, 0 fail |
| `npm run missions:player-xp` | `SUMMARY checks 29/29, mission XP 100/100 (replay 0), daily XP 100 (duplicate 0), active 160000 ms = 2.666666 XP, balance 200.5 -> 200.5, level 2 -> 2, reload equal true, determinism 2/true, overall PASS` |
| `npm run missions:player-xp -- --check` | `Player XP report is current`, exit 0 |

## Limite

- Nivel `funcțional izolat`: fără browser real, fără FPS/GPU pe hardware, fără soak. Gate-urile
  integrate rămân 155/159/220/224.
- Modulul nu are ceas: compoziția (hostul) trebuie să furnizeze ferestrele reale de observare și
  verdictul AFK; pragul `afkThresholdMs = 120 000` și fereastra `30 000 ms` sunt propuneri de
  calibrare, nu valori certificate.
- Nu există UI pentru sold, nivel și istoric; persistarea în savefile rămâne a modulelor 127–136, iar
  checkpointul este un contract de date, nu un fișier. `src/app/` nu este atins.
- Suma de 1 XP/minut și pragurile de nivel sunt propunerile documentate în Docs/23, supuse calibrării.

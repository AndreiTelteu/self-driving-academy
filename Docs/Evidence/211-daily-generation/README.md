# Dovezi 211 — trei misiuni noi pe zi și calendar stabil

Status: implementare și validare deterministă locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform [politicii proporționale](../../validation-policy.md).
Contractul este de domeniu, fără DOM, renderer sau efect în `main.ts`, deci proba de browser nu este
necesară și nu se revendică FPS, GPU, Rapier, soak sau hardware.

## Ce s-a livrat

- `src/missions/daily.ts` — contractul `211-mission-daily-v1` (generator), `211-daily-calendar-v1`
  (calendar) și `211-daily-capabilities-v1` (snapshot de capabilități), plus catalogul versionat
  `211-daily-templates-v1`.
- `src/missions/index.ts` — exporturile publice, adăugate exclusiv la finalul listei existente.
- `tests/missions/mission-daily-fixture.ts` — fixture determinist: zile locale reale, offset UTC
  explicit, durată reală a zilei (23/24/25 h), snapshot complet, minimal și doar-learning.
- `tests/missions/mission-daily.test.ts` — 21 de teste deterministe (contract, determinism pe aceeași
  zi, variație pe zile consecutive, distinctivitate, MANUAL garantat, LEARNING explicit, reload,
  deblocare ulterioară, profil nou, miezul nopții, DST, rollback, salt înainte, capabilități
  insuficiente, catalog mic, catalog versionat, refuzuri pentru intrări invalide și save falsificat).
- `tests/missions/mission-daily-report.ts` + `scripts/run-mission-daily-report.mjs` — raport
  determinist cu 73 de verificări, 5 scenarii și suport `--check`.
- `package.json` — scriptul `missions:daily`, adăugat la finalul blocului `scripts`.
- [Docs/23-misiuni-zilnice-si-experienta.md](../../23-misiuni-zilnice-si-experienta.md) — secțiunea
  „Contract implementat în V1 (PBI 211)”.
- [Docs/28-provocari-random-si-revenire.md](../../28-provocari-random-si-revenire.md) — nota despre
  catalogul versionat acceptat de generator și integrarea din 233.
- `Docs/Evidence/211-daily-generation/report.json` și `report.md` — transcriptul real.
- `PBI/Done/211-daily_generation.md` — taskul mutat fizic în Done.

## Cum garantez stabilitatea setului la refresh, reload, profil nou și deblocare ulterioară

1. **O singură generare, apoi setul persistat este sursa de adevăr.** `generateDailyMissionSet` este
   o funcție pură; `parseDailyMissionSet` citește setul salvat înapoi și verifică identitățile,
   sloturile, semnătura de conținut, fereastra zilei, digestul capabilităților și invarianta MANUAL.
   Un save trunchiat sau modificat este refuzat, deci reload-ul nu poate produce alt set.
2. **Aceeași zi locală nu regenerează.** `advanceDailyCalendar` întoarce `SAME_DAY` cu setul reținut,
   `regenerated: false`; `generatedAtMs` rămâne cel original. În raport, reluarea la 23:59:59.999
   produce exact aceiași octeți și rămâne un singur set.
3. **O deblocare ulterioară nu schimbă obiectivele.** Snapshot-ul memorat diferă de cel curent doar
   prin `capabilityDrift: true`; setul zilei rămâne neatins. Zilele următoare folosesc noile
   capabilități.
4. **Profilul de condus nu este o intrare.** Generatorul nu citește `DrivingProfile`; schimbarea
   stilului nu are ce să rerandomizeze. Un `playerId` nou primește propriul set: 3 instanțe, 0
   identități comune cu ale celuilalt jucător.

## Cum variază instanțele pe zile

Seedul este `hash(playerId, dailyDate, generatorVersion, templateCatalogVersion)`, iar fiecare
alegere este `randomUint32(seed, cheie, index)` — fără `Math.random()` și fără ceas de perete. Pe trei
zile consecutive (2026-11-09, 2026-11-10, 2026-11-11) rezultă 3 seeduri distincte, 3 semnături
distincte și 9 identități distincte din 9 instanțe; identitatea include data locală, deci o instanță
nu poate fi refolosită în altă zi. Parametrii variați în catalog sunt ținta, zona, bugetul de
incidente, fereastra de evaluare în tick-uri (60 Hz) și durata minimă de oprire. Repetarea identică a
zilei precedente este evitată în maximum 8 încercări deterministe și rezultatul este raportat în
`distinctFromPrevious`.

Zilele consecutive din raport (interval local 24 h fiecare):

| Zi | Seed | Familii (slot 1→3) | Ținte | Zone | MANUAL |
| --- | --- | --- | --- | --- | --- |
| 2026-11-09 | 766487483 | `daily-learning-demonstration`, `daily-service-window`, `daily-manual-service` | 1, 4, 3 | airport, suburb, suburb | 2 |
| 2026-11-10 | 244603478 | `daily-service-window`, `daily-lane-flow`, `daily-learning-demonstration` | 4, 4, 1 | suburb, suburb, airport | 2 |
| 2026-11-11 | 2203151200 | `daily-lane-flow`, `daily-clean-service`, `daily-learning-demonstration` | 3, 2, 1 | center, center, airport | 2 |

## Cum tratez miezul nopții, DST, rollback/forward și capabilitățile insuficiente

- **Miezul nopții.** Fereastra este `[dayStartMs, expiresAtMs)`. La `expiresAtMs - 1` setul este
  `ACTIVE`, la `expiresAtMs` este `EXPIRED`, iar același instant rezolvă ziua următoare: `NEW_DAY`,
  `gapMs = 0`, `expiredSets = 1`. Ziua este deci închisă, nu ambiguă.
- **DST.** Apelantul deține baza de fusuri și declară offsetul și durata reală a zilei. 2026-03-29 are
  23 h (82 800 s), 2026-10-25 are 25 h (90 000 s); ambele zi + următoare zi au `gapMs = 0`, fără gol
  și fără suprapunere. Un instant care nu aparține ferestrei declarate este refuzat.
- **Rollback.** `highestObservedDate` nu scade, nu se generează un set nou, setul reținut pentru ziua
  respectivă este returnat neatins dacă mai există în istoric, iar recompensa deja acordată rămâne în
  registru: un nou `recordDailyReward` raportează `duplicate: true`, `granted: false`.
- **Forward.** Un salt de la 2026-11-11 la 2026-11-15 raportează `FORWARD_JUMP`, `skippedDays = 3`,
  generează doar ziua curentă (2 seturi reținute + cel nou) și nu acordă XP pentru zilele sărite.
- **Capabilități insuficiente.** Un snapshot fără chei de învățare, fără zonă și fără progres de
  campanie produce tot trei misiuni realizabile: `capabilityGaps` =
  `CAMPAIGN_PROGRESS,LEARNING_KEYS,LEARNING_MODE,ZONES`, `excludedFamilies` =
  `daily-learning-demonstration,daily-service-window`, `fallbacks = 0` pe catalogul livrat și
  `fallbacks = 1` pe un catalog de două familii. Nicio excepție la runtime; `zone` este `null`, nu
  inventat. Un snapshot care ar elimina modul MANUAL este refuzat, pentru că MANUAL rămâne o cale de
  progres fără learning.

## Numere reale (din `report.json`)

| Scenariu | Numere |
| --- | --- |
| zile consecutive | 3 zile, 9 instanțe, 9 identități distincte, 3 semnături distincte, 3 seeduri distincte, 6 variante distincte `(familie, țintă, zonă)`, 6 obiective MANUAL fără learning (minimum 2 pe zi), 0 goluri de continuitate |
| aceeași zi reluată | octeți identici după reload `true`, `SAME_DAY`, `regenerated = false`, `generatedAtMs` neschimbat (1794380400000), 1 set, drift `false`; după deblocare: octeți identici `true`, drift `true`, 1 set; profil nou: 3 instanțe, 0 identități comune |
| catalog mic | 3 instanțe, 3 identități, 3 variante distincte, `fallbacks = 1`, 3 obiective MANUAL, 0 obiective LEARNING, versiune catalog `report-small-v1`; catalogul livrat exclude 2 familii și produce 3 parametri `zone = null` |
| miezul nopții | fereastră 24 h, `ACTIVE` → `EXPIRED`, ziua următoare 2026-11-12 începe exact la expirare, `NEW_DAY`, `gapMs = 0`, 2 seturi, 1 set expirat |
| schimbarea ceasului | 23 h și 25 h cu `gapMs = 0`; rollback: `ROLLBACK`, `regenerated = false`, `highestObservedDate` = 2026-11-11, recompensă păstrată, al doilea grant duplicat; salt: `FORWARD_JUMP`, 3 zile sărite, 3 seturi, 1 recompensă reală păstrată, 0 XP pentru zilele sărite |

## Comenzi rulate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără output (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | exit 0, fără avertismente |
| `npm run format:check` | `All matched files use Prettier code style!`, exit 0 |
| `npm run check:architecture` | `Architecture imports: PASS (322 TypeScript files)`, probe negative PASS, exit 0 |
| `npm run check:parameter-catalog` | `Parameter catalog is synchronized.`, exit 0 |
| `npm test` | 2268 teste, 2268 pass, 0 fail, 80,95 s, exit 0 |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-daily.test.ts"` | 21 teste, 21 pass, 0 fail |
| `npm run missions:daily` | `SUMMARY checks 73/73, runs 5, overall PASS` |
| `npm run missions:daily -- --check` | `Mission daily report is current`, exit 0 |

## Limite

- Rulare Node deterministă: nu există browser, renderer sau sesiune umană; contractul nu are UI și nu
  modifică `main.ts`.
- Apelantul deține baza de fusuri IANA: modulul primește offsetul UTC și durata reală a zilei locale
  și nu citește ceasul sistemului. DST este deci reprezentat explicit ca zi de 23 h sau 25 h.
- Creditul XP este produs ca identitate idempotentă (`dailyRewardId`); PBI 211 nu scrie ledgerul XP
  `PlayerProgress` și nici KPI-urile 209 (`historyScans` rămâne structural `0`).
- Suma de 100 XP și pragurile șabloanelor sunt propuneri de calibrare, nu valori certificate.
- Catalogul livrat nu conține încă șabloanele de provocări din 231; integrarea este 233, iar
  generatorul acceptă deja un catalog versionat extern.

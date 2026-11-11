# Dovezi 130 — persistența misiunilor și setărilor

Status: implementare și validare funcțională locală — PASS. Nivel de validare: `targeted` conform
[politicii proporționale](../../validation-policy.md) — corectitudine izolată și cost local, fără
browser real, FPS, Rapier, soak sau hardware. Nu se revendică persistarea în IndexedDB-ul unui
browser real: adaptorul real este 127, iar aici se verifică regulile peste aceleași porturi, cu
dublul determinist în memorie.

## Ce s-a livrat

- `src/persistence/progress-save.ts` — contractul `130-progress-save-v1`: trei categorii
  (`PROGRESS`, `CAMPAIGN`, `SETTINGS`), construirea rândurilor, jurnalul de campanie reluabil,
  recorder-ul 125, decodorul, restauratorul trackerului 116, store-ul aplicației
  (`createProgressSaveStore`) și cele două funcții de tranzacție (`commitPlayerSaveRows`,
  `commitPlayerResetRows`).
- `src/persistence/repository.ts` — `commitPlayerSave`, `resetPlayerSave` și `readPlayerSave`:
  o singură tranzacție multi-store peste `progress` + `settings`, respectiv o singură citire.
- `src/persistence/contracts.ts` — șase coduri de refuz adăugate vocabularului închis
  (`CATALOG_MISMATCH`, `LEDGER_REPLAY_MISMATCH`, `TRACKER_SNAPSHOT_INVALID`,
  `SAVE_DIGEST_MISMATCH`, `SAVE_CATEGORY_UNKNOWN`, `SAVE_EMPTY`).
- `src/persistence/index.ts` — exporturile publice, adăugate la finalul listei.
- `tests/persistence/progress-save-fixture.ts`, `progress-save.test.ts`,
  `progress-save-report.ts` — 20 de teste deterministe și transcriptul raportului.
- `scripts/run-progress-save-report.mjs` + `npm run save:progress` (ultima intrare din
  `package.json`), cu `--check`.
- [Docs/15-salvare-si-import-export.md](../../15-salvare-si-import-export.md) — secțiunea
  „Contract implementat V1 (PBI 130)”.

## Rezultat

- **Progresul** este `MissionTrackerSnapshot` real 116, scris pe rândul
  `tracker:<sessionId>` din store-ul `progress`. Înainte de scriere trece prin
  `MissionTracker.restore`; la reîncărcare un tracker nou este restaurat prin același `restore`.
  Snapshotul scenariului de raport (3 misiuni finalizate + 1 misiune activă) are **8 090 de
  bytes**, iar faptele de tracker (instanțe, obiective, verdicte, versiuni, motive) sunt identice
  înainte și după reload.
- **Recompensele și campania** sunt jurnalul ordonat al ledgerului 125, scris pe rândul
  `campaign:<sessionId>` (**1 229 de bytes** pentru 3 finalizări). Jurnalul este reluat la fiecare
  scriere și la fiecare citire, iar digestul canonic `SDA-CJSON-1`/SHA-256 al celor patru read
  model-uri 125 trebuie să coincidă: un jurnal trunchiat este refuzat cu
  `LEDGER_REPLAY_MISMATCH`.
- **Recompensa rămâne unică** prin ciclu complet, nu prin compararea unui blob: după reload,
  aceeași finalizare livrată din nou răspunde `DUPLICATE` cu motivul `COMPLETION_ALREADY_SETTLED`
  și **0 XP**; o reluare reală 116 (încercarea 2) produce o finalizare nouă, dar răspunde
  `NO_REWARD` cu motivul `REWARD_ALREADY_GRANTED` și **0 XP**. XP-ul rămâne **300**, recompensele
  acordate **6**, deblocările **3**.
- **Setările** sunt `RuntimeSettings` real 009: remapările (`KeyI/ArrowDown/KeyV`), camera
  `FIRST_PERSON`, unitățile `mph/ft`, calitatea `HIGH`, audio mut și FOV 92 se restaurează exact.
  Fără rând stocat, `load` întoarce valorile implicite documentate (`KeyW`, `km/h`, `MEDIUM`,
  audio nemut) cu `settingsSource: "DEFAULTS"`.
- **Reseturi izolate**, fiecare în tranzacția lui: `SETTINGS` scrie doar setările (digestul
  trackerului și digestul campaniei rămân identice, campania păstrează 3 finalizări);
  `CAMPAIGN` șterge doar rândul de campanie (progresul și setările rămân identice);
  `PROGRESS` șterge doar rândul de tracker (campania și setările rămân identice, iar trackerul
  restaurat are 0 instanțe). Profilurile nu sunt atinse de niciun reset (1 profil și 1 activare
  rămân după toate cele trei).
- **Tranzacțional**: un eșec injectat înainte de commit (`beforeCommit`) este raportat
  `REJECTED`/`TRANSACTION_ABORTED`, iar cele **2** rânduri rămân byte cu byte identice, cu aceleași
  revizii.
- **Refuzuri închise**: jurnal de campanie modificat → `LEDGER_REPLAY_MISMATCH`; snapshot de
  tracker modificat → `SAVE_DIGEST_MISMATCH`; alt catalog → `CATALOG_MISMATCH`; salvare fără
  categorie → `SAVE_EMPTY`; categorie de reset necunoscută → `SAVE_CATEGORY_UNKNOWN`; pagină fără
  lock de scriitor → `WRITER_REQUIRED`; snapshot nerestaurabil → `TRACKER_SNAPSHOT_INVALID`.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 330 fișiere TypeScript, probe negative 6+4+3 PASS |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/progress-save.test.ts"` | 20/20 teste pass, 0 fail |
| `npm test` | 2356/2356 teste pass, 0 fail |
| `npm run save:progress` | 70/70 verificări, 8 scenarii, overall PASS |
| `npm run save:progress -- --check` | „Progress save report is current” |

Transcript: [report.json](report.json) și [report.md](report.md). Verificările sunt numerotate în
raport: 16 pentru reîncărcare, 10 pentru unicitatea recompensei, 11 + 8 + 8 pentru cele trei
reseturi, 5 pentru scrierea eșuată, 6 pentru valorile implicite și 6 pentru refuzuri.

## Fișiere atinse

- Create: `src/persistence/progress-save.ts`, `tests/persistence/progress-save-fixture.ts`,
  `tests/persistence/progress-save.test.ts`, `tests/persistence/progress-save-report.ts`,
  `scripts/run-progress-save-report.mjs`, `Docs/Evidence/130-progress-save/`.
- Modificate: `src/persistence/repository.ts`, `src/persistence/contracts.ts`,
  `src/persistence/index.ts`, `package.json`, `Docs/15-salvare-si-import-export.md`,
  `PBI/In Progress/130-save_progress.md` → `PBI/Done/130-save_progress.md`.

## Limitări

- Persistarea este verificată pe dublul determinist în memorie peste porturile 127, nu pe
  IndexedDB-ul unui browser real; adaptorul real și schema rămân cele livrate de 127.
- Un rând de tracker respectă bugetul de corp 127 (256 KiB). O sesiune al cărei registru de
  identități de eveniment depășește bugetul este refuzată explicit cu `BODY_TOO_LARGE`, nu
  trunchiată; nu există încă împărțirea snapshotului pe mai multe rânduri.
- Jurnalul de campanie este plafonat la 256 de operații, cât capacitatea de finalizări a lui 125.
- Nu există autosave periodic, UI de salvare sau compunere în `main.ts`; PBI-ul livrează
  contractul de persistență, nu integrarea în bucla de joc (rămâne pentru pașii de compunere).
- Save-ul nu compune singur snapshotul: apelantul trebuie să dea `sessionId`/`worldEpoch` ale
  trackerului real, altfel trackerul restaurat ar refuza evenimentele altui world.

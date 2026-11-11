# Dovezi — PBI 132 Retenția datelor și cote locale

Contract: `132-data-retention-v1` din [src/persistence/data-retention.ts](../../../src/persistence/data-retention.ts).
Document de modul: [Docs/15-salvare-si-import-export.md](../../15-salvare-si-import-export.md), secțiunea
„Contract implementat V1 (PBI 132)".

Transcript determinist: [report.json](report.json) și [report.md](report.md), produse de
`npm run retention:data`. Raportul nu conține ceas de perete; două rulări sunt identice byte cu byte.

## Ce s-a implementat

- `createDataRetention` păzește **două domenii separate**, fiecare cu cotă RAM și DB în bytes:
  `INTERVENTION_TELEMETRY` și `WORLD_RECORDER`. Nu există cotă comună și nicio operație care să
  atingă ambele domenii.
- Cotele sunt citite din contracte livrate, nu inventate: `proposedCapacities.recorderRamBytes`
  (33 554 432 B), `proposedCapacities.optionalReplayStorageBytes` (134 217 728 B),
  `resourceAdmissionContracts.workers.persistenceIngressBytes` (16 777 216 B) și limita 069
  `INTERVENTION_LIMITS.recordStoreBytes` (33 554 432 B). Lacuna `interventionTelemetryDbBytes` este
  publicată în `retentionBudgetGaps` și în raport; un buget lipsă produce `QUOTA_MISSING`.
- Cota plină oferă `exportDomain` (document versionat, `SHA-256` peste `SDA-CJSON-1`) și apoi
  `planCleanup` + `applyCleanup`. Fără digestul exportului, planul este refuzat cu
  `EXPORT_REQUIRED`; dacă inventarul s-a schimbat, cu `EXPORT_MISMATCH`.
- Curățare selectivă pe criteriu explicit: `OLDEST_FIRST`, `LARGEST_FIRST`, `WHOLE_DOMAIN`, cu ținte
  opționale în bytes și `maxEvictions`.
- Datele protejate (`PROFILE`, `PROGRESS`, `ACTIVE_CHECKPOINT`, `DEDUP_LEDGER`) consumă cotă, dar nu
  intră niciodată în candidați; la `PROTECTED_OVERFLOW` nu se șterge nimic (`NOTHING_TO_EVICT`).
- Un clip atins parțial este re-declarat `PARTIAL` cu motivul `RETENTION_EVICTED` și cu secvențele
  lipsă exacte.

## Numere reale (din report.json)

Inventarul fixturei: 25 de rânduri, 5 protejate, 20 evacuabile, 51 404 800 B RAM și 55 853 056 B DB.

| Domeniu | RAM (B) | Sursă RAM | DB (B) | Sursă DB |
| --- | --- | --- | --- | --- |
| INTERVENTION_TELEMETRY | 33 554 432 | CONTRACT_LIMIT 069 `recordStoreBytes` | 16 777 216 | MANIFEST `persistenceIngressBytes` |
| WORLD_RECORDER | 33 554 432 | MANIFEST `recorderRamBytes` | 134 217 728 | MANIFEST `optionalReplayStorageBytes` |

**Scenariul 1 — recorderul lumii peste cota RAM.** Înainte: 33 771 520 B RAM din 33 554 432 B
(depășire 217 088 B), 13 rânduri. Export: 13 artefacte, 33 771 520 B RAM, 33 792 000 B DB, checksum
`274dd0ec…` (64 caractere hex). Plan `OLDEST_FIRST`: `checkpoint:superseded-1`,
`checkpoint:superseded-2`, `clip:incident-a:0` — 4 325 376 B eliberați. După: 29 446 144 B RAM din
33 554 432 B, 10 rânduri, stare `WITHIN`. Cele 4 rânduri păstrate din `clip:incident-a` sunt
`PARTIAL` cu `RETENTION_EVICTED` și `missingSequences: [0]`; `clip:incident-b` rămâne `COMPLETE`.
Domeniul de telemetrie rămâne la 22 061 056 B DB, neschimbat.

**Scenariul 2 — telemetria intervențiilor peste cota DB.** Înainte: 22 061 056 B DB din 16 777 216 B
(depășire 5 283 840 B), 12 rânduri. Export: 12 artefacte, 17 633 280 B RAM, 22 061 056 B DB. Plan
`LARGEST_FIRST`: `intervention-segment:0..2`. După: 14 196 736 B DB din 16 777 216 B, 9 rânduri,
stare `WITHIN`, zero clipuri parțiale (s-au eliminat clipuri întregi).

**Scenariul 3 — țintă de mărime și clip parțial.** Țintă DB 4 194 304 B: 8 rânduri evacuate
(13 410 304 B RAM, 18 874 368 B DB), rămân 4 rânduri (2 protejate + 2 chunkuri). `telemetry-chunk:ride-2`
și `telemetry-chunk:ride-3` sunt `PARTIAL`, motiv `RETENTION_EVICTED`, `missingSequences: [0, 1]`;
exportul următor raportează `partialArtifacts: 2`.

**Scenariul 4 — criteriu de domeniu.** `WHOLE_DOMAIN` pe telemetrie elimină 10 rânduri evacuabile
(17 604 608 B RAM, 22 020 096 B DB) și păstrează doar `profile:active` și
`ledger:intervention-admission`; domeniul recorderului rămâne byte-identical.

**Scenariul 5 — doar date protejate peste cotă.** Stare `PROTECTED_OVERFLOW`, plan cu 0 evacuări,
aplicare `NOTHING_TO_EVICT`; toate cele 5 rânduri protejate rămân.

**Scenariul 6 — determinism.** Inventar normal și inventar inversat produc exact aceleași digests:
export `274dd0ec…`, plan `3ac7773e…`, rezultat `df780263…`, aceleași 3 rânduri evacuate.

**Scenariul 7 — refuzuri.** Buget lipsă `QUOTA_MISSING`, curățare fără export `EXPORT_REQUIRED`,
plan falsificat `PLAN_UNKNOWN`, plan aplicat de două ori `PLAN_UNKNOWN`.

Toate cele 19 verificări din raport sunt `PASS` (`npm run retention:data` → `SUMMARY checks 19/19,
overall PASS`).

## Comenzi executate și rezultate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0 (`All matched files use Prettier code style!`) |
| `npm run check:architecture` | exit 0 (337 fișiere TypeScript, toate probele negative PASS) |
| `npm run check:parameter-catalog` | exit 0 (`Parameter catalog is synchronized.`) |
| `npm test` | exit 0 — 2 419 teste, 2 419 pass, 0 fail (72,9 s) |
| `node --import ./scripts/register-typescript.mjs --test tests/persistence/data-retention.test.ts` | 12 teste, 12 pass, 0 fail |
| `npm run retention:data` | 19/19 PASS, scrie `report.json` și `report.md` |
| `npm run retention:data -- --check` | exit 0 (`Data retention report is current`) |

## Fișiere atinse

- `src/persistence/data-retention.ts` (nou) — contractul.
- `src/persistence/index.ts` — exporturile publice adăugate la finalul fișierului.
- `tests/persistence/data-retention-fixtures.ts` (nou) — inventarul declarat al fixturei.
- `tests/persistence/data-retention.test.ts` (nou) — 12 teste țintă.
- `tests/persistence/data-retention-report.ts` (nou) — transcriptul determinist.
- `scripts/run-data-retention-report.mjs` (nou) — raportul cu `--check`.
- `package.json` — `retention:data`, ultima intrare din blocul `scripts`.
- `Docs/15-salvare-si-import-export.md` — secțiunea contractului.
- `Docs/Evidence/132-data-retention/` — acest README, `report.json`, `report.md`.

## Limitări

- Inventarul din raport este o fixture declarată (25 de rânduri cu bytes declarați), nu o sesiune
  reală de înregistrare: motorul nu citește singur IndexedDB sau inelul 207. Legarea lui la
  producătorii reali (207/090/129) rămâne un pas de integrare, iar `bytes` sunt contoare de
  ownership, nu o citire a heap-ului.
- Cota durabilă a telemetriei folosește `persistenceIngressBytes` pentru că manifestul nu fixează o
  cotă totală dedicată; lacuna este raportată, nu ascunsă. `totalHeapBytes` rămâne indisponibil.
- Măsurătorile sunt corectitudine deterministă; nu s-a rulat un soak 159/224 și nu se pretinde
  performanță hardware.
- Meniul de curățare din UI și exportul către fișier rămân în afara scope-ului; contractul oferă
  documentul de export, nu descărcarea lui.

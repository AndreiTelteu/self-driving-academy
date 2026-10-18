# 069 — Re-baseline pe mașina curentă (host controlat) și verdict real

2026-10-18. Scop: re-capturarea perechii BEFORE/AFTER pe același host, la cererea explicită a utilizatorului, pentru a decide dacă gate-ul de performanță 069 poate fi acceptat.

Host: **AMD Ryzen 7 7735U**, Windows 11 10.0.26300, node v24.21.0, AC + plan **High performance**, CPU idle măsurat **~2%** înainte de fiecare rulare (procese străine închise). Repo la commit-ul de bază d8e5756.

## BEFORE — `native-before-02` (produs 069 absent)

- Comandă: `node --import ./scripts/register-typescript.mjs scripts/benchmark-manual-segments-reference.mjs`
- Rezultat: EXIT0, `status: PASS`, `sourceHash: c88a6e1d…`, 24 lumi, protocol neschimbat.
- Reader `verify-reference.mjs` (CURRENT și HISTORICAL): `PASS_SUPPLEMENTAL_NATIVE_REFERENCE`, native `02dc6a4e…`.
- **normal70 tick p95: 4,1001 / 4,1245 / 4,1320 / 4,3797 / 4,3880 ms** (toate sub 5,5). rapierP95 ~0,90–0,95.

## AFTER — `native-after-04` (produs 069 prezent, verificat byte-exact față de receipt-ul 924c)

- Comandă: `node --import ./scripts/register-typescript.mjs scripts/benchmark-manual-segments-after.mjs`
- Rezultat: **EXIT1, `Normal tick absolute gate`**, la world-1 (`count=70, observer=true`), `failedAt 16:38:58.653Z`, `sourceHash 15eb9ed3…`. Captura incompletă păstrată (`failure.json`, `started.json`, `worlds/world-0,1`, `source`, `native`).
- Măsurat în world-1: `tickMs` **p50 3,8119 / p95 5,6364 / p99 6,8102**, cu defalcare `authorityMs p95 2,0954`, `boundaryMs p95 1,4063`, `rapierMs p95 1,0122`, `deliveryMs p95 0,0699`.

## Verdict

Costul nou al produsului 069 este **real**, nu un artefact de mașină:

| | tick p95 normal70 |
|---|---|
| BEFORE (referință, fără produs) | 4,10–4,39 ms |
| AFTER (cu produs 069) | **5,64 ms** → peste gate-ul de 5,5 |
| Desktop 7950X3D (capturi istorice) | 5,16–7,36 ms |

Aceeași depășire apare pe două mașini diferite, ambele liniștite, cu praguri neschimbate. Componentele noi (authority + boundary ≈ 3,5 ms p95) împing tick-ul peste limită. **069 nu poate fi închis pe performanță**; este nevoie de reducerea costului înainte de o nouă captură.

Niciun prag nu a fost relaxat și nicio rulare nu a fost repetată până la un rezultat favorabil.

## Adaptări de harness (documentate)

Namespace nou `native-before-02` / `native-after-04`; `PINNED_BEFORE` (sourceHash, manifestSha256), hash-ul `complete.json` și `relativePath` actualizate; inventar BEFORE nou generat (`native-before-02-inventory.json`, 179 rânduri) și `validateOriginalInventory` re-pinuit la digestul lui; `core.autocrlf=false` la checkout-ul surselor, altfel LF→CRLF rupe identitatea byte-exactă a produsului față de receipt-ul 924c.

Capturi respinse păstrate: `native-after-04-rejected-01` (receipt de produs — CRLF) și `native-after-04-rejected-02` (hash manifest BEFORE vechi).

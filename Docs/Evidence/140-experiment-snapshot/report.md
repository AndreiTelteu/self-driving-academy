# Raport determinist 140 — snapshot complet pentru experiment

- Contract: `140-experiment-snapshot-v1` (integritate `SDA-CJSON-1` + `SHA-256`)
- Izolare ledger: `140-experiment-ledger-isolation-v1`
- Snapshot: tick 60, 64378 bytes, `c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5`
- Roundtrip: 287 entități, 3080 câmpuri frunză, 0 diferențe
- Încărcare la același tick: expected 60, restaurat 60, avans 0
- Continuare: 60 tickuri, identică DA, digest `c1347393390deb7bb6a5b504986720aff53c40348e7777362caa327c643f8a6a`

## Secțiuni comparate

| Secțiune | Entități | Câmpuri | Stare |
| --- | ---: | ---: | --- |
| snapshotVersion | 1 | 1 | comparat |
| units | 1 | 1 | comparat |
| tick | 1 | 1 | comparat |
| worldEpoch | 1 | 1 | comparat |
| profile | 1 | 3 | comparat |
| vehicles | 70 | 1680 | comparat |
| controllers | 70 | 560 | comparat |
| rides | 30 | 240 | comparat |
| passengers | 30 | 150 | comparat |
| segments | 3 | 21 | comparat |
| opportunities | 64 | 320 | comparat |
| signals | 8 | 32 | comparat |
| dispatch | 4 | 24 | comparat |
| learning | 1 | 33 | comparat |
| rng | 1 | 4 | comparat |
| dedup | 1 | 9 | comparat |

## Refuzuri demonstrate

| Probă | Etapă | Coduri | Detaliu |
| --- | --- | --- | --- |
| STORED_CHECKSUM_CORRUPTED | READ | CHECKSUM_MISMATCH | CHECKSUM_MISMATCH: The stored snapshot does not match its checksum (snapshot.checksum) |
| ENGINE_VERSION | COMPATIBILITY | ENGINE_VERSION_MISMATCH | engineVersion: stored babylon-9.28.0, current babylon-9.29.0 |
| PHYSICS_BACKEND | COMPATIBILITY | PHYSICS_BACKEND_MISMATCH | physicsVersion: stored ammo-0.4.0, current rapier-0.21.0 |
| MAP_VERSION | COMPATIBILITY | MAP_VERSION_MISMATCH | mapVersion: stored city-v2, current city-v1 |
| ALL_THREE | COMPATIBILITY | ENGINE_VERSION_MISMATCH, PHYSICS_BACKEND_MISMATCH, MAP_VERSION_MISMATCH | engineVersion: stored babylon-9.28.0, current babylon-9.29.0; physicsVersion: stored ammo-0.4.0, current rapier-0.21.0; mapVersion: stored city-v2, current city-v1 |
| OTHER_TICK | TICK | TICK_MISMATCH | The snapshot is at tick 60, the experiment starts at 61 |
| CAPTURE_INSIDE_STEP | CAPTURE | CAPTURE_REJECTED | TICK_NOT_BOUNDARY: A checkpoint may only be captured on a tick boundary (snapshot.tickBoundary) |

## Izolarea ledger-elor

- Suprafața experimentului: `fingerprint`, `fork`, `structuralIsolation`, `verify`, `version`, `write`
- Scriere directă: REFUSED / LIVE_LEDGER_READ_ONLY, aplicată live: false
- Scriere în copie: ACCEPTED_IN_COPY, aplicată live: false, rânduri copiate: 1
- Amprentă neschimbată: DA, scrieri live: 0
- Probă de control: scrierea reală schimbă amprenta (KPI)

## Verificări

| Verificare | Așteptat | Real | Rezultat | Detaliu |
| --- | --- | --- | --- | --- |
| contract-version | 140-experiment-snapshot-v1 | 140-experiment-snapshot-v1 | PASS | 140 snapshot contract |
| integrity-matches-206 | true | true | PASS | the experiment reuses SDA-CJSON-1 + SHA-256, not a second format |
| section-count | 16 | 16 | PASS | the 206 payload sections |
| tick-restored | 60 | 60 | PASS | the restored tick is the snapshot tick |
| tick-expected | 60 | 60 | PASS | the experiment requests that same tick |
| no-advance | 0 | 0 | PASS | the load never advances the fixed-tick loop |
| snapshot-bytes | 64378 | 64378 | PASS | the complete 70-vehicle snapshot size |
| snapshot-checksum | c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5 | c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5 | PASS | deterministic SHA-256 of the captured payload |
| vehicles | 70 | 70 | PASS | 30 taxis + 40 civilians |
| controllers | 70 | 70 | PASS | one controller memory per vehicle |
| passengers | 30 | 30 | PASS | waiting, onboard and delivered passengers |
| rides | 30 | 30 | PASS | one ride per passenger |
| segments | 3 | 3 | PASS | open, closed and incomplete segments |
| opportunities | 64 | 64 | PASS | evaluated opportunities |
| signals | 8 | 8 | PASS | signal phases and remaining ticks |
| dispatch-entities | 4 | 4 | PASS | 3 pending jobs + 1 accepted result |
| dispatch-fields | 24 | 24 | PASS | pending and accepted rows compared leaf by leaf |
| entities-total | 287 | 287 | PASS | entities compared in the roundtrip |
| fields-total | 3080 | 3080 | PASS | leaf fields compared in the roundtrip |
| mismatches | 0 | 0 | PASS | stored and restored states are identical |
| comparison-recomputed | 3080 | 3080 | PASS | an independent comparison of capture and restored state reports the same field count |
| resume-plan | 206-world-resume-v1 | 206-world-resume-v1 | PASS | the experiment gets the real 206 resume plan |
| checksum-corrupted-refused | READ/CHECKSUM_MISMATCH | READ/CHECKSUM_MISMATCH | PASS | a modified payload is refused before any value is used |
| engine-refused | COMPATIBILITY/ENGINE_VERSION_MISMATCH | COMPATIBILITY/ENGINE_VERSION_MISMATCH | PASS | another engine build is a closed refusal |
| physics-refused | COMPATIBILITY/PHYSICS_BACKEND_MISMATCH | COMPATIBILITY/PHYSICS_BACKEND_MISMATCH | PASS | another physics backend is a closed refusal |
| map-refused | COMPATIBILITY/MAP_VERSION_MISMATCH | COMPATIBILITY/MAP_VERSION_MISMATCH | PASS | another map is a closed refusal |
| combined-refused | ENGINE_VERSION_MISMATCH,PHYSICS_BACKEND_MISMATCH,MAP_VERSION_MISMATCH | ENGINE_VERSION_MISMATCH,PHYSICS_BACKEND_MISMATCH,MAP_VERSION_MISMATCH | PASS | every incompatible field is named at once |
| tick-refused | TICK/TICK_MISMATCH | TICK/TICK_MISMATCH | PASS | a snapshot from another tick is not loaded as the experiment start |
| capture-boundary-refused | CAPTURE/CAPTURE_REJECTED | CAPTURE/CAPTURE_REJECTED | PASS | a capture inside the fixed step is refused |
| ledger-surface | fingerprint,fork,structuralIsolation,verify,version,write | fingerprint,fork,structuralIsolation,verify,version,write | PASS | the experiment handle exposes observation, a copy and a refusing write only |
| ledger-direct-refused | REFUSED/LIVE_LEDGER_READ_ONLY | REFUSED/LIVE_LEDGER_READ_ONLY | PASS | a direct write never reaches the live ledger |
| ledger-direct-not-live | false | false | PASS | no live row was appended |
| ledger-copy-accepted | ACCEPTED_IN_COPY | ACCEPTED_IN_COPY | PASS | the fork accepts the same write |
| ledger-copy-not-live | false | false | PASS | the fork write stays in the copy |
| ledger-copy-rows | 1 | 1 | PASS | the copied row count is reported |
| ledger-cross-refused | EXPERIMENT_LEDGER_MISMATCH | EXPERIMENT_LEDGER_MISMATCH | PASS | a fork only accepts its own ledger |
| ledger-unchanged | true | true | PASS | learning, rewards and KPI fingerprints are identical |
| ledger-live-writes | 0 | 0 | PASS | the experiment wrote zero live rows |
| ledger-stable-around-load | true | true | PASS | the successful load leaves the fingerprints unchanged |
| ledger-control-detected | true | true | PASS | a real write on the live KPI ledger changes its fingerprint |
| ledger-control-scope | KPI | KPI | PASS | only the ledger that was written changes |
| continuation-identical | true | true | PASS | original and restored worlds agree after 60 ticks |
| deterministic | true | true | PASS | two runs produce byte-identical results |

## Sumar

- Probe de refuz: 7
- Verificări: 43/43
- Rezultat: PASS

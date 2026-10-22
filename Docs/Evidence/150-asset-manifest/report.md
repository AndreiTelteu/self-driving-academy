# PBI 150 — manifest și pipeline de asseturi

Versiune contract: `150-asset-manifest-v1`, format `1`.

## Identitate

| Câmp | Valoare |
| --- | --- |
| Intrări | 27 (17 critice, 10 opționale) |
| Placeholder-uri marcate | 7 |
| Hash manifest | `9520b7a5de10beda7dff20f589d24429a27d7e538c75699f0d47d0caa3fde478` |
| ETag | `"9520b7a5de10beda7dff20f589d24429"` |
| Bytes pe wire | 6756068 B |
| Resurse decodate estimate | 40934632 B |

## Contabilitate separată

| Categorie | Bytes |
| --- | ---: |
| Wire — raw | 5728699 |
| Wire — encoded | 6756068 |
| Wire — gzip comparativ | 2072500 |
| Decodat — geometrie | 4469344 |
| Decodat — texturi | 0 |
| Decodat — WASM rezident | 36201028 |
| Decodat — WASM decodere | 0 |
| Decodat — workspace decodere | 0 |
| Decodat — audio | 261956 |
| Decodat — text | 2304 |
| Decodat — total | 40934632 |

## Scenarii

- `rebuild-one-asset` — Rebuild with vehicle:sedan:near geometry +640 B: only that cache entry is invalidated. → `{"changed":"vehicle:sedan:near","invalidatedIds":["vehicle:sedan:near"],"invalidated":1,"reused":26,"evicted":0,"manifestHashChanged":true}`
- `format-version-bump` — Format version bump keeps every asset unchanged but invalidates all cache keys explicitly. → `{"formatVersion":2,"invalidated":27,"reused":0}`
- `missing-critical-asset` — Two critical records removed: release blocked with the exact missing id list. → `{"removedIds":["runtime:wasm:rapier","vehicle:sedan:near"],"entries":25,"releaseBlocked":true,"reason":"MISSING_CRITICAL_ASSETS","missingCriticalIds":["runtime:wasm:rapier","vehicle:sedan:near"]}`
- `missing-source-file` — Rapier WASM file unavailable: reported as missing source and the release is blocked. → `{"missing":[{"id":"runtime:wasm:rapier","reason":"WASM_FILE_MISSING"}],"entries":26,"releaseBlocked":true,"reason":"MISSING_CRITICAL_ASSETS","missingCriticalIds":["runtime:wasm:rapier"]}`
- `missing-provenance` — A manifest entry without licence is blocked before release. → `{"corrupted":"city-decor:tree","releaseBlocked":true,"reason":"MISSING_PROVENANCE","missingProvenanceIds":["city-decor:tree"]}`
- `wire-vs-resident` — Base64 transport grows the Rapier module on the wire, while residency uses the 021 declared WASM estimate; gzip only shrinks transport. → `{"rapierRawBytes":3082103,"rapierEncodedBytes":4109472,"rapierResidentBytes":33554432,"rapierBase64Expansion":1027369,"glslangRawBytes":943680,"glslangGzipBytes":301882,"glslangResidentBytes":943680,"totalWireBytes":6756068,"totalDecodedBytes":40934632}`

## Verificări

| Verificare | Rezultat | Detaliu |
| --- | --- | --- |
| `manifest-format-versioned` | PASS | format 1, version 150-asset-manifest-v1, entries 27, hash 9520b7a5de10… |
| `manifest-provenance-complete` | PASS | audit OK; provenance complete for 27 entries |
| `manifest-deterministic` | PASS | two collections of the same real sources produce the same hash and entries |
| `selective-cache-invalidation` | PASS | invalidated 1 (vehicle:sedan:near), reused 26, evicted 0 |
| `format-version-invalidates-all` | PASS | format bump invalidated 27/27 entries explicitly |
| `missing-critical-blocks-release` | PASS | reason MISSING_CRITICAL_ASSETS, missing runtime:wasm:rapier, vehicle:sedan:near, entries 25 |
| `missing-source-file-blocks-release` | PASS | reason MISSING_CRITICAL_ASSETS, missing runtime:wasm:rapier |
| `missing-provenance-blocks-release` | PASS | reason MISSING_PROVENANCE, missing provenance city-decor:tree |
| `wire-separated-from-resident` | PASS | wire 6756068 B, decoded 40934632 B, rapier base64 4109472 B > raw 3082103 B, resident 33554432 B |
| `transfer-budget-223` | PASS | first-ride transfer 6756068 B <= 20971520 B; critical WASM 6756068 B <= 8388608 B |
| `resident-budgets-021-223-148` | PASS | geometry 4469344 B, textures 0 B, WASM resident 36201028 B, decoders 0 B / workspace 0 B, audio 261956 B |
| `registry-honest-empty` | PASS | no final GLB asset ships in V1; the registry decoder WASM/workspace stay 0 under the 8/16 MiB caps instead of fabricated entries |
| `cross-check-145-vehicle-evidence` | PASS | manifest vehicle budget equals Docs/Evidence/145-vehicle-assets/measurement.json (7 assets) |
| `cross-check-146-city-evidence` | PASS | decor inventory 8 kinds, 4354688 B equals the 146 measured 4354688 B and 1585 items |
| `cross-check-148-audio-evidence` | PASS | 7 cue ids match the 148 report; 261956 B <= 1048576 B |
| `build-evidence-hashes-recomputed` | PASS | artifact hashes recomputed for 145 (140), 146 (129) and 223 (149) builds |
| `build-wasm-artifacts-match-packages` | PASS | emitted glslang/twgsl bytes in the real 145/146/223 builds equal the package WASM sizes in the manifest |

Rezultat: 17/17 verificări, overall PASS.

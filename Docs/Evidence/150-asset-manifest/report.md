# PBI 150 — manifest și pipeline de asseturi

Versiune contract: `150-asset-manifest-v1`, format `1`.

## Identitate

| Câmp | Valoare |
| --- | --- |
| Intrări | 59 (33 critice, 26 opționale) |
| Placeholder-uri marcate | 7 |
| Hash manifest | `9d0e7d941666f8a58d5b1069b01e670ff70830e6b9488bebe89398ba8c72bea3` |
| ETag | `"9d0e7d941666f8a58d5b1069b01e670f"` |
| Bytes pe wire | 10849468 B |
| Resurse decodate estimate | 112011983 B |

## Contabilitate separată

| Categorie | Bytes |
| --- | ---: |
| Wire — raw | 9822099 |
| Wire — encoded | 10849468 |
| Wire — gzip comparativ | 2072500 |
| Decodat — geometrie | 15975320 |
| Decodat — texturi | 59571375 |
| Decodat — WASM rezident | 36201028 |
| Decodat — WASM decodere | 0 |
| Decodat — workspace decodere | 0 |
| Decodat — audio | 261956 |
| Decodat — text | 2304 |
| Decodat — total | 112011983 |

## Scenarii

- `rebuild-one-asset` — Rebuild with vehicle:sedan:near geometry +640 B: only that cache entry is invalidated. → `{"changed":"vehicle:sedan:near","invalidatedIds":["vehicle:sedan:near"],"invalidated":1,"reused":58,"evicted":0,"manifestHashChanged":true}`
- `format-version-bump` — Format version bump keeps every asset unchanged but invalidates all cache keys explicitly. → `{"formatVersion":2,"invalidated":59,"reused":0}`
- `missing-critical-asset` — Two critical records removed: release blocked with the exact missing id list. → `{"removedIds":["runtime:wasm:rapier","vehicle:sedan:near"],"entries":57,"releaseBlocked":true,"reason":"MISSING_CRITICAL_ASSETS","missingCriticalIds":["runtime:wasm:rapier","vehicle:sedan:near"]}`
- `missing-source-file` — Rapier WASM file unavailable: reported as missing source and the release is blocked. → `{"missing":[{"id":"runtime:wasm:rapier","reason":"WASM_FILE_MISSING"}],"entries":58,"releaseBlocked":true,"reason":"MISSING_CRITICAL_ASSETS","missingCriticalIds":["runtime:wasm:rapier"]}`
- `missing-provenance` — A manifest entry without licence is blocked before release. → `{"corrupted":"city-decor:tree","releaseBlocked":true,"reason":"MISSING_PROVENANCE","missingProvenanceIds":["city-decor:tree"]}`
- `wire-vs-resident` — Base64 transport grows the Rapier module on the wire, while residency uses the 021 declared WASM estimate; gzip only shrinks transport. → `{"rapierRawBytes":3082103,"rapierEncodedBytes":4109472,"rapierResidentBytes":33554432,"rapierBase64Expansion":1027369,"glslangRawBytes":943680,"glslangGzipBytes":301882,"glslangResidentBytes":943680,"totalWireBytes":10849468,"totalDecodedBytes":112011983}`

## Verificări

| Verificare | Rezultat | Detaliu |
| --- | --- | --- |
| `manifest-format-versioned` | PASS | format 1, version 150-asset-manifest-v1, entries 59, hash 9d0e7d941666… |
| `manifest-provenance-complete` | PASS | audit OK; provenance complete for 59 entries |
| `manifest-deterministic` | PASS | two collections of the same real sources produce the same hash and entries |
| `selective-cache-invalidation` | PASS | invalidated 1 (vehicle:sedan:near), reused 58, evicted 0 |
| `format-version-invalidates-all` | PASS | format bump invalidated 59/59 entries explicitly |
| `missing-critical-blocks-release` | PASS | reason MISSING_CRITICAL_ASSETS, missing runtime:wasm:rapier, vehicle:sedan:near, entries 57 |
| `missing-source-file-blocks-release` | PASS | reason MISSING_CRITICAL_ASSETS, missing runtime:wasm:rapier |
| `missing-provenance-blocks-release` | PASS | reason MISSING_PROVENANCE, missing provenance city-decor:tree |
| `wire-separated-from-resident` | PASS | wire 10849468 B, decoded 112011983 B, rapier base64 4109472 B > raw 3082103 B, resident 33554432 B |
| `transfer-budget-223` | PASS | first-ride transfer 10849468 B <= 20971520 B; critical WASM 6756068 B <= 8388608 B |
| `resident-budgets-021-223-148` | PASS | geometry 15975320 B, textures 59571375 B, WASM resident 36201028 B, decoders 0 B / workspace 0 B, audio 261956 B |
| `glb-core-only-no-decoder` | PASS | PBI 254 ships 17 CC0 GLB models as core glTF (identity wire, embedded PNG/JPEG); no Draco/meshopt/KTX2 decoder WASM or workspace is admitted |
| `cross-check-145-vehicle-evidence` | FAIL | manifest vehicle budget equals Docs/Evidence/145-vehicle-assets/measurement.json (7 assets) |
| `cross-check-146-city-evidence` | FAIL | decor inventory 10 kinds, 13119064 B equals the 146 measured 4354688 B and 1585 items |
| `cross-check-148-audio-evidence` | PASS | 7 cue ids match the 148 report; 261956 B <= 1048576 B |
| `build-evidence-hashes-recomputed` | PASS | artifact hashes recomputed for 145 (140), 146 (129) and 223 (149) builds |
| `build-wasm-artifacts-match-packages` | PASS | emitted glslang/twgsl bytes in the real 145/146/223 builds equal the package WASM sizes in the manifest |

Rezultat: 15/17 verificări, overall FAIL.

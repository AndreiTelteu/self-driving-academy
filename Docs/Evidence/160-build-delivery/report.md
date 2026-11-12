# PBI 160 — build de producție și livrare statică

Contract: `160-build-delivery-report-v1`. Buildul este produs de `vite.config.ts` cu `base: ./` și `sourcemap: false`.

## Sumar

| Categorie | Valoare |
| --- | ---: |
| Artefacte | 130 |
| JS | 3478683 B |
| WASM | 2646596 B |
| CSS | 43917 B |
| HTML | 2882 B |
| Total pe disc | 6172078 B (5.89 MiB) |
| Total gzip (JS+WASM+CSS) | 1769518 B |
| Buget JS+WASM | 6125279 B din 8388608 B (WITHIN, 73.02%) |

Amprenta SHA-256 a arborelui de build: `81e33b1d8c54a53b97087288dac3b7cf1f9f833f66eef07b108a23dc2042d3a9`. Al doilea build independent are digest identic.

## Ce este exclus în producție

| Excludere | Valoare măsurată |
| --- | ---: |
| Source maps | 0 |
| Instrucțiuni `debugger` | 0 |
| Apeluri console de debug (`log/debug/info/trace`) | 0 |
| Chunk-uri inspector | 0 |
| `import.meta.env` neînlocuit | 0 |

## WASM și asseturi

| Id manifest | Fișier pachet | Bytes pachet | Emis | Bytes emis | Wire manifest | Coerent |
| --- | --- | ---: | --- | ---: | ---: | --- |
| `runtime:wasm:glslang` | `node_modules/@babylonjs/core/assets/glslang/glslang.wasm` | 943680 | `assets/glslang-G7Yt_-32.wasm` | 943680 | 943680 (`IDENTITY`) | DA |
| `runtime:wasm:twgsl` | `node_modules/@babylonjs/core/assets/twgsl/twgsl.wasm` | 1702916 | `assets/twgsl-CB--yrSG.wasm` | 1702916 | 1702916 (`IDENTITY`) | DA |

Module WASM emise: 2, total 2646596 B, toate coerente cu pachetul și cu manifestul 150: DA.

## Livrare statică

Server: node:http static (fără server de dezvoltare). Referințe relative în `index.html`: DA. Cereri: 132; artefacte verificate (status, mărime, SHA-256, MIME): 130; eșecuri: 0.

| Cerere | Status | Bytes | Content-Type |
| --- | ---: | ---: | --- |
| `/index.html` | 200 | 2882 | text/html; charset=utf-8 |
| `/assets/glslang-DqqdIFnr.js` | 200 | 16030 | text/javascript; charset=utf-8 |
| `/assets/glslang-G7Yt_-32.wasm` | 200 | 943680 | application/wasm |
| `/assets/index-DdXCknGo.css` | 200 | 43917 | text/css; charset=utf-8 |
| `/assets/twgsl-CB--yrSG.wasm` | 200 | 1702916 | application/wasm |
| `/assets/twgsl-DqdFeK3J.js` | 200 | 74555 | text/javascript; charset=utf-8 |

## Cele mai mari chunk-uri JS

| Fișier | Bytes | Gzip |
| --- | ---: | ---: |
| `assets/index-CKTUUkAQ.js` | 1342577 | 324482 |
| `assets/openpbrMaterial.pure-D5-b4fhI.js` | 141120 | 31722 |
| `assets/pbrMaterial.pure-Bdqi0dXe.js` | 135852 | 25553 |
| `assets/thinEngine.pure-6EYX9WhP.js` | 127864 | 30942 |
| `assets/pbr.fragment-BEZ30aNp.js` | 97264 | 18058 |

## Artefacte ne-JS

| Fișier | Tip | Bytes | Gzip | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `assets/glslang-G7Yt_-32.wasm` | WASM | 943680 | 302467 | `d79453e0803ebcdf…` |
| `assets/index-DdXCknGo.css` | CSS | 43917 | 6922 | `f7cd35ffaedc8d4f…` |
| `assets/twgsl-CB--yrSG.wasm` | WASM | 1702916 | 595637 | `a434c2decdbb38ca…` |
| `index.html` | HTML | 2882 | — | `3052f5e2cc433463…` |

## Verificări

| Verificare | Rezultat | Detaliu |
| --- | --- | --- |
| `reproducible-build` | PASS | două builduri independente: 130 artefacte, digest 81e33b1d8c54a53b vs 81e33b1d8c54a53b |
| `wasm-and-assets-included` | PASS | 2 module WASM, 2646596 B; 3478683 B JS, 43917 B CSS, 2882 B HTML |
| `debug-excluded` | PASS | source maps 0, debugger 0, console debug 0, inspector 0, import.meta.env 0 |
| `static-delivery` | PASS | 132 cereri HTTP, 130 artefacte verificate (status, mărime, SHA-256, MIME), referințe relative true |
| `bundle-budget` | PASS | 6125279 B JS+WASM din 8388608 B (Docs/performance-budgets.json, 203-initial-1) |
| `artifact-taxonomy` | PASS | 130 artefacte: JS 3478683 B, WASM 2646596 B, CSS 43917 B, HTML 2882 B, altele 0 B |

Rezultat: 6/6 verificări, overall PASS.


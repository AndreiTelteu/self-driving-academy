# Dovezi PBI 150 — manifest și pipeline de asseturi

Contractul `150-asset-manifest-v1` din `src/build/` generează manifestul de build din inventarele
reale ale modulelor 145/146/147/148/149 și din fișierele WASM reale ale pachetelor. Nu există intrări
scrise de mână: fiecare `id`, sursă, licență și cost provine din modulul care deține contractul
assetului, iar bytes-ii WASM sunt citiți din `node_modules` și comparați cu artefactele buildurilor
reale 145/146/223.

## Conținut

| Fișier | Descriere |
| --- | --- |
| `asset-manifest.json` | Manifestul versionat complet: 27 intrări cu proveniență, `inputsHash`, `recordHash`, `cacheKey`, costuri wire și decodate. |
| `report.json` | Raportul determinist: contabilitate, bugete LOW/MEDIUM/HIGH, audit, 6 scenarii și 17 verificări. |
| `report.md` | Același raport în Markdown, pentru citire umană. |
| `commands.txt` | Comenzile executate și codurile lor reale de ieșire. |

`npm run assets:manifest` rescrie primele trei fișiere; `npm run assets:manifest -- --check` nu
scrie nimic și eșuează dacă vreunul este învechit. Ieșirea este deterministă: fără timestamp, fără
cale absolută și fără SHA de commit.

## Ce demonstrează

- **Manifest real, nu inventat.** 27 intrări: 7 vehicule (145), 9 decor inclusiv materialele (146),
  7 cue-uri audio procedurale (148/149), 1 read model de text pentru pasageri (147) și 3 module WASM
  (Rapier, glslang, twgsl). 17 critice, 10 opționale, 7 marcate explicit `placeholder`.
- **Identitate versionată.** Format `1`, versiune `150-asset-manifest-v1`, hash de manifest
  `9520b7a5de10beda7dff20f589d24429a27d7e538c75699f0d47d0caa3fde478` și ETag derivat din el.
  Două colectări ale acelorași surse, inclusiv în ordine inversă, produc același hash și aceleași
  intrări.
- **Cache selectiv.** Un rebuild care crește geometria lui `vehicle:sedan:near` cu 640 B invalidează
  exact 1 intrare și refolosește 26; o modificare doar de licență refolosește toate cele 27 de chei
  (hash-ul manifestului se schimbă, cache-ul de payload nu); un bump de format invalidează explicit
  27/27.
- **Lipsa unui asset critic blochează release-ul.** Eliminarea a două intrări critice produce
  `MISSING_CRITICAL_ASSETS` cu lista exactă `runtime:wasm:rapier`, `vehicle:sedan:near`; un fișier
  WASM inexistent este raportat ca `WASM_FILE_MISSING` și nu apare ca intrare fabricată; o licență
  goală produce `MISSING_PROVENANCE`.
- **Wire separat de rezident.** Rapier: 3.082.103 B modul brut → 4.109.472 B base64 pe wire →
  33.554.432 B rezidenți declarați de contractul 021. Glslang 943.680 B și twgsl 1.702.916 B sunt
  `IDENTITY`, cu rezidența egală cu limita inferioară a modulului. Totaluri: **6.756.068 B pe wire**
  și **40.934.632 B decodați estimați** (geometrie 4.469.344, WASM rezident 36.201.028, audio
  261.956, text 2.304, texturi 0).
- **Bugetele existente sunt respectate.** Proiecția 223 trece pe LOW/MEDIUM/HIGH: transfer first-ride
  6.756.068 B ≤ 20.971.520 B, cod critic WASM 6.756.068 B ≤ 8.388.608 B. Bugetele rezidente trec
  față de capurile 223 (geometrie, texturi), admiterea 021 (WASM) și `AUDIO_LIMITS` 148.
- **Dovezile existente sunt refolosite, nu duplicate.** Hash-urile de artefacte ale buildurilor 145,
  146 și 223 sunt recalculate și coincid; inventarul de decor (8 tipuri, 4.354.688 B, 1.585 itemuri)
  și cele 7 cue-uri audio coincid cu măsurătorile 146/148; glslang/twgsl emise de cele trei builduri
  au exact bytes-ii din pachete. Registry-ul V1 livrează 0 definiții GLB, deci decoderele raportează
  0 B în loc de asseturi de umplutură.

## Reproducere

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check:architecture
npm run check:parameter-catalog
npm test
npm run assets:manifest
npm run assets:manifest -- --check
node --import ./scripts/register-typescript.mjs --test tests/build/asset-manifest.test.ts
```

## Limitări

- Costurile „wire” sunt bytes-ii reali ai pachetelor și ai codării base64; nu s-a măsurat un răspuns
  HTTP real (compresia CDN, headere, cache-ul browserului). `gzipBytes` este o comparație locală la
  nivel 9, folosită numai pentru transport.
- Estimările „decoded” sunt cele declarate de contracte: geometria și texturile vin din bugetele 223
  și din inventarele 145/146, WASM-ul Rapier din admiterea 021, iar audio-ul din specificațiile de
  buffer. Nu sunt citiri ale memoriei GPU sau ale heap-ului unui browser; măsurătorile de rezidență
  rămân în dovezile 145/146/223.
- Registry-ul nu conține încă un asset GLB final, deci `decoderWasmBytes` și `decoderWorkspaceBytes`
  sunt 0 prin contract. Când apare primul GLB, intrarea și decodorul intră în manifest prin aceleași
  câmpuri, fără schimbarea formatului.
- Cele 7 cue-uri audio sunt placeholder-uri procedurale, marcate `placeholder: true`. Înlocuirea lor
  cu înregistrări reale schimbă `audioBytes` și `cacheKey` pentru acele intrări, nu contractul.
- Manifestul descrie buildul, nu servește fișiere: pipeline-ul de publicare și invalidarea cache-ului
  la runtime rămân în afara acestui PBI.

---
id: "150"
title: "Manifest și pipeline de asseturi pentru build"
status: "Done"
release: "V1"
module: "Asseturi și audio"
depends_on: ["146","145","147","149"]
performance_checks: ["assets", "loading"]
owner: "loop-pbi/manifest-150-01 (opencode/deepseek-v4.1-flash-free)"
started_at: "2026-10-22T20:24:32+03:00"
completed_at: "2026-10-22T20:41:28+03:00"
---

# 150 Manifest și pipeline de asseturi pentru build

## Obiectiv

Versionează fișierele, cache-ul și inventarul asseturilor.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

[16-asseturi-vizual-si-audio.md](../../Docs/16-asseturi-vizual-si-audio.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 146 trebuie să existe în Done înainte de începere.
- PBI 145 trebuie să existe în Done înainte de începere.
- PBI 147 trebuie să existe în Done înainte de începere.
- PBI 149 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un build nou invalidează numai cache-ul necesar.
- [x] Lipsa unui asset critic este detectată înainte de release.

- [x] CI verifică bytes transferați și resurse decodate estimate, inclusiv WASM/decodere, fără a confunda compresia cu memoria rezidentă.

## Verificare

Testează manifest incomplet și rebuild cu un asset modificat.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `150-asset-manifest-v1` este implementat în `src/build/` și generează manifestul din inventarele reale 145/146/147/148/149 și din fișierele WASM reale ale pachetelor. Manifestul are 27 de intrări (17 critice, 10 opționale, 7 placeholder-uri marcate), hash `9520b7a5de10beda7dff20f589d24429a27d7e538c75699f0d47d0caa3fde478` și ETag derivat. `cacheKey` depinde numai de format, versiune, `id` și `inputsHash`, deci un rebuild care schimbă un singur asset invalidează exact acea intrare (1 invalidată, 26 refolosite), o modificare doar de licență refolosește toate cheile, iar un bump de format invalidează explicit 27/27. `auditAssetManifest` blochează release-ul cu motive închise și lista exactă de `id`-uri (`MISSING_CRITICAL_ASSETS`, `MISSING_PROVENANCE`), iar sursele lipsă sunt raportate (`WASM_FILE_MISSING`) fără intrări fabricate. Contabilitatea separă wire-ul (6.756.068 B) de rezidentul estimat (40.934.632 B, inclusiv 36.201.028 B WASM), iar proiecția 223 și bugetele rezidente 021/223/148 trec pe LOW/MEDIUM/HIGH. Registry-ul V1 are 0 definiții GLB, raportat onest cu 0 B decodere.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0; `npm run check:architecture` exit 0 (303 fișiere TypeScript, toate probele negative PASS); `npm run check:parameter-catalog` exit 0; `npm test` exit 0 (2088 teste, 2088 pass, 0 fail); `npm run assets:manifest` exit 0 (17/17 verificări PASS; entries 27, wire 6756068 B, decoded 40934632 B); `npm run assets:manifest -- --check` exit 0 (cele trei fișiere de dovezi sunt actuale); `node --import ./scripts/register-typescript.mjs --test tests/build/asset-manifest.test.ts` exit 0 (14 teste, 14 pass). Rezultatele exacte și notele despre avertismentul Node de tipare experimentală sunt în `Docs/Evidence/150-asset-manifest/commands.txt`.

Fișiere și documente actualizate: `src/build/content-hash.ts`, `src/build/asset-manifest.ts`, `src/build/asset-manifest-sources.ts`, `src/build/index.ts`, `tests/build/asset-manifest.test.ts`, `tests/build/asset-manifest-report.ts`, `scripts/run-asset-manifest-report.mjs`, `package.json` (scriptul `assets:manifest`), `Docs/16-asseturi-vizual-si-audio.md` (secțiunea manifestului 150), `Docs/Evidence/150-asset-manifest/{README.md,asset-manifest.json,report.json,report.md,commands.txt}`.

Limitări sau follow-up: costurile wire sunt bytes-ii reali ai pachetelor și ai codării base64, nu un răspuns HTTP/CDN măsurat; `gzipBytes` este doar o comparație locală de transport. Estimările decodate provin din contractele 021/223/145/146/148, nu din citiri de memorie GPU sau heap de browser (măsurătorile rămân în dovezile 145/146/223). Registry-ul nu are încă un GLB final, deci decoderele sunt 0 prin contract; primele asseturi GLB intră prin aceleași câmpuri, fără schimbare de format. Cue-urile audio sunt placeholder-uri procedurale; înlocuirea lor schimbă `audioBytes` și `cacheKey`, nu contractul. Servirea și invalidarea cache-ului la runtime rămân în afara scope-ului.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '150' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-22: Implementat contractul `150-asset-manifest-v1` în `src/build/`, raportul determinist și dovezile; 27 intrări reale, cache selectiv, audit de release și contabilitate wire/decodat separată. Toate verificările obligatorii au trecut (2088 teste, 17/17 verificări de manifest).

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

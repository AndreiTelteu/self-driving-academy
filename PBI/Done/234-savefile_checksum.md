---
id: "234"
title: "Savefile complet cu checksum și încărcare atomică"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["135","215","225","227","229","230","233","222"]
performance_checks: ["storage", "memory", "workers", "ui"]
owner: "loop-pbi/savefile-234-01"
started_at: "2026-11-12T05:53:45+02:00"
completed_at: "2026-11-12T06:26:32+02:00"
---

# 234 Savefile complet cu checksum și încărcare atomică

## Obiectiv

Implementează Salvează/Încarcă jocul în fișier .sdasave complet cu checksum calculat/verificat în browser.

## Context și plan

- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)
- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 135 trebuie să existe în Done înainte de începere.
- PBI 215 trebuie să existe în Done înainte de începere.
- PBI 225 trebuie să existe în Done înainte de începere.
- PBI 227 trebuie să existe în Done înainte de începere.
- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 230 trebuie să existe în Done înainte de începere.
- PBI 233 trebuie să existe în Done înainte de începere.
- PBI 222 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Envelope-ul SHA-256/SDA-CJSON-1 acoperă metadatele și payloadul, exclude numai checksum top-level și include ambele sesiuni/decor/reglaje/progres.
- [x] Vectorii de canonicalizare acoperă Unicode, numere finite/safe integers, ordine obiect/array, -0 și base64; duplicate keys sunt respinse înainte de hashing.
- [x] Editarea fără checksum recalculat, checksum lipsă/necunoscut și fișier corupt/prea mare produc eroare fără bypass sau modificare live.
- [x] Verificarea checksum precede schema/migrarea; un checksum recalculat nu face o schemă invalidă acceptabilă și nu este prezentat drept anti-cheat.
- [x] Sumarul fișierului validat precede confirmarea înlocuirii; staging/commit/rollback și un singur writer împiedică activarea parțială sau adunarea reward-urilor.
- [x] Exportul/importul au progres/anulare și limite bytes/depth; statusul distinge autosave de fișierul pregătit, iar startup reia în pauză/AUTO.

## Verificare

Roundtrip ambele sesiuni, modifică XP fără hash nou, checksum valid/schema invalidă, whitespace/key order, missing hash, truncation, versiune veche/nouă, quota, două taburi și rollback; măsoară fișierul maxim admis.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/persistence/savefile.ts` (contract `234-savefile-v1`) livrează envelope-ul `self-driving-academy-save` (`formatVersion 1`, `integrityVersion 1`, `schemaVersion 1`), cu checksum `SDA-CJSON-1`/SHA-256 peste metadate și payload, fără câmpul top-level `checksum`. Payload-ul conține versiunile engine/fizică/hartă/schemă, ambele sesiuni (Academie și Haos) ca documente 135/215 neschimbate — checkpoint 206, progres/campanie 130, setări 009, referință profil 109/110, scenarii 127, daily 211/212, ledger 209 și XP 213 — plus snapshoturile 227 de decor și replay-urile opționale base64. Citirea refuză închis: buget bytes/adâncime, parser strict cu chei duplicate, format/integritate, formă canonică, checksum, schemă, componente, bilanț de mărime. `createSaveFileStore` oferă `preview` (sumarul fișierului + starea curentă, fără scriere) și `import`, care cere identitatea preview-ului, pregătește lumea într-un port, înlocuiește ambele sesiuni și economia lor într-o singură tranzacție, recitește fiecare slot în tranzacție și publică lumea numai după commit. Nu există `settle`/`creditMission`/`creditDaily`/`recordDailyReward`; al doilea import are delta 0 XP și o singură recompensă daily. `exportSaveFile` citește din repository, `SaveFileJob` dă progres/anulare, `saveFileView` distinge `FILE_READY` de `AUTOSAVE_SAVED` și nu pretinde scriere pe disc, iar reluarea este `PAUSED_AUTO`. Arhiva 135/215 simplă este refuzată `LEGACY_SAVEFILE` și migrată explicit cu `migrateSessionArchiveToSaveFile`. Fișierul produs are 174 732 code units canonici (174 757 bytes UTF-8), checksum `f0f5b9d26e4ff78ead11fbf98dd191b738c7060350ed40e7b171ebc98cb4f106`. În Chromium 156, aceleași bytes au fost scrise ca `Blob`/`File`, descărcate pe disc (SHA-256 `8cc72504a71976d14b33384718b2f242fc4cb512bafe824fdfe16642893108bb`), recitite și importate cu succes; WebCrypto a recalculat exact checksum-ul documentului.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (364 fișiere TypeScript + probe negative); `npm run check:parameter-catalog` sincronizat; testele țintă 26/26 PASS (24 cazuri deterministe + 2 de raport); `npm test` 2 799/2 799 pass, 0 fail, 97 943,98 ms; `npm run save:file` 84/84 verificări PASS, 6 scenarii; `npm run save:file -- --check` raportează raportul curent; `npm run save:file -- --browser` BROWSER PASS (2 sesiuni, 35 obiecte de decor, 100,5 XP după import, zero erori de consolă). Sunt acoperite round-trip-ul ambelor sesiuni, XP modificat fără hash nou, whitespace/ordine chei, checksum valid cu schemă invalidă, checksum lipsă/necunoscut, trunchiere, fișier prea mare, versiune veche/mai nouă, quota plină, două taburi, anulare, rollback și fișierul maxim admis (12 285 272 B; produs 174 732).

Fișiere și documente actualizate: `src/persistence/savefile.ts` (nou), `src/persistence/index.ts` (exporturi la final), `tests/persistence/savefile-fixture.ts`, `tests/persistence/savefile.test.ts`, `tests/persistence/savefile-report.ts`, `tests/persistence/savefile-report.test.ts`, `scripts/run-savefile-report.mjs`, `tests/browser/savefile-234/index.html`, `tests/browser/savefile-234/main.ts`, `package.json` (`save:file`, ultima intrare), `Docs/29-savefile-si-integritate.md` (secțiune nouă), `Docs/Evidence/234-savefile/` (`README.md`, `report.json`, `report.md`, `browser.json`, `saved-file.sdasave`).

Limitări sau follow-up: Nu există un panou UI montat; PBI-ul livrează store-ul, sumarul de confirmare și proiecția de status, iar montarea în shell rămâne stratului de compunere (verificare vizuală `NOT_APPLICABLE_NO_UI_COMPONENT`). Decorul este verificat structural de cititor și complet de `restore` 227 în portul de lume; fără port, un decor modificat și re-stampat ar fi refuzat abia la restaurare. Repository-ul din teste și din pagină este dublul 127 în memorie: tranzacțiile și rollback-ul sunt reale, dar nu s-a scris în IndexedDB-ul persistent al unui profil. Proba de browser este headless, fără GPU, și dovedește fișierul/WebCrypto/`File`/înlocuirea, nu performanța pe hardware. `twoSessionCheckpointBytes` rămâne `null` în manifest (măsurat, necalibrat), `totalHeapBytes` este indisponibil, iar transcriptul determinist nu măsoară timp de perete.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '234'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-11-12: Implementare livrată pe branch-ul `loop-pbi/savefile-234-01`: contract `234-savefile-v1`, envelope complet cu ambele sesiuni și decor, checksum verificat în Chromium, import atomic cu preview/staging/rollback, teste țintă 26/26, suita completă 2 799/2 799, raport determinist 84/84 și probă de browser PASS; fișier mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

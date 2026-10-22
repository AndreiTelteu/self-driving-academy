---
id: "129"
title: "Salvarea segmentelor și checkpointuri"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["127","090"]
owner: "loop-pbi/saves-128-129-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T15:26:00+03:00"
completed_at: "2026-10-22T15:50:00+03:00"
---

# 129 Salvarea segmentelor și checkpointuri

## Obiectiv

Persistă segmente închise și checkpointuri pentru intervenții active.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 127 trebuie să existe în Done înainte de începere.
- PBI 090 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un crash recuperează segmentul ca incomplet, cu motiv.
- [x] Scrierile nu blochează inputul și păstrează ordinea evenimentelor.

## Verificare

Testează intervenție lungă și oprire necontrolată.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: segmentele închise (069/090) sunt persistate în store-ul `segments` cu
starea, motivul închiderii și ordinea evenimentelor (`src/persistence/segment-store.ts`, contract
`129-segment-store-v1`). Scrierea are trei pași — manifest, bucăți de evenimente, sigiliu — și
citirea (`readSegment`) raportează realitatea: un segment scris parțial la o oprire necontrolată
este recuperat ca `INCOMPLETE` cu motiv explicit (`UNSEALED_WRITE`, `MISSING_CHUNKS`,
`ORDER_VIOLATION`, `DIGEST_MISMATCH`, `SOURCE_INCOMPLETE`), întoarce numai evenimentele aflate
efectiv în magazin și numelează bucățile lipsă; nu fabrică date și nu transformă niciodată un
segment parțial într-unul complet. Evenimentele primesc o secvență monotonă, iar digestul
FNV-1a 64 al listei ordonate detectează orice modificare a conținutului stocat. Scrierile nu
blochează inputul: `src/persistence/write-queue.ts` oferă o coadă FIFO limitată (`enqueue`
întoarce imediat, scrierea are loc mai târziu, în afara hot path-ului de tick), ordinea segmentelor
și ordinea evenimentelor se păstrează, iar o coadă plină refuză segmentul nou cu `STORAGE_FULL`.
Checkpointul unei intervenții active (`src/persistence/intervention-checkpoint.ts`, contract
`129-intervention-checkpoint-v1`) conține doar identitatea și generația; snapshotul complet al
lumii rămâne la PBI 206, iar o generație mai veche nu înlocuiește una mai nouă (`STALE_REVISION`).

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS;
`npm run format:check` PASS; `npm run check:architecture` PASS (280 fișiere, 6+4+3 probe
negative); `npm test` PASS — 1963 teste, 1963 pass, 0 fail, 0 skipped, 70417.4707 ms;
`node --import ./scripts/register-typescript.mjs --test "tests/persistence/segment-store.test.ts"`
PASS — 11/11; `npm run save:segments` PASS — 52/52 verificări
(`SUMMARY checks 52/52, overall PASS`). Scenariile executate: intervenție lungă (500 evenimente,
8 bucăți, secvență monotonă păstrată), oprire necontrolată înainte de bucăți, oprire necontrolată
la mijlocul bucăților (bucățile prezente 0 și 1 raportate, cele lipsă 2 și 3 raportate, 100 de
evenimente stocate din 200), bucată lipsă, bucată modificată (digest rupt), segment incomplet la
sursă (`DATA_LOSS`), coada limitată (refuz `STORAGE_FULL`) și checkpoint cu generație veche
(`STALE_REVISION`). Notă: la o rulare anterioară a suitei complete a eșuat un singur test de timp
din `tests/workers/protocol.test.ts`, fără legătură cu persistența; rulările următoare au trecut
integral (1963/1963, de două ori).

Fișiere și documente actualizate: `src/persistence/segment-store.ts` (nou),
`src/persistence/write-queue.ts` (nou), `src/persistence/intervention-checkpoint.ts` (nou),
`src/persistence/index.ts` (exporturi), `tests/persistence/segment-store.test.ts` (nou),
`tests/persistence/save-segments-report.ts` (nou), `scripts/run-save-segments-report.mjs` (nou),
`package.json` (script `save:segments` adăugat la finalul blocului `scripts`),
`Docs/15-salvare-si-import-export.md` (versiune 0.8 + secțiunea contractului 129),
`Docs/Evidence/129-save-segments/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: verificarea rulează pe dublul în memorie IndexedDB; verificarea în browser
rămâne PBI 235. Evenimentele sunt stocate ca fapte de ordine, mostrele brute de telemetrie (085/090)
rămân în contractul lor, iar segmentul nu este un replay complet al lumii. Bucățile sunt rânduri
separate în store-ul `segments`, deci consumatorii grupează după `body.segmentId`. Coada este
limitată la segmente, nu la evenimente, și nu există încă politică de retenție a segmentelor vechi.
Modulul nu este încă conectat la bucla de joc; integrarea automată rămâne în planul de salvare
periodică din Docs/15.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '129' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22: Asumat de loop-pbi/saves-128-129-01; segmentele, recuperarea incompletă cu motiv,
  coada de scriere limitată și checkpointul de intervenție implementate în `src/persistence`.
- 2026-10-22: Verificări executate (typecheck, lint, format:check, check:architecture, 1963/1963
  teste, 11/11 teste ținte, raport 52/52); dovezi în Docs/Evidence/129-save-segments.

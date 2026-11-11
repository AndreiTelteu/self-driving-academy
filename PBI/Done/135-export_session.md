---
id: "135"
title: "Export import de sesiune și scenarii"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["134","129","130","206"]
owner: "loop-pbi/session-135-01"
started_at: "2026-11-11T15:03:33+02:00"
completed_at: "2026-11-11T15:23:44+02:00"
---

# 135 Export import de sesiune și scenarii

## Obiectiv

Adaugă arhivă de sesiune cu structură și mărime explicite.

## Context și plan

- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 134 trebuie să existe în Done înainte de începere.
- PBI 129 trebuie să existe în Done înainte de începere.
- PBI 130 trebuie să existe în Done înainte de începere.
- PBI 206 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Importul este validat și atomic; checkpointul lumii și referințele stil/progres sunt coerente.
- [x] Sesiunea importată înlocuiește starea, fără adunarea recompenselor; arhiva invalidă păstrează sesiunea curentă.

- [x] Exportul de sesiune furnizează snapshot coerent pentru envelope-ul și verificarea checksum din 234; importul de profil/scenariu nu este bypass pentru Load game.

## Verificare

Testează arhivă validă, coruptă și prea mare.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: arhiva de sesiune `self-driving-academy-session-archive` (`formatVersion 1`, `schemaVersion 1`) are sloturi explicite pentru checkpointul 206, rândul 130 de progres, rândul 130 de campanie, setările 009, referința de generație a profilului (109/110) și rândurile 127 `SCENARIO` (maximum 8). Documentul declară mărimea canonică UTF-8 pe fiecare componentă, suma și plafonul (2 097 152 de bytes); cititorul remăsoară cu `measureJsonBytes` (bugetul 127) și refuză declarația greșită (`SIZE_MISMATCH`), componenta peste buget (`COMPONENT_TOO_LARGE`) și totalul peste plafon (`ARCHIVE_TOO_LARGE`), fără trunchiere. Checksum-ul este SHA-256 peste forma `SDA-CJSON-1` a envelope-ului fără câmpul `checksum`, iar snapshotul 206, digesturile 130 și rejucarea ledgerului 125 rămân verificări independente. Importul rulează într-o singură tranzacție (`commitSessionArchiveRows`) peste `profiles`, `profileActivations`, `checkpoints`, `progress`, `settings` și `scenarios`: validează referința de profil, citește și validează rândurile care vor fi șterse, le înlocuiește, apoi recitește sesiunea în aceeași tranzacție și compară digesturile și XP-ul cu arhiva. În scenariul real, XP 600 al sesiunii țintă devine 300 (XP-ul arhivei, nu 900), recompensele acordate rămân 6, aceeași finalizare 116 răspunde `DUPLICATE` cu 0 XP, iar un al doilea import lasă tot 300/6. Un fișier cu checksum modificat, un jurnal de campanie rescris cu envelope re-stampat, o referință de profil ruptă, un rând din altă sesiune, un eșec înainte de commit și un al doilea tab sunt refuzate cu coduri închise, iar amprenta sesiunii rămâne byte cu byte identică.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (332 fișiere TypeScript, probe negative 6+4+3 PASS); `npm run check:parameter-catalog` „Parameter catalog is synchronized.”; `node --import ./scripts/register-typescript.mjs --test "tests/persistence/session-archive.test.ts"` 15/15 pass, 0 fail; `npm test` 2371/2371 pass, 0 fail; `npm run save:session-archive` 58/58 verificări, 3 scenarii, overall PASS; `npm run save:session-archive -- --check` „Session archive report is current”.

Fișiere și documente actualizate: create `src/persistence/session-archive.ts`, `src/persistence/session-archive-import.ts`, `tests/persistence/session-archive-fixture.ts`, `tests/persistence/session-archive.test.ts`, `tests/persistence/session-archive-report.ts`, `scripts/run-session-archive-report.mjs`, `Docs/Evidence/135-session-archive/README.md`, `report.json`, `report.md`; modificate `src/persistence/index.ts` (numai append la finalul listei de exporturi), `Docs/29-savefile-si-integritate.md` (secțiune nouă „Contract implementat V1 (PBI 135) — arhiva de sesiune”), `package.json` (ultima intrare din `scripts`).

Limitări sau follow-up: (1) `src/persistence/repository.ts` nu este în ownership-ul acestui PBI și nu expune încă propria conexiune ca graniță tranzacțională; importul primește portul `SessionArchiveTransactionRunner`, iar cablarea `repository → runner` rămâne pentru PBI-ul de integrare 234/136. În teste portul este o a doua conexiune pe aceeași bază în memorie, deci tranzacția și rollback-ul sunt reale. (2) Nu există UI de export/import sau de confirmare; store-ul oferă `preview` (validare + starea curentă) pentru pasul de confirmare. (3) Arhiva nu transportă profiluri (doar referința de generație), replay-uri sau telemetrie brută. (4) Plafoanele (2 MiB total, 8 scenarii) sunt derivate din bugetele 127, necalibrate pe sesiuni lungi reale. (5) Nu este implementat envelope-ul `.sdasave` al modulului 234; arhiva furnizează snapshotul coerent pe care acesta îl împachetează. (6) Verificările rulează pe dublul determinist în memorie, nu pe IndexedDB-ul unui browser real. (7) Nu am modificat `Docs/15-salvare-si-import-export.md`; un pointer către Docs/29 și acest PBI rămâne de adăugat la integrare.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '135' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Plan revizuit la v0.3; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-11: Implementat în `loop-pbi/session-135-01`: arhivă de sesiune cu structură și mărime declarate, checksum `SDA-CJSON-1`/SHA-256, coerență checkpoint/profil/progres, import atomic și înlocuitor verificat în aceeași tranzacție; 15 teste noi, raport determinist 58/58, suita completă 2371/2371.

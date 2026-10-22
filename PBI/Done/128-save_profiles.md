---
id: "128"
title: "Tranzacții pentru profil și activare"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["127","110"]
owner: "loop-pbi/saves-128-129-01 (opencode-go/minimax-m3.1-flash-free)"
started_at: "2026-10-22T15:14:51+03:00"
completed_at: "2026-10-22T15:24:30+03:00"
---

# 128 Tranzacții pentru profil și activare

## Obiectiv

Salvează versiunea și activarea fără referințe orfane.

## Context și plan

[15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 127 trebuie să existe în Done înainte de începere.
- PBI 110 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Un crash între pași nu lasă profil activ imposibil de încărcat.
- [x] Proveniența și istoricul sunt păstrate.

## Verificare

Simulează întrerupere înainte și după commit.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: versiunea 109 și activarea 110 sunt scrise într-o singură tranzacție
multi-store peste `profiles` și `profileActivations` (`src/persistence/profile-transaction.ts`,
contract `128-profile-transaction-v1`; repository: `commitProfileActivation`). Înainte de commit nu
rămâne niciun rând, după commit rămân ambele, deci un crash nu poate lăsa un profil activ
imposibil de încărcat. Activarea trebuie să indice exact versiunea scrisă în aceeași tranzacție
(`REFERENCE_MISSING`), părintele unei versiuni derivate trebuie să fie stocat
(`REFERENCE_MISSING`), o versiune stocată este imuabilă (`IMMUTABLE_RECORD`), secvența activării nu
se întoarce (`STALE_REVISION`), iar repetarea identică este idempotentă. Proveniența și istoricul
sunt păstrate și citite înapoi exact: `getProfileHistory` reconstruiește lanțul base→tip din
legăturile de părinte stocate și întoarce versiunea activă, secvența, timestamp-urile și
proveniența; sursa este clasificată din proveniența stocată (`BASE` / `MANUAL_TUNING` /
`LEARNING`).

Verificări executate și rezultat: `npm run typecheck` PASS; `npm run lint` PASS;
`npm run format:check` PASS; `npm run check:architecture` PASS (277 fișiere, 6+4+3 probe
negative); `npm test` PASS — 1952 teste, 1952 pass, 0 fail, 0 skipped, 66182.3367 ms;
`node --import ./scripts/register-typescript.mjs --test "tests/persistence/profile-transaction.test.ts"`
PASS — 12/12; `npm run save:profiles` PASS — 40/40 verificări
(`SUMMARY checks 40/40, contract 128-profile-transaction-v1, overall PASS`). Includerile
`beforeCommit` și `afterCommit` au fost executate efectiv: crash înainte de commit → `REJECTED`
(`TRANSACTION_ABORTED`), 1 rând de versiune și 1 de activare (doar cele anterioare), profilul activ
rămâne `profile-1@1` și este încărcabil; crash după commit → `CRASHED_AFTER_COMMIT`, ambele rânduri
sunt durabile și profilul activ este citit înapoi.

Fișiere și documente actualizate: `src/persistence/profile-transaction.ts` (nou),
`src/persistence/repository.ts`, `src/persistence/index.ts`,
`tests/persistence/profile-transaction.test.ts` (nou),
`tests/persistence/save-profiles-report.ts` (nou),
`scripts/run-save-profiles-report.mjs` (nou), `package.json` (script `save:profiles` adăugat la
finalul blocului `scripts`), `Docs/15-salvare-si-import-export.md` (versiune 0.7 + secțiunea
contractului 128), `Docs/Evidence/128-save-profiles/README.md`, `report.json`, `report.md`.

Limitări sau follow-up: verificarea rulează pe dublul în memorie IndexedDB; adaptorul real folosește
același port, dar verificarea în browser rămâne PBI 235. Clasificarea provenienței este derivată
din listele de intervenții și segmente stocate, nu adaugă surse. Activarea unei versiuni deja
stocate rămâne operația separată `activateProfile` din 127; revenirea la o versiune mai veche cu
secvență mai mare nu are încă un contract de plan.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '128' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-22: Asumat de loop-pbi/saves-128-129-01; tranzacția atomică profil+activare
  implementată în `src/persistence/profile-transaction.ts` cu rezultate explicite
  COMMITTED/CRASHED_AFTER_COMMIT/REJECTED, istoric și proveniență citite înapoi exact.
- 2026-10-22: Verificări executate (typecheck, lint, format:check, check:architecture, 1952/1952
  teste, 12/12 teste ținte, raport 40/40); dovezi în Docs/Evidence/128-save-profiles.

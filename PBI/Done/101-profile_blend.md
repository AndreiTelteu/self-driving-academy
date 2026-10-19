---
id: "101"
title: "Regularizare adaptare și memorii recente"
status: "Done"
release: "V1"
module: "Învățare"
depends_on: ["100"]
owner: "Codex gpt-6-luna medium profile-blend-01"
started_at: "2026-10-20T00:55:00+03:00"
completed_at: "2026-10-20T01:10:00+03:00"
---

# 101 Regularizare adaptare și memorii recente

## Obiectiv

Compune estimatele cu profilul de bază și ponderea recentului.

## Context și plan

[10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 100 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Zgomotul singular are efect limitat, iar stilul repetat poate schimba puternic profilul.
- [x] Regularizarea nu forțează comportamentele riscante către conformare.

## Verificare

Testează obicei vechi, schimbare repetată de stil și demonstrație singulară.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/learning/profile-blend.ts` (exportat prin `src/learning/index.ts`) implementează `newValue = oldValue + learningWeight × (estimate − oldValue)` cu `learningWeight = min(cap, quality × E/(E+4) × recencyFactor × contradictionFactor)`, unde `E` este numărul efectiv de episoade din 100. Recența este media ponderată de expunere a `max(0,05; 0,5^(ageSeconds/86400))` (half-life 24 h, prag 5%), iar contradicția este 1 / 0,5 / 0 la NONE / MODERATE / SEVERE. Plafoanele sunt 0,6 per actualizare și 0,15 când `E < 2`, astfel încât un episod singular zgomotos are efect mic, iar stilul repetat consistent poate muta puternic valoarea. `UNOBSERVED`/`WEAK` păstrează exact valoarea veche; `ZERO` este aplicat ca zero real, nu ignorat; un interval fără valoare punctuală și `SEVERE` sunt reținute cu intervalul lor. Nu există nicio contracție către profilul de bază/sigur: doar limitarea la intervalul 092, raportată prin `clampedToBounds`. Fiecare actualizare păstrează proveniența completă (secvență, valori, pondere, calitate, recență, contradicție, interval, identități de episoade, vârstă) în lanțul `history`; rezultatul este înghețat, `published: false`, `learned: false`, iar flagurile 092 rămân neschimbate.

Verificări executate și rezultat: `npm run typecheck`, `lint`, `format:check`, `check:architecture` (171 fișiere), `check:parameter-catalog` exit 0; `npm test` 1084/1084 PASS (1072 baseline + 12); suita țintă `tests/learning/profile-blend.test.ts` 12/12. Dovezi verbatim în [Evidence/101-profile-blend](../../Docs/Evidence/101-profile-blend/README.md).

Fișiere și documente actualizate: `src/learning/profile-blend.ts` (nou), `src/learning/index.ts`, `tests/learning/profile-blend.test.ts` (nou), [Docs/profile-blend.md](../../Docs/profile-blend.md) (nou), [Docs/10-invatarea-stilului.md](../../Docs/10-invatarea-stilului.md), `Docs/Evidence/101-profile-blend/`.

Limitări sau follow-up: identitatea episoadelor, expunerea, grupurile de corelare și ceasul `ageSeconds` sunt furnizate de apelant. Half-life-ul de 24 h, pragul de 5%, saturația la patru episoade și plafoanele 0,6/0,15 sunt calibrare provizorie, nu semnificație statistică. Nu există worker, persistență, buclă live, publicare de profil, integrare în panou, rulare în browser sau playtest; flagurile 092 rămân neschimbate.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '101' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-10-20: Implementare în worktree izolat (commit `eb32e124`): blend mărginit cu pondere din calitate/număr efectiv/recență/contradicție, ZERO aplicat ca valoare reală, fără contracție spre profilul sigur, cu proveniență completă și 12 teste noi. Integrat prin fast-forward; verificat de orchestrator cu 1084/1084 teste.

---
id: "215"
title: "Persistență pentru KPI-uri misiuni zilnice și XP"
status: "Done"
release: "V1"
module: "Persistență"
depends_on: ["214","210","212","131","136"]
performance_checks: ["storage", "memory"]
owner: "loop-pbi/save-econ-215-01"
started_at: "2026-11-11T21:24:43.477+02:00"
completed_at: "2026-11-11T21:56:36.273+02:00"
---

# 215 Persistență pentru KPI-uri misiuni zilnice și XP

## Obiectiv

Extinde checkpointul/exportul de sesiune cu calendar economic/daily, ledger comercial, review-uri, bucketuri și XP.

## Context și plan

- [29-savefile-si-integritate.md](../../Docs/29-savefile-si-integritate.md)

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [15-salvare-si-import-export.md](../../Docs/15-salvare-si-import-export.md)
- [22-kpi-economie-si-review-uri.md](../../Docs/22-kpi-economie-si-review-uri.md)
- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 214 trebuie să existe în Done înainte de începere.
- PBI 210 trebuie să existe în Done înainte de începere.
- PBI 212 trebuie să existe în Done înainte de începere.
- PBI 131 trebuie să existe în Done înainte de începere.
- PBI 136 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Reload/migrarea păstrează sumele, media, daily set și XP fără duplicate. Arhiva versiunea 2
  compară canonic înainte/după: sold 100,5 XP (100 500 000 micro-XP), nivel 2, 2 intrări XP, 1 zi KPI
  cu venit 690 și medie 1, 3 settle-uri, 1 review, 1 recompensă daily, calendarul daily cu același set.
- [x] Commitul lumii și ledger-elor este coerent; exportul de DrivingProfile nu transferă progres.
  Sloturile `session` (135) și `economy` (215) trebuie să numească aceeași sesiune, jucător și epocă;
  133/134 nu ating `meta`, deci un import de stil nu transferă XP, daily sau istoric comercial.
- [x] Cota plină, importul invalid și clock rollback nu corup sau dublează recompensele. `STORAGE_FULL`
  anulează toată tranzacția (amprentă identică), un checksum modificat este `CHECKSUM_MISMATCH`, iar
  un rollback de ceas raportează `ROLLBACK`, păstrează setul și nu re-acordă recompensa (duplicat).
- [x] Commiturile comerciale/XP respectă pipeline-ul 222; datele sintetice de istoric și storage lent
  au costuri și limite măsurate. Persistența nu inventează un al doilea pipeline: scrie ledgerul 209
  și XP 213 exact ca documente, într-o singură tranzacție, fără `settle`/credit. Măsurat: bundle
  14 005 B (daily 4 919, economy 7 341, player 1 745) din 1 048 576, rând 14 647 B din 1 048 576,
  arhivă v2 80 033 B din 3 149 824; un istoric sintetic peste plafon este `COMPONENT_TOO_LARGE`.
- [x] XP persistat conține credite nenegative și nicio evaluare de penalizare; savefile complet
  verificat este extensia 234. `parsePlayerProgress` refuză un credit negativ (`PLAYER_INVALID`) și
  read model-ul persistat raportează structural `debits: 0`, `negativeCredits: false`; envelope-ul
  `.sdasave` și acțiunile de fișier rămân ale PBI 234.

## Verificare

Roundtrip sesiune și crash la review/reward/credit XP, migrare din schema anterioară, două taburi și quota.

Păstrează comenzile, scenariile și rezultatele reale; nu declara trecere fără execuție.

## Dovezi de finalizare

Rezultat implementare: arhiva de sesiune are versiunea 2 (`215-session-archive-economy-v1`) cu slotul
`economy` lângă documentul 135 neschimbat. Bundle-ul `215-economy-save-v1` persistă verbatim
calendarul daily 211/212, ledgerul comercial 209 cu review-urile și bucketurile KPI și checkpointul XP
213, într-un rând 127 `meta` (`economy:<sessionId>`). Citirea folosește parserul proprietarului
(`restoreDailyProgress`, `parsePlayerProgress`, validare structurală 209), iar importul rulează într-o
singură tranzacție peste store-urile 135 plus `meta`, cu verificare canonică după scriere. Arhiva
versiunea 1 este citită ca `LEGACY` (slot economic `UNCHANGED` la import), iar migrarea aditivă
`upgradeSessionArchive` păstrează componentele 135 identice.

Verificări executate și rezultat:
`npm run typecheck` PASS; `npm run lint` PASS; `npm run format:check` PASS; `npm run check:architecture`
PASS (345 fișiere TS); `npm run check:parameter-catalog` PASS; `npm test` 2506/2506 pass (75 053 ms);
testele țintă `tests/persistence/economy-save.test.ts` 12/12 și `economy-save-report.test.ts` 2/2;
`npm run save:economy` 32/32 verificări PASS și `npm run save:economy -- --check` curent. Numere
reale: sold XP 100,5 → 100,5, nivel 2 → 2, 3 settle-uri, 1 review, 1 zi KPI (venit 690), 1 recompensă
daily, `historyScans` 0, delta 0 XP la al doilea import, revizia rândului 2; refuzuri:
`FORMAT_VERSION_TOO_NEW`, `CHECKSUM_MISMATCH`, `COMPONENT_TOO_LARGE`, `PLAYER_INVALID`,
`SESSION_MISMATCH`, `STORAGE_FULL`, `WRITER_REQUIRED`.

Fișiere și documente actualizate: `src/persistence/economy-save.ts`,
`src/persistence/session-archive-economy.ts`, `src/persistence/index.ts`,
`tests/persistence/economy-save-fixture.ts`, `tests/persistence/economy-save.test.ts`,
`tests/persistence/economy-save-report.ts`, `tests/persistence/economy-save-report.test.ts`,
`scripts/run-save-economy-report.mjs`, `package.json` (scriptul `save:economy`, ultima intrare),
`Docs/29-savefile-si-integritate.md` (secțiunea contractului 215) și
`Docs/Evidence/215-save-economy/` (`README.md`, `report.json`, `report.md`).

Limitări sau follow-up: 209 nu are punct de restaurare din snapshot, deci bundle-ul comercial este
verificat structural (versiuni, `historyScans: 0`, identități, referințe charge/refund, aritmetica
bucketurilor, dovezi reținute ≤ totaluri), fără recalcularea tarifelor sau notelor; un rebuild live al
ledgerului 209 rămâne al modulului 209. Bundle-ul stă într-un singur rând `meta`, iar un istoric peste
1 MiB este refuzat explicit, nu împărțit pe mai multe rânduri. Costurile sunt bytes măsurați, nu
măsurători de hardware; envelope-ul `.sdasave` și acțiunile de fișier rămân ale PBI 234.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '215'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-11-11: Implementat și verificat: arhiva versiunea 2 cu bundle economic/daily/XP, migrare
  aditivă din versiunea 1 și import atomic cu refuzuri închise; 32/32 verificări în raportul
  determinist și 2506/2506 teste în suita completă. Mutat în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

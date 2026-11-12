---
id: "177"
title: "Politică extinsă pentru schimbare de bandă și depășire"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","053"]
parameter_role: "policy"
parameter_keys: ["lane_change_duration","signal_lead_time","signal_use_probability","pass_on_right_probability"]
owner: "loop-pbi/v2-policy-177-01"
started_at: "2026-11-12T23:47:07+02:00"
completed_at: "2026-11-13T00:08:21+02:00"
---

# 177 Politică extinsă pentru schimbare de bandă și depășire

## Obiectiv

Implementează utilizarea cheilor R: lane_change_duration, signal_lead_time, signal_use_probability, pass_on_right_probability. Include semnalizarea, durata manevrei și oportunități de depășire prin dreapta.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 053 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `177-lane-policy-v2` din `src/autonomy/lane-policy-v2.ts` activează cele patru chei R peste rezultatul real `053-lane-change-v1`, fără o a doua politică de bandă. `lane_change_duration` avansează progresul lateral cu durata efectivă `max(cheie, 1 s)` (60 de tick-uri la minimul de catalog, 300 la 5 s); `signal_lead_time` ține manevra 0 vs 300 de tick-uri în avans, numai după ce indicatorul este folosit și numai pe validări proaspete ale lui 053; `signal_use_probability` pornește indicatorul cu un eșantion per oportunitate (0,324830); `pass_on_right_probability` acceptă depășirea prin dreapta cu un eșantion per oportunitate (0,249755) numai după ce harta permite și spațiul declarat acoperă `lane_change_front_gap`. Podeaua de 1 s face manevra neinstantanee, iar refuzul hărții, al spațiului sau al lui 053 este dominant față de orice valoare a cheilor.

Verificări executate și rezultat: `npm run typecheck` 0 erori; `npm run lint` 0 erori/0 warnings; `npm run format:check` toate fișierele formatate; `npm run check:architecture` PASS (380 fișiere TS, 6+4+3 probe negative); `npm run check:parameter-catalog` catalog 092 sincronizat; testele țintă 13/13 PASS; `npm test` 3074 teste, 3074 PASS, 0 fail (102,9 s); `npm run lane:policy` 22/22 verificări PASS; `npm run lane:policy -- --check` raport actual. Tabelul cheie → scenariu → joasă → ridicată → diferență: durata 0,5 → 5 s dă progres 0,500 → 0,100 (−0,400); avansul 0 → 5 s dă 0 → 300 tick-uri (+300); semnalizarea 0 → 1 dă indicator oprit → pornit (+1,000); depășirea prin dreapta 0 → 1 dă refuz → acceptare (+1,000). Separare: 11 perechi inerte cu diferența 0,000 plus dependența explicită `signal_use_probability` → `signal_lead_time` (300 tick-uri). Compatibilitate M: 60/60 rezultate 053 identice între cheile R neutre și active, 50/50 comenzi neutre identice cu 053, 10 tick-uri de depășire prin dreapta refuzate de cheia neutră 0, 30 tick-uri active diferă (până la 0,492 progres lateral).

Fișiere și documente actualizate: `src/autonomy/lane-policy-v2.ts`, `src/autonomy/index.ts` (export la final), `tests/autonomy/lane-policy-v2-reference.ts`, `tests/autonomy/lane-policy-v2.test.ts`, `tests/autonomy/lane-policy-v2-report.ts`, `scripts/run-v2-lane-policy-report.mjs`, `package.json` (`lane:policy`), `Docs/11-catalog-parametri.md` (secțiune nouă la final), `Docs/Evidence/177-v2-lane-policy/README.md` (cu `report.json` și `report.md`).

Limitări sau follow-up: Registry-ul 092 rămâne fail-closed pentru cele patru chei (`implemented: false`), deci `MANUAL_TUNING`/`LEARNED` rămân refuzate; stratul este un contract de politică neexecutat încă în bucla live, iar montarea în compoziție și proba de browser rămân pași separați. Observația (vecinătate, permisiune de depășire, spațiu liber) este a apelantului; compoziția trebuie să alimenteze 053 cu stare goală cât timp avansul rulează, altfel manevra rămâne în `SIGNAL_LEAD_STALE`.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '177' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-12: Implementare începută (owner `loop-pbi/v2-policy-177-01`, status In Progress), după confirmarea dependențelor 166 și 053 în Done.
- 2026-11-13: Contract `177-lane-policy-v2` livrat și verificat: 13/13 teste țintă, 3074/3074 teste de proiect, 22/22 verificări ale raportului determinist; fișier mutat fizic în Done.

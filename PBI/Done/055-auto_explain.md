---
id: "055"
title: "Motive de decizie și observabilitate"
status: "Done"
release: "V1"
module: "Autonomie"
depends_on: ["050","051","052","053","054"]
performance_checks: ["simulation", "memory"]
owner: "opencode deepseek-v4.1-flash medium decision-explanation-01"
started_at: "2026-10-19T02:59:15+03:00"
completed_at: "2026-10-19T03:21:40+03:00"
---

# 055 Motive de decizie și observabilitate

## Obiectiv

Expune motivul, țintele și cheile de profil folosite de politica curentă.

## Context și plan

[06-autonomie-si-trafic.md](../../Docs/06-autonomie-si-trafic.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 050 trebuie să existe în Done înainte de începere.
- PBI 051 trebuie să existe în Done înainte de începere.
- PBI 052 trebuie să existe în Done înainte de începere.
- PBI 053 trebuie să existe în Done înainte de începere.
- PBI 054 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] UI și testele pot urmări influența parametrilor fără acces intern mutabil.
- [x] Un parametru neimplementat nu apare ca motiv al unei decizii.

## Verificare

Inspectează motivele în toate comportamentele V1.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Livrat `src/autonomy/decision-explanation.ts`. `explainDecision` este un builder pur care transformă o decizie reală a lanțului de autonomie într-o explicație read-only înghețată la adâncime: formă versionată (`055-decision-explanation-v1`), motive în ordine, cu ultimul element legat obligatoriu de perechea `state`/`reason` a deciziei 045, cantitățile chiar folosite ca `targets` și cheile de profil chiar consumate ca `influences`, fiecare cu valoarea reală; `createDecisionExplainer` adaugă un depozit mărginit de explicație curentă per actor admis, alimentat din portul de decizie 219, cu garduri explicite de ownership și cu un record explicit `NO_DECISION` înainte de prima decizie sau cât timp 045 nu ține nicio decizie AUTO. Criteriile sunt impuse prin construcție: explicația este o copie detașată care nu poate atinge starea FSM/politicilor și nu hrănește nimic înapoi, iar o influență este admisă numai dacă registry-ul 092 marchează cheia `implemented`, deci un parametru neimplementat nu poate apărea ca motiv al unei decizii (cazul negativ este construit explicit în teste). Exportat prin `src/autonomy/index.ts`.

Verificări executate și rezultat: subagentul a fost **întrerupt înainte de a commit-a**, deci orchestratorul a preluat arborele necommitat, l-a verificat și l-a commit-at (`5b84d917`, `a30f39aa`, integrare `84af4f27`). Pe starea integrată în `main`, orchestratorul a rulat independent `npm run check` EXIT 0 (`npm test` **848 teste / 848 pass / 0 fail**, de la 840; include 7 teste izolate 055 și 1 test de lanț real pe cadența 219) și `npm run check:parameter-catalog` EXIT 0. Orchestratorul a **re-rulat independent ambele brațe** ale sondei (`node --import ./scripts/register-typescript.mjs scripts/benchmark-autonomy-policies.mjs --pbi 055 --before|--after`, commit măsurat `84af4f27`) și a reprodus concluzia: BEFORE p50/p95/p99 0,0517/0,0975/0,1489 ms, AFTER 0,0590/0,1069/0,1567 ms, cost adăugat +0,0108/+0,0164/+0,0249 ms per decizie la 10 Hz, cu numărul de decizii și checksum-ul identice între brațe (colectorul nu perturbă lanțul). Proba păstrată a subagentului (bază `d98fe714`): delta +0,0120/+0,0139/+0,0102 ms, același ordin de mărime. Memoria (20 de cicluri, `gcAvailable: true`) ține exact o explicație per actor admis, `retainedHistory: 0`, `disposed: true`, heap ~13,8–14,2 MB după `gc`. Acoperirea criteriilor: fiecare comportament V1 expune motivul și cheile consumate (inclusiv cazul „fără decizie"); cheia neimplementată este refuzată cu `ContractValidationError`; explicația profund înghețată nu poate fi mutată și nu schimbă următoarea decizie; determinism verificat prin egalitate profundă.

Fișiere și documente actualizate: `src/autonomy/decision-explanation.ts` (nou), `src/autonomy/index.ts`, `tests/autonomy/decision-explanation.test.ts` (nou), `tests/autonomy/policy-decision-path.test.ts`, `scripts/benchmark-autonomy-policies.mjs` (brațul 055), `Docs/decision-explanation.md` (nou), `Docs/06-autonomie-si-trafic.md`, `Docs/README.md`, `Docs/Evidence/055-decision-explanation/` (README, ambele brațe JSON și transcripturi, checks, tests).

Limitări sau follow-up: explicația este exact atât de onestă cât motivele și valorile consumate pe care owner-ul le pasează la `capture`; builderul impune forma, legarea de 045, legarea ultimului motiv și filtrul de registry, dar nu poate detecta un owner care omite o cheie pe care a folosit-o real, deci wiring-ul trebuie să listeze cheile pe fiecare ramură. **Lacună reală raportată, nu ascunsă:** politica de yield 052 consumă `yield_time_gap` și matricea de acoperire o leagă de 052, dar registry-ul 092 nu o marchează `implemented`, deci cheia nu poate fi atribuită ca influență (decizia YIELD își expune motivul și țintele consumate, cu listă de influențe goală). Repararea cere o schimbare de contract 092 (marcarea cheii și extinderea listei așteptate din testul de registry), deliberat nefăcută aici. Explicațiile sunt per feliță de decizie, fără istoric. Evidența JSON a subagentului indică commit-ul de bază `d98fe714`, deoarece arborele măsurat era necommitat la întrerupere; legătura corectă este commit-ul `5b84d917` plus re-rularea orchestratorului la `84af4f27`. Proba este Node CPU-only pe o mașină de tip laptop, fără browser, GPU, FPS sau bugetul jocului integrat; etichetele de calibrare rămân provizorii.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '055' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-19: Ordonatorul `loop-pbi` a actualizat scope-ul de verificare înainte de implementare (conform AGENTS.md): adăugat `performance_checks: ["simulation", "memory"]`, aliniat cu familia de autonomie 044–054. Owner `opencode deepseek-v4.1-flash medium decision-explanation-01`; mutat fizic To Do → In Progress.

- 2026-10-19: Subagentul a livrat modulul, testele, dovezile și documentația în worktree izolat, dar a fost **întrerupt înainte de commit**; munca a rămas necommitată în worktree.

- 2026-10-19: Ordonatorul a preluat arborele necommitat (fără a-l recrea), a verificat `npm run check` (848/848 EXIT 0) și catalogul de parametri, apoi a commit-at munca (`5b84d917`, `a30f39aa`) și a integrat-o în `main` printr-un merge (`84af4f27`).

- 2026-10-19: Orchestratorul a re-rulat verificările pe starea integrată și ambele brațe ale sondei 055, a consemnat lacuna de registry a `yield_time_gap` (052/092), a completat dovezile și a mutat fizic fișierul In Progress → Done.

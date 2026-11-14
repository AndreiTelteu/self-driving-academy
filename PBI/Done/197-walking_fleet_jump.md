---
id: "197"
title: "Schimbare rapidă taxi și revenire la mers"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["196","075"]
owner: "loop-pbi/v3-switch-197-01"
started_at: "2026-11-14T23:13:10.456+02:00"
completed_at: "2026-11-14T23:36:49.634+02:00"
---

# 197 Schimbare rapidă taxi și revenire la mers

## Obiectiv

Păstrează selecția rapidă și starea personajului când camera sare la taxi.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 196 trebuie să existe în Done înainte de începere.
- PBI 075 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Saltul de cameră nu clonează sau mută fizic personajul implicit.
- [x] Modul urmărit și entitatea controlată sunt vizibile și coerente.

## Verificare

Testează mers–taxi distant–înapoi la personaj.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `197-fleet-switch-v1` din `src/character/fleet-switch.ts` separă explicit cele două operații care se confundau. **FOCUS** (`decideFleetFocus`) schimbă doar ținta camerei: autoritatea 193 este copiată neschimbată, poziția personajului rămâne bit-identică (24 de bytes IEEE-754), numărul de entități rămâne același, iar un taxi la 200 m este o țintă validă; camera urmează noul `entityId` cu tranziția existentă de 18 tick-uri din 194. **TAKE** (`decideFleetTake`) este preluarea reală cu regulile 195/196: de pe jos este exact intrarea 195, iar dintr-o altă mașină este ieșirea validă 196 urmată de intrarea 195, compuse atomic (dacă intrarea e refuzată, ieșirea nu este aplicată). Un taxi distant este refuzat de regula reală de atingere a lui 195 (`TAKE_REFUSED` / `OUT_OF_RANGE`). **RETURN** (`decideFleetReturn`) eliberează mașina prin ieșirea validă 196 în `AUTO` cu ruta de dinainte de preluare și restaurează corpul: poziția dinainte de preluare dacă este încă fizic validă (reluată bit-identic), altfel punctul valid al ieșirii 196. Un zid construit între timp peste poziția veche este detectat cu marja 196 și confirmat de walker-ul real 192 cu `WALK_START_BLOCKED`, deci nu există teleport prin zid. `fleetSwitchProjection` expune entitatea controlată (`CHARACTER:<id>` / `VEHICLE:<id>`), modul cu sursa lui, entitatea urmărită de cameră și steagul de divergență cu motivul `FOCUS`; `validateFleetSwitchProjection` refuză cu `INCONSISTENT_PROJECTION` o mașină controlată în `AUTO`, o cameră pe personaj cât timp o mașină este controlată fără motiv de FOCUS, un steag care contrazice id-urile, o entitate necunoscută, un mod care nu vine din starea 024 și un număr de entități care nu corespunde listei. Starea (autoritate, focus, corp suspendat, jurnale, ultima comandă, contoare) este serializabilă și reluabilă strict pentru 200.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (407 fișiere TypeScript, probe negative 6+4+3 PASS); `npm run check:parameter-catalog` „Parameter catalog is synchronized.”; `npm test` 3362/3362 pass, 0 fail (13 teste noi); testele țintă `fleet-switch.test.ts` 12/12 pass și `fleet-switch-report.test.ts` 1/1 pass; `npm run fleet:switch` 12/12 scenarii, FOCUS PASS, TAKE PASS, RETURN PASS, chain PASS, projection PASS, overall PASS; `npm run fleet:switch -- --check` „Fleet switch report is current” pentru `report.json` și `report.md`. Numere reale: FOCUS la 200 m cu 0 m mișcați de corp și entități 2 → 2; cameră 18/18 cadre la FOCUS, 0 la TAKE (aceeași țintă), 18/18 la RETURN; ramura `resume` cu biți identici, ramura `wall` cu `CLEARANCE` pe punctul vechi și `WALK_START_BLOCKED` de la 192, punct de ieșire acceptat cu 0,05 m liber; proiecție 4 valide / 8 refuzate; 2 rulări identice, digest SHA-256 `720753874ba6c1bc115c4ef64b52c2793ceea59cc0d3754e0a044f185226a936`.

Fișiere și documente actualizate: `src/character/fleet-switch.ts` (nou), `src/character/index.ts` (export la final), `tests/character/fleet-switch-suite.ts` (nou), `tests/character/fleet-switch.test.ts` (nou), `tests/character/fleet-switch-report.test.ts` (nou), `scripts/run-v3-fleet-switch-report.mjs` (nou), `package.json` (o singură intrare nouă, `fleet:switch`, ultima din `scripts`), `Docs/20-extensii-si-mers-pe-jos.md` (secțiunea 197 la final), `Docs/Evidence/197-v3-fleet-switch/{report.json,report.md,README.md}`.

Limitări sau follow-up: Contractul este pur headless; compunerea (camera 194, input 066, vehicule 024) aplică cererile în tick-ul curent. FOCUS nu are regulă de distanță; „aproape” rămâne exclusiv o regulă a TAKE, prin 195. Poziția de revenire este corpul suspendat la preluare, nu o reconstrucție pas cu pas. Proiecția raportează `MANUAL` pentru personaj, pentru că 193 îl conduce manual; etichetele vizuale rămân la UI. O singură comandă de flotă pe tick (`DOUBLE_SWITCH_REFUSED`). Registrul 068 scrie doar `tick`, `controlMode` și `appliedProfileVersion`, deci mașina eliberată de 196 este returnată ca date și trebuie aplicată de proprietarul 061/044/068. Proba este deterministă și headless; feel-ul saltului de cameră și validarea în browser rămân la integrarea ulterioară.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '197' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-14: Implementare finalizată prin contractul 197: FOCUS separat de TAKE, proiecție de UI cu gardă de coerență, revenire la mers cu ambele ramuri (poziție veche validă / zid peste ea), lanț FOCUS → TAKE → RETURN, stare serializabilă, raport determinist `fleet:switch` cu 12/12 scenarii; mutat fizic în Done după validare.

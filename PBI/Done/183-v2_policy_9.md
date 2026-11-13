---
id: "183"
title: "Politică extinsă pentru pietoni și pericole"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","052"]
parameter_role: "policy"
parameter_keys: ["pedestrian_yield_probability","pedestrian_clearance","hazard_reaction_delay","obstacle_clearance","emergency_brake_intensity","evasive_steer_willingness","crosswalk_approach_speed","horn_use_probability"]
owner: "loop-pbi/v2-policy-183-01"
started_at: 2026-11-13T09:56:32+02:00
completed_at: 2026-11-13T20:36:04+02:00
---

# 183 Politică extinsă pentru pietoni și pericole

## Obiectiv

Implementează utilizarea cheilor R: pedestrian_yield_probability, pedestrian_clearance, hazard_reaction_delay, obstacle_clearance, emergency_brake_intensity, evasive_steer_willingness, crosswalk_approach_speed, horn_use_probability. Folosește stimuli observabili, traversări reale și contexte de evitare fezabile.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere. — îndeplinit (215 PBI-uri în Done la începere).
- PBI 052 trebuie să existe în Done înainte de începere. — îndeplinit.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat: opt scenarii, opt efecte nenule (raportul măsoară 8/8 efecte cu diferență nenulă și 56/56 perechi de separare cu diferența 0,000).
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului: patru chei M livrate (`comfort_deceleration` m/s², `brake_reaction_delay` s, `curve_lateral_accel` m/s², `yield_time_gap` s) sunt citite fără să fie rescrise, iar consecințele lor sunt dovedite numeric pe plafonul de viteză, pe întârzierea totală, pe deplasarea laterală și pe granița cedării obligatorii.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: contractul `183-hazard-policy-v2` din `src/autonomy/hazard-policy-v2.ts` implementează cele opt chei R ca strat de politică peste faptele observabile ale tick-ului: traversarea reală `164-pedestrians-v1`, stimulul, cutia obstacolului și oportunitatea de claxon `165-hazards-v1`, geometria clasei livrate `023` și aderența suprafețelor `026`. Fiecare cheie are propriul canal și propriul scenariu: cedarea (0 → 1 decizie), spațiul față de pieton (6,228965 → 4,898979 m/s), reacția (marjă 28,000 → 4,000 m), spațiul față de obstacol (6,324555 → 5,549775 m/s), frânarea de urgență (0 → 8,000 m/s²), ocolirea (0 → 0,450 m), viteza de apropiere de trecere (0,500 → 15,000 m/s) și claxonul (0 → 1 decizie). Cele patru limite de siguranță sunt explicite și dovedite: minimul de spațiu (0,10 m din catalog devine 2,300 m la pieton și 3,400 m la barieră, cu viteză comandată 0 când hazardul este deja în marjă), plafonul de reacție (3 s saturate la 1,000 s, cu marjă de oprire 0,000 m), plafonul de aderență (8 m/s² ceruți devin 4,463550 m/s² pe `reduced-adhesion`) și subordonarea ocolirii și a claxonului (cheie inertă fără spațiu lateral, respectiv fără permisiune). Determinism: 16 decizii, digest `fnv1a32:76d1c68d`, identic la rulare repetată, `retainedHistory: 0`.

Verificări executate și rezultat:
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0, 0 erori, 0 avertismente.
- `npm run format:check` — exit 0, „All matched files use Prettier code style!".
- `npm run check:architecture` — exit 0, PASS (386 fișiere TypeScript, inclusiv probele negative).
- `npm run check:parameter-catalog` — exit 0, „Parameter catalog is synchronized.".
- `npm test` — 3 168 teste, 3 168 trecute, 0 eșuate (629,4 s).
- `node --import ./scripts/register-typescript.mjs --test tests/autonomy/hazard-policy-v2.test.ts` — 15 teste, 15 trecute, 0 eșuate.
- `npm run hazard:policy` — 15/15 verificări PASS, 8 efecte, 56 perechi de separare, 0 cuplaje, 7 rânduri de siguranță, digest `fnv1a32:76d1c68d`.
- `npm run hazard:policy -- --check` — „Hazard policy report is current" și „Hazard policy markdown is current".

Fișiere și documente actualizate: creat `src/autonomy/hazard-policy-v2.ts`; modificat `src/autonomy/index.ts` (export la finalul listei); creat `tests/autonomy/hazard-policy-v2-reference.ts`, `tests/autonomy/hazard-policy-v2.test.ts`, `tests/autonomy/hazard-policy-v2-report.ts`; creat `scripts/run-v2-hazard-policy-report.mjs`; modificat `package.json` (scriptul `hazard:policy`, ultima intrare); modificat `Docs/11-catalog-parametri.md` (secțiunea contractului, la final); creat `Docs/Evidence/183-v2-hazard-policy/` (`README.md`, `report.json`, `report.md`); mutat fișierul PBI în `PBI/Done`.

Limitări sau follow-up: politica tratează cel mult un pieton și un obstacol pe tick (compoziția predă cei mai apropiați candidați); distanța și viteza ego-ului sunt fapte ale apelantului, în timp ce traversarea, starea, timpul rămas, cutia obstacolului și stimulul sunt reale; jumătatea de lățime a pietonului (0,25 m) și rezerva de 0,5 m sunt constante de politică documentate, pentru că 164 modelează pietonul ca punct; claxonul decide folosirea, nu creează canalul live de input pe care 165 îl declară absent; un hazard deja în marjă produce 0 m/s, dar nu recrează spațiul pierdut; contractul nu este încă legat la un consumator din joc, ca și PBI-urile 167–181.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '183' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: Implementare începută (owner `loop-pbi/v2-policy-183-01`, mutat în In Progress).
- 2026-11-13: Contract `183-hazard-policy-v2` livrat cu opt chei, opt efecte izolate, 56 perechi de separare inerte, cele patru limite de siguranță dovedite și compatibilitatea M păstrată; verificări complete (3 168 teste) și raport determinist 15/15; mutat fizic în Done.

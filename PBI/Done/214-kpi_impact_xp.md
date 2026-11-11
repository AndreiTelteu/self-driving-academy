---
id: "214"
title: "Feedbackul consecințelor fără pierdere XP"
status: "Done"
release: "V1"
module: "Progres"
depends_on: ["213","209","073"]
performance_checks: ["ui", "frame"]
owner: "loop-pbi/kpi-impact-214-01"
started_at: "2026-11-11T19:06:04+02:00"
completed_at: "2026-11-11T20:58:47+02:00"
---

# 214 Feedbackul consecințelor fără pierdere XP

## Obiectiv

Arată consecințele comerciale ale MANUAL/LEARNING și verifică invarianta că XP/nivelul nu scad prin gameplay. Nu implementează evaluare contrafactuală sau worker pentru penalizare.

## Context și plan

[Contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md) definește probele și bugetele performance_checks.

- [23-misiuni-zilnice-si-experienta.md](../../Docs/23-misiuni-zilnice-si-experienta.md)
- [14-experimente-si-indicatori.md](../../Docs/14-experimente-si-indicatori.md)

Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 213 trebuie să existe în Done înainte de începere.
- PBI 209 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Revenue/ratings și reviews reflectă incidentele reale; feedbackul scurt arată efectele fără mesaje de pierdere XP.
- [x] Scăderea unuia sau ambilor KPI, accidentele și eșecul/refuzul obiectivelor nu debitează XP și nu coboară nivelul.
- [x] PlayerProgress/ledger acceptă numai credite nenegative; nicio cale AUTO/MANUAL/LEARNING nu lansează evaluări negative sau joburi contrafactuale.
- [x] UI separă rezultatul misiunii, fidelitatea stilului și consecințele de serviciu; reset/import de profil nu resetează XP.
- [x] Actualizarea HUD este plafonată, fără reconstruirea istoricului pe frame.

## Verificare

Testează revenue↑/rating↓, inversul, ambele↓, impact MANUAL/LEARNING/AUTO, reward duplicat și restore de profil. Păstrează soldul/nivelul înainte și după, inclusiv feedbackul vizual.


## Dovezi de finalizare

Rezultat implementare: `src/economy/kpi-impact.ts` (`214-kpi-impact-v1`) citește exclusiv read model-ul 209 și compară ziua simulată curentă cu ziua precedentă: venit, curse terminale, incidente (eșuate + anulate), review-uri, media exactă `ratingSum / reviewCount` și notele 0–2, cu direcții `UP`/`DOWN`/`FLAT`/`UNKNOWN` și stări `COMPARABLE`/`NO_BASELINE`/`NO_EVENT`. Feedbackul din `src/ui/kpi-impact-format.ts` (`214-kpi-impact-feedback-v1`) păstrează trei planuri separate — rezultatul misiunii (116/125), fidelitatea stilului (mod de control + confort 139) și consecințele de serviciu — și refuză orice text care promite o pierdere de XP. `src/ui/kpi-impact-hud.ts` citește cel mult o dată la 6 tick-uri (10 Hz) și scrie numai planul schimbat, fără reconstruirea istoricului.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` exit 0; `npm run check:architecture` exit 0 (PASS, 340 fișiere TypeScript); `npm run check:parameter-catalog` exit 0 (catalog sincronizat); `npm test` exit 0 cu **2451/2451 teste**; testele țintă `tests/economy/kpi-impact.test.ts` + `tests/ui/kpi-impact.test.ts` exit 0 cu **30/30**; `npm run kpi:impact` **16/16 verificări PASS**; `npm run kpi:impact -- --check` raport curent. Numere reale din raport: venit +500 cu rating 5 → 2, invers −500 cu 2 → 5, ambele în scădere −800 și 5 → 1 cu 1 incident real și review real de nota 1; sold XP 100.5 → 100.5 și nivel 2 → 2 după KPI în scădere, accident, obiectiv eșuat și credit negativ refuzat; recompensă duplicată 0 XP; import de stil păstrează soldul; 146 texte verificate cu 0 potriviri interzise; HUD 600 tick-uri → 100 citiri, 2 randări, 4 scrieri de plan.

Fișiere și documente actualizate: create `src/economy/kpi-impact.ts`, `src/ui/kpi-impact-format.ts`, `src/ui/kpi-impact-hud.ts`, `scripts/run-kpi-impact-report.mjs`, `tests/economy/kpi-impact-fixture.ts`, `tests/economy/kpi-impact.test.ts`, `tests/economy/kpi-impact-report.ts`, `tests/ui/kpi-impact-fixture.ts`, `tests/ui/kpi-impact.test.ts`, `Docs/Evidence/214-kpi-impact/README.md` (+ `report.json`, `report.md`); modificate `src/economy/index.ts`, `src/ui/index.ts`, `package.json` (scriptul `kpi:impact`), `Docs/22-kpi-economie-si-review-uri.md`, `Docs/23-misiuni-zilnice-si-experienta.md`.

Limitări sau follow-up: nivel `targeted`, cost UI măsurat structural (citiri/randări/scrieri), fără FPS/GPU pe hardware real; feedbackul citește agregatele 209 și nu paginează ledgerul de review-uri, deci nu afișează motive individuale de review; montarea în HUD și hotkey-ul rămân ale hostului (`src/app` nu este atins).

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '214'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.3; implementarea nu a început.

- 2026-10-04: Revizia 0.4 adaugă contracte/verificări de performanță; implementarea rămâne neîncepută.

- 2026-10-04: Revizia 0.5 elimină pierderea XP și evaluatorul A/B; ID-ul/fișierul rămân stabile, scope-ul este feedback și regresie, status To Do.

- 2026-11-11: Implementare finalizată pe branch-ul `loop-pbi/kpi-impact-214-01`: read model 214 peste 209, feedback cu trei planuri și HUD plafonat; 16/16 verificări ale raportului, 30/30 teste țintă, 2451/2451 teste; fișier mutat fizic în Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

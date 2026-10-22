---
id: "229"
title: "Popup cu slidere pentru control și confort"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["025","081","085","070"]
performance_checks: ["ui", "frame"]
owner: "loop-pbi/control-sliders-229-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T02:45:40+03:00"
completed_at: "2026-10-22T03:34:24+03:00"
---

# 229 Popup cu slidere pentru control și confort

## Obiectiv

Permite ajustarea inputului și camerei prin ControlPreferences versionat, fără modificarea directă a DrivingProfile.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)
- [05-vehicule-si-fizica.md](../../Docs/05-vehicule-si-fizica.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 025 trebuie să existe în Done înainte de începere.
- PBI 081 trebuie să existe în Done înainte de începere.
- PBI 085 trebuie să existe în Done înainte de începere.
- PBI 070 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Tabul de control are slidere/preseturi, capete simple, valori și suport tastatură pentru direcție/revenire/atenuare/accelerație/frână/cameră/FOV.
- [x] Draft/Aplică/Anulează/Reset nu modifică live la fiecare pointer move; popup-ul pune toate modurile pe pauză și eliberează inputul.
- [x] Setările păstrează mecanica mașinii; versiunea este salvată și înregistrată în telemetrie, iar schimbarea închide/deschide segmentul la tick.
- [x] Extremele sunt utilizabile în două clase; controlPreferences nu schimbă direct AI-ul și nu fabrică dovezi de stil.

## Verificare

Playtest slidere/preseturi, extreme, anulare și reload; verifică focus/Escape/remapare și 1280×720, fără rafale de capturi sau lucru pe frame.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: livrat popup-ul „Reglaje”, tabul „Cum controlez mașina” cu șapte slidere native (0–100; FOV 60–100°), capete simple, valoare afișată și `aria-valuetext`, plus presetările Accesibil/Echilibrat/Direct. Tabul „Cum conduce orașul” este explicit `Indisponibil · 230`. Popup-ul se deschide ca suprafață `menu` la 070 (suspendă AUTO/MANUAL/LEARNING și eliberează comenzile ținute), ține focusul în dialog, închide cu Escape/buton prin portul injectat, nu instalează listeneri globali și respectă contrastul 083. Mișcarea unui slider scrie doar citirea locală (≤10 Hz) și o revizie de draft la eliberare; „Aplică” închide popup-ul, reia ceasul și publică o singură dată la primul tick: `input.control.version` +1 în store-ul 009, valorile pentru filtrul 025 la acel tick și un `InterventionTargetChange` `CONTROL_PREFERENCES_CHANGE` prin care 069 închide segmentul vechi și deschide unul nou cu `controlPreferencesVersion` nou, `learningEpoch` neschimbat. „Anulează” retrage o aplicare în așteptare și revine la valorile salvate; „Revino la valorile inițiale” cere confirmare și propune doar draftul. Bindingurile, camera, unitățile, calitatea, scenariul, clasa și mecanica 023 rămân neschimbate; sesiunea nu atinge profilul învățat sau AI-ul. La 1280×720 popup-ul are 416×648 px, 4 rânduri vizibile, lista derulează, antetul și footerul rămân fixe.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0 (`--max-warnings 0`); `npm run format:check` exit 0; `npm run check:architecture` PASS (257 fișiere, toate probele negative); `npm test` PASS 1832/1832; `node --import ./scripts/register-typescript.mjs scripts/run-control-sliders-report.mjs` → 53/53 checks, 8 scenarii, `overall PASS`, iar `--check` → `Control sliders report is current`; playtest Chromium 156.0.8078.4 headed la 1280×720 → 31/31 checks, 0 erori de pagină (deschidere, pauză `tick 5 → 5`, focus, preset Direct, Home/ArrowRight/End, toate maximele, Aplică 3→4 cu segment 3→4 la tick 6, Anulează fără scriere, Escape cu focus restaurat, reload cu versiunea 4 și valorile 100, Tab trap, `globalListeners=0`, `writeHz=10`). Sonda locală: 600 apeluri `update()` identice la 60 Hz → 0 scrieri, 0 randări suplimentare, ~0,018 ms/apel; popup-ul nu are `requestAnimationFrame` și nu lucrează pe frame.

Fișiere și documente actualizate: `src/ui/control-sliders-format.ts`, `src/ui/control-sliders.ts`, `src/app/control-sliders.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/control-sliders.test.ts`, `tests/ui/control-sliders-fixture.ts`, `tests/app/control-sliders.test.ts`, `tests/app/control-sliders-report.ts`, `tests/browser/control-sliders/index.html`, `tests/browser/control-sliders/main.ts`, `scripts/run-control-sliders-report.mjs`, `Docs/27-reglaje-hud-si-camera.md`, `Docs/Evidence/229-control-sliders/` (README, report.json/md, playtest.json, 9 capturi).

Limitări sau follow-up: playtestul nu rulează jocul complet (fără renderer/fizică/buclă reală de telemetrie); 069 este verificat pe lifecycle-ul real cu fixture determinist, iar integrarea completă rămâne la 235. Persistența între reload din pagina de playtest este un adaptor `localStorage` local, nu portul de salvare per jucător. Popup-ul nu este înregistrat în `PANEL_SURFACES` din 083 (ar modifica numărătoarea și raportul 083); refolosește selectorul, contrastul și pragurile 083 și își publică propriul audit — înregistrarea poate fi făcută la 235. La zoom 150% rămân 2 rânduri vizibile, cu lista derulată și footerul fix.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '229'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-10-22: Implementat și verificat (owner `loop-pbi/control-sliders-229-01`). Livrat popup-ul de control cu șapte slidere, preseturi, draft/aplică/anulează/reset, pauză 070 pe toate modurile, publicare la tick prin 069 (`CONTROL_PREFERENCES_CHANGE`) și versiune 009 în telemetrie. Verificări: typecheck/lint/format/architecture verzi, 1832/1832 teste, raport 53/53 (`--check` curent), playtest headed 31/31 la 1280×720. Limitări: integrarea completă a jocului rămâne la 235; persistența reload din playtest este un adaptor local; popup-ul nu este încă înregistrat în `PANEL_SURFACES` 083.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

---
id: "230"
title: "Slidere de stil și versiuni MANUAL_TUNING"
status: "Done"
release: "V1"
module: "Profiluri și interfață"
depends_on: ["229","110","114","205","102","092"]
performance_checks: ["ui", "frame", "storage"]
owner: "loop-pbi/style-sliders-230-01 (cpa/deepseek/deepseek-v4.1-flash)"
started_at: "2026-10-22T03:53:21+03:00"
completed_at: "2026-10-22T04:52:56+03:00"
---

# 230 Slidere de stil și versiuni MANUAL_TUNING

## Obiectiv

Permite reglarea manuală a opt parametri înțeleși ușor, cu proveniență, validare și restaurare.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)
- [12-profiluri-si-propagare.md](../../Docs/12-profiluri-si-propagare.md)

Citește și [workflow-ul PBI](../AGENTS.md). Pentru performance_checks aplică [contractul de performanță](../../Docs/25-performanta-contracte-si-benchmark.md).

## Dependențe

- PBI 229 trebuie să existe în Done înainte de începere.
- PBI 110 trebuie să existe în Done înainte de începere.
- PBI 114 trebuie să existe în Done înainte de începere.
- PBI 205 trebuie să existe în Done înainte de începere.
- PBI 102 trebuie să existe în Done înainte de începere.
- PBI 092 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Mapările sliderelor folosesc cheile/domeniile existente; km/h și procentele se convertesc corect, iar cheile nesuportate sunt dezactivate.
- [x] Aplică publică numai diferențele ca versiune MANUAL_TUNING cu before/after, barieră learningEpoch și tick comun taxi/civil.
- [x] Nu inventează observații sau confidence; dovezile istorice sunt distincte de proveniența valorii ajustate și nu acordă progres LEARNING.
- [x] Draftul depășit nu suprascrie un profil nou; anularea/no-op nu publică, restore este funcțional și LEARNING ulterior poate modifica din nou valorile.
- [x] Ținta este profilul sesiunii active; aplicarea în Haos nu schimbă Academie, iar schimbarea sesiunii invalidează draftul.

## Verificare

Testează conversii/limite, parametru nesuportat, worker în curs, baseVersionId depășit, no-op, anulare, restore și reload; verifică efectul real în AUTO.

Păstrează scenariile, comenzile, playtesturile și rapoartele reale; nu declara trecerea fără execuție.

## Dovezi de finalizare

Rezultat implementare: tabul „Cum conduce orașul” este funcțional în popup-ul 229 printr-un contract opțional (`options.style`), deci o gazdă fără editor de stil păstrează placeholder-ul 229. Sunt livrate opt slidere peste cheile reale 092 (`speed_delta_urban`, `desired_acceleration`, `comfort_deceleration`, `following_time_headway`, `following_min_gap`, `red_stop_probability`, `stop_full_probability`, `green_start_delay`), cu conversii exacte km/h ↔ m/s (3,6) și % ↔ probabilitate (100) verificate dus-întors față de `min`/`max` din catalog, text simplu principal, valoare secundară, capete în cuvinte și `aria-valuetext`. Cheile din afara mapei (`speed_delta_residential`, `launch_intensity`, `signal_use_probability`) rămân vizibile, dezactivate, cu badge `R` și motiv. „Aplică” derivează numai diferențele din `baseVersionId` cu `reason = MANUAL_TUNING 230-style-map-v1`, valori SI înainte/după, și le publică prin bariera 205 (epoch +1, segment închis cu `PROFILE_CHANGE`, joburi 103 anulate, stare fizică păstrată) și activarea 110 cu origine `MANUAL_TUNING` la tick comun taxi/civil. Proveniența valorii ajustate este `MANUAL_TUNING` cu dovezi `HISTORICAL_ONLY`; versiunea nu inventează observații, încredere sau segmente (doar `manual:<versionId>`), nu creează job 103 și nu scrie progres. Draftul cu head schimbat produce `STALE_BASE`, Aplică este blocat, iar „Reîncarcă baza” adoptă explicit noul head fără a contopi propunerea. No-op → `UNCHANGED`, anularea retrage fără scriere, restore rulează prin 114 cu două confirmări și fără versiune nouă, iar LEARNING ulterior poate modifica din nou cheile. Sesiunea este fixată pe `playerId`/`profileId`/`sessionId`/`worldEpoch`, deci Haos nu atinge Academia și schimbarea sesiunii invalidează draftul. Mișcarea sliderului scrie doar citirea locală plafonat la 10 Hz; 600 cadre identice produc 0 scrieri și 0 randări; o aplicare scrie o singură versiune, lista de restore este ≤ 8, iar reload-ul recitește head-ul imuabil.

Verificări executate și rezultat: `npm run typecheck` PASS (exit 0); `npm run lint` PASS (exit 0, `--max-warnings 0`); `npm run format:check` PASS (exit 0); `npm run check:architecture` PASS (260 fișiere TypeScript, toate probele negative); `npm test` PASS 1850/1850 teste; `node --import ./scripts/register-typescript.mjs scripts/run-style-sliders-report.mjs` PASS 70/70 checks, 10 scenarii, `overall PASS`; `... --check` → „Style sliders report is current” (exit 0); playtest Chromium headed 1280×720 pe portul explicit 5230 → PASS 46/46 checks, 10 scenarii, 0 page errors. Playtestul a arătat vizual: deschiderea tabului la 1280×720 (popup 416×648, footer fix), cele 3 chei dezactivate cu `R`, draftul editat (+18 km/h, 55%, 2.5 s), aplicarea (`manual-playtest-academia-1`, epoch 2, flota pe versiunea nouă la tick 8, job 103 anulat), banner-ul de draft depășit, reîncărcarea bazei, restaurarea la `style-v1` (epoch 4, versiunile neschimbate), reload-ul persistat, invalidarea la schimbarea sesiunii și Escape cu focus readus pe butonul gazdă. Capturile și transcriptul sunt în `Docs/Evidence/230-style-sliders/`.

Fișiere și documente actualizate: noi `src/ui/style-sliders-format.ts`, `src/ui/style-sliders.ts`, `src/app/control-sliders-style.ts`, `tests/ui/style-sliders.test.ts`, `tests/ui/style-sliders-fixture.ts`, `tests/app/style-sliders.test.ts`, `tests/app/style-sliders-fixture.ts`, `tests/app/style-sliders-report.ts`, `tests/browser/style-sliders/*`, `scripts/run-style-sliders-report.mjs`, `Docs/Evidence/230-style-sliders/*`; extinse non-breaking `src/ui/control-sliders.ts` (tab opțional, footer rutat, updateStyle), `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`; actualizate `Docs/27-reglaje-hud-si-camera.md` și `Docs/12-profiluri-si-propagare.md`.

Limitări sau follow-up: playtestul rulează popup-ul și lanțul real 109/205/110/057, dar fără renderer, fizică sau worker real (porturile 069/103 sunt în memorie; coada 103 reală este verificată în testele Node și în raport), deci performanța jocului integrat rămâne la gate-urile 220/224/235. Persistența între reload este oglinda `localStorage` a paginii de playtest, nu portul de salvare al integrării. 205 nu are motiv propriu `MANUAL_TUNING`; sesiunea folosește motivul `NEW_PROFILE`, singurul publicat de 110 cu originea `MANUAL_TUNING` (ca la 114), fără extinderea vocabularului 205. Propunere pentru orchestrator: intrarea `"ui:style-sliders": "node --import ./scripts/register-typescript.mjs scripts/run-style-sliders-report.mjs"` în `package.json` (fișier neatins de acest PBI).

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate, inclusiv performance_checks și verificarea vizuală relevantă.
- [x] Contracte/documentație actualizate.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: Validate-Board.ps1 -RequireDone '230'.

## Istoric

- 2026-10-04: PBI creat în To Do în revizia 0.5; implementarea nu a început.
- 2026-10-22 03:53 +03:00: preluat de `loop-pbi/style-sliders-230-01`; status In Progress, mutat fizic în In Progress, board validat.
- 2026-10-22 04:52 +03:00: implementare finalizată — tab de stil, versiuni MANUAL_TUNING prin 109/205/110, restore 114, izolare pe sesiune, raport determinist 70/70, playtest 1280×720 46/46, typecheck/lint/format/architecture verzi, `npm test` 1850/1850; status Done.

## Nivel de validare — politica 2026-10-08

Nivel: `targeted`. Aplică [politica de validare proporțională](../../Docs/validation-policy.md), inclusiv preflight, scenarii afectate, reutilizarea harness-ului și dovezilor, paralelizare numai pentru corectitudine și checkpoint-uri numai pentru perechi complete independente. Criteriile explicite de gameplay, hardware sau soak rămân obligatorii. DEV nu închide gate-ul de release; rapoartele istorice nu se reclasifică. Alegerea nivelului nu bifează criterii și nu schimbă statusul.

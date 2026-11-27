---
id: "279"
title: "Setări, remapare taste și slidere de control/stil în joc"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["260"]
performance_checks: ["ui","frame"]
owner: "loop-pbi/deepseek-279"
started_at: "2026-11-27T20:54:30.268Z"
completed_at: "2026-11-27T22:25:58.595Z"
---

# 279 Setări, remapare taste și slidere de control/stil în joc

## Obiectiv

Jucătorul deschide setările reale, remapează cele 15 acțiuni, reglează controlul și stilul, iar modificările se aplică și se salvează.

## Starea actuală și ce lipsește

- Butonul „Setări” din ecranul de start și meniul de pauză este TODO.
- Nu există panoul de unități, cameră, confort, grafică și audio montat.
- Nu există remapare de taste cu detectarea conflictelor.
- Nu există sliderele de control (7) și stil (8) montate.
- Nu există aplicarea `MANUAL_TUNING` prin bariera 205 și activarea 110.
- Nu există resetare cu confirmare și nici separarea setărilor de profil.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Reglaje HUD și cameră](../../Docs/27-reglaje-hud-si-camera.md)
- [Setările jocului](../../Docs/game-settings.md)
- [Remaparea comenzilor](../../Docs/key-remapping.md)
- [Accesibilitatea interfeței](../../Docs/ui-accessibility.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [x] „Setări” deschide un panou real din start și din pauză; Anulează, Salvează și Resetare funcționează.
- [x] Toate cele 15 acțiuni sunt remapabile, conflictele blochează salvarea, iar Escape anulează captura.
- [x] Cele șapte slidere de control și opt de stil se aplică și se salvează fără a atinge profilul învățat.
- [x] O aplicare de stil trece prin bariera de epoch și publică o versiune `MANUAL_TUNING`.
- [x] Unitatea km/h/mph și camera CHASE/FIRST_PERSON se aplică doar prezentării.
- [x] Panourile respectă focusul, Tab, Escape, contrastul și nu fură tastele de condus.

## Verificare

- Teste pentru remapare, conflict, reset și aplicarea sliderelor.
- Probă în browser: deschide setările din start/pauză, remapează, aplică un slider.
- Verifică faptul că profilul învățat și XP-ul rămân neschimbate la o setare de dispozitiv.

## Dovezi de finalizare

Rezultat implementare: `src/app/live-settings.ts` (`279-live-settings-v1`) și `src/ui/live-settings.ts` montează suprafața reală „Setări” din ecranul de start, meniul de pauză și bara shell-ului, cu trei taburi: 081 (unități, cameră, șapte slidere de control, grafică, audio indisponibil), 080 (toate cele 15 acțiuni remapabile) și 230 (opt slidere de stil). „Salvează” scrie numai `SettingsStore` 009; „Aplică” pentru stil publică o versiune `MANUAL_TUNING` prin bariera 205 și activarea 110, fără job 103, progres sau XP. Remaparea actualizează `KeyboardDriveBinding` și tastele M/L fără reconstrucția lumii; conflictele blochează salvarea, Escape anulează captura. Unitățile km/h/mph și camera CHASE/FIRST_PERSON sunt preferințe de prezentare; HUD-ul central afișează unitatea aleasă. Resetarea cere confirmare, păstrează tastele și readuce valorile 009. Focus/Tab/Escape, contrastul și zero listeneri globali respectă 083.

Verificări executate și rezultat: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run check:architecture` (485 fișiere), `npm run composition:report -- --check`, `npm run docs:check -- --check`, `npm run settings:live -- --check` — PASS. Teste țintă 22/22. `npm test` integrat: 3.791 teste, 3.777 pass, 0 fail, 14 skip-uri istorice. Raport 27/27, 8 scenarii: 15 acțiuni, 7+8 slidere, conflictul blochează salvarea fără scriere, remaparea salvează fără a schimba controlul, mph/camera doar prezentare, confortul incrementează controlul o dată, resetarea propune valorile reale, stilul trece prin 205, avansează epoch-ul și activează `MANUAL_TUNING`; profilul și XP-ul de dispozitiv rămân neschimbate. Browser probe 28/28 PASS, Chrome 157 headless, WEBGPU, 1024×640, tick 1→104: `brake` `KeyS`→`ArrowDown`, conflict `KeyW` blocat, `steeringSensitivity` 50→80 cu control version 0→1; amprenta profilului `1c4d32b2…` neschimbată, XP `fnv1a32:76ab935a` neschimbat; `km/h`→`mph` afișat în HUD și resetat la `km/h` cu tastele păstrate; stil `settings-279-session-261-academy-1`, epoch 0→1, o barieră 205, activare 110 `MANUAL_TUNING`, profil `1c4d32b2…`→`1598abac…`, fără intrare XP; 24 listeneri, 0 globali; capturi în `Docs/Evidence/279-live-settings/screenshots/`.

Fișiere și documente actualizate: `src/app/live-settings.ts`, `src/ui/live-settings.ts`, `src/app/live-learning.ts`, `src/app/walking-composition.ts`, `src/input/keyboard-drive.ts`, `src/rendering/babylon/v3-browser-composition.ts`, `src/ui/rendering-view.ts`, `src/ui/game-shell-host.ts`, `src/ui/index.ts`, `src/main.ts`, `src/style.css`, tests settings/UI, `scripts/run-live-settings-report.mjs`, `scripts/run-live-settings-probe.mjs`, `package.json`, `Docs/08`, `Docs/21`, `Docs/27`, `Docs/31`, `Docs/game-settings.md`, `Docs/key-remapping.md`, `Docs/Evidence/279-live-settings/`.

Limitări sau follow-up: FIRST_PERSON este stocat și validat ca preferință de prezentare; randarea first-person rămâne 280. HUD-ul central comută pe mph, dar HUD-ul vechi al taxiului 073 încă formatează km/h. O activare manuală de stil actualizează imediat profilul/flota/stilul orașului, iar segmentul 069 deschis adoptă noua generație la următorul boundary de sesiune/segment. Proba de browser folosește `?nofocuspause` pentru a nu transforma focusul pierdut headless în pauză; este Chrome headless, fără playtest uman sau pretenție FPS/GPU/hardware. Persistența setărilor este store-ul real 009, fără un al doilea store durabil. Node local 24.19.0.

## Definition of Done

- [x] Criterii îndeplinite și verificate.
- [x] Dovezi completate și documentație actualizată.
- [x] Status Done și completed_at completat.
- [x] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '279'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.
- 2026-11-28: Implementat de `loop-pbi/deepseek-279`; integrat, verificat și mutat în Done.

---
id: "080"
title: "Remaparea comenzilor și conflicte"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["067","009","073"]
owner: "opencode deepseek-v4.1-flash key-remapping-01"
started_at: "2026-10-21T02:44:06.538Z"
completed_at: "2026-10-21T06:13:25+03:00"
---

# 080 Remaparea comenzilor și conflicte

## Obiectiv

Permite remaparea hotkey-urilor și reset la valorile implicite.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 067 trebuie să existe în Done înainte de începere.
- PBI 009 trebuie să existe în Done înainte de începere.
- PBI 073 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Conflictele sunt indicate și toate acțiunile importante rămân accesibile.
- [x] Setările persistabile sunt distincte de profilul învățat.

## Verificare

Testează conflict, reset, focus și taste nesuportate.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Panoul 080 listează toate cele 15 acțiuni de input și permite remaparea fiecăreia prin captura explicită a următoarei taste. Sunt acceptate exclusiv coduri `KeyboardEvent.code` din gramatica 009; tastele nesuportate, modifier-only, codurile rezervate browserului și valoarea goală sunt respinse cu motive închise. Conflictul este detectat prin harta cod→acțiuni, toate rândurile afectate sunt marcate textual și simbolic, iar salvarea este blocată până la rezolvare; nicio comandă nu este mutată silențios. Resetarea propune valorile reale din `createDefaultSettings`, cere o confirmare vizibilă și modifică doar draftul local până la `Salvează`. Captura atașează un singur listener `keydown` pe butonul activ, previne comportamentul implicit și îl elimină după captură; Escape anulează fără a închide panoul, iar Tab/Enter/Space pot fi capturate fără pierderea focusului. Nu există listener global, deci tastele de condus nu sunt interceptate. Salvare/reset schimbă doar `input.bindings` prin `SettingsStore`, păstrând controlul, unitățile, calitatea, scenariul și camera; nu există import sau scriere în profilul învățat, deci setările persistabile rămân separate de profil.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (215 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1411/1411 pass, 0 fail; `npm run key:remapping` 51/51 verificări, 7 scenarii, overall PASS; `npm run key:remapping -- --check` „Key remapping report is current”. Testele țintite 080: 22/22 pass. Raportul acoperă implicitele, conflictul, conflictul rezolvat, tasta nesuportată, resetarea, salvarea cu păstrarea celorlalte setări și captura cu focus. Dovezi: [report.json](../../Docs/Evidence/080-key-remapping/report.json), [report.md](../../Docs/Evidence/080-key-remapping/report.md), [README](../../Docs/Evidence/080-key-remapping/README.md).

Fișiere și documente actualizate: `src/ui/key-remapping-format.ts`, `src/ui/key-remapping.ts`, `src/app/key-remapping.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/key-remapping-fixture.ts`, `tests/ui/key-remapping.test.ts`, `tests/app/key-remapping.test.ts`, `tests/ui/hud-dom.ts`, `tests/app/key-remapping-report.ts`, `scripts/run-key-remapping-report.mjs`, `package.json`, `Docs/key-remapping.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/README.md` și `Docs/Evidence/080-key-remapping/`.

Limitări sau follow-up: Tastele din teste/raport sunt evenimente sintetice de adaptor, nu input fizic de browser; nu se pretinde captură browser. Panoul nu este încă legat în meniul live de setări; seam-ul este pregătit. Escape nu poate fi atribuit ca binding nou pentru că anulează captura, dar rămâne valid ca valoare persistată pentru pauză. Lista codurilor rezervate este o politică UI închisă; browserul/OS poate intercepta alte scurtături. Remaparea acoperă doar tastatura, fără gamepad sau hardware. Nu se pretinde FPS, GPU, memorie sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '080' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: remapare pe coduri de tastatură, conflicte blocate, reset cu confirmare, captură focalizată fără listener global și persistență separată de profil; 22 teste, raport cu 51 de verificări și documentație. Mutat fizic în Done după validare.

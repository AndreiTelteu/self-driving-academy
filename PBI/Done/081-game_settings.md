---
id: "081"
title: "Setări unități cameră grafică și audio"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["080","016","017"]
owner: "opencode deepseek-v4.1-flash game-settings-01"
started_at: "2026-10-21T03:41:06.032Z"
completed_at: "2026-10-21T07:01:45+03:00"
---

# 081 Setări unități cameră grafică și audio

## Obiectiv

Creează panoul de preferințe și aplicare coerentă.

## Context și plan

- [27-reglaje-hud-si-camera.md](../../Docs/27-reglaje-hud-si-camera.md)

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 080 trebuie să existe în Done înainte de începere.
- PBI 016 trebuie să existe în Done înainte de începere.
- PBI 017 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Unitățile de afișare nu schimbă SI în simulare.
- [x] Modificarea camerei sau graficii nu modifică stilul flotei.

- [x] Preferințele de confort/cameră și schema ControlPreferences sunt persistabile; editorul de stil este distinct și nu schimbă AI-ul prin acest panou.

## Verificare

Testează mph/kmh și schimbări în timpul unei sesiuni.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Panoul 081 acoperă unitățile de afișare (km/h/mph, m/ft), camera (CHASE/FIRST_PERSON), confortul (sensibilitate, revenire, atenuare, rampe, mișcare cameră, FOV), grafica (preset, backend, scală rezoluție, adaptiv) și o secțiune audio explicit indisponibilă până la 148, fără volum sau mute inventat. Conversia este strict de afișare: `formatSpeedDisplay`/`formatDistanceDisplay` transformă m/s și m în text, iar valoarea SI și preview-ul păstrează aceeași mărime (ex. `12.5 m/s = 45 km/h = 28 mph`). Aplicarea scrie doar câmpurile de preferințe prin `SettingsStore`, păstrând `input.bindings`, `playerId` și scenariul; o schimbare de confort incrementează `input.control.version` exact o dată, în timp ce unitățile/camera/grafica nu o modifică. Resetarea readuce valorile reale implicite pentru afișare/cameră/confort/grafică, păstrează bindings-urile și cere confirmare explicită. Nota „Setări dispozitiv · nu modifică profilul învățat, AI-ul sau stilul flotei” este permanentă; modulul nu importă și nu modifică profiluri, flota sau stilul, iar editorul de stil rămâne separat.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (221 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1452/1452 pass, 0 fail; `npm run game:settings` 45/45 verificări, 7 scenarii, overall PASS; `npm run game:settings -- --check` „Game settings report is current”. Testele țintite 081: 25/25 pass. Raportul acoperă km/h, mph, schimbarea în timpul sesiunii, schimbarea confortului, camera/grafica, resetarea cu bindings păstrate și audio indisponibil. Dovezi: [report.json](../../Docs/Evidence/081-game-settings/report.json), [report.md](../../Docs/Evidence/081-game-settings/report.md), [README](../../Docs/Evidence/081-game-settings/README.md).

Fișiere și documente actualizate: `src/ui/game-settings-format.ts`, `src/ui/game-settings.ts`, `src/app/game-settings.ts`, `src/ui/index.ts`, `src/app/index.ts`, `src/style.css`, `tests/ui/game-settings-fixture.ts`, `tests/ui/game-settings.test.ts`, `tests/app/game-settings.test.ts`, `tests/app/game-settings-report.ts`, `scripts/run-game-settings-report.mjs`, `package.json`, `Docs/game-settings.md`, `Docs/27-reglaje-hud-si-camera.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/README.md` și `Docs/Evidence/081-game-settings/`.

Limitări sau follow-up: Nu există captură browser sau audio redat; panoul este verificat pe DOM-ul determinist, iar DOM-ul serializat este dovada vizuală. Meniul de setări live nu găzduiește încă panoul; legarea aparține integrării pauză/meniu (229/235). Audio rămâne explicit indisponibil până la 148, fără schemă de volum inventată. Backend-ul și rezoluția rămân declarative; nu se pretinde măsurare renderer/FPS/hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '081' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-04: Revizia 0.5 actualizează scope-ul și verificările; implementarea rămâne în To Do.

- 2026-10-21: Implementare finalizată: unități strict de afișare, cameră/confort/grafică persistabile, versionare corectă a ControlPreferences, audio explicit indisponibil și separare de profil/stil; 25 teste, raport cu 45 de verificări și documentație. Mutat fizic în Done după validare.

---
id: "084"
title: "Layout la rezoluții PC și viewport mic"
status: "Done"
release: "V1"
module: "Interfață"
depends_on: ["083","074"]
owner: "opencode deepseek-v4.1-flash responsive-layout-01"
started_at: "2026-10-21T09:58:01.583Z"
completed_at: "2026-10-21T13:56:08+03:00"
---

# 084 Layout la rezoluții PC și viewport mic

## Obiectiv

Adaptează HUD și paneluri la 1280×720 și 1920×1080.

## Context și plan

[08-interfata-camera-si-control.md](../../Docs/08-interfata-camera-si-control.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 083 trebuie să existe în Done înainte de începere.
- PBI 074 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Lista de 30 de taxiuri și profilul nu se suprapun peste controale esențiale.
- [x] Textul și scrollul rămân lizibile la zoom de browser.

## Verificare

Inspectează cele două rezoluții și zoom mărit.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: Contractul `084-responsive-layout-v1` definește regiunile `COMPACT` (≤1279 px lățime sau ≤719 px înălțime), `STANDARD` și `LARGE` (≥1920×1080), cu zoom efectiv calculat ca `innerWidth / zoom`. Sunt fixate ancorele HUD stânga-sus, minimapă dreapta-sus, flotă în coloana stângă sub HUD, profil/tablou/setări ca modal central cu `max-height` și scroll, notificări în coloana dreaptă sub minimapă (10rem în `COMPACT`). CSS-ul real aplică variabilele `--layout-*`, media query-urile 1279/719 și 1920×1080, `box-sizing: border-box`, scroll intern pentru listă și modal, antet lipicios, `overflow-wrap: anywhere`, font minim de 12 CSS px și line-height 1.4. Au fost corectate patru defecte reale găsite la măsurare: `grid-template-areas` invalid la rândurile profilului, plafoane pe content-box care depășeau panoul central, padding-ul butoanelor HUD care umfla HUD-ul și `[hidden]` ignorat de panourile `display:grid`. Notificările au fost mutate din colțul stânga-jos în coloana dreaptă, îngustate în `COMPACT`, ca să nu acopere HUD-ul, lista de 30 de taxiuri sau profilul. Capturile reale în Chromium headless confirmă zero suprapuneri critice, toate cele cinci controale esențiale vizibile, lista derulabilă (1715 px conținut / 206 px vizibil la 1280×720), profilul derulabil (1489/646), font minim 12 px și line-height 1.4.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run format:check` „All matched files use Prettier code style!”; `npm run check:architecture` PASS (225 fișiere TypeScript, probe negative 6+4+3 PASS); `npm test` 1497/1497 pass, 0 fail; `npm run ui:responsive` 42/42 verificări, 7 scenarii, overall PASS; `npm run ui:responsive -- --check` „Responsive layout report is current”; `node scripts/capture-responsive.mjs` 5 capturi, 50/50 verificări, overall PASS, a scris `capture.json` și PNG-urile. Capturile au fost inspectate vizual la 1280×720, 1920×1080 și 853×480 (150% zoom): HUD-ul, minimapa, lista și profilul nu se suprapun, iar controalele esențiale rămân vizibile. Dovezi: [capture.json](../../Docs/Evidence/084-responsive-pc/capture.json), [report.json](../../Docs/Evidence/084-responsive-pc/report.json), [report.md](../../Docs/Evidence/084-responsive-pc/report.md), [README](../../Docs/Evidence/084-responsive-pc/README.md).

Fișiere și documente actualizate: `src/ui/responsive-layout.ts`, `src/ui/index.ts`, `src/style.css`, `tests/ui/responsive-layout.test.ts`, `tests/ui/responsive-fixture.html`, `tests/app/responsive-layout-report.ts`, `scripts/run-responsive-layout-report.mjs`, `scripts/capture-responsive.mjs`, `package.json`, `Docs/responsive-layout.md`, `Docs/08-interfata-camera-si-control.md`, `Docs/27-reglaje-hud-si-camera.md`, `Docs/README.md` și `Docs/Evidence/084-responsive-pc/` (inclusiv cinci PNG-uri și `capture.json`).

Limitări sau follow-up: Capturile folosesc fixture-ul determinist, nu aplicația live cu o sesiune reală de flotă; dreptunghiurile, scroll-ul și fonturile sunt însă măsurate de Chromium pe CSS-ul real. La 150% zoom (853×480 efectiv) coloana flotei are ~6rem sub HUD și lista păstrează 5rem cu scroll propriu, deci se vede puțin conținut. Plafonul de 8/10/14 rânduri este o limită de proiectare, nu o promisiune. Nu înlocuiește gate-ul 235 și nu certifică zoom 200%, `forced-colors`, cititoare de ecran, FPS sau hardware.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '084' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.

- 2026-10-21: Implementare finalizată: contract responsive cu zoom efectiv, CSS real pentru 1280×720/1920×1080/compact, corectarea a patru defecte de layout, notificări mutate în coloana dreaptă, 20 de teste, raport cu 42 de verificări și cinci capturi Chromium cu 50/50 verificări. Mutat fizic în Done după validare.

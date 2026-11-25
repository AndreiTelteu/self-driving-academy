---
id: "281"
title: "Minimapa, harta de flotă și HUD-ul complet de joc"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["260","263"]
performance_checks: ["ui","frame"]
owner: null
started_at: null
completed_at: null
---

# 281 Minimapa, harta de flotă și HUD-ul complet de joc

## Obiectiv

HUD-ul arată viteza, modul, sesiunea, obiectivul și o minimapă cu ruta și markerii flotei, fără suprapuneri și fără muncă în bucla 3D.

## Starea actuală și ce lipsește

- Nu există minimapă montată în joc.
- Nu există markeri pentru taxiuri/civili, rută, pickup/dropoff sau incidente.
- Nu există obiectivul curent, sesiunea sau starea cursei în HUD.
- Nu există hinturi contextuale pentru intrare, mod și recuperare.
- Nu există layout responsive și verificarea suprapunerilor.
- Nu există o probă vizuală la 1280×720 și pe zoom.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Reglaje HUD și cameră](../../Docs/27-reglaje-hud-si-camera.md)
- [Minimapa](../../Docs/minimap.md)
- [HUD](../../Docs/hud.md)
- [Layout responsive](../../Docs/responsive-layout.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 260 trebuie să fie Done înainte de începere.
- 263 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Minimapa arată ruta, vehiculul selectat, taxiurile/civilii și pickup/dropoff, cu identitate stabilă.
- [ ] HUD-ul arată viteză, mod, sesiune, obiectivul curent și starea cursei.
- [ ] Un click pe marker selectează numai camera și respectă contractul de selecție.
- [ ] HUD-ul se actualizează la 5–10 Hz, nu per frame, și nu blochează tastele.
- [ ] Layout-ul rămâne lizibil la 1280×720, 1920×1080 și zoom 150%.
- [ ] Nicio informație indisponibilă nu este afișată ca zero inventat.

## Verificare

- Teste de proiecție, identitate marker și overlap.
- Probă în browser: minimapă, click, rută, obiectiv, zoom.
- Capturi la cele trei breakpoint-uri.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criterii îndeplinite și verificate.
- [ ] Dovezi completate și documentație actualizată.
- [ ] Status Done și completed_at completat.
- [ ] Fișier mutat fizic în Done și absent din celelalte coloane.

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '281'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

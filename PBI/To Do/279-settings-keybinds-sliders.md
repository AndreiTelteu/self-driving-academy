---
id: "279"
title: "Setări, remapare taste și slidere de control/stil în joc"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["260"]
performance_checks: ["ui","frame"]
owner: null
started_at: null
completed_at: null
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

- [ ] „Setări” deschide un panou real din start și din pauză; Anulează, Salvează și Resetare funcționează.
- [ ] Toate cele 15 acțiuni sunt remapabile, conflictele blochează salvarea, iar Escape anulează captura.
- [ ] Cele șapte slidere de control și opt de stil se aplică și se salvează fără a atinge profilul învățat.
- [ ] O aplicare de stil trece prin bariera de epoch și publică o versiune `MANUAL_TUNING`.
- [ ] Unitatea km/h/mph și camera CHASE/FIRST_PERSON se aplică doar prezentării.
- [ ] Panourile respectă focusul, Tab, Escape, contrastul și nu fură tastele de condus.

## Verificare

- Teste pentru remapare, conflict, reset și aplicarea sliderelor.
- Probă în browser: deschide setările din start/pauză, remapează, aplică un slider.
- Verifică faptul că profilul învățat și XP-ul rămân neschimbate la o setare de dispozitiv.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '279'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

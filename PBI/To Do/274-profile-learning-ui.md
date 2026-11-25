---
id: "274"
title: "Interfața de learning și profil: notificări, explicații, istoric și restore"
status: "To Do"
release: "V1"
module: "Interfață"
depends_on: ["273"]
performance_checks: ["ui","frame"]
owner: null
started_at: null
completed_at: null
---

# 274 Interfața de learning și profil: notificări, explicații, istoric și restore

## Obiectiv

Jucătorul vede starea analizei, delta justificat, dovezile, valorile neobservate, istoricul versiunilor și poate restaura/importa un profil.

## Starea actuală și ce lipsește

- Nu există notificări live pentru analiză, candidat, publicare, lipsă dovezi sau eroare.
- Nu există panoul profilului cu cele 80 de chei, `null` vs zero și chei R rezervate.
- Nu există istoric de versiuni, comparație părinte→copil și restore cu confirmare.
- Nu există import/export de profil în UI și nici verificarea unei versiuni incompatibile.
- Nu există explicația „ce s-a schimbat și de ce” din dovezile reale.
- Nu există reguli de focus, 10 Hz, fără listeners globali și fără citiri când panoul este închis.

## Context și plan

- [Interfață, cameră și control](../../Docs/08-interfata-camera-si-control.md)
- [Învățarea stilului](../../Docs/10-invatarea-stilului.md)
- [Notificările de analiză](../../Docs/learning-notifications.md)
- [Explicația modificărilor](../../Docs/learning-explanation.md)
- [Panoul profilului](../../Docs/profile-panel.md)
- [Istoricul profilului](../../Docs/profile-history.md)
- [Restaurarea și importul](../../Docs/profile-restore.md)
- [Legarea UI la profiluri](../../Docs/profile-ui-binding.md)
- Citește integral documentele de mai sus și [PBI/AGENTS.md](../AGENTS.md) înainte de implementare.
- Refolosește contractele existente; nu crea un al doilea model de simulare, ledger sau store.

## Dependențe

- 273 trebuie să fie Done înainte de începere.

## Criterii de acceptare

- [ ] Notificările disting analiza, candidatul nepublicat, publicarea, lipsa dovezilor și eroarea; nu apar ca publicare falsă.
- [ ] Panoul profilului afișează toate cheile, `Neobservat` pentru `null`, zero real pentru zero și cheile R rezervate.
- [ ] Istoricul afișează versiunile imuabile și delta părinte→copil; restaurarea cere confirmare.
- [ ] Importul validează fișierul și nu scrie nimic înainte de confirmare; un import invalid nu schimbă profilul.
- [ ] Explicația leagă fiecare delta de episoade, contexte, calitate și încredere.
- [ ] Panourile respectă accesibilitatea, pauza și costul UI.

## Verificare

- Teste de proiecție pentru `null`/zero/R, istoric, restore și import invalid.
- Probă în browser: LEARNING, notificare, profil, istoric, restore.
- Verifică focusul, Escape, Tab și citirile când panoul este închis.

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

Verificare finală: `PBI/Validate-Board.ps1 -RequireDone '274'`.

## Istoric

- 2026-11-26: Creat în To Do la resetarea boardului; înlocuiește munca rămasă din generația 001–258.

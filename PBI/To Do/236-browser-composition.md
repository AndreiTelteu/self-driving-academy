---
id: "236"
title: "Compunerea în browser a lanțului V3"
status: "To Do"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["202","193","194","195","196","197"]
performance_checks: ["frame","simulation"]
owner: null
started_at: null
completed_at: null
---

# 236 Compunerea în browser a lanțului V3

## Obiectiv

Leagă contractele V3 191–200 într-o singură compoziție care rulează în browser: personajul se mișcă din
input real, camera third person îl urmărește, intrarea și ieșirea din mașină funcționează, iar HUD-ul
arată entitatea controlată și modul. Până la acest task, toate capabilitățile V3 sunt `HEADLESS_CONTRACT`:
`src/main.ts` nu are nicio referință la `character`, `authority` sau `walker`, deci jocul nu poate fi jucat
pe jos.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie contractele V3 și
secțiunea finală de release, care declară explicit nivelul `HEADLESS_CONTRACT` și cele șase lucruri
nelivrate end-to-end. [18-validare-si-release.md](../../Docs/18-validare-si-release.md) descrie
verdictul V3 pe criterii, iar [25-performanta-contracte-si-benchmark.md](../../Docs/25-performanta-contracte-si-benchmark.md)
definește probele de performanță. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 202 trebuie să existe în Done înainte de începere.
- PBI 193 trebuie să existe în Done înainte de începere.
- PBI 194 trebuie să existe în Done înainte de începere.
- PBI 195 trebuie să existe în Done înainte de începere.
- PBI 196 trebuie să existe în Done înainte de începere.
- PBI 197 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [ ] Personajul se mișcă în browser din input real, cu camera third person pe aceeași entitate și cu clipul ales din viteza măsurată; proba e în browser real (WebGPU sau WebGL2), nu doar headless.
- [ ] Intrarea și ieșirea din mașină și revenirea la mers funcționează din input real, cu autoritate unică (exact un consumator primește comanda) și cu HUD care arată entitatea controlată și modul.
- [ ] Nu există regresii: `npm test` integral verde, bugetele de performanță neschimbate, taskul pe frame/tick raportat explicit față de contractul 25.

## Verificare

Probă în browser: mers, alergare, intrare în taxi, conducere, ieșire, revenire la mers, plus captură de
consolă fără erori și măsurătoare de frame pe compoziția nouă. Rulează verificările relevante ale
proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o
în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție. Nu
înlocui o măsurătoare hardware cu FPS headless.

## Dovezi de finalizare

Rezultat implementare: De completat.

Verificări executate și rezultat: De completat.

Fișiere și documente actualizate: De completat.

Limitări sau follow-up: De completat.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '236' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-15: PBI creat după închiderea backlog-ului 001–235, ca primul pas care transformă contractele V3 în joc jucabil.

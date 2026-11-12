# Manual de utilizare și operare — V1

Acest manual este scris pentru **jucător și operator**, nu pentru dezvoltator. Explică pașii, tastele,
ce se întâmplă pe ecran și ce înseamnă fiecare indicator. Nu promite nimic ce nu este livrat sau
măsurat: fiecare afirmație a fost verificată în codul reviziei curente sau în documentul de modul care
o deține, iar ce rămâne nevalidat este spus explicit.

- Versiune aplicație: `0.1.0` ([package.json](../../package.json)).
- Engine: Babylon.js `9.29.0`; build: Vite `8.3.2`; TypeScript `7.0.2`; Node `24.21.x`.
- Data reviziei acestui manual: 12 noiembrie 2026.

## Cui se adresează și ce acoperă

Manualul acoperă exact ce cere versiunea V1: cele **trei moduri** de control, **sesiunile Academie și
Haos**, **KPI-urile** și ceasurile, **XP fără pierderi**, **misiunile zilnice**, **provocările**,
**sliderele și camera first-person**, **salvarea/exportul** și **recuperarea**.

## Ce trebuie să știi înainte de primul pas

Revizia curentă are două straturi, iar manualul le ține separate ca să nu promită un ecran care nu
există încă:

1. **Artefactul care pornește în browser** (`index.html` → `src/main.ts`) este un **bootstrap de
   randare**: canvas Babylon.js, linia de stare, butoanele Pornește/Pauză/Reîncearcă și panoul
   „Diagnostic”. El nu montează încă HUD-ul de condus, lista flotei, panourile de misiuni/KPI ori
   meniul de fișier. Acest lucru este vizibil în `src/main.ts`, care compune doar
   `createRenderingView` și `createDiagnosticsPanel`.
2. **Fluxurile de joc** (condus, moduri, KPI, zilnice, provocări, slidere, savefile) sunt
   **implementate ca module cu contracte verificate** în `src/` și în dovezile lor. Unde un panou este
   „la nivel de contract”, manualul spune asta la locul lui, cu numele butonului și al fișierului care
   îl deține. Montarea lor în bootstrap este treaba stratului de compoziție, nu a acestui manual.

Consecința practică: poți urma pașii de pornire și diagnostica randarea acum; pașii de joc descriu
contractele reale ale modulelor, cu tastele și pragurile exacte din cod.

## Cuprins

1. [Pornire, tastatură și cameră](01-pornire-si-control.md) — cum pornești aplicația, ce vezi, toate
   tastele implicite, camera din spate și first-person.
2. [Cele trei moduri: AUTO, MANUAL, LEARNING](02-moduri-si-invatare.md) — tranzițiile, ce învață orașul
   și ce nu face MANUAL.
3. [Academie, Haos și recuperare](03-academie-haos-recuperare.md) — izolarea sesiunilor, R, resetul
   orașului, restaurarea stilului, decorul destructibil.
4. [KPI-uri, economie și review-uri](04-kpi-si-economie.md) — revenue, rating 0–5, cele trei ceasuri,
   pop-up-ul KPIs și ce înseamnă „date insuficiente”.
5. [Misiuni zilnice, XP și provocări](05-misiuni-xp-si-provocari.md) — exact trei misiuni pe zi, cum se
   câștigă XP, de ce XP-ul nu scade, cum funcționează ofertele de provocări.
6. [Slidere, confort și camera first-person](06-slidere-si-camera.md) — pop-up-ul „Reglaje”, tabul de
   control, tabul de stil, ce se aplică și când.
7. [Salvare, export și recuperare din fișier](07-salvare-si-recuperare.md) — ce conține `.sdasave`, cum
   se verifică checksum-ul, ce se întâmplă cu un fișier corupt sau prea nou.

## Convenții

- Tastele se scriu ca în codul fizic al tastaturii (`W`, `S`, `Space`, `Escape`), exact cum apar în
  bindingurile salvate.
- „Panou” înseamnă o suprafață modală cu `role="dialog"`; „pop-up” este folosit ca sinonim în textele
  butoanelor.
- Numerele marcate „propunere de calibrare” sunt valori autorate în cod, nu rezultate de playtest.
- Un lucru declarat `NOT_RUN` nu a fost executat; unul declarat `NOT_VALIDATED` nu a fost măsurat.

## Ce rămâne nevalidat în această revizie

- **Playtestul uman și retenția** (revenirea jucătorilor la 24 h / 7 zile) sunt `NOT_RUN`, cu zero
  participanți. Manualul descrie mecanisme, nu procente de revenire.
- **FPS-ul, frame p95/p99 și lucrul GPU pe hardware real** sunt `NOT_VALIDATED` la gate-ul de
  performanță. Nicio propoziție din manual nu promite o rată de cadre.
- **Sesiunea de onboarding** cerută pentru verificarea documentației nu a fost executată cu oameni;
  verificarea făcută aici este o confruntare afirmație-cu-cod, consemnată în
  [Evidence/161-release-docs](../Evidence/161-release-docs/README.md).
- Defectele reale de accesibilitate măsurate (text sub 12 px în panoul camerei și în pop-up-ul KPI,
  etichete care depășesc caseta graficului) sunt raportate, nu ascunse; vezi
  [secțiunea 6](06-slidere-si-camera.md#ce-nu-este-încă-în-regulă).

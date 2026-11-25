---
id: "238"
title: "Coliziunea mașinii conduse cu decorul și clădirile, și orientarea decorului"
status: "Done"
release: "V3"
module: "Mers pe jos V3"
depends_on: ["236","237","256","257"]
performance_checks: ["simulation"]
owner: "orchestrator/sonnet-implementer"
started_at: "2026-11-15T19:28:38+02:00"
completed_at: "2026-11-15T20:00:04+02:00"
---

# 238 Coliziunea mașinii conduse cu decorul și clădirile, și orientarea decorului

## Obiectiv

Repară trei defecte observate la jucarea compunerii 236 în browser:

1. Băncile de pe trotuar erau întoarse invers: orientarea decorului 146 folosea direcția de mers a
   trotuarului (`heading`), nu direcția spre carosabil, deci spătarul (−Z local) ajungea când spre stradă,
   când spre clădire.
2. Mașina condusă trecea prin copaci, stâlpi, hidranți, bănci, coșuri, indicatoare, parcometre și adăposturi:
   `driveVehicle` integra poziția fără nicio verificare de coliziune, iar decorul 146 nu are colliders prin contract.
3. Mașina putea intra în clădiri, iar camera rămânea în afară, pentru că mașina ajungea în interiorul solidului
   care ocluzionează camera 194.

## Context și plan

[20-extensii-si-mers-pe-jos.md](../../Docs/20-extensii-si-mers-pe-jos.md) descrie compunerea 236. Decorul
distructibil 227 nu este conectat la compunerea din browser (planul 146 este desenat direct de scenă), așa că
coliziunea folosește contractele existente: blocatoarele clădirilor din lumea de mers 192 și planul 146 cu raza
lui de footprint. Citește și [workflow-ul PBI](../AGENTS.md).

## Dependențe

- PBI 236 și 237 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare bancă, adăpost și stâlp cu braț are fața spre carosabil și spatele spre exterior, pe toate laturile străzii; ce era corect (copaci, hidranți, coșuri, indicatoare, parcometre) rămâne neschimbat.
- [x] Mașina condusă nu poate traversa copaci, stâlpi, hidranți, bănci, coșuri, indicatoare, parcometre sau adăposturi: corpul ei rotit (`halfExtentsM`, yaw) nu se suprapune cu obstacolul la accelerație maximă, iar mașina rămâne oprită lângă el.
- [x] Mașina condusă nu poate intra în clădiri, iar camera continuă să o urmărească normal lângă clădire.
- [x] Mișcarea este măturată în sub-pași, deci viteza mare nu produce tunelare, și rămâne deterministă.

## Verificare

`tests/app/vehicle-collision.test.ts` conduce mașina compunerii reale prin portul de input real la accelerație maximă
spre fiecare tip de decor și spre clădiri și verifică, la fiecare tick, că dreptunghiul rotit al mașinii nu
pătrunde în obstacol (verificare independentă de implementare), că mașina se oprește lângă el și că
camera rămâne pe mașină. Un test de orientare citește geometria reală a decorului. Rulează `npm test`
integral și păstrează rezultatul exact.

## Dovezi de finalizare

Rezultat implementare: `facingYaw` în `src/rendering/city-decor.ts` orientează banca, adăpostul și brațul stâlpului spre carosabil; `src/app/vehicle-collision.ts` (nou, `238-vehicle-collision-v1`) dă mașinii condusă coliziune cu clădirile 192 și cu decorul 146, cu dreptunghiul rotit, mătură în sub-pași de 0,1 m și alunecare; `driveVehicle` din `src/app/walking-composition.ts` îl folosește. Decorul 227 nu este conectat la compunerea din browser, deci nu a fost reutilizat; nimic nu este distrus, toate obiectele sunt obstacole fizice. Din oprire, frâna ținută dă marșarier lent (max 3 m/s), altfel mașina blocată nu ar putea ieși.

Cauze: vezi [Evidence/238-vehicle-static-collision](../../Docs/Evidence/238-vehicle-static-collision/README.md).

Verificări executate: `node --import ./scripts/register-typescript.mjs --test tests/app/vehicle-collision.test.ts` 13/13 pass (pe codul vechi: 3 pass, 9 fail); `npm test` 3441 teste, 3441 trecute, 0 eșuate; `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` exit 0; `npm run qa:v1-regression -- --check` și `npm run v2:contexts -- --check` current; `Validate-Plan.ps1` și `Validate-Board.ps1` valide.

Fișiere: `src/rendering/city-decor.ts`, `src/app/vehicle-collision.ts`, `src/app/walking-composition.ts`, `src/app/index.ts`, `tests/app/vehicle-collision.test.ts`, `Docs/20-extensii-si-mers-pe-jos.md`, `Docs/Evidence/238-vehicle-static-collision/README.md`, rapoartele 216 și 163 regenerate, `PBI/README.md`, `README.md`, `Docs/README.md`, `PBI/Validate-Plan.ps1`.

Verificare în browser (verificator independent, Playwright MCP cu taste reale W/S/A/D/G pe build-ul `vite preview`, 0 erori în consolă): hidrantul, banca, stâlpul și parcometrul opresc mașina la contact fără traversare (ex. stâlp 11,2 m/s → 0); clădirea `bld:0-0:0-0` oprește mașina cu colțul la z = 24,7153 față de peretele de la 24,7154, camera rămâne pe mașină la 3,5 m, `cameraDivergent` false; S ținut din oprire dă marșarier până la −3 m/s; băncile de la (17,2; 5,5) și (80,2; 5,5) au spătarul spre iarbă și șezutul spre stradă. Capturi și raport: [browser/browser-verification.md](../../Docs/Evidence/238-vehicle-static-collision/browser/browser-verification.md).

Limitări: copacul, băncile de pe alte străzi și adăpostul sunt verificate doar headless (testele 238), nu și vizual; lipită de perete sub unghi mic, mașina alunecă foarte lent (~0,025 m/s), nu complet; coliziunea este circulară pentru decor (rază de footprint 146) și nu are distrugere; mașinile parcate nu se ciocnesc între ele.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '238' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-15: PBI creat după 237, din trei defecte reale observate la jucarea compunerii în browser.
- 2026-11-15T20:00:04+02:00: verificat independent în browser, aprobat de orchestrator și mutat în Done.
- 2026-11-25: Gate-ul V3 include acum PBI 256 (trafic AI vizibil) și 257 (mod AUTO/MANUAL, HUD și
  coliziune cu mașinile AI), adăugate ulterior ca prerequisite ale etapei; implementarea și dovezile
  238 rămân neschimbate.

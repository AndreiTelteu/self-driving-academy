---
id: "242"
title: "Suprafață de drum fără goluri, teren până la orizont și limita hărții"
status: "To Do"
release: "V4"
module: "Calitate vizuală V4"
depends_on: ["239"]
performance_checks: ["simulation","frame"]
owner: null
started_at: null
completed_at: null
---

# 242 Suprafață de drum fără goluri, teren până la orizont și limita hărții

## Obiectiv

Repară trei defecte ale lumii vizibile în audit:

1. Pe carosabil apare o dungă albastru-deschis de exact culoarea cerului (`clearColor`). Este un gol în suprafața drumului.
2. Terenul se termină la marginea orașului; dincolo de el se vede vidul albastru.
3. Mașina condusă poate ieși de pe hartă și ajunge în vid (captura 17).

## Context și plan

Suprafețele benzilor din `city-scene.ts` sunt extrudate per bandă (`LANE_SURFACE`, vezi [city-visual](../../Docs/city-visual.md)). Între benzi sau între bandă și bordură rămâne un gol. Coliziunea 238 (`src/app/vehicle-collision.ts`) acoperă clădirile și decorul, nu și marginea lumii. Vezi [documentul 30](../../Docs/30-calitate-vizuala-v4.md), problemele 5–6.

## Dependențe

- PBI 239 trebuie să fie în Done.

## Criterii de acceptare

- [ ] Suprafața carosabilă, a intersecțiilor și a trecerilor este continuă: un test geometric verifică faptul că, pe fiecare segment, uniunea benzilor acoperă lățimea dintre borduri fără goluri mai mari de 1 mm; în cadrele 239 nu apare niciun pixel de `clearColor` sub linia orizontului.
- [ ] Nu există z-fighting între bandă, marcaj și intersecție; ordinea pe verticală este documentată (marcajele folosesc offset de adâncime sau decal, nu o înălțime arbitrară).
- [ ] Terenul continuă dincolo de oraș până la `camera.maxZ`, cu un fundal la distanță (dealuri sau siluete de oraș, low-poly, nesimulate), astfel încât orizontul să nu fie o linie tăiată.
- [ ] Mașina condusă și personajul nu pot ieși din limitele hărții: o barieră fizică (parapet, gard sau teren care urcă) este vizibilă și oprește mișcarea, folosind aceeași metodă de măturare ca 238 și același comportament determinist.
- [ ] Contractul 238 (coliziunea cu clădirile și decorul) și testele lui trec neschimbate.

## Verificare

Test geometric de acoperire a carosabilului pe harta implicită și pe toate hărțile 158. Test de compunere care conduce mașina cu accelerație maximă spre fiecare margine și verifică, la fiecare tick, că rămâne în interior. Capturi 239 (stradă, intersecție, orizont, marginea hărții). Raportează costul de simulare al barierei.

## Dovezi de finalizare

De completat la finalizare.

## Definition of Done

- [ ] Criteriile de acceptare sunt îndeplinite și bifate.
- [ ] Verificările relevante sunt executate, iar dovezile sunt completate.
- [ ] Contractele și documentația afectate sunt actualizate.
- [ ] Statusul este Done și completed_at este completat.
- [ ] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '242' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-11-16: PBI creat din auditul vizual: dungă de cer pe carosabil, vid după margine, taxi ieșit de pe hartă.

---
id: "185"
title: "Politică extinsă pentru pickup și confortul pasagerilor"
status: "Done"
release: "V2"
module: "Parametri V2"
depends_on: ["166","062"]
parameter_role: "policy"
parameter_keys: ["pickup_approach_speed","pickup_curb_distance","pickup_stop_precision","pickup_dwell_time","dropoff_approach_speed","dropoff_curb_distance","occupied_acceleration_scale","occupied_lateral_accel_scale"]
owner: "loop-pbi/v2-policy-185-01"
started_at: "2026-11-13T21:30:07+02:00"
completed_at: "2026-11-13T21:50:58+02:00"
---

# 185 Politică extinsă pentru pickup și confortul pasagerilor

## Obiectiv

Implementează utilizarea cheilor R: pickup_approach_speed, pickup_curb_distance, pickup_stop_precision, pickup_dwell_time, dropoff_approach_speed, dropoff_curb_distance, occupied_acceleration_scale, occupied_lateral_accel_scale. Separă preferința de serviciu de pragurile obligatorii ale pickup/dropoff și de starea ocupată.

## Context și plan

[11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) descrie regulile și contractele acestei funcționalități. Citește și [workflow-ul PBI](../AGENTS.md) înainte de implementare.

## Dependențe

- PBI 166 trebuie să existe în Done înainte de începere.
- PBI 062 trebuie să existe în Done înainte de începere.

## Criterii de acceptare

- [x] Fiecare cheie schimbă un comportament observabil într-un scenariu izolat.
- [x] Interacțiunea cu cheile M păstrează unitățile, profilele și consecințele stilului.

## Verificare

Compară valori joase și ridicate pentru fiecare cheie în aceeași scenă.

Rulează verificările relevante ale proiectului și păstrează rezultatul exact. Dacă aplicația sau comanda necesară nu există încă, creeaz-o în scope-ul acestui PBI ori raportează blocajul; nu declara verificarea trecută fără execuție.

## Dovezi de finalizare

Rezultat implementare: `src/autonomy/pickup-policy-v2.ts` (exportat prin `src/autonomy/index.ts`, la finalul listei) oferă contractul `185-pickup-policy-v2` cu `PICKUP_POLICY_V2_KEYS`, `PICKUP_POLICY_V2_M_KEYS`, `PICKUP_POLICY_V2_LIMITS`, `compilePickupPolicyProfile`, `evaluatePickupPolicyV2` și `getPickupPolicyV2Stats`. Zona autorată, ancora, lungimea (5,50 m), adâncimea (3,00 m) și accesul vin din poligonul real 032 (`sz:0-0` pickup, `sz:1-0` dropoff, `sz:2-2` numai CIVIL), iar starea ocupată vine din ciclul real 061 (`TO_PICKUP` → `PICKUP` → `TO_DROPOFF` → `DROPOFF` → `COMPLETED`). Preferința de serviciu este separată de pragurile obligatorii: blocul `mandatory` este identic la minimul și maximul fiecărei preferințe, iar pe o grilă de 162 de combinații (3 valori × 4 preferințe × 2 scene) 162/162 păstrează oprirea în bay și 0 combinații schimbă blocul obligatoriu. Pragul nu este încălcat de nicio preferință: 0,10 → 0,15 m și 2,00 → 1,20 m la bordură, 5 → 2,75 m la precizie, 8 → 5,567764 m/s la apropiere, 1 → 3 s la staționare; trei blocaje reale (`ZONE_NOT_TAXI`, `STOP_BEYOND_ZONE`, `ZONE_KIND_MISMATCH`) refuză oprirea la toate extremele. Cele trei limite cerute sunt dovedite: toleranța de precizie nu coboară sub 0,05 m și nu iese din bay, scările cu pasager sunt tăiate de confort și de aderență (4,463550 m/s² pe `reduced-adhesion`), iar plecarea cere oprire în bay, confirmarea 061, staționare efectivă și viteză sub 0,3 m/s. `pickup_dwell_time` este ridicat la `max(3 s, M stop_dwell_time)`, iar cele două scări se aplică numai în `TO_DROPOFF`/`DROPOFF`.

Verificări executate și rezultat: `npm run typecheck` exit 0; `npm run lint` exit 0, 0 erori/0 avertismente; `npm run format:check` exit 0; `npm run check:architecture` exit 0 (388 fișiere TypeScript); `npm run check:parameter-catalog` exit 0 („Parameter catalog is synchronized."); `npm test` **3209/3209 trecute, 0 eșuate** (101,2 s); testul țintă `tests/autonomy/pickup-policy-v2.test.ts` **14/14 trecute**; `npm run pickup:policy` **19/19 verificări PASS**, 8 efecte, 56/56 perechi de separare inerte, 0 cuplaje, 6 rânduri de siguranță, 162/162 cazuri în grilă, digest `fnv1a32:f9043488`; `npm run pickup:policy -- --check` confirmă raportul și markdown-ul actuale.

Fișiere și documente actualizate: `src/autonomy/pickup-policy-v2.ts` (nou), `src/autonomy/index.ts`, `tests/autonomy/pickup-policy-v2-reference.ts` (nou), `tests/autonomy/pickup-policy-v2.test.ts` (nou), `tests/autonomy/pickup-policy-v2-report.ts` (nou), `scripts/run-v2-pickup-policy-report.mjs` (nou), `package.json` (scriptul `pickup:policy` la finalul blocului `scripts`), [Docs/11-catalog-parametri.md](../../Docs/11-catalog-parametri.md) (secțiune nouă la final), [Docs/Evidence/185-v2-pickup-policy/README.md](../../Docs/Evidence/185-v2-pickup-policy/README.md) (nou, cu `report.json` și `report.md`).

Limitări sau follow-up: nivel determinist în Node, fără browser, GPU, fizică live sau input uman; contractul nu este încă legat la un consumator din joc, ca PBI-urile 167–183. Plasarea ego-ului (distanță, viteză, bordură curentă, timp de staționare) este a scenariului, în timp ce zona, ancora și starea ocupată sunt reale. Poligonul 032 nu declară o linie separată a bordurii, deci bordura este marginea exterioară a bay-ului; rezerva de 0,15 m și toleranța de 0,05 m sunt constante de politică documentate. Pragul de 3 s este o constantă egală cu cele 180 de tick-uri ale lui 062 (importul `fleet` ar crea un ciclu), iar `M stop_dwell_time` are maximum 4 s. Cheile de precizie și de staționare aparțin fazei de pickup; dropoff are numai cheile lui de apropiere și bordură. Politica tratează un singur punct de serviciu pe tick, iar scările cu pasager sunt plafoane de comandă, nu un controller complet.

## Definition of Done

- [x] Criteriile de acceptare sunt îndeplinite și bifate.
- [x] Verificările relevante sunt executate, iar dovezile sunt completate.
- [x] Contractele și documentația afectate sunt actualizate.
- [x] Statusul este Done și completed_at este completat.
- [x] Fișierul este mutat fizic în PBI/Done și lipsește din celelalte coloane.

Verificare finală obligatorie: rulează Validate-Board.ps1 -RequireDone '185' după mutarea fizică și păstrează rezultatul.

## Istoric

- 2026-10-04: PBI creat în To Do; implementarea nu a început.
- 2026-11-13: Implementare în worktree izolat (branch `loop-pbi/v2-policy-185-01`): politică pickup/dropoff cu opt chei R, separare preferință/prag obligatoriu/stare ocupată dovedită în ambele sensuri (162/162 combinații), 56/56 perechi de separare, 14 teste noi și raport determinist `fnv1a32:f9043488`.

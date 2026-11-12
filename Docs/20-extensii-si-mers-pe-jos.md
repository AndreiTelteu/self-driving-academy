# Extensii și mers pe jos

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md).

## V2 întregul catalog

V1 livrează 24 de chei M. V2 implementează cele 56 R rămase, cu efecte reale în politica autonomă, contexte, estimatori, incertitudine și teste independente. Catalogul rămâne comun pentru taxiuri și civili. Starea de suport și defaulturile se migrează explicit pentru profilele V1.

| Categorie | Context suplimentar și livrabil |
| --- | --- |
| Viteză | Ritm variabil, deadband, artere și depășire |
| Longitudinal | Coasting, jerk de frână, ridicarea accelerației și plecare |
| Urmărire | Cut-in, TTC, schimbare de lider și histerezis |
| Semafoare | Galben, traversare pe roșu, gap și plecare specifică |
| STOP | Rolling stop, prioritate din toate direcțiile și intersecție blocată |
| Benzi | Durata manevrei, semnalizare și depășire prin dreapta |
| Lateral | Offset, răspuns, viraje, clearance și corecție |
| Rutare | Alternative comparabile, costuri normalizate, rerutare și recuperare |
| Pietoni/pericole | NPC pietoni, stimuli și reacții observabile |
| Serviciu | Pickup/dropoff și comparații cu/fără pasager |

Datele ambigue nu justifică estimări absolute. Ponderile rutării au o scară canonică și modificatorii de pasager folosesc contexte comparabile. Fiecare cheie este mapată în [matricea PBI](21-acoperire-functionalitati.md). Dacă un estimator nu este validat, gate-ul V2 rămâne deschis.

Pietonii se deplasează pe trotuar și traversează prin oportunități definite. Obstacolele și stimuli de pericol sunt scenarii ale jocului. Coliziunile și distanțele au aceeași semantică de expunere, iar simularea nu adaugă imunitate pentru un profil riscant.

## V3 personajul și mersul pe jos

Jucătorul are personaj third person cu mers, alergare, idle, cameră și coliziuni. Poate intra în orice mașină accesibilă și poate ieși într-un punct fizic valid. Se păstrează selectarea rapidă a taxiului prin listă.

Autoritatea este una singură: personaj sau vehicul. Selectarea unui taxi distant poate muta camera fără a clona personajul. UI arată entitatea controlată și modul; la revenirea în personaj se reia starea sa fizică. Mașina eliberată continuă cursa sau ruta prin politica potrivită.

Ieșirea și schimbarea vehiculului închid segmentul MANUAL/LEARNING; analiza se lansează numai pentru LEARNING eligibil. Selectarea distantă mută doar camera; MANUAL/LEARNING preiau explicit vehiculul și suspendă inputul personajului, păstrându-i corpul fizic. Revenirea la personaj eliberează vehiculul în AUTO. Mersul pe jos nu contribuie la profilul de driving. O mașină în mișcare sau cu ieșire blocată folosește reguli explicite pentru transferul controlului; personajul nu apare într-un collider.

Salvarea V3 păstrează poziția personajului, camera și autoritatea. Sesiunile vechi primesc o stare validă prin migrare. Tutorialul nou nu blochează accesul la taxiuri. Testele includ coliziuni, intrare/ieșire, focus, schimbare rapidă, cele trei moduri, telemetrie eligibilă, KPI-uri, misiuni zilnice, XP și regresii de flotă. Mersul activ poate contribui la XP de timp, fără a deveni demonstrație de driving.

## Scope ulterior neangajat

Multiplayer, vreme dinamică, interioare complexe, percepție prin senzori și rețele neuronale sunt direcții posibile, fără task-uri de implementare în acest backlog. Ar necesita cerințe și estimări distincte.

## Contexte, etichete și scenarii pentru parametrii V2 (PBI 163)

[Contractul `163-v2-contexts-v1`](../src/telemetry/v2-contexts.ts) închide golul dintre catalogul de parametri și telemetria reală: fiecare dintre cele 56 de chei R are un context în care este **observabilă**, o etichetă în română și un scenariu **reprezentativ**. Modulul este un read model pur de telemetrie — fără ceas, fără fizică, fără renderer, fără scheduler, fără publicare — și consumă exclusiv contracte livrate: eșantionul 085/069 (`TelemetrySample`), fluxul de evenimente 007, forma de observație de pericol 030 (`HazardObservation`), faptul de rutare 033/219 (`RoutePlan`, `BlockedRecoveryStage`) și faptul de serviciu 061.

**Vocabularul închis.** Un context declară o listă de `facets` — faptele minime de care are nevoie — iar fiecare facet este derivat din contractul proprietar, nu inventat: `LEADER_GAP` și `LEADER_QUEUE` din contextul 044/048 al eșantionului, `SIGNAL_RED/GREEN` și `STOP_LINE` din semnalul și linia aplicabilă, `LANE_CHANGE_OPEN/CLOSED` din evenimentele 007, `PEDESTRIAN`/`OBSTACLE` din observația 030 activă și observabilă, `ROUTE_ALTERNATIVE`/`ROUTE_BLOCKED`/`REROUTE` din faptul de rutare, `SERVICE_APPROACH`/`CURB_DISTANCE`/`STOP_PRECISION` din faptul de serviciu. Un context este observabil când toate faptele cerute apar în scenariu; se completează la cadrul ultimului fapt lipsă, iar `observableFrames` numără cadrele de la acel tick în care cel puțin un fapt cerut este încă prezent. Constrângerea exterioară a contextului (`NONE`, `LEADER`, `BLOCKED_GREEN`, `MECHANICAL_LIMIT`, `IMPACT`) este validată la încărcare față de tabelul real 087 `eligibilityLabelClasses`: `NONE` trebuie să fie `ELIGIBLE`, orice altă valoare `EXTERNAL_CONSTRAINT`. Tipul de oportunitate 086 este atașat doar unde există cu adevărat (`RED`, `GREEN`, `STOP`, `YIELD`, `LANE_CHANGE`), nu pentru fiecare context.

**Reprezentabilitate numărată, nu afirmată.** Fiecare categorie R are un scenariu propriu, iar evaluatorul verifică două lucruri separat: toate cheile categoriei sunt observabile și toate declanșatoarele categoriei sunt observate. Declanșatoarele sunt fapte numerice din cadre, nu text: croazieră pe cel puțin două tipuri de drum și atât peste, cât și sub limită (Viteză); accelerare și decelerare plus frână în spatele unui lider (Longitudinal); cel puțin trei eșantioane cu lider și spațiu în scădere plus o schimbare de lider (Urmărire); ciclu roșu → verde cu linie de oprire plus `SIGNAL_PHASE_CHANGED` (Semafoare); `STOP_APPROACH` plus `FULL_STOP` plus conflict de prioritate (STOP); pereche `LANE_CHANGE_STARTED`/`LANE_CHANGE_COMPLETED` cu aceleași benzi plus semnalizare înainte de manevră (Benzi); curbură cu viraj și încărcare laterală susținută (Lateral); alternative comparabile, bandă blocată urmată de `REROUTE` și recuperare prin mers înapoi (Rutare); pieton și obstacol observabile plus răspuns (Pietoni); `PICKUP` și `DROPOFF` plus segment cu pasager (Serviciu). Un scenariu este reprezentativ numai dacă ambele condiții trec; controlul negativ (`control-flat-cruise`, croazieră urbană uniformă) trebuie să producă **zero** chei observabile și zero categorii reprezentative, deci verificarea nu este tautologică.

**Date de manual.** Fiecare context poartă `setup`, `action` și `evidence`: unde stă jucătorul, ce face ca să întâlnească contextul și ce trebuie să arate telemetria. Sunt deterministe și verificabile, gândite pentru manual și QA, nu valori de calibrare: pragurile numerice rămân cele din catalogul de proiectare.

**Compatibilitatea V1.** Nicio cheie V1 (M) nu este redefinită, redenumită sau recalibrată: catalogul validat la încărcare refuză orice suprapunere între cele 24 de chei protejate și cele 56 de chei R, iar `V1_COMPATIBILITY` declară `migration: none` și listează câmpurile de catalog păstrate. Dovezile V1 citate (`151-scenario-suite`, `216-v1-regression`, `142-experiment-rerun`, `056-auto-scenarios`) sunt verificate pe disc, cu SHA-256 în raport.

Comenzi: `npm run v2:contexts` derivă `Docs/Evidence/163-v2-contexts/report.json` și `report.md`, iar `npm run v2:contexts -- --check` refuză un raport neactualizat. Testele `tests/telemetry/v2-contexts.test.ts` acoperă catalogul real (56/56), reprezentativitatea pe categorie (10/10), controlul negativ, refuzul unei chei inexistente, compatibilitatea V1 și determinismul (două rulări, aceeași amprentă). Dovezile, tabelul cheie → context → scenariu → etichetă și numerele reale sunt în [Evidence/163-v2-contexts](Evidence/163-v2-contexts/README.md).

## Pietoni autonomi și traversări (PBI 164)

Contractul `164-pedestrians-v1` din [`src/world/pedestrians.ts`](../src/world/pedestrians.ts) transformă trecerile livrate de 039 într-o populație reală de pietoni: entități cu ID stabil, traseu derivat din hartă, o stare explicită și o decizie de traversare măsurabilă. Modulul este un pas de lume determinist — fără renderer, fără fizică și fără ceas — și consumă exclusiv contracte deja livrate: geometria semantică a trecerilor 039, proiecția pe bandă 033 și layout-ul derivat 042.

**Identitate și ciclu de viață.** Fiecare pieton are un ID derivat din sesiune, epoca lumii, harta, trecere și slotul din trecere, deci nu depinde de tick și nu se schimbă între două rulări cu aceeași intrare. Vocabularul de stare este închis: `ON_SIDEWALK` (merge pe trotuar), `WAITING` (așteaptă la bordură), `CROSSING` (traversează), `CROSSED` (a ajuns pe trotuarul celălalt), `WITHDRAWN` (retras). Tranzițiile sunt o tabelă explicită (`PEDESTRIAN_STATE_TRANSITIONS`), iar orice altă tranziție este refuzată. Retragerea nu este o dispariție: poartă un motiv închis, `ROUTE_COMPLETE` sau `IMPACT`, și un eveniment `STATE_CHANGED` cu tick-ul real. Nu există respawn tăcut; crearea este numărată, iar snapshot-ul expune `stateSinceTick`.

**Traseul.** Pentru fiecare trecere, axa de traversare este perpendiculara pe banda de referință, măsurată din linia de trecere autorată a benzii; capetele traversării sunt proiecțiile poligonului 039 pe acea axă, iar apropierea pe trotuar este un segment drept ancorat în banda `SIDEWALK` derivată de layout-ul 042. O trecere fără trotuar derivat pe ambele capete este refuzată cu motiv închis (`NO_SIDEWALK`, `NO_LANE_PROJECTION`, `DEGENERATE_GEOMETRY`) și raportată ca lacună, nu aproximată. Pietonii merg cu viteză, răbdare și marjă de siguranță derivate din seed-ul explicit și expuse per entitate, deci aceleași intrări produc aceiași oameni, aceleași momente și aceleași decizii.

**Traversarea cu conflict.** La bordură, pietonul evaluează vehiculele observabile din apropiere: dacă timpul până la linia de trecere este mai mic decât timpul necesar pentru a elibera traversarea plus marja sa, așteaptă. După `patienceTicks` se angajează oricum (`ASSERTED`), ceea ce creează o oportunitate reală de cedare; altfel traversează în gol (`GAP_ACCEPTED`). Conflictul este un fapt observat, nu o presupunere: fiecare înregistrare poartă distanța semnată până la linia benzii, viteza vehiculului, timpul până la conflict (distanță ÷ viteză), timpul de traversare rămas și distanța minimă observată. Un vehicul care frânează cât timp pietonul traversează produce o oprire reală (`PedestrianStop` cu `duringCrossing: true`), iar conflictul devine `YIELDED`; dacă vehiculul își păstrează viteza, conflictul rămâne `CROSSED_WITHOUT_YIELD` cu distanța minimă măsurată.

**Fără denominatoare fictive.** Numărătorile sunt evenimente reale: traversări pornite, finalizate, întrerupte, conflicte observate, opriri reale. Fiecare traversare finalizată este clasificată exact o dată — `FREE` (acoperire completă, zero conflicte), `YIELDED`, `WITHOUT_YIELD` sau `UNOBSERVED` (acoperire incompletă) — iar suma clasificărilor este egală cu traversările finalizate. Rata de cedare are ca numitor doar traversările cu acoperire completă și conflict observat; când acel numitor lipsește, valoarea este `null`, statusul `MISSING` și motivul este declarat într-o lacună (`NO_COMPLETE_CONFLICT_EPISODE`, `INCOMPLETE_VEHICLE_COVERAGE`, `REFUSED_CROSSWALK_LINK`, `MISSING_CROSSING_LINE`, `PEDESTRIAN_CAPACITY_TRUNCATED`, `NO_CROSSWALK`). Un drum gol nu devine „cedare 0 %”, iar o enumerare incompletă a vehiculelor nu devine „traversare liberă”.

**Coliziuni.** Contactele sunt fapte autoritare ale proprietarului coliziunilor: modulul le validează (tick curent, pieton existent și activ), le înregistrează cu starea de la impact și retrage pietonul cu motiv `IMPACT`. Traversarea întreruptă nu este numărată ca finalizată, iar un al doilea contact pentru același pieton este refuzat. Modulul nu detectează fizic impactul și nu inventează un contact din simpla apropiere.

**Capacități și cost.** Numărul de pietoni (`maxPedestrians`), vehiculele per pas, conflictele, opririle și contactele au plafoane explicite; depășirea unui plafon de dovezi este refuzată, nu trunchiată tăcut, iar trunchierea creării este raportată. Costul per pas este mărginit structural: O(pietoni activi + vehicule × treceri de pe banda lor), fără alocare de snapshot-uri în `step` — pozițiile se cer explicit prin `getPedestrians()`.

Comenzi: `npm run pedestrians:report` derivă `Docs/Evidence/164-pedestrians/report.json` și `report.md`, iar `npm run pedestrians:report -- --check` refuză un raport neactualizat. Testele `tests/world/pedestrians.test.ts` acoperă ID-urile stabile, fiecare stare și tranzițiile închise, traversarea cu cedare, traversarea fără cedare, conflictul observabil (distanță, viteză, timp), numărătorile fără numitori ficși, acoperirea incompletă, contactul autoritar, refuzul intrărilor invalide și determinismul. Numerele reale, tabelele și limitările sunt în [Evidence/164-pedestrians](Evidence/164-pedestrians/README.md).

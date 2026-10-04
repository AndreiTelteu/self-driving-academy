# Produs și scope

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Cerințe confirmate

| Domeniu | Decizie |
| --- | --- |
| Platformă | Browser pe PC și laptop, cu tastatură și mouse |
| Perspectivă | Oraș 3D și cameră din spatele mașinii |
| Vehicule | Jucătorul poate conduce orice mașină și poate selecta rapid orice taxi |
| Flotă inițială | Aproximativ 20–30 de taxiuri, într-un cartier compact, alături de trafic obișnuit |
| Interfață | Inspirație GTA San Andreas, listă a taxiurilor și a curselor, mod de control vizibil |
| Control | AUTO, MANUAL fără învățare și LEARNING cu învățare; maximum un vehicul condus de jucător |
| Învățare | Numai din LEARNING, inclusiv în mașini civile, din curse complete și intervenții de câteva străzi |
| Propagare | Automat după segmente LEARNING eligibile, către taxiuri și civili; civilii imită stilul comun al orașului |
| Greșeli | Flota copiază inclusiv condusul agresiv și încălcările regulilor |
| Fizică | Mai realistă, cu aderență, frânare și control al mașinii importante |
| Gameplay | Campanie, trei misiuni noi pe zi calendaristică, XP din misiuni și timp activ; penalizări pentru deteriorarea atribuibilă a KPI-urilor |
| KPI flotă | Revenue lunar, ratings 0–5, curse și review-uri pe zi; buton KPIs cu pop-up și grafice istorice |
| Oraș | Cartier fictiv cu atmosferă americană, apropiată de GTA San Andreas |
| Persistență | Single-player, salvare locală în browser și export/import de profil |
| Mers pe jos | Extensie ulterioară |

## Propuneri de calibrare

Propuneri pentru prima versiune: trafic pe dreapta, vreme uscată și lumină de zi; flotă standard de 24 de taxiuri; 40 de vehicule de trafic obișnuit; două clase de mașini; pasageri reprezentați simplificat; trafic civil care adoptă același profil de stil ca taxiurile, cu rute proprii. Regulile jocului sunt definite în datele hărții și ale scenariilor.

Bugetul, echipa, calendarul și hardware-ul minim exact nu sunt cunoscute. Planul stabilește dependențe și criterii de acceptare fără estimări fictive de durată. Numele de lucru Self Driving Academy și toate valorile numerice de calibrare rămân propuneri.

## Experiența principală

Jucătorul observă taxiurile, selectează unul și vede cursa curentă. Taxiul merge autonom până când jucătorul preia controlul. Jucătorul alege MANUAL pentru a conduce fără învățare sau LEARNING pentru a demonstra stilul, apoi revine la AUTO. Numai segmentele LEARNING eligibile pot publica automat un profil nou, adoptat de taxiuri și civili. Revenue-ul și ratings reflectă atât cursele conduse direct de jucător, cât și efectele profilului comun. Butonul KPIs arată istoricul; misiunile zilnice și XP oferă obiective de revenire.

Obiectivul observabil este reproducerea tendințelor jucătorului în contexte comparabile. Același profil poate produce acțiuni diferite pe străzi diferite, în mașini diferite sau în trafic diferit. Jucătorul poate vedea dacă stilul său produce livrări rapide, disconfort, aglomerație, încălcări sau accidente.

Un exemplu de sesiune: profilul inițial păstrează distanță mare și pleacă lent de la semafor. Jucătorul conduce câteva străzi în LEARNING, urmărește mai aproape mașina din față și reacționează mai repede la verde. Jocul actualizează doar parametrii susținuți de acele observații. Celelalte taxiuri și mașinile civile adoptă profilul și, când întâlnesc situații similare, manifestă aceleași tendințe.

## Limitele primei versiuni

Prima versiune include conducere manuală, autonomie pe un graf de benzi, curse cu pickup și dropoff, trafic obișnuit, semafoare, STOP, priorități, coliziuni, profiluri versionate, telemetrie și comparații. Condusul liber permite abateri de la traseu și contact cu borduri sau alte vehicule.

Mersul pe jos, interioarele, multiplayer-ul, percepția prin camere sau LiDAR simulat, vremea dinamică și antrenarea unei rețele neuronale sunt extensii. Autonomia folosește inițial informațiile structurale ale simulării. Învățarea parametrilor este nucleul produsului și nu presupune apeluri la un model conversațional.

Manevrele pe care politica autonomă nu le poate reprezenta, precum cascadoriile sau condusul deliberat pe trotuar, rămân vizibile în înregistrare și în statistici. Interfața le marchează ca comportamente nereproduse de profil; nu pretinde că le-a învățat.

## Etapele produsului

V1 este jocul complet pentru PC în browser cu 20–30 de taxiuri, condus realist, curse, campanie, 24 de parametri învățabili, profil comun pentru oraș, comparații, KPI-uri economice și ratings, trei misiuni zilnice, XP și salvare locală. V2 implementează și validează întregul catalog de 80 de parametri, inclusiv contexte suplimentare de pietoni, pericole, rutare și serviciu. V3 adaugă personajul și mersul pe jos, păstrând schimbarea rapidă a taxiului.

Multiplayer-ul, vremea dinamică, interioarele complexe, percepția prin camere sau LiDAR și rețelele neuronale nu intră în backlogul confirmat. Implementarea lor ar necesita o extindere explicită a scope-ului. Diferența V1/V2/V3 este o ordine de livrare, nu omiterea funcționalităților planificate.

## Babylon.js confirmat

Engine-ul de joc și randare ales este Babylon.js. Three.js și PlayCanvas nu mai sunt alternative de implementat. Fizica rămâne un subsistem distinct; baza planificată este Rapier 3D cu adaptor propriu, verificată în prototip. Schimbarea engine-ului grafic necesită o nouă decizie explicită a utilizatorului.

## Decizii confirmate în revizia 0.3

MANUAL nu actualizează stilul; LEARNING folosește aceleași comenzi și fizică și publică automat când există dovezi. Mașinile civile sunt prezentate ca șoferi umani care imită stilul orașului, deși sunt simulate de aceeași politică de comportament. Nu sunt personalități fixe de control în sesiunea live. KPI-urile economice aparțin numai flotei de taxiuri; civilii le pot influența indirect prin trafic.

[Economia și review-urile](22-kpi-economie-si-review-uri.md), [misiunile zilnice și XP](23-misiuni-zilnice-si-experienta.md) și [milestone-urile timpurii](24-milestone-timpuriu-si-contracte.md) completează scope-ul V1. Viralizarea rămâne o oportunitate ulterioară; această revizie prioritizează fidelizarea prin misiuni și progres.

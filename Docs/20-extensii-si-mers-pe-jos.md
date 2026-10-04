# Extensii și mers pe jos

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md).

## V2 întregul catalog

V1 livrează 24 de chei M. V2 implementează cele 56 R rămase, cu efecte reale în politica autonomă, contexte, estimatori, incertitudine și teste independente. Catalogul rămâne comun pentru întreaga flotă. Starea de suport și defaulturile se migrează explicit pentru profilele V1.

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

Ieșirea și schimbarea vehiculului închid intervenția manuală și lansează analiza datelor valide. Mersul pe jos nu contribuie la profilul de driving. O mașină în mișcare sau cu ieșire blocată folosește reguli explicite pentru transferul controlului; personajul nu apare într-un collider.

Salvarea V3 păstrează poziția personajului, camera și autoritatea. Sesiunile vechi primesc o stare validă prin migrare. Tutorialul nou nu blochează accesul la taxiuri. Testele includ coliziuni, intrare/ieșire, focus, schimbare rapidă, telemetrie și regresii de flotă.

## Scope ulterior neangajat

Multiplayer, vreme dinamică, interioare complexe, percepție prin senzori și rețele neuronale sunt direcții posibile, fără task-uri de implementare în acest backlog. Ar necesita cerințe și estimări distincte.

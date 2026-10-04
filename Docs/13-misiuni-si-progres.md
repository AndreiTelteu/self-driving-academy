# Misiuni și progres

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Misiuni și progres

Campania introduce mecanicile în ordine și păstrează libertatea de a demonstra un stil riscant. Progresul poate evalua rezultate diferite: finalizarea cursei, fidelitatea imitației, confortul, viteza serviciului sau efectul asupra orașului. Învățarea nu șterge automat greșelile pentru a acorda un scor bun.

| Etapă | Misiune propusă | Condiție de progres |
| --- | --- | --- |
| 1 | Primul taxi | Selectează un taxi, comută în manual și finalizează o cursă |
| 2 | Prima demonstrație | Închide un segment LEARNING cu cel puțin un parametru susținut de date și vezi publicarea în flotă |
| 3 | Distanța în trafic | Demonstrează două stiluri de urmărire și identifică diferența dintre profiluri |
| 4 | STOP și semafoare | Întâlnește oportunități relevante și inspectează comportamentul învățat |
| 5 | Pasagerul | Finalizează o cursă cu obiectiv explicit de confort |
| 6 | Orașul te copiază | Rulează un scenariu cu întreaga flotă și inspectează efectele stilului |
| 7 | Schimbarea unui obicei | Creează o versiune nouă din demonstrații repetate și compară două profiluri |
| 8 | Provocarea flotei | Finalizează un scenariu cu obiective de serviciu și buget de incidente afișate |

Recompensele propuse sunt deblocări de provocări, clase de mașini și instrumente de analiză. Capacitățile de bază de a conduce orice mașină existentă și de a selecta orice taxi sunt disponibile de la început. Nu se condiționează accesul la taxiurile existente de nivelul jucătorului.

O misiune are ID stabil, condiții de pornire, obiective, praguri, fereastră de evaluare, stare, recompensă și reguli de reluare. Obiectivele sunt calculate din evenimente ale simulării, nu din textul HUD. Eșecul unei misiuni păstrează profilurile învățate; reluarea arată dacă folosește profilul curent sau un snapshot inițial.

Jocul păstrează separat rezultatul misiunii, fidelitatea stilului și indicatorii orașului. Nu comprimă toate efectele într-un singur scor de „șofer bun”. Provocările care cer respectarea regulilor o spun explicit; experimentele de imitație pot reuși și cu un profil problematic.

## Reluare și dificultate

Reluarea păstrează profilul curent dacă obiectivul nu declară un snapshot fix. Misiunile de comparație declară profilele și scenariul. Dificultatea ajustează cererea și pragurile obiectivelor, fără a modifica pe ascuns stilul învățat. Recompensele sunt idempotente pe missionId și versiunea progresului.

În V2 se adaugă provocări pentru rutare, semnalizare, pietoni, pericole și serviciu. În V3 se adaugă tutorialul de mers și intrare/ieșire. Niciuna dintre aceste extensii nu elimină accesul la taxiurile existente.

## Misiuni zilnice și experiență

V1 include exact trei misiuni noi pe zi calendaristică, separate de campanie și de zilele economice simulate. Obiectivele provin dintr-un catalog de activități normale cu parametri randomizați și condiții realizabile: curse MANUAL, confort, eficiență și demonstrații LEARNING explicite. MANUAL rămâne o cale de progres fără schimbarea profilului comun.

PlayerProgress conține XP și nivelul; fiecare misiune eligibilă și timpul activ contribuie la XP. Deteriorarea atribuibilă a revenue-ului sau ratingului după o intervenție MANUAL/LEARNING poate scădea XP, chiar când celălalt KPI crește. Sunt afișate cauza și dovezile; fidelitatea imitației rămâne un rezultat separat. [Contractul zilnic și XP](23-misiuni-zilnice-si-experienta.md) definește resetarea, formulele, idempotența și cazurile fără dovezi.

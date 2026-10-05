# Vehicule și fizică

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Fizica și senzația de condus

Realismul primei versiuni înseamnă distanțe de frânare dependente de viteză și aderență, transfer credibil al sarcinii, pierderea aderenței în viraje, suspensie, inerție și diferențe între clasele vehiculelor. Modelul final se alege prin prototip. Un controller cu ray casting este o bază de evaluare, nu o garanție că întreaga dinamică a anvelopelor este simulată fidel.

Inputul digital al tastaturii este filtrat prin curbe de accelerație, frână și direcție, cu revenire și sensibilitate dependentă de viteză. Asistențele sunt configurabile prin ControlPreferences versionat și sliderele din [modulul 27](27-reglaje-hud-si-camera.md), în limite calibrate care păstrează mecanica vehiculului. Estimatorul observă inputul brut, comenzile efective și versiunea setărilor; nu învață oscilațiile produse de limita tastaturii drept preferință personală.

Pragurile mecanice aparțin configurației vehiculului. Profilul șoferului exprimă accelerații dorite și spații acceptate, apoi controllerul le realizează în limita aderenței și puterii. Condusul agresiv poate produce derapaje, frânare insuficientă și coliziuni. Sistemul nu adaugă imunitate fizică taxiurilor autonome.

Scenele de calibrare includ frânare de la viteze repetabile, viraje cu rază fixă, schimbare de bandă, impact cu bordură și contact între două mașini. Se verifică stabilitatea numerelor și coerența manual versus autonom înainte de construirea campaniei.

## Contractul dintre manual și autonomie

Controllerul auto aplică aceeași comandă din oricare sursă. Arbitrajul este realizat înainte de fizică; comenzile AI nu sunt aplicate după preluare. Raw input, commanded input și achieved acceleration sunt valori distincte pentru învățare. Nu antrenăm profilul să reproduce zgomotul de suspensie sau impulsurile de coliziune.

Daunele V1 pot avea un model simplu, documentat: efect asupra disponibilității și mobilității, cu incident păstrat. Recuperarea este o operație de joc etichetată, exclusă din preferințele șoferului. Scenele cu frânare, viraj și două clase sunt gate înainte de extinderea hărții.

## Costul fizicii și frecvențele

Controllerul și fizica rămân la 60 Hz; doar deciziile de nivel înalt au 10 Hz distribuiți prin scheduler. Colliderele/query-urile sunt simplificate și filtrate cu regresii de contact/vecini; camera nu dezactivează fizica civililor sau a taxiurilor. Solver/CCD nu se reduc automat cu FPS. 021 măsoară pasul fizic, query-urile și bridge-ul WASM pe trafic/contacte, pe hardware-ul fixat în 203. Acumularea de timp este plafonată și suprasarcina explicită, conform [modulului 25](25-performanta-contracte-si-benchmark.md).

## Recuperare și impacturi distractive

[Modulul 26](26-joaca-libera-haos-si-distrugere.md) diferențiază R/deblocarea mașinii de resetul lumii cu stil păstrat și definește contactele cu decor destructibil. Fizica este aceeași în Academie/Haos și MANUAL/LEARNING/AUTO. Reglajele de input schimbă realizarea comenzilor jucătorului; sliderele de stil schimbă țintele politicii, fără modificarea ascunsă a masei, aderenței sau puterii.

## Prototip implementat021

[Prototipul Rapier](physics-prototype.md) documentează portul, calibrarea, decizia, limitele observate și probele desktop reale. Babylon rămâne engine-ul. Fizica finală și integrarea gameplay continuă în PBI-urile dedicate.

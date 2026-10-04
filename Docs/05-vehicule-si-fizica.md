# Vehicule și fizică

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Fizica și senzația de condus

Realismul primei versiuni înseamnă distanțe de frânare dependente de viteză și aderență, transfer credibil al sarcinii, pierderea aderenței în viraje, suspensie, inerție și diferențe între clasele vehiculelor. Modelul final se alege prin prototip. Un controller cu ray casting este o bază de evaluare, nu o garanție că întreaga dinamică a anvelopelor este simulată fidel.

Inputul digital al tastaturii este filtrat printr-o curbă de accelerație, frână și direcție, cu viteză de revenire și sensibilitate dependentă de viteză. Această asistență de input este fixă și documentată; estimatorul observă atât tastele, cât și comenzile efective. Nu învață ca preferință personală oscilațiile produse de limita tastaturii.

Pragurile mecanice aparțin configurației vehiculului. Profilul șoferului exprimă accelerații dorite și spații acceptate, apoi controllerul le realizează în limita aderenței și puterii. Condusul agresiv poate produce derapaje, frânare insuficientă și coliziuni. Sistemul nu adaugă imunitate fizică taxiurilor autonome.

Scenele de calibrare includ frânare de la viteze repetabile, viraje cu rază fixă, schimbare de bandă, impact cu bordură și contact între două mașini. Se verifică stabilitatea numerelor și coerența manual versus autonom înainte de construirea campaniei.

## Contractul dintre manual și autonomie

Controllerul auto aplică aceeași comandă din oricare sursă. Arbitrajul este realizat înainte de fizică; comenzile AI nu sunt aplicate după preluare. Raw input, commanded input și achieved acceleration sunt valori distincte pentru învățare. Nu antrenăm profilul să reproduce zgomotul de suspensie sau impulsurile de coliziune.

Daunele V1 pot avea un model simplu, documentat: efect asupra disponibilității și mobilității, cu incident păstrat. Recuperarea este o operație de joc etichetată, exclusă din preferințele șoferului. Scenele cu frânare, viraj și două clase sunt gate înainte de extinderea hărții.

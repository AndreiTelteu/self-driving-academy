# Interfață cameră și control

Versiune 0.3 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Camera și interfața

HUD propus: minimap și rută în stânga jos; viteză în dreapta jos; ID taxi, modul de control și profilul activ sus; etapa cursei și următorul obiectiv într-o zonă compactă; notificări temporare pentru învățare. Culorile modurilor sunt însoțite de text și simbol, astfel încât diferența să rămână lizibilă fără distingerea culorilor.

Panoul flotei permite selectarea oricărui taxi fără a muta fizic vehiculele. Mașinile civile se selectează prin click pe vehiculul vizibil sau pe markerul lui de pe hartă, apoi prin aceeași acțiune de preluare a controlului. Traficul civil are destinații sau rute proprii pe care le reia la eliberare. Camera trece către taxiul ales. În modul autonom jucătorul îl observă; după alegerea MANUAL sau LEARNING îl conduce. Dacă părăsește un vehicul în MANUAL sau LEARNING, segmentul se închide și vehiculul revine în AUTO cu ruta/cursa păstrată. Noua selecție schimbă doar ținta camerei; noul vehicul rămâne în AUTO până la preluarea explicită. În V3 selecția distantă păstrează personajul și nu îi transferă implicit autoritatea.

Panoul profilului afișează valorile curente, diferența față de versiunea precedentă, situațiile care au susținut schimbarea, cantitatea de dovezi și parametrii încă neobservați. Notificarea poate spune: „Profil nou: distanță mai mică în mers și reacție mai rapidă la verde”. Valorile concrete provin exclusiv din datele sesiunii.

Tabloul orașului arată curse finalizate, timpi, distanță parcursă, încălcări, coliziuni, blocaje și confort. Jucătorul poate inspecta fiecare eveniment pe hartă și poate compara două profiluri în același scenariu.

## Comenzi propuse

| Comandă | Acțiune |
| --- | --- |
| W / S | Accelerație și frână; marșarier la viteză apropiată de zero |
| A / D | Direcție |
| Space | Frână de mână |
| M | AUTO ↔ MANUAL; din LEARNING revine în AUTO |
| L | AUTO/MANUAL → LEARNING; din LEARNING revine în MANUAL |
| K | Pop-up KPIs cu revenue, ratings și grafice istorice |
| Tab | Deschidere sau închidere listă flotă |
| Click pe taxi în listă | Selectare taxi și mutare cameră |
| Q / E | Semnalizare stânga / dreapta |
| C | Schimbare cameră din spate / capotă, dacă a doua cameră este activată |
| P | Panou profil și istoric |
| Escape | Pauză și meniu |
| R | Recuperare la ultimul punct valid, după afișarea consecinței |

Hotkey-urile sunt remapabile. Butoanele din HUD oferă echivalente pentru acțiunile importante. Când un câmp de text sau un dialog are focus, tastele nu controlează vehiculul. Meniul de pauză și pierderea focusului opresc simularea single-player; panourile flotei, profilului, misiunilor și KPIs pun simularea pe pauză în MANUAL și LEARNING. În observare autonomă, panoul flotei rămâne live. Închiderea panoului reia simularea și resetează tastele ținute, prevenind o comandă rămasă activă.

## Moduri de control și închiderea intervențiilor

Există cel mult un vehicul sub controlul jucătorului, în MANUAL sau LEARNING. Modul de control, etapa cursei și versiunea profilului sunt stări independente. Un taxi poate fi autonom și în drum spre pickup sau manual și în drum spre dropoff.

La AUTO → MANUAL/LEARNING, sistemul deschide un segment cu controlMode, learningEligible, poziția, viteza, ruta, contextul, clasa și profilul existente. Comenzile AI încetează la același tick. MANUAL → LEARNING și LEARNING → MANUAL închid segmentul vechi și deschid unul nou fără salt fizic sau gol de input. Numai segmentul LEARNING închis intră în coada estimatorului. La revenirea în AUTO, politica reia starea fizică actuală. Modul MANUAL păstrează telemetria pentru KPI-uri și istoric, cu learningEligible=false; nu poate fi antrenat retroactiv printr-un toggle.

Închiderea este declanșată de revenirea la autonomie, schimbarea mașinii, finalizarea cursei, recuperare sau ieșirea din sesiune. Dacă jucătorul rămâne în MANUAL sau LEARNING după finalizarea unei curse, se deschide un segment nou fără a schimba modul de control. Pauza suspendă segmentul. Un crash de browser păstrează numai datele deja salvate, marcând segmentul incomplet.

Sistemul acceptă și segmente scurte. Un segment LEARNING fără suficiente situații informative produce „Nicio modificare justificată” și nu creează artificial o versiune nouă. Aplicația arată clar momentul în care analiza este în curs și momentul în care flota a adoptat rezultatul.

La revenirea la autonomie în afara unei benzi, politica caută o reintrare fezabilă în graful rutier. Dacă nu există, taxiul este marcat BLOCKED și oferă recuperarea explicită. Preluarea controlului nu teleportează mașina și nu șterge accidentele.

## Afișarea modurilor și a progresului

AUTO arată „Conduce AI-ul”; MANUAL arată „Conduci · învățare oprită”; LEARNING arată „Conduci · orașul învață”. Textul și simbolurile însoțesc culoarea. Tutorialul explică MANUAL înainte de prima demonstrație LEARNING. ANALYZING este starea unui job, nu un al patrulea mod de conducere. La reload se pornește în pauză, cu selecția păstrată și vehiculele în AUTO; reluarea MANUAL/LEARNING cere o acțiune explicită și deschide un segment nou.

Butonul KPIs din panoul flotei și hotkey-ul K sunt disponibile de la început. Pop-up-ul are grafice pentru revenue lunar, rating mediu, curse pe zi și număr de review-uri; arată unitățile, perioada, eșantionul și datele insuficiente. Panoul misiunilor arată cele trei obiective ale zilei, resetarea și XP; profilul jucătorului arată XP și istoricul câștigurilor/penalizărilor. Focusul, Escape și pauza respectă aceleași reguli ca celelalte panouri.

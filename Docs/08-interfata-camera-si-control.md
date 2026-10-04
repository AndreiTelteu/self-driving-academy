# Interfață cameră și control

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Camera și interfața

HUD propus: minimap și rută în stânga jos; viteză în dreapta jos; ID taxi, modul de control și profilul activ sus; etapa cursei și următorul obiectiv într-o zonă compactă; notificări temporare pentru învățare. Culorile modurilor sunt însoțite de text și simbol, astfel încât diferența să rămână lizibilă fără distingerea culorilor.

Panoul flotei permite selectarea oricărui taxi fără a muta fizic vehiculele. Mașinile civile se selectează prin click pe vehiculul vizibil sau pe markerul lui de pe hartă, apoi prin aceeași acțiune de preluare a controlului. Traficul civil are destinații sau rute proprii pe care le reia la eliberare. Camera trece către taxiul ales. În modul autonom jucătorul îl observă; după comutarea în manual îl conduce. Dacă părăsește un taxi condus manual, intervenția se închide, taxiul revine la autonomie și cursa sa continuă.

Panoul profilului afișează valorile curente, diferența față de versiunea precedentă, situațiile care au susținut schimbarea, cantitatea de dovezi și parametrii încă neobservați. Notificarea poate spune: „Profil nou: distanță mai mică în mers și reacție mai rapidă la verde”. Valorile concrete provin exclusiv din datele sesiunii.

Tabloul orașului arată curse finalizate, timpi, distanță parcursă, încălcări, coliziuni, blocaje și confort. Jucătorul poate inspecta fiecare eveniment pe hartă și poate compara două profiluri în același scenariu.

## Comenzi propuse

| Comandă | Acțiune |
| --- | --- |
| W / S | Accelerație și frână; marșarier la viteză apropiată de zero |
| A / D | Direcție |
| Space | Frână de mână |
| M | Comutare SELF-DRIVING / MANUAL INTERVENTION |
| Tab | Deschidere sau închidere listă flotă |
| Click pe taxi în listă | Selectare taxi și mutare cameră |
| Q / E | Semnalizare stânga / dreapta |
| C | Schimbare cameră din spate / capotă, dacă a doua cameră este activată |
| P | Panou profil și istoric |
| Escape | Pauză și meniu |
| R | Recuperare la ultimul punct valid, după afișarea consecinței |

Hotkey-urile sunt remapabile. Butoanele din HUD oferă echivalente pentru acțiunile importante. Când un câmp de text sau un dialog are focus, tastele nu controlează vehiculul. Meniul de pauză și pierderea focusului opresc simularea single-player; panourile flotei și profilului pun simularea pe pauză dacă jucătorul conduce manual. În observare autonomă, panoul flotei rămâne live. Închiderea panoului reia simularea și resetează tastele ținute, prevenind o comandă rămasă activă.

## Moduri de control și închiderea intervențiilor

Există cel mult un vehicul sub control manual. Modul de control, etapa cursei și versiunea profilului sunt stări independente. Un taxi poate fi autonom și în drum spre pickup sau manual și în drum spre dropoff.

La AUTO → MANUAL, sistemul deschide un segment cu poziția, viteza, ruta, contextul rutier, clasa vehiculului și versiunea de profil existente. Comenzile AI încetează la pasul de simulare în care controlul manual începe. La MANUAL → AUTO, segmentul este închis, estimarea este lansată și autonomia reia controlul din starea fizică actuală.

Închiderea este declanșată de revenirea la autonomie, schimbarea mașinii, finalizarea cursei, recuperare sau ieșirea din sesiune. Dacă jucătorul rămâne manual după finalizarea unei curse, se deschide un segment nou fără a schimba modul de control. Pauza suspendă segmentul. Un crash de browser păstrează numai datele deja salvate, marcând segmentul incomplet.

Sistemul acceptă și segmente scurte. O intervenție fără suficiente situații informative produce „Nicio modificare justificată” și nu creează artificial o versiune nouă. Aplicația arată clar momentul în care analiza este în curs și momentul în care flota a adoptat rezultatul.

La revenirea la autonomie în afara unei benzi, politica caută o reintrare fezabilă în graful rutier. Dacă nu există, taxiul este marcat BLOCKED și oferă recuperarea explicită. Preluarea controlului nu teleportează mașina și nu șterge accidentele.

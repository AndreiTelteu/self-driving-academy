# Interfață cameră și control

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Camera și interfața

HUD implicit: minimap/rută, viteză, mod de control cu text și simbol, tipul sesiunii și următorul obiectiv. ID-ul mașinii și versiunea profilului sunt în detalii la cerere. Rezultatele apar întâi prin acțiune, sunet și reacții scurte; graficele și panourile de analiză rămân opționale. [Reglajele și camera](27-reglaje-hud-si-camera.md) definesc popup-ul cu slidere, first-person și accesibilitatea. Culorile nu sunt singura diferență între moduri.

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
| C | Comutare cameră din spate / first-person din poziția șoferului |
| P | Panou profil și istoric |
| Escape | Pauză și meniu |
| R | Recuperare la ultimul punct valid, după afișarea consecinței |

Hotkey-urile sunt remapabile. Butoanele din HUD oferă echivalente pentru acțiunile importante. Când un câmp de text sau un dialog are focus, tastele nu controlează vehiculul. Meniul de pauză și pierderea focusului opresc simularea single-player; panourile flotei, profilului, misiunilor și KPIs pun simularea pe pauză în MANUAL și LEARNING. În observare autonomă, panoul flotei rămâne live. Închiderea panoului reia simularea și resetează tastele ținute, prevenind o comandă rămasă activă.

## Moduri de control și închiderea intervențiilor

Există cel mult un vehicul sub controlul jucătorului, în MANUAL sau LEARNING. Modul de control, etapa cursei și versiunea profilului sunt stări independente. Un taxi poate fi autonom și în drum spre pickup sau manual și în drum spre dropoff.

[Coordinatorul de autoritate066](control-authority.md) compune controllerul fizic024 prin porturi injectate și păstrează maximum110 identități native și un singur loc PLAYER, fără istoric sau coadă de cereri. Două preluări PLAYER contradictorii în același tick resping întregul batch; eliberarea vehiculului vechi și preluarea celui nou formează o tranziție comună. Comenzile păstrează identitatea vehiculului adresat, iar selecția camerei nu emite implicit o preluare. După acceptarea tick-ului024, coordinatorul publică locul și tick-ul acceptate, apoi curăță sincron inputul vehiculului părăsit. Eșecul callbackului produce o stare terminală explicită; nu anulează fictiv fizica deja executată. Segmentele LEARNING și integrarea flotei rămân responsabilități separate.

[Comenzile de mod067](mode-controls.md) reduc maximum16 intenții M/L ordonate la un singur ticket pregătit pentru tick, apoi afișează numai rezultatul acceptat de066. Tastatura folosește bindings009 și respinge repeat, taste ținute duplicate, câmpuri editabile, dialoguri și input suspendat. HUD-ul actualizează textul la maximum10Hz, separă vehiculul controlat de ținta selectată pentru butoane și respinge un click dacă acea țintă s-a schimbat. Eligibilitatea LEARNING vine dintr-un port sincron explicit, legat de context, identitate și tick; lipsa sau invaliditatea observației afișează indisponibilitatea. MANUAL și AUTO au eligibilitate false. Aceste adaptoare nu deschid segmente și nu execută joburi de învățare; hostul furnizează layout-ul vizual și integrarea sesiunii.

La AUTO → MANUAL/LEARNING, sistemul deschide un segment cu controlMode, learningEligible, poziția, viteza, ruta, contextul, clasa și profilul existente. Comenzile AI încetează la același tick. MANUAL → LEARNING și LEARNING → MANUAL închid segmentul vechi și deschid unul nou fără salt fizic sau gol de input. Numai segmentul LEARNING închis intră în coada estimatorului. La revenirea în AUTO, politica reia starea fizică actuală. Modul MANUAL păstrează telemetria pentru KPI-uri și istoric, cu learningEligible=false; nu poate fi antrenat retroactiv printr-un toggle.

Închiderea este declanșată de revenirea la autonomie, schimbarea mașinii, finalizarea cursei, recuperare sau ieșirea din sesiune. Dacă jucătorul rămâne în MANUAL sau LEARNING după finalizarea unei curse, se deschide un segment nou fără a schimba modul de control. Pauza suspendă segmentul. Un crash de browser păstrează numai datele deja salvate, marcând segmentul incomplet.

Sistemul acceptă și segmente scurte. Un segment LEARNING fără suficiente situații informative produce „Nicio modificare justificată” și nu creează artificial o versiune nouă. Aplicația arată clar momentul în care analiza este în curs și momentul în care flota a adoptat rezultatul.

La revenirea la autonomie în afara unei benzi, politica caută o reintrare fezabilă în graful rutier. Dacă nu există, taxiul este marcat BLOCKED și oferă recuperarea explicită. Preluarea controlului nu teleportează mașina și nu șterge accidentele.

## Afișarea modurilor și a progresului

AUTO arată „Conduce AI-ul”; MANUAL arată „Conduci · învățare oprită”; LEARNING arată „Conduci · orașul învață”. Textul și simbolurile însoțesc culoarea. Tutorialul explică MANUAL înainte de prima demonstrație LEARNING. ANALYZING este starea unui job, nu un al patrulea mod de conducere. La reload se pornește în pauză, cu selecția păstrată și vehiculele în AUTO; reluarea MANUAL/LEARNING cere o acțiune explicită și deschide un segment nou.

Butonul KPIs din panoul flotei și hotkey-ul K sunt disponibile de la început. Pop-up-ul are grafice pentru revenue lunar, rating mediu, curse pe zi și număr de review-uri; arată unitățile, perioada, eșantionul și datele insuficiente. Panoul misiunilor arată cele trei obiective ale zilei, resetarea și XP; profilul jucătorului arată XP și istoricul câștigurilor, fără pierderi sau retrogradare. Focusul, Escape și pauza respectă aceleași reguli ca celelalte panouri.

## Experiențe și acțiuni suplimentare

Academie/Haos se aleg ca sesiuni, fără a înlocui AUTO/MANUAL/LEARNING. Meniul oferă „Reglaje”, „Oraș proaspăt, păstrează stilul”, „Salvează jocul în fișier” și „Încarcă jocul din fișier”. Popup-ul Reglaje pune simularea pe pauză inclusiv în AUTO. Schimbarea sesiunii și resetul au reguli în [modulul 26](26-joaca-libera-haos-si-distrugere.md); confirmarea înlocuirii după verificarea savefile-ului este în [modulul 29](29-savefile-si-integritate.md). Provocările [random](28-provocari-random-si-revenire.md) arată o ofertă discretă și un singur obiectiv activ, fără întreruperea cursei existente.

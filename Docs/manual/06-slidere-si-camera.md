# 6. Slidere, confort și camera first-person

## Pop-up-ul „Reglaje”

Butonul **„Reglaje”** deschide un pop-up cu două taburi:

- **„Cum controlez mașina”** — preferințe de input și confort (șapte slidere).
- **„Cum conduce orașul”** — editorul de stil al flotei (opt slidere). Tabul este opțional în
  compunere: dacă hostul nu injectează editorul de stil, tabul afișează exact placeholder-ul
  **„Indisponibil · 230”**, nu un editor gol sau inventat.

Reguli valabile pentru ambele taburi:

- Deschiderea pune simularea pe pauză **în toate modurile**, inclusiv AUTO, și eliberează comenzile ținute.
- Mișcarea unui slider **nu** schimbă nimic în lume. Scrie doar o citire locală, plafonată la 10 Hz, și o
  singură revizie de draft la eliberare.
- **Aplică** închide pop-up-ul și reia ceasul. Schimbarea se publică o singură dată, la primul tick după
  reluare.
- **Anulează** retrage o aplicare în așteptare și revine la valorile salvate.
- **Revino la valorile inițiale** cere confirmare și propune doar draftul; nu aplică singur.
- Focusul intră în dialog, `Tab`/`Shift+Tab` rămân în interior, `Escape` închide. Panoul nu instalează
  listeneri pe `window`/`document`, deci nu fură tastele de condus.
- La 1280×720 lista de slidere derulează, iar antetul și footerul rămân fixe.

## Tabul „Cum controlez mașina”

Șapte slidere native, cu valoare afișată, capete în cuvinte simple și text pentru cititoarele de ecran
(`aria-valuetext`). Etichetele și capetele sunt exact cele din cod (`src/ui/control-sliders-format.ts`):

| Slider | Interval | Capete | Ce face |
| --- | --- | --- | --- |
| Sensibilitatea direcției | 0–100 | Lină / Directă | cât de repede crește comanda de direcție |
| Revenirea volanului | 0–100 | Lentă / Rapidă | cât de repede revine volanul la neutru |
| Direcție mai calmă la viteză | 0–100 | Puțină / Multă | cât se reduce virajul la viteză mare |
| Accelerație progresivă | 0–100 | Lentă / Rapidă | cât de lin crește accelerația |
| Frânare progresivă | 0–100 | Lentă / Rapidă | cât de lin crește frânarea |
| Mișcarea camerei | 0–100 | Stabilă / Mobilă | cât urmărește camera mișcarea; 0 = stabilă |
| Câmp vizual | 60–100° | Îngust / Larg | FOV în prima persoană |

Presetările sunt **Accesibil**, **Echilibrat** și **Direct**. Valorile 0–100 sunt convenții ale jocului,
nu unități fizice; se mapează monoton în limite calibrate și versionate.

Ce **nu** schimbă aceste slidere:

- nu oferă imunitate și nu schimbă masa, puterea, aderența sau frânarea mecanică a mașinii;
- nu modifică stilul AI; aplicarea directă nu creează dovezi și nu îndeplinește obiective LEARNING;
- nu schimbă legăturile de taste, camera, unitățile, calitatea, scenariul sau clasa vehiculului.

La aplicare, contractul face patru lucruri într-o ordine fixă: crește `input.control.version` cu 1,
salvează `ControlPreferences`, predă valorile filtrului de tastatură pentru acel tick și închide
segmentul curent cu `CONTROL_PREFERENCES_CHANGE`, deschizând unul nou cu versiunea nouă (fără să atingă
`learningEpoch`). Segmentul de telemetrie păstrează versiunea preferințelor, inputul brut și comanda
efectivă, ca estimatorul să nu confunde limita tastaturii cu o oscilație intenționată.

## Tabul „Cum conduce orașul”

Opt slidere peste cheile reale din catalogul de parametri, cu text simplu principal și valoarea secundară:

| Slider | Parametru | Interval afișat |
| --- | --- | --- |
| Ritm pe străzile orașului | `speed_delta_urban` | −28,8…+54 km/h față de limita hărții |
| Plecare de pe loc | `desired_acceleration` | 0,2…6 m/s² |
| Frânare obișnuită | `comfort_deceleration` | 0,3…8 m/s² |
| Distanță în mers | `following_time_headway` | 0,2…5 s |
| Spațiu minim în mers | `following_min_gap` | 0,2…15 m |
| Oprire la roșu | `red_stop_probability` | 0…100% |
| Oprire completă la STOP | `stop_full_probability` | 0…100% |
| Reacție la verde | `green_start_delay` | 0…4 s |

- Conversiile sunt exacte și versionate: km/h ↔ m/s prin 3,6 și % ↔ probabilitate prin 100. Domeniile
  UI coincid cu `min`/`max` din catalog.
- Cheile care nu sunt în mapă rămân vizibile, dezactivate și explicate, cu badge `R` (rezervate).
  Un slider apare doar dacă parametrul este implementat în politică.
- **Aplică** derivează numai diferențele față de versiunea de bază și creează o versiune **imutabilă**
  `MANUAL_TUNING`, cu valori înainte/după în unități SI. Publicarea trece prin bariera de epocă și
  activează versiunea la tick comun pentru taxiuri **și** civili.
- Versiunea nu inventează observații, încredere sau segmente: valoarea apare „Ajustat manual”, cu
  dovezile istorice păstrate separat. Nu creează job de învățare și nu îndeplinește misiuni LEARNING.
- Dacă profilul s-a schimbat între deschidere și aplicare, apare `STALE_BASE` și **Aplică** este blocat;
  „Reîncarcă baza” adoptă explicit noul cap, fără să contopească propunerea.
- Restaurarea dintr-o listă mărginită la **8 versiuni** cere două confirmări și publică o activare nouă,
  fără să editeze versiuni existente.
- LEARNING poate modifica ulterior aceleași chei — UI spune acest lucru, ca să nu pară că reglajul
  manual este permanent.
- Draftul este legat de sesiunea activă (`sessionId`, `worldEpoch`, `playerId`, `profileId`), deci Haos
  nu atinge Academia, iar schimbarea sesiunii îl invalidează.

## Camera first-person

First-person este confirmată ca funcționalitate V1, cu aceste limite reale:

- `C` comută între camera din spate și first-person; preferința se salvează în setările dispozitivului.
- Poziția este la ochiul șoferului, transformată prin poziția completă a mașinii (viraj, ruliu), nu o
  cameră pe capotă. Caroseria exterioară este ascunsă, habitaclul rămâne vizibil.
- Câmpul vizual este reglabil 60–100°. „Mișcarea camerei” la 0 dă o cameră stabilă, fără head-bob
  impus.
- Mouse look are yaw ±110° și pitch ±70°, cu recentrare explicită. Capturarea pointerului se cere printr-o
  acțiune explicită; `Escape`, pierderea focusului și trecerea în background o eliberează.
- Camera nu schimbă autoritatea, regulile sau limitele de preluare a altor mașini.
- **Nu** există personaj controlabil sau mers pe jos în V1. First-person este o cameră, nu o schimbare de
  gameplay.

## Ce nu este încă în regulă

Acestea sunt defecte reale măsurate pe componentele reale din `src/ui`, în Chromium headless, și sunt
raportate ca atare:

- **D4** — cel mai mic text din panoul camerei are **11,52 px** (pragul este 12 px).
- **D5** și **D7** — pop-up-ul KPI are text de **11 px** la 1280×720 și la 1920×1080.
- **D6** și **D8** — patru etichete „fără review-uri” depășesc caseta graficului.
- **D1–D3** apar la zoom 200% pe 640×360, unde lista flotei și notificările ies din viewport; acesta este
  un caz de stres declarat în afara benzii normale.

PBI-ul care a găsit aceste defecte nu avea voie să modifice `src/`, deci ele sunt consemnate cu captură
și pași de reproducere, nu ascunse. Confortul subiectiv și lizibilitatea pentru oameni cer playtest, care
este `NOT_RUN`.

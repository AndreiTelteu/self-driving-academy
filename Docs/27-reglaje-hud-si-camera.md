# Reglaje simple, HUD și cameră

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Cerințe V1 acceptate; mapările și sensibilitățile se calibrează prin prototip.

## Popup de reglaje

Butonul „Reglaje” deschide un popup cu două taburi: „Cum controlez mașina” și „Cum conduce orașul”. Sliderul are nume obișnuit, descriere de o propoziție, valoare, capete explicite și control din tastatură. Aplică, Anulează și Revino la valorile inițiale sunt disponibile. Editarea este draft; mișcarea sliderului nu publică versiuni și nu schimbă fizica live. Popup-ul pune simularea pe pauză în toate modurile, eliberează inputul la închidere și respectă focus/Escape. Resetul tabului afectează doar draftul său.

## Preferințe pentru control și confort

| Etichetă | Domeniu UI propus | Efect |
| --- | --- | --- |
| Sensibilitatea direcției | 0–100 | Rata de creștere a comenzii de direcție |
| Revenirea volanului | Lentă–Rapidă | Viteza revenirii comenzii la neutru |
| Direcție mai calmă la viteză | 0–100 | Atenuarea inputului digital la viteză mare |
| Accelerație progresivă | 0–100 | Rampa comenzii de accelerație |
| Frânare progresivă | 0–100 | Rampa comenzii de frână |
| Mișcarea camerei | 0–100 | Amortizare și intensitatea efectelor; 0 permite cameră stabilă |
| Câmp vizual | 60–100° | FOV de bază al camerei first-person |

ControlPreferences este separat de DrivingProfile și se salvează per jucător. Valorile 0–100 se mapează monoton în limite calibrate/versionate; nu sunt unități fizice. Preseturile Accesibil/Echilibrat/Direct și limitele sliderelor păstrează frânarea, aderența și mecanica aceleiași mașini. Nu oferă imunitate sau schimbări de masă/putere. Aplicarea directă nu schimbă stilul AI; comportamentul efectiv demonstrat ulterior în LEARNING poate furniza dovezi normale.

[025](keyboard-input.md) implementează filtrul și maparea `025-keyboard-v1`, calibrate la reglaje0/50/100 pe sedan/compact. Upgrade-ul mapării provizorii este explicit, iar înlocuirea preferințelor este adresată unui tick. Popup-ul și tranzacțiile sale draft/aplicare/anulare rămân în229; filtrul nu le simulează.

Filtrarea nu mai este o asistență fixă globală. Segmentul de telemetrie păstrează controlPreferencesVersion, inputul brut și comanda efectivă. Schimbarea preferințelor închide segmentul la un tick, aplică setările și începe un segment nou dacă se reia condusul. Estimatorul nu interpretează limita tastaturii drept oscilație intenționată. Se validează extremele reglajelor și cele două clase de vehicul.

## Editarea manuală a stilului comun

| Etichetă | Parametru existent | Afișare / sens |
| --- | --- | --- |
| Ritm pe străzile orașului | speed_delta_urban | −28,8…+54 km/h față de limita hărții; ritm mai lent/mai rapid |
| Plecare de pe loc | desired_acceleration | 0,2…6 m/s²; lină/energică |
| Frânare obișnuită | comfort_deceleration | 0,3…8 m/s²; lină/fermă |
| Distanță în mers | following_time_headway | 0,2…5 s; aproape/departe |
| Spațiu minim în mers | following_min_gap | 0,2…15 m; mic/mare |
| Oprire la roșu | red_stop_probability | 0…100%; rar/mereu |
| Oprire completă la STOP | stop_full_probability | 0…100%; rar/mereu |
| Reacție la verde | green_start_delay | 0…4 s; rapidă/lentă |

Valorile sunt convenții ale jocului, nu recomandări de condus. Conversia km/h↔m/s și %↔probabilitate este exactă; domeniile provin din [catalog](11-catalog-parametri.md). Textul simplu rămâne principal, numărul este secundar. Un slider este disponibil numai dacă parametrul este implementat în politică. M/R și starea dovezilor nu se confundă cu editabilitatea; cheile nesuportate rămân dezactivate și explicate. Nu se adaugă un parametru global ascuns de „agresivitate”.

Aplică validează numai cheile schimbate și creează o versiune imuabilă source=MANUAL_TUNING, cu baseVersionId, valori înainte/după și tuningMapVersion. Nu generează observații, încredere sau mission progress de demonstrație. Dovezile anterioare se păstrează în istoric, dar valoarea suprascrisă apare „Ajustat manual”, nu „Învățat”; schema distinge proveniența valorii de dovezile istorice. Publicarea folosește același tick comun pentru taxiuri/civili și continuitate fizică.

Aplicarea invalidează joburile vechi prin learningEpoch, ca restore/import. Un draft cu baseVersionId depășit cere actualizarea draftului, fără suprascriere tăcută. Anulează și Aplică fără diferențe nu creează versiuni sau bariere. LEARNING ulterior poate modifica din nou cheile reglate; UI spune acest lucru. Restaurarea versiunii precedente anulează reglajul prin activare nouă. În Haos se editează doar copia profilului Haos. Sliderele sunt o cale rapidă de experiment, fără să substituie obiectivele care cer demonstrații reale.

## HUD și feedback

HUD implicit: viteză, rută/minimap, mod de control cu text/simbol și următorul obiectiv. SessionKind este lizibil. ID-ul mașinii, versiunea profilului, parametrii și explicațiile complete sunt disponibile în detalii. Panourile de analiză nu sunt obligatorii pentru condus liber sau provocări. Notificările sunt scurte, deduplicate și plafonate; incidentul sau publicarea profilului are sunet/efect cu alternativă vizuală și volum reglabil.

Instrucțiunile LEARNING arată progres concret, de exemplu „2 din 3 opriri observate”, fără a garanta estimarea din număr dacă dovezile sunt ambigue. „Vezi un exemplu” păstrează contractul milestone-ului 204. Reviews pot include replici scurte amuzante determinate de evenimente reale, fără pop-up care oprește mașina și fără repetarea aceleiași replici la fiecare cursă.

## Cameră first-person confirmată

V1 oferă camera din spate și first-person din poziția șoferului; C comută și preferința se salvează. First-person nu este echivalentă doar cu o cameră pe capotă. Poziția/FOV evită caroseria în câmpul vizual și clippingul la viraje/impact; dacă nu există interior complet, reprezentarea rămâne simplă. Nu presupune personaj controlabil sau mers pe jos. Mouse-ul poate privi în jur cu limită și recenter; inputul este capturat doar după acțiune explicită, iar Escape eliberează capturarea. Sliderele de mișcare și FOV permit confort fără head-bob impus. Camera nu schimbă autoritatea sau regulile și nu limitează preluarea altor mașini.

## Acoperire și verificare

017 implementează cele două camere, 025 filtrarea configurabilă, 073 HUD simplu, 079 feedbackul, 081 preferințele. 229 livrează popup-ul de control și 230 editarea stilului. 235 verifică întregul flux: draft/anulare, profil depășit, analiză în curs, extreme de slider, focus, remapare, 1280×720, tastatură, cameră la impact și reload. Playtestul verifică dacă jucătorul înțelege ce schimbă fiecare tab fără să citească numele tehnice.

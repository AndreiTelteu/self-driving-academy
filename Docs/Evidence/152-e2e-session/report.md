# 152 — test integral de sesiune și progres

Transcript determinist generat de `scripts/run-e2e-session-report.mjs` cu `npm run e2e:session`.
Machine-readable: [report.json](report.json).

Regula oracolului: Fiecare valoare așteptată este contractul livrat (stările 061, tranzițiile 067, închiderea 068, suma 213, cele trei misiuni 211), nu o copie a valorii observate; exportul și restartul se compară prin amprente SHA-256 ale stării.

Seed fix: 152. Două rulări independente produc același transcript; amprenta SHA-256 a
pașilor este `8f8664e167f462703814d40c49539b5f254a933060630d0ac0b0b1aae1e2ae1d`.

## Sesiunea

- sesiune: `session-152-e2e`, jucător `player-152`, profil
  `city-profile-115`;
- flotă: 30 taxiuri și 40 civile;
- drumul modurilor: AUTO → MANUAL → LEARNING → AUTO;
- cursa: TO_PICKUP → PICKUP → TO_DROPOFF → DROPOFF → COMPLETED;
- segmente 005 păstrate: 2;
- tick final: 23.

## Pași

| Pas | Ordine | Titlu | Contract | Verificări | Verdict |
| --- | ---: | --- | --- | ---: | --- |
| S0-new-profile | 0 | Profil nou: o singură versiune de bază pentru toată flota | 109 profile store + 057 fleet registry | 7 | PASS |
| S1-auto | 1 | AUTO: simularea rulează fără autoritate de jucător | 024 + 066 control authority | 4 | PASS |
| S2-ride-begin | 2 | Cursă reală: dispeceratul 060 alocă taxiul, 061 pornește cursa | 059 ride demand + 060 dispatcher + 061 ride FSM | 5 | PASS |
| S3-manual | 3 | MANUAL: jucătorul preia taxiul cursei și deschide intervenția | 067 mode controls + 066 authority + 005 segment | 6 | PASS |
| S4-mid-ride | 4 | La mijlocul cursei: pickup-ul este complet, taxiul rămâne revendicat | 061 ride FSM (tranziții legale) + 005 OPEN | 5 | PASS |
| S5-vehicle-switch | 5 | Schimbarea vehiculului la mijlocul cursei închide explicit intervenția, nu cursa | 068 vehicle selection + 005 VEHICLE_SWITCH + 061 ride FSM | 14 | PASS |
| S6-ride-complete | 6 | Cursa se închide o singură dată după schimbare, cu taxiul eliberat | 061 ride FSM + 060 release | 7 | PASS |
| S7-learning | 7 | LEARNING: segmentul închis produce o versiune activă pentru taxi și civil | 100 + 101 + 102 + 103 + 109 + 110 + 112 | 13 | PASS |
| S8-kpi-daily-xp | 8 | KPI, daily și XP primesc faptele reale ale aceleiași curse și ale aceleiași zile | 209 KPI + 211 daily + 212 daily progress + 213 XP | 15 | PASS |
| S9-export | 9 | Export: profilul flotei și progresul sunt scrise ca documente verificabile | 133 profile export + 215 economy save | 9 | PASS |
| S10-restart | 10 | Restart: exportul este re-citit din text și amprentele coincid | 133 read-back + 215 read-back + 212 restore | 19 | PASS |

Total: 11 pași, 104 verificări,
11 pași PASS, 0 FAIL, overall PASS.

## Profilul și progresul după restart

Exportul 133 și bundle-ul 215 sunt scrise ca text, apoi re-citite dintr-o stare nouă:

| Buclă | Înainte | După | Amprentă |
| --- | --- | --- | --- |
| XP | 200.5 XP, nivel 2, 3 intrări | 200.5 XP, nivel 2, 3 intrări | `876d4783216c46c2d99b75013b2825c2f8cb766bd45e43230ab3398ec542f1bd` |
| Daily | 3 misiuni, 1 recompensată | 3 misiuni, 1 recompensată | `71c2de1c72cc4e13b256c1cfe661f4dfdfa385b3c86eab5f5e15890ad3483a24` |
| KPI | 551 unități minore, 1 recenzii | 551 unități minore, 1 recenzii | `08715908155a5e0d9b0ea44ccd063d38a8f6f4255f85ea620110986050954f33` |
| Flotă | 30 taxiuri + 40 civile pe `segment-152-learning~112` | versiunea activă `segment-152-learning~112` | `df96f5a9f7112271f37d8b2312732874be36f627ca5c6e56293a9058398d4320` |

- profil 133: ACCEPTED, checksum verificat
  true, 5851 unități
  canonice;
- bundle 215: ACCEPTED, checksum verificat
  true, 13362 unități
  canonice;
- checksum-urile versiunilor 109: `fnv1a64:04272752f8b03537`, `fnv1a64:b62f09a0c88905e8`.

## Schimbarea vehiculului la mijlocul cursei

- cursa `id-v1:4:ride18:city:fixture:rides59:id-v1:12:ride-request18:city:fixture:rides8:w:single5:r0000` rămâne a taxiului `id-v1:7:vehicle14:city:115:slice4:TAXI4:0002`;
- camera trece pe `id-v1:7:vehicle14:city:115:slice4:TAXI4:0001`, scaunul devine
  null;
- segmentul `segment-152-1` se închide la tick-ul
  15 cu motivul VEHICLE_SWITCH;
- starea cursei rămâne TO_DROPOFF, tranzițiile rămân
  3, cursa activă rămâne
  1;
- assignment-ul 060 și amprenta călătoriei rămân identice.

## Verificări per pas

### S0-new-profile — Profil nou: o singură versiune de bază pentru toată flota

- `profile versions`: 1 → 1 (EXACT), PASS — un profil nou pornește cu exact o versiune de bază
- `base versions`: 1 → 1 (EXACT), PASS — versiunea de start este BASE, nu o versiune derivată
- `taxis`: 30 → 30 (EXACT), PASS — flota V1 are 30 de taxiuri
- `civilians`: 40 → 40 (EXACT), PASS — traficul civil are 40 de vehicule
- `fleet on base version`: ["city-style-base-115"] → ["city-style-base-115"] (EXACT), PASS — toate taxiurile folosesc versiunea de bază
- `civil on base version`: ["city-style-base-115"] → ["city-style-base-115"] (EXACT), PASS — toate civilele folosesc versiunea de bază
- `initial mode`: "AUTO" → "AUTO" (EXACT), PASS — sesiunea pornește în AUTO, fără scaun de jucător

### S1-auto — AUTO: simularea rulează fără autoritate de jucător

- `auto mode`: "AUTO" → "AUTO" (EXACT), PASS — modul rămâne AUTO
- `auto seat`: null → null (EXACT), PASS — niciun jucător nu deține un vehicul
- `auto segment`: 0 → 0 (EXACT), PASS — AUTO nu deschide segment de intervenție
- `auto tick`: true → true (EXACT), PASS — ceasul fix a avansat

### S2-ride-begin — Cursă reală: dispeceratul 060 alocă taxiul, 061 pornește cursa

- `ride state`: "TO_PICKUP" → "TO_PICKUP" (EXACT), PASS — ASSIGNED deschide cursa în TO_PICKUP
- `ride taxi`: "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" → "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" (EXACT), PASS — cursa aparține taxiului alocat de 060
- `taxi claimed`: "ASSIGNED" → "ASSIGNED" (EXACT), PASS — taxiul este revendicat de cursă
- `camera on ride taxi`: "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" → "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" (EXACT), PASS — camera urmărește taxiul cursei, fără a lua scaunul
- `active rides`: 1 → 1 (EXACT), PASS — exact o cursă activă

### S3-manual — MANUAL: jucătorul preia taxiul cursei și deschide intervenția

- `manual claim`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — tasta M este acceptată la tick-ul următor
- `manual mode`: "MANUAL" → "MANUAL" (EXACT), PASS — HUD și simularea sunt MANUAL
- `manual seat`: "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" → "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" (EXACT), PASS — jucătorul deține taxiul cursei
- `manual seat mode`: "MANUAL" → "MANUAL" (EXACT), PASS — scaunul raportează MANUAL
- `segment open`: "OPEN" → "OPEN" (EXACT), PASS — intervenția este deschisă
- `segment start`: 12 → 12 (EXACT), PASS — segmentul pornește la tick-ul acceptat

### S4-mid-ride — La mijlocul cursei: pickup-ul este complet, taxiul rămâne revendicat

- `mid-ride state`: "TO_DROPOFF" → "TO_DROPOFF" (EXACT), PASS — pasagerul este la bord
- `mid-ride transitions`: 3 → 3 (EXACT), PASS — ASSIGNED + ARRIVED_PICKUP + PICKUP_COMPLETE
- `mid-ride taxi claimed`: "ASSIGNED" → "ASSIGNED" (EXACT), PASS — cursa deține încă taxiul
- `mid-ride segment open`: "OPEN" → "OPEN" (EXACT), PASS — intervenția MANUAL este încă deschisă
- `mid-ride active rides`: 1 → 1 (EXACT), PASS — cursa este activă în momentul schimbării

### S5-vehicle-switch — Schimbarea vehiculului la mijlocul cursei închide explicit intervenția, nu cursa

- `selection accepted`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — 068 acceptă schimbarea la tick-ul următor
- `camera follows switch`: "id-v1:7:vehicle14:city:115:slice4:TAXI4:0001" → "id-v1:7:vehicle14:city:115:slice4:TAXI4:0001" (EXACT), PASS — camera trece pe celălalt taxi
- `seat released`: null → null (EXACT), PASS — scaunul MANUAL este eliberat, nu mutat implicit
- `segment closed explicitly`: "CLOSED" → "CLOSED" (EXACT), PASS — intervenția se închide explicit
- `segment close reason`: "VEHICLE_SWITCH" → "VEHICLE_SWITCH" (EXACT), PASS — motivul este schimbarea vehiculului
- `segment close tick`: 15 → 15 (EXACT), PASS — segmentul se închide la tick-ul acceptat
- `segment retained`: true → true (EXACT), PASS — același segment, cu start și identitate neschimbate
- `ride survives switch`: "TO_DROPOFF" → "TO_DROPOFF" (EXACT), PASS — cursa continuă din aceeași stare
- `ride history intact`: 3 → 3 (EXACT), PASS — schimbarea nu adaugă și nu taie tranziții
- `no orphan ride`: 1 → 1 (EXACT), PASS — cursa rămâne activă, nu orfană
- `ride owner unchanged`: "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" → "id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" (EXACT), PASS — cursa rămâne a taxiului inițial
- `assignment unchanged`: "id-v1:19:dispatch-assignment18:city:fixture:rides59:id-v1:12:ride-request18:city:fixture:rides8:w:single5:r000044:id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" → "id-v1:19:dispatch-assignment18:city:fixture:rides59:id-v1:12:ride-request18:city:fixture:rides8:w:single5:r000044:id-v1:7:vehicle14:city:115:slice4:TAXI4:0002" (EXACT), PASS — claim-ul 060 nu este rescris de cameră
- `trip fingerprint unchanged`: "ride-id-v1:4:ride18:city:fixture:rides59:id-v1:12:ride-request18:city:fixture:rides8:w:single5:r0000" → "ride-id-v1:4:ride18:city:fixture:rides59:id-v1:12:ride-request18:city:fixture:rides8:w:single5:r0000" (EXACT), PASS — identitatea călătoriei rămâne aceeași după schimbare
- `segment history complete`: 1 → 1 (EXACT), PASS — istoricul păstrează fiecare segment închis

### S6-ride-complete — Cursa se închide o singură dată după schimbare, cu taxiul eliberat

- `ride completed`: "COMPLETED" → "COMPLETED" (EXACT), PASS — dropoff-ul închide cursa
- `ride states`: ["TO_PICKUP","PICKUP","TO_DROPOFF","DROPOFF","COMPLETED"] → ["TO_PICKUP","PICKUP","TO_DROPOFF","DROPOFF","COMPLETED"] (EXACT), PASS — traseul 061 este complet, inclusiv după schimbare
- `ride transitions`: 5 → 5 (EXACT), PASS — istoricul cursei are cele cinci tranziții
- `single release`: 1 → 1 (EXACT), PASS — claim-ul este eliberat exact o dată
- `taxi available`: "AVAILABLE" → "AVAILABLE" (EXACT), PASS — taxiul reintră în dispecerat
- `no active rides`: 0 → 0 (EXACT), PASS — nicio cursă orfană nu rămâne activă
- `one completed ride`: 1 → 1 (EXACT), PASS — cursa este numărată o singură dată

### S7-learning — LEARNING: segmentul închis produce o versiune activă pentru taxi și civil

- `learning claim`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — tasta L preia LEARNING pe taxiul selectat
- `learning claim mode`: "LEARNING" → "LEARNING" (EXACT), PASS — modul LEARNING este activ după tasta L
- `learning segment closed`: "RETURN_TO_AUTO" → "RETURN_TO_AUTO" (EXACT), PASS — segmentul se închide la revenirea în AUTO
- `return claim`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — revenirea în AUTO este acceptată
- `return mode`: "AUTO" → "AUTO" (EXACT), PASS — scaunul este eliberat
- `pipeline composition`: true → true (EXACT), PASS — pipeline-ul 112 compune versiunea reală
- `new active version`: true → true (EXACT), PASS — versiunea activă se schimbă după publicare
- `learned value applied`: true → true (ABSOLUTE 1e-12 ratio), PASS — valoarea învățată depășește baza 0,6
- `taxi activation`: {"segment-152-learning~112":30} → {"segment-152-learning~112":30} (EXACT), PASS — toate taxiurile adoptă aceeași versiune
- `civil activation`: {"segment-152-learning~112":40} → {"segment-152-learning~112":40} (EXACT), PASS — toate civilele adoptă aceeași versiune
- `single version in fleet`: 1 → 1 (EXACT), PASS — flota nu rămâne pe două versiuni
- `no hidden override`: 0 → 0 (EXACT), PASS — nicio suprascriere ascunsă de profil per vehicul
- `learning end tick`: true → true (EXACT), PASS — segmentul LEARNING are durată reală

### S8-kpi-daily-xp — KPI, daily și XP primesc faptele reale ale aceleiași curse și ale aceleiași zile

- `kpi settlement`: 1 → 1 (EXACT), PASS — o cursă terminală produce un settlement 209
- `kpi review`: 1 → 1 (EXACT), PASS — pasagerul lasă o recenzie reală
- `kpi revenue`: true → true (RELATIVE 1 minor units), PASS — venitul vine din tariful real, nu dintr-o constantă
- `kpi rating range`: true → true (EXACT), PASS — nota este în intervalul 1–5
- `daily set size`: 3 → 3 (EXACT), PASS — 211 generează exact trei misiuni
- `daily rows`: 3 → 3 (EXACT), PASS — 212 păstrează un rând per misiune
- `daily rewarded`: 1 → 1 (EXACT), PASS — o singură misiune daily este recompensată
- `daily xp`: 100 → 100 (EXACT), PASS — recompensa daily este cea publicată
- `xp balance`: 200.5 → 200.5 (ABSOLUTE 0.000001 XP), PASS — 100 misiune + 100 daily + 0,5 timp activ
- `xp level`: 2 → 2 (EXACT), PASS — nivelul derivat din sold
- `xp entries`: 3 → 3 (EXACT), PASS — o intrare per sursă
- `mission survives`: ["campaign-1-first-taxi"] → ["campaign-1-first-taxi"] (EXACT), PASS — misiunea campaniei este în ledgerul XP
- `daily date survives`: ["2026-11-11"] → ["2026-11-11"] (EXACT), PASS — ziua daily este în ledgerul XP
- `duplicate daily refused`: "DUPLICATE" → "DUPLICATE" (EXACT), PASS — aceeași recompensă daily nu se plătește de două ori
- `duplicate mission refused`: "DUPLICATE" → "DUPLICATE" (EXACT), PASS — același settlement nu se plătește de două ori

### S9-export — Export: profilul flotei și progresul sunt scrise ca documente verificabile

- `profile export`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — 133 acceptă documentul
- `profile checksum`: true → true (EXACT), PASS — SHA-256 peste forma canonică
- `exported versions`: 2 → 2 (EXACT), PASS — versiunea de bază plus cea învățată
- `exported active version`: "segment-152-learning~112" → "segment-152-learning~112" (EXACT), PASS — pointerul activ este versiunea învățată
- `raw telemetry excluded`: false → false (EXACT), PASS — exportul nu publică evenimente brute
- `economy save`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — 215 acceptă bundle-ul
- `economy components`: ["daily","economy","player"] → ["daily","economy","player"] (EXACT), PASS — bundle-ul are cele trei componente
- `component budgets`: true → true (EXACT), PASS — bundle-ul respectă plafonul de 1 MiB
- `fleet active profile`: ["segment-152-learning~112"] → ["segment-152-learning~112"] (EXACT), PASS — întreaga flotă este pe versiunea exportată

### S10-restart — Restart: exportul este re-citit din text și amprentele coincid

- `profile read`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — fișierul se re-citește
- `profile checksum verified`: true → true (EXACT), PASS — checksumul este recalculat la citire
- `economy read`: "ACCEPTED" → "ACCEPTED" (EXACT), PASS — bundle-ul se re-citește
- `economy checksum verified`: true → true (EXACT), PASS — checksumul bundle-ului este recalculat
- `xp balance after restart`: 200.5 → 200.5 (ABSOLUTE 0.000001 XP), PASS — soldul XP este identic
- `xp level after restart`: 2 → 2 (EXACT), PASS — nivelul este identic
- `xp entries after restart`: 3 → 3 (EXACT), PASS — intrările XP sunt identice
- `xp fingerprint`: true → true (EXACT), PASS — amprenta XP înainte/după este aceeași
- `mission after restart`: ["campaign-1-first-taxi"] → ["campaign-1-first-taxi"] (EXACT), PASS — misiunea creditată este în checkpoint
- `daily date after restart`: ["2026-11-11"] → ["2026-11-11"] (EXACT), PASS — ziua daily este în checkpoint
- `daily fingerprint`: true → true (EXACT), PASS — setul daily și recompensa sunt identice
- `daily rewarded after restart`: 1 → 1 (EXACT), PASS — exact o recompensă daily supraviețuiește
- `kpi fingerprint`: true → true (EXACT), PASS — KPI (venit, note, curse) este identic
- `kpi revenue after restart`: 551 → 551 (EXACT), PASS — venitul în unități minore este identic
- `kpi reviews after restart`: 1 → 1 (EXACT), PASS — numărul de recenzii este identic
- `fleet profile after restart`: "segment-152-learning~112" → "segment-152-learning~112" (EXACT), PASS — profilul flotei rămâne versiunea activă exportată
- `fleet categories after restart`: ["segment-152-learning~112"] → ["segment-152-learning~112"] (EXACT), PASS — taxiurile și civilele erau pe aceeași versiune la export
- `intervention history retained`: 2 → 2 (EXACT), PASS — ambele intervenții (MANUAL și LEARNING) sunt în istoric
- `course not lost`: "COMPLETED" → "COMPLETED" (EXACT), PASS — cursa este terminală înainte de export

## Browser

Transcriptul determinist nu pornește un browser. Rularea reală în Chromium, cu profil nou și restart prin reîncărcarea paginii, este proba separată `npm run e2e:session -- --browser`; fără Playwright raportul rămâne explicit neacoperit pe această parte.

Când rulează, proba separată scrie [browser.json](browser.json) și
[browser-session.png](browser-session.png).

## Limitări

- Nivel determinist în Node: fără GPU, renderer Babylon, input uman sau FPS; fizica nativă este „un dublu contorizat, același folosit de testele 068, iar browserul real este o probă separată.
- Segmentele 005 din sesiune au boundary real (start, end, motiv), dar fără eșantioane de telemetrie: harness-ul nu inventează samples și nu pretinde un recorder live.
- Recenzia 209 folosește confortul `null` (fără probe de confort în sesiune), deci nota provine din facturile reale ale cursei, nu dintr-o calibrare de confort.
- Misiunea de campanie creditată este settlement-ul real 116/125 al fixture-ului, nu o misiune jucată în harta din sesiune; daily 211/212 sunt reale pentru ziua aleasă.
- Exportul 133 nu publică telemetrie brută, iar bundle-ul 215 nu conține starea lumii (206); profilul flotei este dovedit prin versiunea activă și histogramele ei.
- Fără browser real, playtestul vizual și senzația de condus rămân ale gate-urilor 153/220/224/235.

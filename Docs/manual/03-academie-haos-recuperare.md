# 3. Academie, Haos și recuperare

## Două sesiuni, trei moduri

Alegerea experienței este o **sesiune**, nu un mod de condus. Etichetele reale sunt:

| Sesiune | Eticheta din cod | Ce este |
| --- | --- | --- |
| `ACADEMY` | „Academie” | lumea cu progres: campanie, misiuni zilnice, XP, ledger economic |
| `CHAOS` | „Joacă liberă / Haos” | lume izolată, pentru condus liber, distrugere și provocări locale |

Ambele sesiuni publică aceleași nouă capabilități — selectarea oricărei mașini existente, condus liber,
AUTO, MANUAL, LEARNING, decor destructibil, reset de lume, restaurare din checkpoint și recorduri — și
aceleași trei moduri de control. Diferența este **ce se contabilizează**, nu ce poți face.

## Cum se izolează Haos

- La prima intrare în Haos, profilul de condus ales este **copiat explicit**: identitate proprie,
  checksum recalculat, proveniență `BASE`, fără segmente sursă. Nu este o referință partajată.
- LEARNING și sliderele de stil din Haos modifică **numai copia**. O reglare în Haos nu schimbă
  valoarea din Academie, iar o versiune nouă produsă în Academie nu schimbă copia.
- În Haos, toate operațiile de progres răspund `ISOLATED` cu codul `SESSION_KIND_ISOLATED`, înainte de a
  atinge proprietarul: ingestia și avansarea zilei, XP de misiune, XP zilnic, XP de timp activ și
  decontarea campaniei. Amprenta combinată a ledgerelor din Academie rămâne identică înainte și după.
- Haos are checkpoint, recorduri și statistici proprii. Nu există **două lumi live simultan**: la
  schimbarea sesiunii se închide segmentul, se salvează un singur checkpoint coerent și se anulează
  joburile lumii părăsite.
- Dacă salvarea eșuează, schimbarea este refuzată (`SAVE_FAILED`): lumea rămâne cea veche, fără epocă
  avansată și fără input eliberat. Reîncercarea comite normal.
- Revenirea în Academie reia checkpointul ei în pauză/AUTO, fără timp sau venit „offline”.

## Ce poate și ce nu poate trece între sesiuni

Sunt permise exact două transferuri, ambele explicite:

1. `PROFILE_COPY` — copierea profilului din Academie în Haos, la prima intrare.
2. `STYLE_COPY` — copierea stilului din Haos în Academie, ca **versiune nouă de profil** validată și cu
   checksum.

Sunt refuzate cu `PROMOTION_REFUSED`: import, export, checkpoint, restaurare și arhivă din Haos în
Academie. Copierea de stil declară literal zero pentru progres, recompense zilnice, XP, recompense de
campanie, checkpointuri, recorduri și deblocări; un câmp de progres strecurat în cerere este refuzat cu
`PROGRESS_TRANSFER_REFUSED`, iar amprenta ledgerelor Academiei rămâne neschimbată.

## `R` — „Deblochează mașina”

Butonul din HUD se numește **„Deblochează mașina”** și are ca tastă implicită `R`.

- Repoziționează **un singur vehicul** — cel controlat — la un punct de recuperare validat și îi
  restabilește mobilitatea.
- Punctul nu este „unde era”, ci un candidat inspectat nativ ca sigur: geometrie, suport și ocupare
  verificate, `colliderCount = 0`. Dacă nu există candidat, răspunsul este `NO_SAFE_POINT` **înainte de
  orice scriere**; dacă apare un collider, `COLLIDER_PRESENT`.
- Nu atinge epocile, profilul, seria economică, checkpointul sau XP. Dovada este o amprentă reală
  înainte/după: soldul rămâne identic, `debits = 0`. Un port care ar retrage XP este refuzat cu
  `XP_WITHDRAWN`.
- **Cu pasager la bord**, cursa sau provocarea activă se încheie **exact o dată** cu
  `RECOVERED_WITH_PASSENGER`, `revenue = 0`, stare terminală. A doua apăsare găsește cursa deja
  încheiată și nu mai închide nimic.
- În Haos, provocarea declară dacă `R` invalidează încercarea; reluarea este disponibilă imediat
  (`ticksWaited = 0`). În Academie nu se promite reluare imediată.
- Ținta „revenire la condus în două secunde” este o **propunere nemăsurată**: raportul declară
  `playtest: NOT_PERFORMED`. Ce este măsurat determinist: recuperarea se comite la aceeași graniță de
  tick, fără muncă în tick-ul de reset.

## „Oraș proaspăt, păstrează stilul” — resetul lumii

- Afișează un dialog scurt: cursele și provocările active se încheie, traficul și decorul se refac,
  stilul rămâne.
- La commit, scrie **întâi checkpointul** (`SCENARIO_RESET`), apoi închide segmentul, invalidează
  joburile lumii vechi cu `WORLD_RESET`, eliberează inputul, închide fiecare activitate o singură dată
  (`revenue = 0`), închide seria economică și deschide o serie nouă (`economyEpoch`), păstrând istoricul.
- Pornește din nou în pauză/AUTO. Profilul, dovezile, XP, misiunile zilnice, recompensele deja acordate
  și misiunile rămân identice; misiunile nu primesc finalizare prin reset (`missionCompletions = 0`), iar
  recompensele nu se acordă (`rewardGrants = 0`).
- Resetul repetat **nu dublează** nimic: douăzeci de reseturi produc douăzeci de checkpointuri, o singură
  închidere de scenă și valori constante pentru corpuri, listeners și joburi.
- Un commit refuzat de stocare răspunde `CHECKPOINT_COMMIT_FAILED`, nu scrie checkpoint, nu avansează
  epoci și nu închide curse; reîncercarea comite exact o dată. Un plan pregătit peste un set de
  activități schimbat este refuzat cu `PLAN_STALE`.
- Replay-ul marchează discontinuitatea cu `WORLD_RESET`.

## „Restaurează stilul”

- Activează o versiune de profil aleasă, în spatele barierei `learningEpoch`, și publică activarea
  pentru taxiuri și civili la tick comun.
- **Nu repară lumea**: nu repornește scena, nu închide curse și nu scrie checkpoint. Este o operație de
  stil, nu o recuperare de vehicul.
- Restaurarea nu inventează dovezi: valorile restaurate apar ca `MANUAL_TUNING` sau ca versiune
  reactivată, cu dovezile lor istorice păstrate separat.

## Decor destructibil și zone de joacă

- Sunt destructibile obiectele ușoare: gard ușor, con, ladă, pubelă, indicator decorativ și mobilier
  stradal — șase arhetipuri.
- **Nu** sunt destructibile clădirile structurale, carosabilul, podurile și infrastructura rutieră
  funcțională. Semnele decorative se disting de STOP/semafor, iar regulile hărții nu dispar dacă lovești
  decorul.
- Stările sunt `INTACT → MOVED → BROKEN`; `BROKEN` este terminal într-o generație și numai resetul sau
  restaurarea îl redeschid.
- Un obiect lovit nu devine „zid invizibil”: reacția asupra mașinii este doar impulsul pe care obiectul
  îl poate prelua. Gardurile și mobilierul deplasate rămân obstacole fizice și sunt raportate
  contextului autonom, din orice poziție.
- Feedbackul combină cedarea vizibilă, sunet specific materialului, puține fragmente și un efect scurt.
- Zonele de joacă sunt derivate din hartă: parcarea de derapaje, rampa și aleea demolării. Aleea
  generează 35 de obiecte, câte unul din fiecare arhetip.
- Plafoane reale: 96 de obiecte/corpuri, un collider per obiect, 192 de fragmente active, adâncime de lanț
  3, cel mult 8 vecini per impact, rază de lanț 2,6 m. Presetul grafic `LOW` reduce **doar** numărul de
  fragmente (1 în loc de 3), niciodată starea, evenimentele sau obstacolele.
- Pragurile de deplasare și rupere sunt marcate în raport `PROVISIONAL_UNCALIBRATED`: sunt propuneri de
  playtest, nu o măsurare.

## Provocări în Haos

- Provocarea de demolare (`challenge-influencer-demolition`) este singurul șablon cu sesiunea `CHAOS`.
  Ea numără obiecte **distincte** în aleea de demolare și nu acordă XP de Academie.
- Dacă o evaluezi în Academie, verdictul este `EXCLUDED` cu motivul `SESSION_NOT_ALLOWED` — nu eșec de
  gameplay.
- Scorul din Haos rămâne record local. Nu există leaderboard competitiv și nu există promisiune de
  recompensă externă.

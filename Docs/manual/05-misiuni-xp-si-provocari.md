# 5. Misiuni zilnice, XP și provocări

## Trei misiuni pe zi, pe ziua reală

- Setul are **exact trei** misiuni, cu ID-uri distincte. Numărul este parte din contract, nu o setare.
- Ziua este **data calendaristică reală** în fusul IANA salvat la crearea profilului (implicit cel al
  browserului). Ora resetării și fusul sunt afișate în panoul „Misiunile zilei”.
- Setul se generează o singură dată pe zi și se salvează. Reload, schimbarea profilului de condus sau o
  deblocare ulterioară **nu** rerandomizează setul. Aceeași zi returnează setul reținut, iar o diferență
  de capabilități este raportată ca `capabilityDrift`, fără să schimbe obiectivele.
- Cel puțin una dintre cele trei este jucabilă în **MANUAL fără learning**. O misiune care cere
  schimbarea stilului spune explicit că cere LEARNING și numește cheia.
- Fereastra zilei este `[început, expirare)`: un eveniment observat cu o milisecundă înainte de expirare
  poate completa obiectivul; exact la expirare este refuzat cu `OUTSIDE_DAY`.
- Zilele ratate **nu** produc seturi restante și **nu** acordă XP offline. Un salt înainte de ceas
  generează doar ziua curentă; un rollback nu reactivează o recompensă deja acordată și nu coboară
  `highestObservedDate`.
- Obiectivele consumă evenimente live idempotente, legate de `sessionId` și `worldEpoch`. Replay-ul,
  experimentele și Haos rulează în altă sesiune, deci nu pot îndeplini daily-ul Academiei.
- Motivele de neîndeplinire sunt afișate explicit: `FOREIGN_SESSION`, `STALE_EPOCH`, `OUTSIDE_DAY`,
  `EXPIRED`, `WINDOW_CLOSED`, `INCIDENT_BUDGET_EXCEEDED`.

## Cum se câștigă XP

XP-ul aparține **progresului jucătorului**, separat de profilul de condus. Un profil nou, o restaurare,
un import de stil sau un reset de lume nu îl resetează.

Sunt exact trei surse de credit:

| Sursă | Valoare | Condiție |
| --- | --- | --- |
| Misiune de campanie | suma autorată de misiune | prima finalizare reală, o singură dată |
| Misiune zilnică | **100 XP** (propunere de calibrare) | o dată per identitate de instanță |
| Timp activ | **1 XP / minut real activ** | fereastră în Academie, cu focus, vizibilă, ne-pauzată, ne-AFK |

Reguli exacte, așa cum sunt în cod:

- 1 XP = 1 000 000 micro-XP. Acumularea este exactă, pe milisecunde întregi: **30 s = 0,5 XP**,
  70 s = 1,166666 XP. Fracțiile nu se rotunjesc, se reportează în fereastra următoare.
- O fereastră de observare mai lungă de **30 000 ms** este refuzată cu `WINDOW_TOO_LONG`; un apelant nu
  poate pretinde că a observat o oră.
- Pragul AFK este **120 000 ms**. O fereastră în pauză, fără focus, în background, AFK sau în alt scope
  este respinsă cu motiv (`PAUSED`, `NOT_FOCUSED`, `BACKGROUND`, `AFK`, `OUTSIDE_ACADEMY`) și **nu**
  produce XP.
- Golul dintre cursor și următoarea fereastră (offline) se numără separat și nu se creditează niciodată.
- **AUTO poate conta** la timpul activ: regula exclude lipsa de prezență, nu modul de condus. Replay-ul,
  experimentele și Haos sunt alt scope și nu acordă XP Academie.
- Nivelul este o funcție pură și monotonă de sold: pragul nivelului `n` este `100 × (n−1) × n / 2`. Deci
  nivel 2 = 100 XP, nivel 3 = 300 XP, nivel 50 = 122 500 XP (nivelul maxim).
- Istoricul este soldul: fiecare intrare are sursa, momentul real, identitatea cauzei, suma și soldul de
  după ea. Un checkpoint cu sold inventat sau cu o intrare falsificată este refuzat.
- Idempotența nu este un al doilea mecanism: identitatea recompensei (misiune, versiune, zi) este cea
  care deduplică. Un duplicat raportează `DUPLICATE` și acordă 0 XP.

## De ce XP-ul nu scade niciodată

Ledgerul are **doar credit**. Nu există operație de debit, penalizare, refund sau reset de XP, iar o sumă
negativă este refuzată la validare. Monotonia este o invariantă a gameplay-ului, nu o promisiune de
marketing.

Cei cinci factori pe care un jucător i-ar putea bănui ca „penalizare” au fost verificați cu amprente
înainte/după pe sold, nivel, intrări și cursorul de contorizare:

| Situație | Ce se întâmplă de fapt | XP |
| --- | --- | --- |
| KPI în scădere (revenue, rating) | feedback de serviciu, grafice mai slabe | neschimbat |
| Incident / accident | review cu notă mică, consecință comercială | neschimbat |
| Misiune eșuată | stare `FAILED` cu motiv închis, fără recompensă | neschimbat |
| Recompensă refuzată | `SKIPPED`, fără plată | neschimbat |
| Zi ratată | fără set restant, fără XP offline | neschimbat |

Dovada nu este „nu au apărut erori”, ci faptul că amprenta este identică. Un credit negativ este refuzat
explicit de validator, nu ignorat. Contoarele de refuz sunt intenționat în afara amprentei: un duplicat
refuzat crește un contor fără să plătească sau să scadă XP.

Singura „pierdere” posibilă este una **explicită și cerută de tine**: încărcarea unui savefile mai vechi
înlocuiește progresul cu valorile acelui fișier, după ce ai văzut sumarul și ai confirmat. Nu este o
penalizare de gameplay, este o înlocuire de sesiune.

## Provocări: oferte scurte, fără penalizare

Catalogul are **12 șabloane** în șase familii: precizie, disciplină, explorare, distrugere controlată,
eficiență și experiment. Sunt exact situațiile din documentul de modul, nu douăsprezece variații de titlu.

- Există **cel mult o ofertă vizibilă** și **o singură instanță activă**. A doua cerere în aceeași
  fereastră este refuzată nominal (`OFFER_ALREADY_ACTIVE`, `INSTANCE_ALREADY_ACTIVE`), niciodată
  suprascrisă.
- Cooldown-ul este un termen în tick-uri simulate: **10 800 tick-uri = trei minute active la 60 Hz**,
  după orice rezultat terminal, inclusiv refuz.
- Istoricul anti-repetiție evită ultimele trei șabloane cât timp există o alternativă și este plafonat.
- Deadline-ul este între 1 și 4 minute și este calculat din durata de referință plus o marjă; înainte de
  ofertă se verifică ruta reală, zonele, vehiculul, evaluatorul și fezabilitatea. Un deadline
  infezabil este refuzat cu `DEADLINE_INFEASIBLE`.
- **Pauza îngheață deadline-ul**: `advance(..., { paused: true })` nu consumă timpul obiectivului.
- Acceptarea cere un taxi liber. Un taxi deja dispecerizat refuză cu `TAXI_ASSIGNED`, unul cu pasager cu
  `PASSENGER_ABOARD`; oferta rămâne deschisă și pasagerul rămâne unde este.
- **Refuzul nu penalizează**: `DECLINED` cu `penalty: 'NONE'`, `xpDelta: 0`, `reputationDelta: 0`,
  `rewardGranted: false`.
- Expirarea produce `FAILED` cu motivul `DEADLINE_EXPIRED`, fără penalizare.
- `R` anulează instanța curentă și pornește una nouă, cu identitate și seed noi, plafonat la **8
  încercări per șablon** (`ATTEMPT_LIMIT`). Resetul orașului și părăsirea sesiunii anulează fără XP.
- Schimbarea mașinii nu duplică instanța sau recompensa: alt taxi produce `BOUND_TO_TAXI`, același taxi
  `UNCHANGED`.
- O setare permite **oprirea ofertelor**: `setOffersEnabled(false)` retractează oferta vizibilă (`EXPIRED`,
  motiv `OFFERS_DISABLED`) și nu atinge o instanță deja activă.

### Recompense, recorduri și reluare

- În Academie, cheia de recompensă este `(familie, zi locală)`: prima reușită a unei familii într-o zi
  poate acorda XP, iar celelalte reușite sunt marcate din ofertă „Record personal, fără XP suplimentar”.
  Un reload, un import, o rerulare sau o livrare duplicată întorc `DUPLICATE` cu `creditedXp: 0`.
- În Haos, un rezultat `COMPLETED` rămâne `xpEligible: false` și primește doar record local
  (`LOCAL_RECORD_ONLY`).
- Recordul este cheiat pe `(templateId, templateVersion)`, deci o revizie nouă de șablon este un rând
  nou. Rangul compară progres, timp relativ al încercării, incidente și calitatea familiei. Un rezultat
  egal este `EQUAL`; unul mai slab este `WORSE` și **nu** scade recordul.
- Reluarea rapidă este definită pentru **eșec**: o provocare `FAILED` primește imediat o instanță nouă,
  cu identitate și seed noi, `xpDelta: 0`. După un succes, „Mai încearcă” este dezactivat cu motivul
  afișat (`NOT_FAILED`), iar o nouă încercare vine din următoarea ofertă. Nu se inventează o tranziție
  care nu există.
- Panoul **„Provocări”** (titlu „Provocări și recorduri”) este read-only: arată premisa, obiectivul,
  recompensa, deadline-ul, incidentele, sesiunea, încercarea activă, ultimul rezultat cu reacția,
  recordurile descoperite și cele trei zilnice. Butoanele `Acceptă`, `Refuză`, `Mai încearcă`,
  `Continuă condusul` trimit intenția hostului; panoul nu le execută singur.
- Reacțiile comice sunt determinate din rezultatul real, au `xpDelta: 0` și `penalty: 'NONE'` și refuză
  promisiunea de upload extern sau de pierdere de XP.

## Ce rămâne nevalidat

- **Retenția nu este măsurată.** Mecanismul există și este testat — ofertă, acceptare, credit, record,
  reluare — dar nu există sesiuni de revenire la 24 h sau 7 zile. Nu vei găsi în joc sau în manual un
  procent de revenire, o rată de retenție sau un număr de jucători.
- **Playtestul uman** (minimum cinci participanți) este `NOT_RUN` cu zero participanți. Fluxurile sunt
  acoperite mecanic, nu jucate de oameni.
- Pragurile de XP, duratele provocărilor și recompensele sunt **propuneri de calibrare**, nu valori
  certificate prin măsurători.

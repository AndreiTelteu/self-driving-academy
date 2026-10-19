# Învățarea stilului

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Estimarea stilului

Fluxul pentru segmente LEARNING eligibile este: validare segment și learningEpoch, etichetare contexte, extragere caracteristici, estimare pe parametri eligibili, verificare a dovezilor, validare în scenarii scurte și compunere a unui delta. Estimatorul rulează în worker; simularea continuă cu profilul existent până când rezultatul poate fi publicat.

Pentru viteza preferată se folosesc ferestre în trafic liber. Pentru distanțe se estimează relația gap ≈ minimumGap + timeHeadway × speed. Separarea celor două valori necesită observații la viteze suficient de variate; la o singură viteză se păstrează parametrul slab identificat. Pentru accelerație și frânare se folosesc statistici robuste din intervale intenționate, normalizate după capacitățile vehiculului.

Pentru roșu și STOP, denominatorul este numărul oportunităților eligibile, nu numărul cadrelor și nici întreaga distanță parcursă. Întârzierea la verde se măsoară de la verde până la plecare doar când vehiculul poate pleca. Pentru acceptarea spațiilor, o manevră reușită oferă o limită observată; un prag exact cere și alegeri între oportunități refuzate și acceptate. Jocul poate furniza scenarii dedicate în misiuni.

Inițial sunt propuse metode statistice explicabile și calibrare locală a politicii în scenarii. Pentru parametrii corelați, sistemul fixează temporar ceilalți și folosește scenarii care îi separă. Nu ajustează toate cele 80 de valori dintr-o singură traiectorie.

### Dovezi și actualizare

Fiecare cheie stochează valoare, număr efectiv de observații, contexte, calitate și incertitudine. „Neobservat” este distinct de zero. Un parametru fără context eligibil rămâne neschimbat.

Propunere de praguri inițiale: trei oportunități distincte pentru o primă estimare de conformare, aproximativ zece secunde de trafic liber pentru viteză, trei episoade și viteze variate pentru urmărire, două plecări neblocate pentru reacția la verde. Sunt praguri de pornire pentru calibrare, nu garanții de învățare. Un eveniment singular poate fi arătat imediat fără să determine singur un obicei stabil.

PBI 093 mapează aceste praguri la dovezi descriptive pe fiecare dintre cele 24 de chei M și deduplică după identitatea oportunității 086 plus occurrence, niciodată după cadre. Read model-ul păstrează parametrii fără context eligibil neschimbați și nu produce valori sau delta; specificația și tabelul complet sunt în [learning-evidence](learning-evidence.md). `READY` indică doar suficiența dovezii pentru un estimator ulterior, nu activare sau învățare.

PBI 094 consumă read model-ul 093 și probe reale de viteză/context 087–089 pentru a produce candidați explicabili la viteză, curbă și apropiere; numai `FREE_TRAFFIC` eligibil poate deveni viteză preferată, iar rezultatul rămâne nepublicat și `estimable=false`. Formula, calitatea și proiecția de verificare sunt în [speed-estimator](speed-estimator.md).

PBI 095 produce candidați longitudinali numai din ferestre complete, intenționate și fără artefacte, folosind raporturile normalizate 089 și reacția măsurată în tick-uri 087; impacturile și limitele mecanice nu devin preferințe. Formula robustă, normalizarea între clase și cazurile neobservate sunt în [acceleration-estimator](acceleration-estimator.md).

PBI 096 separă headway de minimum gap doar cu viteze distincte, păstrează coada oprită în context separat și raportează reziduurile fit-ului; o singură viteză nu identifică interceptul și panta. Formula și motivele de identificare slabă sunt în [following-estimator](following-estimator.md).

PBI 097 folosește denominatorul oportunităților certe 086, exclude oportunitățile RED trunchiate și măsoară reacția GREEN numai la plecări neblocate, între tick-ul de onset și cel de plecare. Formulele și motivele de refuz sunt în [signal-estimator](signal-estimator.md).

PBI 098 folosește STOP-uri certe și fapte de oprire la linie; opririle produse de lider/coadă sunt constrângeri, iar rolling stop-ul este un eșec distinct de oprirea completă. Dwell-ul se convertește din tick-urile măsurate. Acceptarea yield raportează limita inferioară a spațiilor acceptate, ori intervalul dintre cel mai mare refuz și cea mai mică acceptare; detalii în [stop-yield-estimator](stop-yield-estimator.md).

PBI 099 estimează schimbările opționale separat de cele impuse de rută. Manevrele reușite singure dau doar o limită observată; oportunitățile refuzate și acceptate pot delimita intervalul pragului pentru gap și avantaj. Cooldown-ul cere durate măsurate la schimbări opționale; detalii în [lane-estimator](lane-estimator.md).

PBI 100 adaugă stratul de încredere și praguri peste candidații 094–099. `assessEvidenceConfidence`, `summarizeEvidenceQuality` și `assessEstimatorConfidence` transformă read model-ul 093 plus expunerea reală a episoadelor în număr efectiv, stare și incertitudine. Numărul efectiv pliază cadrele aceleiași apariții și episoadele corelate, apoi ponderează expunerea; nu este numărul eșantioanelor la 20 Hz. `UNOBSERVED`, `WEAK`, `ZERO` și `OBSERVED` rămân distincte: un zero observat din dovezi suficiente nu este „fără dovezi”. Contradicțiile dintre episoade produc un interval explicit, iar o contradicție severă păstrează cheia `WEAK` în loc să fie mediată. Rezultatele rămân candidate-only, fără publicare de profil și fără activarea `estimable`; contractul complet este în [evidence-confidence](evidence-confidence.md).

PBI 101 compune estimatele cu profilul curent prin `blendProfileValue` din [profile-blend](profile-blend.md): `newValue = oldValue + learningWeight × (estimate − oldValue)`. Ponderea este produsul dintre calitatea 100, saturația numărului efectiv `E / (E + 4)` și recența exponențială cu timp de înjumătățire de 24 h și podea de 5%, redusă la jumătate pentru contradicție moderată. Pasul este plafonat la 0,6 per actualizare, iar o demonstrație cu mai puțin de două episoade efective la 0,15; repetiția consistentă poate apropia puternic profilul de estimare. `UNOBSERVED` și `WEAK` lasă valoarea neschimbată, `ZERO` este aplicat ca zero real, iar contradicția severă păstrează valoarea și intervalul în loc să le medieze. Regularizarea nu trage stilurile riscante către o valoare de bază sigură și nu șterge un stil extrem susținut de dovezi. Fiecare pas păstrează provenance complet în `history`; rezultatul rămâne nepublicat, fără `LEARNED` și fără schimbări `implemented`/`estimable` în 092.

PBI 102 adaugă poarta numerică `validateCandidateDelta` din [candidate-validation](candidate-validation.md). Fiecare valoare trebuie să fie finită, să aibă o cheie cunoscută, unitatea canonică 092 și să se afle în intervalul 092; cheia trebuie să fie una dintre cele 24 ținte M, iar o cheie R/`extension` este refuzată explicit. Validarea este atomică: orice problemă produce `REJECTED`, `delta: null`, `acceptedKeyCount: 0` și o listă închisă cu cheie, motiv, cale de câmp și valoarea vinovată, deci nu există un delta parțial sau ascuns. Compatibilitatea de versiune/bază/engine respinge cu motiv explicit. Numerele valide dar riscante — coliziuni posibile, încălcări sau stil agresiv — sunt acceptate: nu există gate comportamental. Rezultatul rămâne nepublicat, fără `LEARNED` și fără modificarea flagurilor 092.


Actualizarea propusă este newValue = oldValue + learningWeight × (estimate − oldValue). Ponderea depinde de calitate, numărul efectiv de episoade și incertitudine. Are o limită de calibrare pentru a evita salturi provocate de zgomot; demonstrațiile repetate pot modifica puternic profilul. Această regularizare păstrează și stilurile riscante dacă dovezile sunt consistente.

Istoricul recent primește o pondere mai mare decât demonstrațiile foarte vechi, astfel încât jucătorul să își poată schimba stilul. Jucătorul poate crea un profil nou de la bază și poate restaura versiuni. MANUAL nu produce învățare; în LEARNING analiza și publicarea rămân automate, fără confirmare după fiecare segment. Restaurarea sau schimbarea profilului creează o barieră learningEpoch, conform contractului profilurilor.

Validarea verifică numere finite, intervale, unități, parametri implementați și compatibilitate cu controllerul. Nu respinge o versiune doar pentru că produce încălcări sau coliziuni: acestea pot fi rezultatul urmărit al imitației. Un candidat instabil numeric este respins, iar dovezile și motivul rămân disponibile.

### Rezultatul pentru jucător

După intervenție, panoul arată ce s-a observat, ce s-a modificat și ce a rămas necunoscut. Exemplu ilustrativ, fără date reale: following_time_headway 1.8 s → 1.5 s, din episoade valide; green_start_delay 0.7 s → 0.5 s, din plecări neblocate; stop_full_probability neschimbat, deoarece nu a existat o oportunitate STOP.

Fidelitatea se evaluează în contexte comparabile prin distribuții de viteză, distanțe, accelerații, timpi de reacție și probabilități ale acțiunilor. Copierea inputului tastelor la aceleași momente nu este obiectivul: starea traficului fiecărui taxi este diferită.

## Convenții pentru parametrii corelați

Intervalul de urmărire și minimum gap sunt estimate separat numai când vitezele și episoadele permit identificarea. Pragurile acceptării spațiilor cer și oportunități refuzate sau un experiment dedicat. Reacția la frână și orizontul specific de frânare la roșu folosesc scenarii diferite.

În V2, ponderile rutării au convenție canonică de normalizare; numai raportul lor poate fi observabil din anumite alegeri. Estimatorul explică această constrângere și nu pretinde două valori absolute independente din aceeași alegere. Modificatorii de pasager sunt estimați numai din situații comparabile cu și fără pasager. Valorile neidentificabile rămân neobservate până la date suficiente.

## Efecte economice și validarea cu jucători

Revenue-ul și ratings evaluează consecințele fără să corecteze automat stilul estimat. Un profil agresiv numeric valid poate fi publicat și poate deteriora serviciul, fără pierdere XP sau scădere de nivel. MANUAL poate afecta o cursă fără să modifice stilul orașului. Sliderele de stil sunt o sursă MANUAL_TUNING distinctă de demonstrațiile LEARNING, conform [modulului 27](27-reglaje-hud-si-camera.md).

Prototipul timpuriu validează trei chei înaintea gate-ului complet de 24. Testele sintetice sunt completate prin playtest: jucătorul recunoaște schimbarea, distinge MANUAL de LEARNING și poate indica observația care a susținut delta. Pragurile și criteriile sunt în [milestone](24-milestone-timpuriu-si-contracte.md).

PBI 204 adaugă adaptorul experimental cu trei chei documentat în [early-learning-loop](early-learning-loop.md) și protocolul uman din [early-playtest](early-playtest.md). Blend-ul local nu activează estimabilitatea 092 și nu publică `LEARNED`; MANUAL rămâne fără învățare. Închiderea PBI cere cinci sesiuni reale exportate, fără substituirea lor cu fixture-uri.

## Reglaje și schimbări de lume

Aplicarea unui reglaj de stil invalidează joburile vechi prin learningEpoch și nu inventează dovezi; demonstrațiile eligibile ulterioare pot modifica din nou valorile. ControlPreferences este înregistrat în segment, distinct de profil. Joburile păstrează sessionId/worldEpoch pentru a nu publica peste o lume resetată sau peste sesiunea Academie când au fost lansate în Haos. UI arată observațiile lipsă și exemple reale, fără să promită învățarea driftului sau a distrugerii.

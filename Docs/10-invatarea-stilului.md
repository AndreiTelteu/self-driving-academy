# Învățarea stilului

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## Estimarea stilului

Fluxul propus este: validare segment, etichetare contexte, extragere caracteristici, estimare pe parametri eligibili, verificare a dovezilor, validare în scenarii scurte și compunere a unui delta. Estimatorul rulează în worker; simularea continuă cu profilul existent până când rezultatul poate fi publicat.

Pentru viteza preferată se folosesc ferestre în trafic liber. Pentru distanțe se estimează relația gap ≈ minimumGap + timeHeadway × speed. Separarea celor două valori necesită observații la viteze suficient de variate; la o singură viteză se păstrează parametrul slab identificat. Pentru accelerație și frânare se folosesc statistici robuste din intervale intenționate, normalizate după capacitățile vehiculului.

Pentru roșu și STOP, denominatorul este numărul oportunităților eligibile, nu numărul cadrelor și nici întreaga distanță parcursă. Întârzierea la verde se măsoară de la verde până la plecare doar când vehiculul poate pleca. Pentru acceptarea spațiilor, o manevră reușită oferă o limită observată; un prag exact cere și alegeri între oportunități refuzate și acceptate. Jocul poate furniza scenarii dedicate în misiuni.

Inițial sunt propuse metode statistice explicabile și calibrare locală a politicii în scenarii. Pentru parametrii corelați, sistemul fixează temporar ceilalți și folosește scenarii care îi separă. Nu ajustează toate cele 80 de valori dintr-o singură traiectorie.

### Dovezi și actualizare

Fiecare cheie stochează valoare, număr efectiv de observații, contexte, calitate și incertitudine. „Neobservat” este distinct de zero. Un parametru fără context eligibil rămâne neschimbat.

Propunere de praguri inițiale: trei oportunități distincte pentru o primă estimare de conformare, aproximativ zece secunde de trafic liber pentru viteză, trei episoade și viteze variate pentru urmărire, două plecări neblocate pentru reacția la verde. Sunt praguri de pornire pentru calibrare, nu garanții de învățare. Un eveniment singular poate fi arătat imediat fără să determine singur un obicei stabil.

Actualizarea propusă este newValue = oldValue + learningWeight × (estimate − oldValue). Ponderea depinde de calitate, numărul efectiv de episoade și incertitudine. Are o limită de calibrare pentru a evita salturi provocate de zgomot; demonstrațiile repetate pot modifica puternic profilul. Această regularizare păstrează și stilurile riscante dacă dovezile sunt consistente.

Istoricul recent primește o pondere mai mare decât demonstrațiile foarte vechi, astfel încât jucătorul să își poată schimba stilul. Jucătorul poate crea un profil nou de la bază și poate restaura versiuni. Nu există un lock de învățare activ implicit care ar contrazice aplicarea automată cerută.

Validarea verifică numere finite, intervale, unități, parametri implementați și compatibilitate cu controllerul. Nu respinge o versiune doar pentru că produce încălcări sau coliziuni: acestea pot fi rezultatul urmărit al imitației. Un candidat instabil numeric este respins, iar dovezile și motivul rămân disponibile.

### Rezultatul pentru jucător

După intervenție, panoul arată ce s-a observat, ce s-a modificat și ce a rămas necunoscut. Exemplu ilustrativ, fără date reale: following_time_headway 1.8 s → 1.5 s, din episoade valide; green_start_delay 0.7 s → 0.5 s, din plecări neblocate; stop_full_probability neschimbat, deoarece nu a existat o oportunitate STOP.

Fidelitatea se evaluează în contexte comparabile prin distribuții de viteză, distanțe, accelerații, timpi de reacție și probabilități ale acțiunilor. Copierea inputului tastelor la aceleași momente nu este obiectivul: starea traficului fiecărui taxi este diferită.

## Convenții pentru parametrii corelați

Intervalul de urmărire și minimum gap sunt estimate separat numai când vitezele și episoadele permit identificarea. Pragurile acceptării spațiilor cer și oportunități refuzate sau un experiment dedicat. Reacția la frână și orizontul specific de frânare la roșu folosesc scenarii diferite.

În V2, ponderile rutării au convenție canonică de normalizare; numai raportul lor poate fi observabil din anumite alegeri. Estimatorul explică această constrângere și nu pretinde două valori absolute independente din aceeași alegere. Modificatorii de pasager sunt estimați numai din situații comparabile cu și fără pasager. Valorile neidentificabile rămân neobservate până la date suficiente.

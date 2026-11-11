# Raport 214 — consecințele serviciului fără pierdere de XP

Determinist, fără ceas de perete și fără browser. Contract: `214-kpi-impact-v1`, feedback UI
`214-kpi-impact-feedback-v1`. Consecințele de serviciu sunt citite din read model-ul 209
(`historyScans: 0`), iar planurile de misiune și fidelitate sunt copii ale contractelor 125 și 139.

## Rezumat

- verificări: **16/16**, eșecuri 0, overall PASS;
- sold XP 100.5 → 100.5, nivel 2 → 2 după KPI în scădere, accident și obiectiv eșuat;
- credit negativ refuzat: true (Expected finite number in range); recompensă duplicată 0 XP;
- HUD: 600 tick-uri → 100 citiri, 2 randări, 4 scrieri de plan;
- determinism: 2 rulări, egale true.

## Scenariile cerute

| Scenariu | Venit (SDA) | Rating | Incidente | Review-uri mici |
| --- | --- | --- | --- | --- |
| revenue-up-rating-down | 500 → 1000 (500, UP) | 5 → 2 (-3, DOWN) | 0 (NONE) | 1 |
| revenue-down-rating-up | 1000 → 500 (-500, DOWN) | 2 → 5 (3, UP) | 0 (NONE) | 0 |
| both-down | 1000 → 200 (-800, DOWN) | 5 → 1 (-4, DOWN) | 1 (INCREASED) | 1 |
| steady | 500 → 500 (0, FLAT) | 4 → 4 (0, FLAT) | 0 (NONE) | 0 |
| first-day | 0 → 500 (500, UP) | fără date → 4 (—, UNKNOWN) | 0 (NONE) | 0 |
| no-events | 0 → 0 (0, UNKNOWN) | fără date → fără date (—, UNKNOWN) | 0 (NONE) | 0 |

Scenariul `both-down` scade ambii KPI și raportează 1 incident
real. Prima zi nu are baseline (NO_BASELINE), iar o lume fără evenimente rămâne
NO_EVENT: nu se inventează o comparație.

## Incidentul real și cele trei moduri

O cursă terminală FAILED produsă de ledgerul 209 și review-ul ei real (rating
1) intră în agregat: 1 cursă eșuată,
1 incident, 2 review-uri cu nota 2 sau
mai mică; direcțiile rămân venit UP, rating
DOWN.

| Mod | Rating real | Direcții | Debit XP |
| --- | --- | --- | --- |
| MANUAL | 4 | FLAT/DOWN | 0 |
| LEARNING | 4 | FLAT/DOWN | 0 |
| AUTO | 4 | FLAT/DOWN | 0 |

Aceleași fapte produc același rating în MANUAL, LEARNING și AUTO: 209 nu are termen de mod, deci
modul de control este dovadă în planul de fidelitate, nu o penalizare.

## Invarianta XP

- sold înainte 100.5, după 100.5, nivel 2 → 2 (derivat din sold: 2);
- 2 intrări în ledger, 100 XP din misiunea 125 și fereastra activă de 30000 ms;
- KPI-ul care scade: venit 200, rating 1, accident cu rating 1;
- obiectiv eșuat refuzat de 125: true; credit negativ refuzat explicit: true;
- reset/import de profil: sold 200.5, nivel 2; `profileWrites` 0, `debits` 0.

## Feedbackul și HUD-ul

Cele trei planuri sunt separate: 3. 146 texte
generate au fost verificate față de 5 fragmente interzise
(-xp, pierdere, penalizare, penalty, xp negativ), cu 0 potriviri.
Misiunea eșuată afișează 0 XP, iar livrarea duplicată
0 XP.

HUD-ul primește 600 apeluri (unu per tick) și citește 100 ori
(interval 6 tick-uri = 10 Hz). O singură
schimbare de KPI produce 2 randări și 4 scrieri de plan;
500 tick-uri sunt plafonate și 98 citiri sunt
identice. Reconstrucții de istoric: 0; listeners: 0.

## Verificări

| Rezultat | Verificare |
| --- | --- |
| PASS | the 214 contract is the published read model of the 209 KPI — 214-kpi-impact-v1; historyScans 0; UI 214-kpi-impact-feedback-v1 |
| PASS | revenue up with rating down keeps both facts — venit +500, rating 5 → 2 |
| PASS | revenue down with rating up is the inverse — venit -500, rating 2 → 5 |
| PASS | both KPI fall while the real incident is reported — venit -800, rating 5 → 1, 1 incident, 1 review-uri mici |
| PASS | a steady day is FLAT and a first day has no baseline — flat 0; prima zi NO_BASELINE; fără evenimente NO_EVENT |
| PASS | a real failed ride and its real review reach the consequence — cursă FAILED, review real 1, 1 incident, 2 review-uri mici |
| PASS | MANUAL, LEARNING and AUTO produce the same consequence — rating 4 pentru cele trei moduri, direcții FLAT/DOWN |
| PASS | lower KPI, an accident and a failed objective never lower XP or the level — sold 100.5 → 100.5, nivel 2 → 2, obiectiv eșuat refuzat true |
| PASS | a negative credit is refused explicitly — true: Expected finite number in range; sold neschimbat 100.5 |
| PASS | a duplicate reward grants nothing — prima livrare 100 XP, duplicat 0 XP |
| PASS | a profile reset and import keeps the XP balance and the level — sold 200.5, nivel 2, profileWrites 0, debits 0 |
| PASS | the feedback keeps three separate planes — MISSION / FIDELITY / SERVICE |
| PASS | no consequence message promises a loss of XP — 146 texte verificate, 0 potriviri din 5 fragmente interzise |
| PASS | a failed mission and a duplicate delivery show 0 XP — FAILED 0 XP, REFUSED 0 XP |
| PASS | the HUD reads at 10 Hz and renders once per KPI change — 600 tick-uri: 100 citiri, 2 randări, 500 tick-uri plafonate, interval 6 tick-uri |
| PASS | the HUD writes only the changed plane and owns no listener — 4 scrieri de plan din 2 randări, 0 listeners |

## Limite

Nivel `targeted`: cost UI măsurat structural (citiri, randări, scrieri), fără FPS/GPU pe hardware
real. Feedbackul citește agregatele 209; nu recurge la ledgerul de review-uri și nu inventează motive
individuale de review. HUD-ul este proiectat pentru stratul HUD al hostului, care îl apelează o dată
per tick.

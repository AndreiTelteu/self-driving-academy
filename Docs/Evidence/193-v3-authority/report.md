# 193 — autoritate input la personaj sau mașină

Transcript determinist generat de `scripts/run-v3-authority-report.mjs`; comanda comisă este `npm run authority:report`.
Machine-readable: [report.json](report.json). Contract: `193-input-authority-v1`, tick fix la
60 Hz, context `evidence-193-authority` / epoca
7.

## Sumar

- Scenarii de arbitraj trecute: **13/13**.
- Combinații exhaustive: **256 × 2 = 512 tick-uri**, fiecare cu exact un consumator adresat: **512/512**.
- Tick-uri în care ambele entități ar fi primit comandă non-vidă: **0**.
- Livrări către entitatea inactivă: **0**.
- Tranziții cu taste ținute, fără accelerație la primul tick: **18/18**.
- Focus într-un câmp de text: comandă vidă, personajul nemișcat (0 m).
- Stare serializabilă: 169 B JSON simplu, 6 câmpuri.
- Criteriul 1: **PASS**; criteriul 2: **PASS**; focus: **PASS**; serializare: **PASS**.
- Verdict general: **PASS**.
- Determinism: 2 rulări, identice: **DA**, SHA-256 `9e31131be1109d754939d528961914c26c72942f9ff7ba8544735387c4bad418`.

## Vocabularul contractului

Autoritatea este una dintre `CHARACTER:<id>` și `VEHICLE:<id>`; nu există a treia stare și nu
există autoritate „amestecată”. Acțiunile sunt un vocabular închis de
8 taste: throttle, brake, steerLeft, steerRight, handbrake, signalLeft, signalRight, sprint.
Primele 7 sunt exact `KeyboardDriveAction` din 066
(throttle, brake, steerLeft, steerRight, handbrake, signalLeft, signalRight), deci același binding fizic alimentează ambele
autorități; `sprint` este singura acțiune proprie mersului.

## Scenarii: autoritate → consumator → comandă → verdict

| Scenariu | Descriere | Autoritate | Taste ținute | Consumator | Comandă | Stare | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `character-idle` | Personaj activ, nicio tastă | `CHARACTER:player-character` | — | `CHARACTER` | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | PASS |
| `character-walk` | Personaj activ, accelerație ținută | `CHARACTER:player-character` | throttle | `CHARACTER` | `gait=WALK intensity=1.000 headingRad=0.400000` | activă | PASS |
| `character-run` | Personaj activ, accelerație + sprint | `CHARACTER:player-character` | throttle, sprint | `CHARACTER` | `gait=RUN intensity=1.000 headingRad=0.400000` | activă | PASS |
| `character-turn-right` | Personaj activ, virare dreapta | `CHARACTER:player-character` | throttle, steerRight | `CHARACTER` | `gait=WALK intensity=1.000 headingRad=1.570796` | activă | PASS |
| `character-turn-left` | Personaj activ, virare stânga | `CHARACTER:player-character` | throttle, steerLeft | `CHARACTER` | `gait=WALK intensity=1.000 headingRad=-1.570796` | activă | PASS |
| `character-brake-stops` | Personaj activ, frână fără accelerație | `CHARACTER:player-character` | brake | `CHARACTER` | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | PASS |
| `vehicle-idle` | Vehicul activ, nicio tastă | `VEHICLE:taxi-193` | — | `VEHICLE` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | vidă | PASS |
| `vehicle-throttle-left` | Vehicul activ, accelerație + virare stânga | `VEHICLE:taxi-193` | throttle, steerLeft | `VEHICLE` | `throttle=1.000 brake=0.000 steering=-1.000 handbrake=false signal=OFF` | activă | PASS |
| `vehicle-brake` | Vehicul activ, frână | `VEHICLE:taxi-193` | brake | `VEHICLE` | `throttle=0.000 brake=1.000 steering=0.000 handbrake=false signal=OFF` | activă | PASS |
| `vehicle-handbrake` | Vehicul activ, frână de mână | `VEHICLE:taxi-193` | handbrake | `VEHICLE` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=OFF` | activă | PASS |
| `vehicle-hazard` | Vehicul activ, ambele semnale | `VEHICLE:taxi-193` | signalLeft, signalRight | `VEHICLE` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=HAZARD` | activă | PASS |
| `vehicle-opposite-axes-cancel` | Vehicul activ, accelerație și frână simultan | `VEHICLE:taxi-193` | throttle, brake | `VEHICLE` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | vidă | PASS |
| `focus-text-field` | Tastă peste un câmp de text (legare 066 reală) | `CHARACTER:player-character` | — | `CHARACTER` | `gait=NONE intensity=0.000 headingRad=0.000000` | vidă | PASS |

O comandă „vidă” este `gait=NONE`/intensitate 0 pentru personaj și throttle, brake, steering,
frână de mână și semnal toate pe zero pentru vehicul. Ea este livrată tot entității active, ca să
existe un singur canal cu o singură semantică; entitatea inactivă nu primește nimic, nici măcar vid.

## Criteriul 1 — o singură entitate primește comanda

| Dovadă | Rezultat |
| --- | ---: |
| Combinații de taste per autoritate | 256 |
| Autorități probate | 2 |
| Tick-uri de arbitraj | 512 |
| Tick-uri cu exact un consumator adresat | **512** |
| Livrări către personaj | 256 |
| Livrări către vehicul | 256 |
| Tick-uri cu comandă activă la personaj | 64 |
| Tick-uri cu comandă activă la vehicul | 248 |
| Tick-uri cu comandă vidă | 200 |
| Tick-uri cu comandă non-vidă la ambele entități | **0** |
| Livrări greșite (entitatea inactivă) | **0** |

Livrarea dublă este refuzată explicit, nu ignorată tăcut:

| Încercare | Rezultat |
| --- | --- |
| Livrare către personaj | acceptată (1 livrare) |
| A doua livrare în același tick, către personaj | refuzată `DOUBLE_DELIVERY_REFUSED` |
| A doua livrare în același tick, către vehicul | refuzată `DOUBLE_DELIVERY_REFUSED` |
| Livrare către vehicul când autoritatea este personajul | refuzată `INACTIVE_CONSUMER_REFUSED` |
| Livrare după trecerea la tick-ul următor | refuzată `STALE_RESULT` |
| Contoare de refuz | dublă 2, inactivă 1, învechită 1 |
| Coduri în ordine | `DOUBLE_DELIVERY_REFUSED`, `DOUBLE_DELIVERY_REFUSED`, `INACTIVE_CONSUMER_REFUSED`, `STALE_RESULT` |

## Criteriul 2 — tastele ținute la tranziție

Regula aleasă este **neutralizare până la prima eliberare**: la schimbarea autorității, fiecare
acțiune ținută în acel moment este marcată neutralizată și rămâne inactivă până când sosește o
eliberare reală. O reapăsare fără eliberare (auto-repeat-ul sistemului de operare) nu ridică
neutralizarea; eliberarea urmată de o reapăsare rearmă intenția.

| Direcție | Taste ținute | Înainte de tranziție | Stare | Primul tick după tranziție | Stare | După eliberare + reapăsare | Referință fără tranziție | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHARACTER→VEHICLE | throttle | `gait=WALK intensity=1.000 headingRad=0.400000` | activă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=1.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | `throttle=1.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | PASS |
| CHARACTER→VEHICLE | brake | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=1.000 steering=0.000 handbrake=false signal=OFF` | `throttle=0.000 brake=1.000 steering=0.000 handbrake=false signal=OFF` | PASS |
| CHARACTER→VEHICLE | steerLeft | `gait=NONE intensity=0.000 headingRad=-1.170796` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=-1.000 handbrake=false signal=OFF` | `throttle=0.000 brake=0.000 steering=-1.000 handbrake=false signal=OFF` | PASS |
| CHARACTER→VEHICLE | steerRight | `gait=NONE intensity=0.000 headingRad=1.970796` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=1.000 handbrake=false signal=OFF` | `throttle=0.000 brake=0.000 steering=1.000 handbrake=false signal=OFF` | PASS |
| CHARACTER→VEHICLE | handbrake | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=OFF` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=OFF` | PASS |
| CHARACTER→VEHICLE | signalLeft | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=LEFT` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=LEFT` | PASS |
| CHARACTER→VEHICLE | signalRight | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=RIGHT` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=RIGHT` | PASS |
| CHARACTER→VEHICLE | sprint | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | PASS |
| CHARACTER→VEHICLE | throttle, brake, steerLeft, steerRight, handbrake, signalLeft, signalRight, sprint | `gait=NONE intensity=0.000 headingRad=0.400000` | vidă | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | **vidă** | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=HAZARD` | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=HAZARD` | PASS |
| VEHICLE→CHARACTER | throttle | `throttle=1.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=WALK intensity=1.000 headingRad=0.400000` | `gait=WALK intensity=1.000 headingRad=0.400000` | PASS |
| VEHICLE→CHARACTER | brake | `throttle=0.000 brake=1.000 steering=0.000 handbrake=false signal=OFF` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=0.400000` | `gait=NONE intensity=0.000 headingRad=0.400000` | PASS |
| VEHICLE→CHARACTER | steerLeft | `throttle=0.000 brake=0.000 steering=-1.000 handbrake=false signal=OFF` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=-1.170796` | `gait=NONE intensity=0.000 headingRad=-1.170796` | PASS |
| VEHICLE→CHARACTER | steerRight | `throttle=0.000 brake=0.000 steering=1.000 handbrake=false signal=OFF` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=1.970796` | `gait=NONE intensity=0.000 headingRad=1.970796` | PASS |
| VEHICLE→CHARACTER | handbrake | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=OFF` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=0.400000` | `gait=NONE intensity=0.000 headingRad=0.400000` | PASS |
| VEHICLE→CHARACTER | signalLeft | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=LEFT` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=0.400000` | `gait=NONE intensity=0.000 headingRad=0.400000` | PASS |
| VEHICLE→CHARACTER | signalRight | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=RIGHT` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=0.400000` | `gait=NONE intensity=0.000 headingRad=0.400000` | PASS |
| VEHICLE→CHARACTER | sprint | `throttle=0.000 brake=0.000 steering=0.000 handbrake=false signal=OFF` | vidă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=0.400000` | `gait=NONE intensity=0.000 headingRad=0.400000` | PASS |
| VEHICLE→CHARACTER | throttle, brake, steerLeft, steerRight, handbrake, signalLeft, signalRight, sprint | `throttle=0.000 brake=0.000 steering=0.000 handbrake=true signal=HAZARD` | activă | `gait=NONE intensity=0.000 headingRad=0.400000` | **vidă** | `gait=NONE intensity=0.000 headingRad=0.400000` | `gait=NONE intensity=0.000 headingRad=0.400000` | PASS |

Fiecare rând pornește cu tastele ținute, schimbă autoritatea, rulează primul tick și abia apoi
eliberează și reapasă. Coloana „primul tick după tranziție” este **vidă în toate cele
18 rânduri**, deci o accelerație ținută înainte de tranziție nu
produce comandă. Coloana „după eliberare + reapăsare” este **identică cu referința fără
tranziție** în toate rândurile: aceleași taste produc aceeași comandă, doar că intenția trebuie
reconfirmată printr-o eliberare.

## Focus refolosit din 066

| Dovadă | Rezultat |
| --- | --- |
| Tastă folosită | `KeyW` |
| Focus în câmp de text: taste ținute de arbitraj | **0** |
| Focus în câmp de text: comandă | vidă |
| Focus în câmp de text: distanță parcursă de personaj | **0 m** |
| Focus în câmp de text: `preventDefault` | false |
| După ieșirea din câmp: taste ținute | 1 |
| După ieșirea din câmp: comandă | activă |
| După ieșirea din câmp: distanță parcursă | 0.5401 m |
| Listeneri după dispose | 0 |

## Starea serializabilă pentru 200

| Dovadă | Rezultat |
| --- | --- |
| Câmpuri | `version`, `tick`, `authority`, `held`, `neutralized`, `transitions` |
| Dimensiune JSON | 169 B |
| JSON simplu, fără identitate de obiect | DA |
| Autoritate păstrată | DA |
| Tick păstrat | DA |
| Taste ținute păstrate | DA |
| Taste ținute neutralizate la reluare | DA |
| Primul tick după reluare | vid la `VEHICLE` |
| Stări invalide refuzate | 4/4 |

## Determinism

2 rulări complete, identice;
amprenta SHA-256 a raportului (fără câmpul de determinism) este `9e31131be1109d754939d528961914c26c72942f9ff7ba8544735387c4bad418`.

## Limitări

- Walker-ul 192 are doar mers înainte: axa negativă comandă oprirea, nu mers înapoi. Mersul înapoi și alergarea cu direcție inversă rămân în afara contractului 192.
- Virarea personajului este o direcție absolută derivată din fețarea curentă (±π/2 la capătul barei), nu un model de tanc cu viteză unghiulară proprie; urmărirea unghiului aparține walker-ului (12 rad/s).
- Arbitrajul nu citește tastatura: focusul, dialogurile și câmpurile de text sunt garantate de legarea 066 (`bindKeyboardDriveInput`), al cărei port este exact `arbiter.port`.
- Comutarea autorității este o decizie a compoziției (195 pentru intrarea în mașină, 194 pentru cameră); acest contract oferă tranziția, refuzurile și starea, nu proximitatea.
- Persistarea efectivă și migrarea sesiunilor V3 aparțin PBI 200; aici există doar snapshot-ul explicit, validat și determinist.
- Proba este headless: nu desenează camera third-person și nu măsoară latența percepută a tastelor.

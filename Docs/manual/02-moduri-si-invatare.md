# 2. Cele trei moduri: AUTO, MANUAL, LEARNING

## Ce este un mod de control

Modul de control spune **cine conduce vehiculul selectat**:

| Mod | Simbol | Textul din HUD | Cine conduce |
| --- | --- | --- | --- |
| `AUTO` | `A` | „Conduce AI-ul” | politica autonomă a orașului |
| `MANUAL` | `M` | „Conduci · învățare oprită” | tu, fără nicio învățare |
| `LEARNING` | `L` | „Conduci · orașul învață” | tu, iar orașul poate învăța din segment |

Textul și simbolul însoțesc mereu culoarea, deci modul nu este comunicat doar prin culoare. Modul de
control, etapa cursei și versiunea profilului sunt stări **independente**: un taxi poate fi în AUTO și
în drum spre pickup, sau în MANUAL și în drum spre dropoff.

`MANUAL` și `LEARNING` sunt moduri de condus, nu sesiuni. Ele coexistă cu alegerea Academie/Haos (vezi
[secțiunea 3](03-academie-haos-recuperare.md)); niciun tip de sesiune nu filtrează modurile și niciun
mod nu este ascuns de tipul sesiunii.

## Tranzițiile și tastele

Există exact șase tranziții. Tastele implicite sunt `M` și `L`, ambele remapabile:

| De la | La | Tastă | Ce se închide | Motiv | Ce se deschide |
| --- | --- | --- | --- | --- | --- |
| AUTO | MANUAL | `M` | — | — | segment MANUAL, neeligibil pentru învățare |
| AUTO | LEARNING | `L` | — | — | segment LEARNING, eligibil dacă faptele o permit |
| MANUAL | AUTO | `M` | segment MANUAL | `RETURN_TO_AUTO` | — |
| MANUAL | LEARNING | `L` | segment MANUAL | `MODE_CHANGE` | segment LEARNING |
| LEARNING | AUTO | `M` | segment LEARNING | `RETURN_TO_AUTO` | — |
| LEARNING | MANUAL | `L` | segment LEARNING | `MODE_CHANGE` | segment MANUAL |

Reguli verificate în cod și în dovezile celor trei moduri:

- există **cel mult un scaun `PLAYER`** și cel mult un vehicul condus simultan;
- segmentul vechi se închide și cel nou se deschide **la același tick**, fără gol de input;
- tranziția nu schimbă viteza, direcția sau pasul de poziție și nu teleportează mașina;
- în AUTO nu există scaun de jucător;
- o **selecție** (din listă sau de pe hartă) mută doar camera: vehiculul nou rămâne în AUTO până când
  ceri explicit `M` sau `L`. Selectarea nu preia controlul.

`M` din LEARNING duce în AUTO, nu în MANUAL; `L` din LEARNING duce în MANUAL. Așa se iese dintr-o
intervenție fără să sari peste o stare.

## Ce face MANUAL și ce nu face

- Conduci tu, cu telemetrie reală: viteza, comenzile, ruta, contextul, clasa și profilul existent sunt
  înregistrate.
- Segmentul este marcat `learningEligible = false`. La închidere, pipeline-ul răspunde
  `SKIPPED_MANUAL` cu motivul `MANUAL_SEGMENT_NOT_LEARNABLE`: **zero joburi, zero versiuni de profil,
  niciun parametru modificat**.
- Deci: MANUAL nu antrenează orașul și nu poate fi „convertit retroactiv” în demonstrație.
- Tot ce ține de serviciu rămâne real: cursa poate eșua, pasagerul poate da o notă mică, revenue-ul
  poate scădea. Consecințele sunt comerciale, nu o penalizare de XP (vezi
  [secțiunea 4](04-kpi-si-economie.md)).

## Ce face LEARNING

- Conduci tu, iar segmentul este eligibil dacă faptele reale o permit (context observat, situații
  informative, fereastră validă).
- La închidere, segmentul poate intra în coada de analiză. Rezultatul este un **candidat validat**, nu
  automat o publicare: pipeline-ul decide, iar o versiune nouă de profil se activează pentru taxiuri și
  civili la un tick comun.
- Dacă dovezile nu susțin o schimbare, mesajul este „Nicio modificare justificată”, iar valorile rămân
  neschimbate. Nu se inventează o versiune nouă ca să pară că s-a învățat ceva.
- Notificarea distinge explicit „analiză în curs”, „candidat validat, nepublicat”, „profil publicat”,
  „dovezi lipsă” și eroare. Un rezultat întârziat este marcat `STALE` și nu se aplică.
- În timpul analizei poți continua să conduci; starea `ANALYZING` este o stare de job, nu un al patrulea
  mod.

Limita onestă: pipeline-ul dovedește **că doar sursa corectă ajunge la coadă și la profil** și că
valorile estimate se compun determinist. Nu dovedește că stilul rezultat este „mai bun” sau că
pasagerii vor fi mai mulțumiți — asta ar cere playtest, care este `NOT_RUN`.

## Ce învață orașul, concret

- Se învață **parametri de condus** din segmente LEARNING reale: de exemplu distanța în mers, oprirea
  la roșu, oprirea completă la STOP, reacția la verde, ritmul pe străzi.
- **Nu** se învață cascadorii, distrugerea decorului, driftul sau manevrele de provocare. Acelea sunt
  abilități ale jucătorului și rămân scor local, nu parametri de driving.
- Parametrii fără dovezi suficiente rămân neschimbați și apar în panoul profilului ca „Neobservat”,
  niciodată ca `0`.
- Un profil nou, o restaurare sau un import nu resetează XP, misiunile zilei sau revenue-ul.

## Revenirea în AUTO și continuitatea

- La revenirea la autonomie, politica preia starea fizică actuală, fără teleport și fără să șteargă
  accidentele.
- Dacă mașina a ieșit din bandă și nu există reintrare fezabilă în graful rutier, taxiul este marcat
  BLOCKED și îți oferă recuperarea explicită (vezi `R` în [secțiunea 3](03-academie-haos-recuperare.md)).
- Închiderea unui segment se poate produce și prin schimbarea mașinii, finalizarea cursei, recuperare
  sau ieșirea din sesiune. Dacă rămâi în MANUAL/LEARNING după finalizarea cursei, se deschide un segment
  nou fără să ți se schimbe modul.
- La reload, sesiunea pornește în pauză/AUTO, cu selecția păstrată; reluarea MANUAL/LEARNING cere o
  acțiune explicită și deschide un segment nou.

## XP-ul nu se atinge din moduri

Niciun mod de control nu are o cale către ledgerul de XP. Închiderea unui segment, un accident, o cursă
eșuată sau o notă mică nu retrag XP și nu coboară nivelul. Detaliile și dovezile sunt în
[secțiunea 5](05-misiuni-xp-si-provocari.md).

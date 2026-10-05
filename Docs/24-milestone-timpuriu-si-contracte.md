# Milestone timpuriu și închiderea contractelor

Versiune 0.5 · 4 octombrie 2026. Parte din [planul complet](README.md). Acest modul consemnează corecțiile auditului; nu declară implementări sau playtesturi executate.

## Ordine de validare

PBI 203 stabilește hardware-ul și bugetele după bootstrap/diagnostic și înaintea probei de fizică 021. PBI 155 verifică aceleași bugete la sfârșit, fără a le defini retroactiv după jocul complet. Configurațiile trebuie identificate real la implementarea 203; această revizie nu inventează hardware măsurat.

PBI 204 validează înainte de extinderea cartierului trei chei: speed_delta_urban, desired_acceleration și stop_full_probability. Folosește aceeași fizică, convenții de date, worker și politică; construiește un fixture mic cu 3 taxiuri și 2 civile. Are input/cameră, AUTO/MANUAL/LEARNING, telemetrie și profil versionat minim, fără campanie, dispecerul complet sau gate-ul de 24. Adaptoarele minime au contracte reutilizate de implementarea extinsă; nu se raportează parametri nevalidați ca disponibili.

Arbitrajul 066 depinde de controller/input/evenimente, nu de toate cursele și flota. Registry-ul 092 depinde de contracte și catalog, nu de finalizarea tuturor fixture-urilor de telemetrie. PBI 042 depinde de 204, astfel încât orașul complet nu poate fi început înaintea verificării ideii. PBI 112 integrează pipeline-ul extins fără a aștepta raportul final 108; gate-ul 108 rămâne obligatoriu în suita/release-ul V1. PBI 115 este integrarea extinsă, distinctă de prototipul timpuriu.

## Experiența primei demonstrații

Tutorialul explică selecția fără preluare și diferența dintre MANUAL și LEARNING. Un traseu controlat furnizează oportunitățile necesare, inclusiv cel puțin trei STOP distincte pentru o estimare de conformare. Primul efect recognoscibil are o țintă de playtest propusă de cel mult cinci minute de timp activ, separată de ținta tehnică a duratei estimatorului. Nu se falsifică învățarea dintr-un singur eveniment pentru a obține această țintă.

După publicare, acțiunea „Vezi un exemplu” urmărește un vehicul real aflat într-un context relevant sau deschide un experiment etichetat separat dacă un exemplu live nu este disponibil. Arată observația, cheia modificată, versiunea și consecința; nu mută vehiculul pentru a fabrica dovada. PBI 204 include un playtest cu minimum cinci participanți: fiecare trebuie să distingă cele trei moduri; ținta propusă este ca minimum patru să recunoască schimbarea de stil în două variante și să indice observația care a susținut-o. Se consemnează rezultatele reale și limitările, inclusiv eventualul eșec al țintei, fără a substitui rezultate sintetice.

## Corecțiile auditului

| Problemă | Contract sau corecție | Acoperire PBI |
| --- | --- | --- |
| Demonstrație blocată de catalogul complet | Milestone cu trei chei înainte de cartier | 204, 042, 066, 092, 112, 115 |
| Hardware stabilit la final | Buget timpuriu și verificare finală | 203, 021, 155 |
| Selecție confundată cu preluarea | Selecția schimbă camera; M/L preiau explicit | 068, 067, 217 |
| Civili și contribuția lor nedefinite | LEARNING în orice mașină; stil comun în oraș | 058, 106, 110, 208 |
| yield_time_gap mapat la politica greșită | Politica 052, estimatorul 098 | 052, 098, Validate-Plan.ps1 |
| Restaurare în timpul analizei | Barieră learningEpoch și joburi invalidate | 103, 114, 134, 205 |
| Reluare fără contract al lumii | SessionCheckpoint complet și un singur writer | 127–136, 206, 215 |
| Replay fără înregistrarea AUTO | Recorder pentru întreaga lume, cu retenție | 207, 132, 141 |

Confortul comenzilor și incidentul pasagerului au indicatori separați, utilizați împreună de reviews. Eligibilitatea reacției cere stimuli observabili. XP și economia nu schimbă algoritmul de imitație pe ascuns. Revizia adaugă fidelizare; distribuirea socială nu devine cerință V1 prin aceste corecții.

## Identitatea task-urilor și verificarea planului

Task-urile 203–217 sunt adăugate la V1 fără renumerotarea 001–202. Ordinea se obține din depends_on, nu din sortarea numerică. Un ID mai mic poate depinde de unul nou mai mare, dacă nu există ciclu. Workflow-ul alege cel mai mic ID eligibil. Noile task-uri de implementare rămân To Do în timpul lucrului exclusiv la documentație.

Validate-Plan.ps1 verifică boardul, indexul PBI, linkurile locale, catalogul Markdown/JSON și fiecare legătură politică/estimare/gate. PBI-urile de politică și estimare declară parameter_keys în frontmatter pentru a permite verificarea semantică a matricei. Counts și scope-ul din README-uri se actualizează odată cu backlogul. Gates V1/V2/V3 trebuie să includă toate PBI-urile din etapa lor și etapele anterioare.

## Verificarea performanței încă din prototip

204 folosește 218/219/221 pentru măsurarea fixture-ului timpuriu, fără a cere 220/flota completă. 203 fixează contractul inițial cu baseline desktop real și bugete gameplay provizorii; testul laptopului din 203 este omis prin derogarea explicită din 5 octombrie 2026, fără a valida performanța laptopului; 220 verifică apoi 20–30 de taxiuri și până la 40 civile înainte de campanie și asseturi finale. Aceste dependențe păstrează rolul prototipului devreme. Regresia de semantică și regresia de performanță sunt verificate împreună, conform [modulului 25](25-performanta-contracte-si-benchmark.md).

## Corecțiile de experiență ale reviziei 0.5

Prototipul timpuriu 204 păstrează scope-ul cu trei chei. 225–235 adaugă experiențele acceptate fără a bloca retroactiv fixture-ul. 214 se redefinește pentru feedbackul consecințelor și protejarea XP/nivelului, fără A/B de penalizare. 224 verifică costul noilor sisteme, 235 integrarea și playtestul, iar 162 depinde de 235. Counts, index și matrice includ noile task-uri. Toate rămân în To Do în acest audit de documentație.

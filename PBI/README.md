# Backlog Kanban Self Driving Academy

224 task-uri de implementare cu IDs stabile 001–224. Ordinea de implementare este definită de depends_on; IDs nu mai constituie o ordine topologică numerică. Toate sunt create inițial în To Do. Prefixele rămân stabile la mutarea între coloane.

## Coloane și workflow

- [To Do](<To Do/>): implementare neîncepută.
- [In Progress](<In Progress/>): implementare începută sau blocată.
- [Done](Done/): implementare verificată și fișier mutat fizic.

[AGENTS.md](AGENTS.md) descrie pașii și regula obligatorie de mutare în Done. [Planul modular](../Docs/README.md) și [matricea de acoperire](../Docs/21-acoperire-functionalitati.md) definesc scope-ul.

## Etape

| Etapă | IDs | Număr | Livrabil |
| --- | --- | --- | --- |
| V1 | 001–162 și 203–224 | 184 | Joc PC browser, trei moduri, stil comun taxi/civil, 24 parametri, KPIs, daily, XP, salvare și comparații |
| V2 | 163–190 | 28 | Toți cei 80 de parametri, pietoni, pericole și provocări extinse |
| V3 | 191–202 | 12 | Personaj, mers pe jos și intrare/ieșire din mașini |

Statutul curent se citește din coloana fișierului și frontmatter. Indexul păstrează ID-urile fără statusuri duplicate și fără linkuri către o coloană care s-ar schimba la mutare. Găsește un task prin prefixul său în cele trei coloane.

## Indexul task-urilor

| ID | Task | Modul | Etapă | Dependențe |
| --- | --- | --- | --- | --- |
| 001 | Inițializare proiect TypeScript Vite și Babylon.js | Fundație | V1 | — |
| 002 | Structură modulară și reguli de dependență | Fundație | V1 | 001 |
| 003 | Typecheck lint și convenții de cod | Fundație | V1 | 001 |
| 004 | Infrastructură de teste și scenarii | Fundație | V1 | 001, 002 |
| 005 | Contracte de date și validatoare de runtime | Fundație | V1 | 002 |
| 006 | Identificatori stabili și random determinist | Fundație | V1 | 005 |
| 007 | Evenimente și procesare idempotentă | Fundație | V1 | 005, 006 |
| 008 | Buclă de simulare cu pas fix | Fundație | V1 | 005, 007 |
| 009 | Configurare runtime și preferințe | Fundație | V1 | 005 |
| 010 | Protocol pentru workers și anulare | Fundație | V1 | 005, 006 |
| 011 | Bootstrap Babylon WebGPU și WebGL 2 | Babylon | V1 | 001, 009 |
| 012 | Stările aplicației și lifecycle | Babylon | V1 | 011, 008 |
| 013 | Scenă Babylon și maparea entităților | Babylon | V1 | 011, 005 |
| 014 | Sincronizarea snapshoturilor și interpolare | Babylon | V1 | 013, 008 |
| 015 | Registry asseturi și încărcare GLB | Babylon | V1 | 013 |
| 016 | Materiale lumină și niveluri de calitate | Babylon | V1 | 013, 009 |
| 017 | Camera din spatele mașinii | Babylon | V1 | 014, 009 |
| 018 | Picking și selectarea mașinilor | Babylon | V1 | 013, 017 |
| 019 | Diagnostic Babylon și resurse | Babylon | V1 | 011, 014 |
| 020 | Resize disposal și recuperare GPU | Babylon | V1 | 012, 015, 014 |
| 021 | Prototip Rapier și decizia de fizică | Vehicule și fizică | V1 | 001, 004, 203, 218 |
| 022 | Adaptor fizică și conversii de coordonate | Vehicule și fizică | V1 | 021, 005, 013 |
| 023 | Configurații pentru două clase de mașini | Vehicule și fizică | V1 | 022, 009 |
| 024 | Controller auto și comenzi comune | Vehicule și fizică | V1 | 023, 008 |
| 025 | Input de tastatură și filtrare | Vehicule și fizică | V1 | 024, 009 |
| 026 | Roți suspensie și aderență | Vehicule și fizică | V1 | 024, 014 |
| 027 | Frânare frână de mână și marșarier | Vehicule și fizică | V1 | 024, 025 |
| 028 | Contacte fizice și incidente | Vehicule și fizică | V1 | 022, 007 |
| 029 | Avarie și stare de vehicul blocat | Vehicule și fizică | V1 | 028, 024 |
| 030 | Recuperare la punct valid | Vehicule și fizică | V1 | 029, 007 |
| 031 | Calibrare și paritate manual autonom | Vehicule și fizică | V1 | 026, 027, 028 |
| 032 | Schema hărții și validator semantic | Oraș | V1 | 005, 006 |
| 033 | Graf direcționat de benzi | Oraș | V1 | 032 |
| 034 | Index spațial pentru vecini | Oraș | V1 | 033, 022 |
| 035 | Mișcări și conflicte în intersecții | Oraș | V1 | 033 |
| 036 | Controller de semafoare | Oraș | V1 | 035, 008, 007 |
| 037 | STOP linii și oprire completă | Oraș | V1 | 033, 007 |
| 038 | Priorități și evaluarea spațiilor | Oraș | V1 | 035, 037 |
| 039 | Treceri de pietoni și semantică de pericol | Oraș | V1 | 032 |
| 040 | Zone de pickup dropoff și puncte valide | Oraș | V1 | 033, 030 |
| 041 | Rutare A star și rute valide | Oraș | V1 | 033, 038, 040, 219 |
| 042 | Construirea cartierului în Babylon | Oraș | V1 | 015, 016, 032, 040, 204 |
| 043 | Validarea integrității întregii hărți | Oraș | V1 | 042, 041, 036 |
| 044 | Context rutier pentru fiecare vehicul | Autonomie | V1 | 034, 036, 038 |
| 045 | Mașina de stări comportamentale | Autonomie | V1 | 044, 005, 219 |
| 046 | Ținte de viteză și curbe | Autonomie | V1 | 045, 031 |
| 047 | Control longitudinal accelerație și frânare | Autonomie | V1 | 046, 024 |
| 048 | Urmărirea liderului și distanțe | Autonomie | V1 | 047, 044 |
| 049 | Controller lateral și urmărirea benzii | Autonomie | V1 | 045, 024, 033 |
| 050 | Politica la roșu și verde | Autonomie | V1 | 047, 036, 006 |
| 051 | Politica STOP și opriri incomplete | Autonomie | V1 | 047, 037, 006 |
| 052 | Politica de prioritate și gap acceptat | Autonomie | V1 | 045, 038 |
| 053 | Schimbări de bandă și depășire V1 | Autonomie | V1 | 048, 049, 044 |
| 054 | Blocaje rerutare și reintrare după manual | Autonomie | V1 | 045, 041, 030 |
| 055 | Motive de decizie și observabilitate | Autonomie | V1 | 050, 051, 052, 053, 054 |
| 056 | Suita autonomiei de bază | Autonomie | V1 | 055, 043 |
| 057 | Registry flotă și mașini civile | Flotă și curse | V1 | 056, 023 |
| 058 | Trafic civil cu rute proprii și stilul comun al orașului | Flotă și curse | V1 | 057, 041 |
| 059 | Cereri de curse și program de scenariu | Flotă și curse | V1 | 057, 040, 006 |
| 060 | Dispecerizare după disponibilitate și cost | Flotă și curse | V1 | 059, 041 |
| 061 | Lifecycle cursă și eșecuri | Flotă și curse | V1 | 060, 007 |
| 062 | Pickup cu zonă viteză și staționare | Flotă și curse | V1 | 061, 040, 054 |
| 063 | Dropoff și finalizarea cursei | Flotă și curse | V1 | 062 |
| 064 | ETA și progresul traseului | Flotă și curse | V1 | 063, 041 |
| 065 | Blocaje avarii și reset de scenariu | Flotă și curse | V1 | 058, 063, 029, 064 |
| 066 | Arbitraj de comenzi și autoritate | Control manual | V1 | 024, 025, 007 |
| 067 | Hotkey-uri M/L și cele trei moduri vizibile | Control manual | V1 | 066, 009 |
| 068 | Schimbare rapidă între taxiuri și civile | Control manual | V1 | 067, 018, 017 |
| 069 | Lifecycle de intervenție manuală | Control manual | V1 | 068, 005, 007 |
| 070 | Pauză focus și modalitate de input | Control manual | V1 | 069, 012 |
| 071 | Continuitatea fizică la preluare și revenire | Control manual | V1 | 069, 054, 070 |
| 072 | Cursă completă și intervenție scurtă manuală | Control manual | V1 | 071, 063 |
| 073 | HUD viteză mod taxi și cursă | Interfață | V1 | 072, 009 |
| 074 | Minimap și traseul curent | Interfață | V1 | 073, 043 |
| 075 | Lista taxiurilor filtre și sortare | Interfață | V1 | 073, 057, 064, 068 |
| 076 | Selectarea vehiculelor prin hartă | Interfață | V1 | 074, 068, 058 |
| 077 | Panou profil valori și dovezi | Interfață | V1 | 073 |
| 078 | Istoric și restaurare profil în UI | Interfață | V1 | 077 |
| 079 | Notificări de analiză și publicare | Interfață | V1 | 077, 069 |
| 080 | Remaparea comenzilor și conflicte | Interfață | V1 | 067, 009, 073 |
| 081 | Setări unități cameră grafică și audio | Interfață | V1 | 080, 016, 017 |
| 082 | Tablou oraș și drilldown de evenimente | Interfață | V1 | 073, 028, 061 |
| 083 | Accesibilitate contrast și tastatură | Interfață | V1 | 075, 078, 081, 082 |
| 084 | Layout la rezoluții PC și viewport mic | Interfață | V1 | 083, 074 |
| 085 | Eșantioane manuale și contexte la tick | Telemetrie | V1 | 069, 044, 025 |
| 086 | Oportunități unice și denominatoare | Telemetrie | V1 | 085, 006, 036, 037 |
| 087 | Ferestre eligibile și constrângeri externe | Telemetrie | V1 | 086, 048 |
| 088 | Filtrarea artefactelor și segmente parțiale | Telemetrie | V1 | 087, 030 |
| 089 | Normalizarea după clasa vehiculului | Telemetrie | V1 | 088, 023, 031 |
| 090 | Compactare buffer și finalizare segment | Telemetrie | V1 | 089, 010 |
| 091 | Validator și fixtures pentru demonstrații | Telemetrie | V1 | 090, 004 |
| 092 | Schema celor 80 de parametri și stări de suport | Învățare | V1 | 005 |
| 093 | Eligibilitate și dovezi pe parametru | Învățare | V1 | 092, 091 |
| 094 | Estimator viteză curbe și apropiere | Învățare | V1 | 093, 046 |
| 095 | Estimator accelerație frânare jerk și reacție | Învățare | V1 | 093, 047, 089 |
| 096 | Estimator headway gap și răspuns la lider | Învățare | V1 | 093, 048 |
| 097 | Estimator conformare roșu și reacție verde | Învățare | V1 | 093, 050 |
| 098 | Estimator STOP și acceptare de prioritate | Învățare | V1 | 093, 051, 052 |
| 099 | Estimator schimbare de bandă V1 | Învățare | V1 | 093, 053 |
| 100 | Incertitudine praguri și număr efectiv | Învățare | V1 | 094, 095, 096, 097, 098, 099 |
| 101 | Regularizare adaptare și memorii recente | Învățare | V1 | 100 |
| 102 | Validarea numerică a unui delta | Învățare | V1 | 101, 092 |
| 103 | Estimator în worker cu coadă serială | Învățare | V1 | 102, 010, 221 |
| 104 | Explicația modificărilor și no change | Învățare | V1 | 103, 079 |
| 105 | Validare inversă pe profile cunoscute | Învățare | V1 | 104, 056 |
| 106 | Fidelitate între clase și condus liber | Învățare | V1 | 105, 089 |
| 107 | Regresii pentru intervenții și dovezi | Învățare | V1 | 106, 069 |
| 108 | Validarea celor 24 de parametri învățabili | Învățare | V1 | 107 |
| 109 | Profile imuabile și istoric versionat | Profiluri | V1 | 092, 102 |
| 110 | Activare atomică în întreaga flotă | Profiluri | V1 | 109, 057, 008 |
| 111 | Manevre în curs și profil publicat | Profiluri | V1 | 110, 053, 050, 066 |
| 112 | Integrare intervenție estimator și publicare | Profiluri | V1 | 111, 103, 204 |
| 113 | Conectarea UI la profiluri reale | Profiluri | V1 | 112, 077, 078, 104 |
| 114 | Restaurare și profil nou de la bază | Profiluri | V1 | 113, 205 |
| 115 | Demonstrarea orașului care copiază jucătorul | Profiluri | V1 | 114, 072, 208, 217 |
| 116 | Definiții și lifecycle de misiuni | Misiuni | V1 | 115, 007, 005, 220 |
| 117 | Misiunea primul taxi și tutorialul de control | Misiuni | V1 | 116, 073 |
| 118 | Misiunea prima demonstrație și dovezi | Misiuni | V1 | 117, 112 |
| 119 | Provocarea a două stiluri de urmărire | Misiuni | V1 | 118, 096 |
| 120 | Provocarea STOP roșu și verde | Misiuni | V1 | 118, 097, 098 |
| 121 | Cursa cu obiectiv de confort | Misiuni | V1 | 116, 085 |
| 122 | Misiunea orașul te copiază | Misiuni | V1 | 119, 120, 115 |
| 123 | Misiunea schimbarea unui obicei | Misiuni | V1 | 122, 114 |
| 124 | Provocarea finală de serviciu și incidente | Misiuni | V1 | 123, 121 |
| 125 | Progres recompense și deblocări | Misiuni | V1 | 124 |
| 126 | Panoul misiunilor și obiective live | Misiuni | V1 | 125, 084 |
| 127 | Schema IndexedDB și repository local | Persistență | V1 | 005, 109, 116 |
| 128 | Tranzacții pentru profil și activare | Persistență | V1 | 127, 110 |
| 129 | Salvarea segmentelor și checkpointuri | Persistență | V1 | 127, 090 |
| 130 | Persistența misiunilor și setărilor | Persistență | V1 | 127, 126, 081 |
| 131 | Autosave și închiderea sesiunii | Persistență | V1 | 128, 129, 130, 206, 222 |
| 132 | Retenția datelor și cote locale | Persistență | V1 | 131, 207 |
| 133 | Export JSON de profil | Persistență | V1 | 128 |
| 134 | Import validat și activare de profil | Persistență | V1 | 133, 114, 092 |
| 135 | Export import de sesiune și scenarii | Persistență | V1 | 134, 129, 130, 206 |
| 136 | Migrare și restaurare după restart | Persistență | V1 | 135, 132, 206 |
| 137 | Indicatori de serviciu și expunere | Experimente și indicatori | V1 | 063, 028, 085 |
| 138 | Indicatori de stil și încălcări | Experimente și indicatori | V1 | 137, 086 |
| 139 | Indicatori de confort cu pasager | Experimente și indicatori | V1 | 137, 088, 121 |
| 140 | Snapshot complet pentru experiment | Experimente și indicatori | V1 | 138, 139, 136, 206 |
| 141 | Replay vizual din stări înregistrate | Experimente și indicatori | V1 | 140, 014, 207 |
| 142 | Rerulare din snapshot cu profil ales | Experimente și indicatori | V1 | 140, 114 |
| 143 | Comparație A B cu distribuții și dovezi | Experimente și indicatori | V1 | 142, 138, 139, 082 |
| 144 | Experimente în worker progres și anulare | Experimente și indicatori | V1 | 143, 010, 221 |
| 145 | Asseturi auto roți lumini și LOD | Asseturi și audio | V1 | 015, 023, 014, 220, 223 |
| 146 | Asseturi cartier decor și optimizare | Asseturi și audio | V1 | 042, 015, 220, 223 |
| 147 | Pasageri simplificați și markers | Asseturi și audio | V1 | 062, 063, 015 |
| 148 | Audio motor frâne anvelope și impact | Asseturi și audio | V1 | 145, 028, 009 |
| 149 | Feedback pentru moduri și învățare | Asseturi și audio | V1 | 148, 079, 112 |
| 150 | Manifest și pipeline de asseturi pentru build | Asseturi și audio | V1 | 146, 145, 147, 149 |
| 151 | Suita completă de scenarii V1 | Validare și release | V1 | 115, 126, 136, 143, 150, 216 |
| 152 | Test integral de sesiune și progres | Validare și release | V1 | 151 |
| 153 | QA vizual și accesibilitate V1 | Validare și release | V1 | 152, 084 |
| 154 | Matrice browsere WebGPU și WebGL 2 | Validare și release | V1 | 153, 020 |
| 155 | Verificarea finală a hardware-ului și bugetelor stabilite | Validare și release | V1 | 154, 019, 203, 220, 222, 223 |
| 156 | Benchmark flotă și trafic | Validare și release | V1 | 155, 065, 144 |
| 157 | Optimizare Babylon instanțiere LOD și umbre | Validare și release | V1 | 156, 150, 223 |
| 158 | Optimizare simulare și estimare | Validare și release | V1 | 156, 034, 103, 219, 221, 222 |
| 159 | Sesiune lungă memorie și stabilitatea flotei | Validare și release | V1 | 157, 158 |
| 160 | Build producție CI și livrare statică | Validare și release | V1 | 159, 003, 151, 224 |
| 161 | Instrucțiuni de utilizare și operare | Validare și release | V1 | 160 |
| 162 | Gate și închiderea release-ului V1 | Validare și release | V1 | 161, 154, 152, 108, 039, 076, 141, 216, 217 |
| 163 | Scenarii și telemetrie pentru parametrii V2 | Extindere V2 | V2 | 162, 140 |
| 164 | Pietoni autonomi și traversări | Extindere V2 | V2 | 163, 039, 022 |
| 165 | Pericole obstacole și claxon în scenarii | Extindere V2 | V2 | 164, 024 |
| 166 | Activarea schemelor și suportului V2 | Extindere V2 | V2 | 165, 136, 092 |
| 167 | Politică extinsă pentru viteză și ritm | Parametri V2 | V2 | 166, 046 |
| 168 | Învățare extinsă pentru viteză și ritm | Învățare V2 | V2 | 167, 163 |
| 169 | Politică extinsă pentru accelerație și frânare | Parametri V2 | V2 | 166, 047 |
| 170 | Învățare extinsă pentru accelerație și frânare | Învățare V2 | V2 | 169, 163 |
| 171 | Politică extinsă pentru urmărire și distanțe | Parametri V2 | V2 | 166, 048 |
| 172 | Învățare extinsă pentru urmărire și distanțe | Învățare V2 | V2 | 171, 163 |
| 173 | Politică extinsă pentru semafoare | Parametri V2 | V2 | 166, 050 |
| 174 | Învățare extinsă pentru semafoare | Învățare V2 | V2 | 173, 163 |
| 175 | Politică extinsă pentru stop și prioritate | Parametri V2 | V2 | 166, 051 |
| 176 | Învățare extinsă pentru stop și prioritate | Învățare V2 | V2 | 175, 163 |
| 177 | Politică extinsă pentru schimbare de bandă și depășire | Parametri V2 | V2 | 166, 053 |
| 178 | Învățare extinsă pentru schimbare de bandă și depășire | Învățare V2 | V2 | 177, 163 |
| 179 | Politică extinsă pentru control lateral și viraje | Parametri V2 | V2 | 166, 049 |
| 180 | Învățare extinsă pentru control lateral și viraje | Învățare V2 | V2 | 179, 163 |
| 181 | Politică extinsă pentru trasee și recuperare | Parametri V2 | V2 | 166, 041 |
| 182 | Învățare extinsă pentru trasee și recuperare | Învățare V2 | V2 | 181, 163 |
| 183 | Politică extinsă pentru pietoni și pericole | Parametri V2 | V2 | 166, 052 |
| 184 | Învățare extinsă pentru pietoni și pericole | Învățare V2 | V2 | 183, 163 |
| 185 | Politică extinsă pentru pickup și confortul pasagerilor | Parametri V2 | V2 | 166, 062 |
| 186 | Învățare extinsă pentru pickup și confortul pasagerilor | Învățare V2 | V2 | 185, 163 |
| 187 | Validarea tuturor celor 80 de parametri | Validare V2 | V2 | 168, 170, 172, 174, 176, 178, 180, 182, 184, 186 |
| 188 | Provocări pentru comportamentele extinse | Misiuni V2 | V2 | 187, 125 |
| 189 | Regresii compatibilitate și performanță V2 | Validare V2 | V2 | 188, 187 |
| 190 | Închiderea release-ului V2 | Release V2 | V2 | 189 |
| 191 | Personaj animații și reprezentare | Mers pe jos V3 | V3 | 190, 150 |
| 192 | Controller fizic pentru mers pe jos | Mers pe jos V3 | V3 | 191, 022 |
| 193 | Autoritate input la personaj sau mașină | Mers pe jos V3 | V3 | 192, 066, 080 |
| 194 | Cameră third person pentru personaj | Mers pe jos V3 | V3 | 193, 017 |
| 195 | Intrarea în orice mașină din proximitate | Mers pe jos V3 | V3 | 194, 068 |
| 196 | Ieșirea din mașină și punct valid | Mers pe jos V3 | V3 | 195, 040 |
| 197 | Schimbare rapidă taxi și revenire la mers | Mers pe jos V3 | V3 | 196, 075 |
| 198 | Intervenții și telemetrie cu personaj | Mers pe jos V3 | V3 | 197, 069 |
| 199 | Tutorial și misiuni pentru mers și vehicule | Mers pe jos V3 | V3 | 198, 188 |
| 200 | Salvarea personajului și migrare V3 | Mers pe jos V3 | V3 | 199, 136 |
| 201 | Validare integrală V3 | Mers pe jos V3 | V3 | 200, 189 |
| 202 | Închiderea release-ului complet cu mers pe jos | Mers pe jos V3 | V3 | 201 |
| 203 | Hardware de referință înainte de fizică și oraș | Fundație | V1 | 001, 004, 019 |
| 204 | Prototip timpuriu cu trei parametri și oraș care imită | Produs | V1 | 010, 017, 031, 033, 046, 049, 051, 066, 069, 085, 092, 203, 218, 219, 221 |
| 205 | Barieră pentru learning la restore import și profil nou | Profiluri | V1 | 103, 109, 110, 069 |
| 206 | Checkpoint complet și reluare coerentă a lumii | Persistență | V1 | 127, 128, 129, 065, 008, 010, 221 |
| 207 | Recorder pentru replay taxiuri civile și incidente AUTO | Experimente | V1 | 014, 065, 028, 007, 206, 221 |
| 208 | Propagarea stilului către taxiuri și civili | Autonomie | V1 | 110, 111, 058, 106 |
| 209 | Revenue-ul flotei și review-uri ale curselor 0–5 | Economie | V1 | 063, 065, 137, 139, 208 |
| 210 | Buton KPIs și grafice istorice ale flotei | UI | V1 | 209, 075, 082, 084 |
| 211 | Trei misiuni noi pe zi și calendar stabil | Misiuni | V1 | 116, 117, 006, 009, 209 |
| 212 | Progres și interfață pentru misiunile zilei | Misiuni | V1 | 211, 126, 063, 209 |
| 213 | XP din misiuni și timp activ al jucătorului | Progres | V1 | 212, 125, 008, 009, 209 |
| 214 | Atribuirea impactului intervenției și penalizarea XP | Progres | V1 | 213, 144, 209, 206, 207, 221, 222 |
| 215 | Persistență pentru KPI-uri misiuni zilnice și XP | Persistență | V1 | 214, 210, 212, 131, 136 |
| 216 | Regresii V1 pentru moduri KPI-uri daily și XP | Validare | V1 | 215, 141, 108, 208, 217, 205 |
| 217 | Integrare AUTO MANUAL și LEARNING fără învățare accidentală | Control manual | V1 | 067, 069, 085, 112, 073, 080 |
| 218 | Harness și rapoarte versionate de performanță | Fundație | V1 | 004, 019, 203, 008 |
| 219 | Scheduler de simulare și protecție la suprasarcină | Fundație | V1 | 008, 010, 044, 218 |
| 220 | Gate de performanță al flotei înainte de campanie și asseturi | Validare | V1 | 115, 065, 218, 219 |
| 221 | Buget comun priorități și backpressure pentru workers | Fundație | V1 | 010, 203, 218 |
| 222 | Pipeline plafonat pentru recorder checkpoint și autosave | Persistență | V1 | 090, 206, 207, 221, 218 |
| 223 | Bugete de asseturi randare și calitate adaptivă | Babylon | V1 | 015, 016, 018, 203, 218 |
| 224 | Gate de regresii performanță CI și soak complet | Validare | V1 | 159, 220, 221, 222, 223, 218 |

## Verificarea consistenței planului

Rulează Validate-Board.ps1 pentru coloane/metadate/dependențe și Validate-Plan.ps1 pentru index, catalog, matrice și linkuri. Test-Validate-Plan.ps1 verifică detectarea regresiilor pe o copie temporară izolată. Noile IDs 203–224 aparțin V1 și sunt prerequisite ale unor task-uri cu IDs mai mici; se respectă graful, fără renumerotare. Lucrul la documentație nu finalizează aceste task-uri.

## Revizia 0.4: verificări de performanță

218–224 și actualizările PBI existente implementează [contractul progresiv](../Docs/25-performanta-contracte-si-benchmark.md). performance_checks marchează probele necesare. Gate-ul 220 precede campania/asseturile finale; 224 precede livrarea. Noile task-uri sunt în To Do, fără rezultate de benchmark inventate.

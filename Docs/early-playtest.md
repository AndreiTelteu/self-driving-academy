# Protocol de playtest timpuriu 204

Pagina interactivă este `tests/browser/early-learning-playtest.html` și este servită direct de Vite, fără build. Ea înlocuiește vechiul formular pasiv: participantul conduce un taxi, iar la finalul segmentului LEARNING pagina rulează lanțul real 085-style → 093 → 094/095/098 → `composeEarlyLoopProfile` → `compileEarlyLoopControllerProfiles` și comută aceeași mașină pe AUTO.

Status: pagina și self-testul de developer au fost executate pe 19 octombrie 2026. **Nu există încă niciun participant real.** `Docs/Evidence/204-early-learning-demo/playtest/` rămâne gol până la colectarea celor cinci sesiuni. Rezultatul self-testului este în `playtest-dev/` și este etichetat explicit „developer self-test, not a participant”.

## Ce este real și ce este simplificat

Real:

- inputul de tastatură trece prin filtrul și binding-urile 025 (`createKeyboardFilter`, `bindKeyboardDriveInput`);
- fiecare tick este înregistrat ca eșantion 085-style (comandă, viteză, accelerație, distanță la linia STOP, identitate de segment, mod);
- faptele sunt citite de registrul descriptiv 093 și de estimatorii 094 (viteză), 095 (accelerație) și 098 (STOP);
- profilul este compus de `composeEarlyLoopProfile` cu plafonul `25% × quality` și compilat de `compileEarlyLoopControllerProfiles` prin validatorii 046/047/051;
- în AUTO, decizia STOP este luată de `evaluateStopPolicy` (051) cu probabilitatea învățată; viteza și accelerația folosesc valorile compilate 046/047;
- MANUAL înregistrează comenzile pentru afișare, dar nu creează dovezi, candidați, delta sau tokenuri.

Simplificat, documentat:

- drumul este o linie dreaptă de 12 km cu linii STOP la fiecare 180 m;
- mașina conduce cu un integrator cinematic longitudinal/lateral, nu cu Rapier;
- celelalte trei taxiuri și două civile sunt actori vizuali, fără coliziuni sau trafic emergent;
- AUTO consumă valorile compilate direct; nu rulează stiva completă 044/045 de context rutier;
- faptele 085 sunt un subset adaptat din eșantioanele paginii, nu ieșirea recorderului de producție 069/085.

Niciuna dintre aceste simplificări nu schimbă lanțul de învățare sau dovada că MANUAL nu învață. Ele limitează ce se poate concluziona despre jocul complet.

## Rulare

Din rădăcina worktree-ului:

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Apoi deschideți:

```text
http://127.0.0.1:5173/tests/browser/early-learning-playtest.html
```

Nu rulați `npm ci`/`npm install` în worktree: `node_modules` este o joncțiune către checkout-ul principal. Prima pornire poate dura câteva minute pentru optimizarea dependențelor Vite; următoarele sunt rapide. Opriți serverul cu `Ctrl+C` după sesiuni.

Cerințe: Node 24.21.0, npm 11.19.0, un browser desktop cu WebGL2 sau WebGPU. Dacă backend-ul automat eșuează, pagina afișează eroarea în loc să pretindă că a rulat.

## Comenzi și comportament

| Tastă | Acțiune |
| --- | --- |
| `W` | accelerație |
| `S` | frână |
| `A` / `D` | direcție stânga/dreapta |
| `Space` | frână de mână |

Țineți focusul pe scenă (click pe canvas). Selecturile și butoanele blochează intenționat tastatura de condus.

Pagina are două moduri, alese înainte de start:

- **LEARNING**: conduceți maximum 5:00. La 5:00, sau când apăsați „Termină și arată rezultatul”, pagina închide segmentul, rulează lanțul real și comută mașina pe AUTO cu stilul învățat.
- **MANUAL**: conduceți la fel, dar la final panoul arată zero episoade de dovezi, delta maxim 0, profil neschimbat și tokenuri LEARNING `null`.

Butonul „Termină” este pentru abandonarea timpurie a unei sesiuni de cercetare. Pentru protocolul cu participanți, lăsați cronometrul să ajungă la 05:00, ca toți participanții să aibă aceeași fereastră.

## Ce trebuie să facă participantul

Fără să i se spună ce valori urmărește pagina:

1. Accelereze de cel puțin trei ori de la oprire, natural, cum ar conduce în oraș.
2. Mențină o viteză stabilă în trafic liber cel puțin 10 secunde (o fereastră de viteză).
3. Oprească complet la cel puțin trei linii albe STOP și staționeze scurt înainte de a pleca.
4. După comutarea pe AUTO, urmărească aceeași mașină și spună dacă observă o schimbare de stil.

Contoarele din panoul lateral arată câte ferestre/episoade s-au strâns. Nu sunt răspunsuri și nu garantează un candidat: dacă dovezile nu sunt `READY`, cheia rămâne neschimbată cu motivul afișat.

## Protocolul celor cinci sesiuni

Fiecare participant primește un singur slot anonim, 1–5. Nu se colectează nume, vârstă, contact sau alte date identificabile. Folosiți o fereastră incognito; pagina nu depinde de `localStorage`.

1. Deschideți pagina, alegeți slotul liber și modul **LEARNING**, apoi „Începe sesiunea”.
2. Lăsați participantul să conducă până la 05:00. Observatorul nu sugerează ce ar trebui să observe și nu apasă „Termină” înainte de 05:00 decât dacă sesiunea trebuie abandonată.
3. La apariția panoului, notați: durata, ferestrele de viteză, episoadele de accelerație, apropierile STOP, opririle complete/rolling, cele trei valori înainte/după și motivul fiecărei chei neschimbate. Nu completați un efect pe care pagina nu l-a raportat.
4. Puneți întrebările din formular. Participantul alege singur; nu există răspunsuri preselectate. Textul liber este opțional.
5. Apăsați „Exportă JSON” și salvați fișierul ca `participant-N.json` în `Docs/Evidence/204-early-learning-demo/playtest/` (numai după o sesiune reală). Verificați că nu a intrat text identificabil în câmpul liber; dacă da, eliminați-l înainte de salvare.
6. Demonstrația MANUAL: după export, reîncărcați pagina, alegeți **MANUAL** și lăsați participantul să conducă 60–90 de secunde. Panoul final trebuie să arate zero dovezi, delta 0, profil neschimbat și tokenuri `null`. Această demonstrație nu se salvează ca înregistrare de participant; ea servește doar la întrebarea „ați putea distinge MANUAL de LEARNING?”.
7. Închideți fereastra incognito. Nu păstrați în browser numele participantului.

Ținta propusă de modulul 24: minimum patru din cinci participanți recunosc schimbarea de stil și indică observația care a susținut-o. Dacă ținta nu este atinsă, se raportează eșecul, nu se înlocuiește cu date sintetice.

### Fișa de sesiune (se completează numai cu date reale)

| Slot | Data | Mod | Durată | Chei schimbate | A observat? | Distinge modurile? | Observație invocată | Fișier |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| 1 |  | LEARNING |  |  |  |  |  | `participant-1.json` |
| 2 |  | LEARNING |  |  |  |  |  | `participant-2.json` |
| 3 |  | LEARNING |  |  |  |  |  | `participant-3.json` |
| 4 |  | LEARNING |  |  |  |  |  | `participant-4.json` |
| 5 |  | LEARNING |  |  |  |  |  | `participant-5.json` |

## Formularul și exportul

Formularul are patru câmpuri, toate goale la început:

- `noticedChange`: `yes` / `no` / `uncertain` — a observat schimbarea după AUTO;
- `distinguishesModes`: `yes` / `no` / `uncertain` — ar putea distinge MANUAL de LEARNING;
- `supportingObservation`: `speed` / `acceleration` / `stop` / `none` / `other` — ce observație susține delta;
- `freeText`: text liber opțional.

Exportul `204-playtest-v2` este auto-conținut și conține: schema, eticheta (`participant slot N` sau `developer self-test, not a participant`), slotul, modul, timestamp-urile de start/final, durata, `firstVisibleChangeSeconds`, răspunsurile, rezumatul observat, cele trei chei înainte/candidat/după/delta/qualitate/motiv, cele 77 de chei din afara suprafeței, dovada MANUAL (dacă e cazul), profilul înainte/după și o urmă de 10 Hz (fiecare al 6-lea tick). Nu conține nume, adresă, user-agent sau istoric de browser.

Exportul nu este încărcat nicăieri. Fișierul este descărcat local de browser.

## Self-testul de developer

Self-testul este o sesiune separată, etichetată, în care developerul conduce cu evenimente de tastatură sintetice. Nu este participant și nu se află în `playtest/`.

- Pagina se deschide cu `?selftest=1`; opțiunea „Self-test developer (nu este participant)” devine vizibilă în selectorul de slot.
- Scriptul de self-test apasă `W`/`S` prin `KeyboardEvent` sintetice, folosind același binding 025; dacă documentul nu are focus, hook-ul raportează numărul de fallback-uri directe în loc să pretindă că evenimentul a fost acceptat.
- Rezultatul executat și comenzile sunt în `Docs/Evidence/204-early-learning-demo/playtest-dev/`.

Pentru a repeta manual self-testul: deschideți `http://127.0.0.1:5173/tests/browser/early-learning-playtest.html?selftest=1`, alegeți slotul de self-test și LEARNING, apoi, din consola DevTools, `window.__playtest.selfTest()`. Hook-ul este disponibil numai cu `?selftest=1`.

## Ce este dovedit și ce nu

Dovedit de această etapă:

- pagina se încarcă din Vite fără build și fără să atingă bundle-ul de producție;
- inputul, eșantioanele, cei trei estimatori, compunerea și compilarea sunt cele reale;
- o sesiune LEARNING poate schimba cele trei valori și poate comuta aceeași mașină pe AUTO;
- o sesiune MANUAL produce zero dovezi, delta 0 și profil neschimbat;
- exportul JSON este completat numai cu răspunsuri alese de participant.

Nu este dovedit:

- **cinci participanți reali** și ținta „minimum patru din cinci”; în acest moment există zero;
- comportamentul în jocul complet, cu flotă, coliziuni, trafic emergent, semafoare sau misiuni;
- performanța (FPS, frame p95) sau memoria pe hardware real;
- persistența profilului, publicarea `LEARNED` sau suportul complet de 24/80 de chei;
- generalizarea dincolo de cele trei chei și de scena simplificată.

## Verificări

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
volta run --node 24.21.0 --npm 11.19.0 -- npm test
```

Rezultatele executate pentru această etapă sunt în `Docs/Evidence/204-early-learning-demo/checks.md`.

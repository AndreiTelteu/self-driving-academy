# Hardware de referință — PBI203 în lucru

PBI203 rămâne **In Progress** până la primirea măsurătorilor reale de pe ambele configurații. Specificațiile unui model nu înlocuiesc rularea probei.

| Configurație | Identificare | Proveniență și stare |
| --- | --- | --- |
| Desktop local | AMD Ryzen 9 7950X3D, Radeon RX 7900 XTX, RAM disponibilă sistemului 50.337.325.056 bytes, Windows 11 Pro 10.0.26200, driver 32.0.31041.1004 | CIM local și rapoarte Babylon/Chrome din PBI019. Este un desktop performant, nu o demonstrație a cerinței generale pentru un desktop mediu. |
| Laptop | Lenovo Yoga 7 14ARP8, Ryzen 7 7735U, Radeon 680M, 16 GB RAM, SSD 512 GB, ecran 14" OLED WUXGA | Specificații furnizate de utilizator. OS, driver, browser, alimentare, rezoluție și refresh efective vor fi citite pe laptop. Măsurători încă lipsă. |

Proba se construiește local în producție, fără HMR, cu sursele și commitul înscrise în raport. Scena este bootstrapul gol (cameră și clear), distinctă de jocul cu 70 de vehicule. Rezoluția CSS și cea internă sunt fixate separat la 1920×1080; DPR-ul real este raportat. Contextul de calitate propus este Medium desktop și Low laptop, dar scena goală nu are asseturi/umbre care să testeze diferența dintre presetări.

## Rulare pe laptop

Baseline-ul complet al desktopului este disponibil în [raportul203](Evidence/203-hardware/desktop-report.md): cinci repetări cu observator oprit/pornit, Chrome/WebGPU,1920×1080, fără pierdere de focus. CPU p95 median0,20ms și interval de cadru p95 de7ms sunt valori ale bootstrapului gol pe display144Hz, fără certificare de gameplay. [Sumarizatorul offline](hardware-probe-summary.md) verifică protocolul și calculează medianele fără modificarea dovezilor.

Înainte de pornirea scriptului, conectează laptopul la alimentare, oprește economisirea bateriei și închide alte aplicații care folosesc GPU-ul. Păstrează aceste condiții până la finalul măsurării. Scriptul capturează alimentarea și hardware-ul la pornirea serverului; dacă schimbi condițiile, oprește serverul și rulează din nou scriptul pentru metadata noi.

În checkout-ul proiectului, cu Node 24.21 și npm 11.19 instalate:

```powershell
git pull
npm ci
./scripts/Run-HardwareProbe.ps1 -Profile laptop
```

Deschide în Chrome adresa afișată (`http://127.0.0.1:5189`). Alege backendul Automat și apasă „Rulează proba completă”. Păstrează fereastra în față până la final; ascunderea tabului, pierderea focusului sau pierderea contextului/dispozitivului GPU invalidează proba. Descarcă JSON-ul la sfârșit. Ctrl+C oprește serverul local. Serverul ascultă numai pe 127.0.0.1. Nu porni un al doilea server sau rebuild în timpul probei; după reconstruirea uneltei reîncarcă pagina.

„Verificare scurtă” durează câteva secunde și validează funcționarea uneltei; rezultatul este marcat explicit ca neeligibil pentru baseline. Pentru desktop se schimbă numai parametrul în `-Profile desktop`.

Scriptul citește CPU/GPU/driver/RAM/OS, rezoluțiile și refresh-ul raportate de Windows, planul de alimentare și starea bateriei. Acesta este un snapshot la pornirea serverului, cu `capturedAt`, nu o verificare continuă a alimentării în timpul celor 25 de minute. Nu colectează numele utilizatorului, identificatori de cont, seriale sau fișiere personale. Browserul adaugă backendul real, informația GPU disponibilă, versiunea browserului și dimensiunile canvasului. Metadata hardware și manifestul sunt validate înainte de creare: profilul trebuie să coincidă cu pagina, commitul/digestul surselor cu buildul încărcat, iar fișierul JS curent trebuie să existe în manifest. Digestul întregului manifest de artefacte este verificat în browser; manifestul identifică bytes HTML/JS/WASM efectivi, separat de lista surselor declarate.

## Protocol și limite

Cinci repetări compară colectorul oprit și pornit. Fiecare fază are 30 s încălzire și minimum 120 s măsurate cu requestAnimationFrame: aproximativ 25 minute în total. CPU total include randarea și colectorul; intervalele de cadru sunt raportate separat. Bufferele sunt plafonate la 60.000 de cadre per fază și nu trunchiază tacit la limită. Percentilele sunt calculate între faze, fără exporturi sau loguri în bucla măsurată. GPU folosește rezultatele asincrone disponibile din ultima fereastră de maximum 4.096 de cadre; unsupported/pending rămâne null.

Proba raportează long tasks când API-ul există, plus limitele observatorului. Fazele sunt atribuite după startTime și granițele înregistrate, nu după momentul livrării callbackului. Înainte de închidere se cedează un task real pentru publicarea ultimului RAF, se drenează observerul și se reverifică focusul/rendererul înainte de export. Numărul obiectelor Babylon nu este prezentat ca memorie GPU exactă. Memoria paginii/GPU exactă rămâne indisponibilă dacă nu există o măsurare separată. Scena fără fizică nu măsoară costul tickului, input → comandă, debitul simulării sau latența estimatorului.

Încărcarea uneltei este HTTP local fără cache HTTP și fără limitare de rețea; cache-urile OS/driver nu sunt controlate. Timpul de creare a backendului este separat de navigare. Aceste valori nu închid ținta cold de 25 Mbit/s și RTT 40 ms. Manifestul va păstra distinct protocolul cold obligatoriu și rezultatele disponibile, fără să transforme această probă locală în gate de startup sau gameplay.

Baseline-ul inițial disponibil înaintea acestei unelte este [proba bootstrap019](Evidence/019-diagnostics/report.md), cu 640×360 și timer de pacing, nu FPS de display. Proba203 are un protocol diferit, declarat explicit, și nu înlocuiește retroactiv acel baseline. Bugetele din modulul25 rămân propuneri până la calibrarea pe desktop și laptop.

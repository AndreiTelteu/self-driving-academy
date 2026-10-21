# Cele trei moduri: AUTO, MANUAL și LEARNING

Contract pentru PBI 217, versiune `217-three-modes-v1`. Completează [modurile de control 067](mode-controls.md), [autoritatea 066](control-authority.md), [segmentele manuale 069](manual-segments.md), [pauza și focusul 070](pause-focus.md), [remaparea 080](key-remapping.md), [coada workerului 103](learning-worker.md) și [pipeline-ul 112](profile-pipeline.md). Nu schimbă niciunul dintre aceste contracte; le verifică împreună, de la hotkey și HUD până la estimator și profil.

## Ce verifică

`src/app/three-modes.ts` este un harness de integrare. Nu implementează moduri, scaune, segmente, coadă sau profil: conduce modulele reale un tick acceptat o dată și verifică rezultatul observabil.

- `runThreeModesMatrix(services)` rulează matricea `AUTO/MANUAL/LEARNING × TAXI/CIVIL`, cele șase tranziții, cazurile mixte, pauza, remaparea, workerul ocupat, selecția și dovezile de profil. Raportul este înghețat (`Object.freeze`) și păstrează eșecurile.
- `measureThreeModeLatency(services)` măsoară local, provizoriu, trei canale de input. Nu este o probă de FPS, GPU sau hardware.

Hostul furnizează `ThreeModesServices`: contextul, cele două identități native (`TAXI`, `CIVIL`), o fabrică de scene proaspete peste modulele reale și valorile de bază ale profilului. Fiecare scenariu primește o scenă nouă, deci nicio stare acceptată nu este refolosită între scenarii.

## Matricea de tranziții

| De la | La | Intenție | Segment închis | Motiv închidere | Segment deschis | `learningEligible` |
| --- | --- | --- | --- | --- | --- | --- |
| AUTO | MANUAL | `M` | nu există | — | MANUAL | `false` |
| AUTO | LEARNING | `L` | nu există | — | LEARNING | faptul de eligibilitate |
| MANUAL | AUTO | `M` | MANUAL | `RETURN_TO_AUTO` | nu există | — |
| MANUAL | LEARNING | `L` | MANUAL | `MODE_CHANGE` | LEARNING | faptul de eligibilitate |
| LEARNING | AUTO | `M` | LEARNING | `RETURN_TO_AUTO` | nu există | — |
| LEARNING | MANUAL | `L` | LEARNING | `MODE_CHANGE` | MANUAL | `false` |

Fiecare rând al raportului conține clasa (`TAXI`/`CIVIL`), tranziția, tick-ul anterior și cel acceptat, id-ul și modul segmentului închis, motivul închiderii, id-ul/modul/eligibilitatea segmentului deschis, numărul de scaune `PLAYER`, rezultatul fizicii, rezultatul de learning și verificarea HUD. Sunt 12 rânduri (șase tranziții × două clase).

Reguli verificate pe fiecare rând:

- segmentul vechi este `CLOSED` și se termină exact la tick-ul acceptat;
- segmentul nou este `OPEN` și începe exact la același tick, cu modul cerut;
- `learningEligible` este `true` numai pentru un segment LEARNING deschis când faptul de eligibilitate este `true`;
- modul publicat de HUD după tick este cel acceptat (`Conduci · învățare oprită` / `Conduci · orașul învață`);
- tranziția nu schimbă viteza, heading-ul sau pasul de poziție pe tick și nu produce un al doilea scaun.

## Fizică păstrată

Pentru fiecare tranziție, harness-ul citește starea fizică autoritativă înainte și după tick și cere:

- `tick`-urile citirii să fie exact `tick-1` și `tick`;
- viteza și heading-ul identice (toleranță `1e-9`);
- pasul de poziție să fie exact `viteză × 1/60 s` (toleranță `1e-6 m`), adică fără teleport și fără oprire ascunsă.

O discontinuate injectată (poziție, viteză sau heading) produce un eșec închis: `PHYSICS_POSITION_STEP`, `PHYSICS_SPEED`, `PHYSICS_HEADING` sau `PHYSICS_TICK`. Harness-ul raportează, nu repară: nu clamp-ează, nu teleportează și nu reia starea.

## Scaunul PLAYER și selecția

- Există cel mult un scaun `PLAYER`, iar după tranziție el aparține vehiculului condus (`PLAYER_SEAT_IDENTITY` dacă nu).
- În AUTO nu există scaun; `PLAYER_SEAT_MODE` semnalează un scaun rămas.
- `select(identity)` este doar o intenție 068: camera se mută pe tick-ul acceptat, iar vehiculul nou rămâne în AUTO, fără segment și fără scaun.
- Preluarea controlului cere o intenție `M`/`L` explicită. O schimbare de selecție în timp ce alt vehicul este condus închide segmentul vechi cu `VEHICLE_SWITCH` și eliberează scaunul în același tick; noul vehicul rămâne în AUTO până la intenția explicită.
- Un al doilea scaun injectat produce `MULTIPLE_PLAYER_SEATS`; un segment lipsă produce `MISSING_CLOSED_SEGMENT` sau `WRONG_CLOSED_SEGMENT`.

## MANUAL versus LEARNING (dovezi)

| Sursă | Telemetrie/istoric | Job 103 | Versiune 109 | Parametri/probe |
| --- | --- | --- | --- | --- |
| MANUAL | da, `learningEligible=false`, eșantioane reale | nu | nu | neschimbați |
| LEARNING eligibil | da | da, real | da, prin 112 | compuși din dovada segmentului |
| LEARNING neeligibil | da | nu | nu | neschimbați |
| AUTO | nu are segment | nu | nu | neschimbați |

Verificările folosesc pipeline-ul real 112 peste coada reală 103 și store-ul 109:

- un segment MANUAL închis este `SKIPPED_MANUAL` cu `MANUAL_SEGMENT_NOT_LEARNABLE`, `jobSubmitted=false`, `versionId=null`, zero joburi, zero versiuni și parametrul de bază neschimbat;
- un segment LEARNING eligibil închis este `COMPOSED`, cu job real, `versionId` real și valoarea compusă diferită de baza reală;
- un segment LEARNING neeligibil deschide/închide un segment real, dar răspunde `SKIPPED_INELIGIBLE` fără job și fără versiune.

Workerul folosit de probă răspunde cu blend-ul real 101, ca harness-ul 103 partajat; estimatoarele 094–101 nu sunt rescrise. Din acest motiv raportul NU dovedește acuratețea estimării, ci faptul că doar sursa corectă ajunge la coadă și la profil.

## Remapare, focus și pauză

- Tastele `M`/`L` sunt citite din bindingurile persistate 080. După remapare (`Digit1`/`Digit2`), vechile coduri fizice nu mai produc nicio intenție, iar codurile noi produc tranzițiile documentate; HUD-ul afișează noile coduri.
- O suprafață deschisă în MANUAL/LEARNING suspendă lumea prin 070: tastatura 067 își golește codul ținut, intenția în așteptare este eliminată, iar pasul fizic nu avansează.
- La reluare, următorul tick acceptat este exact `tick+1`: nu există gol, duplicat sau tick inventat. Segmentul rămâne deschis cu același `startTick`.
- Pierderea focusului este un fapt de browser raportat prin portul 070; nu este simulată aici ca input fizic.

## Sonda de latență

`measureThreeModeLatency` este o probă locală, deterministă, într-un singur proces Node, fără lucru paralel:

| Canal | Eșantioane | Ce măsoară |
| --- | ---: | --- |
| Intenție de mod → tranziție acceptată | 48 | `performance.now()` în jurul tastării reale 067/080 și al tick-ului acceptat 066/069 |
| Schimbare de selecție → ținta camerei | 200 | `performance.now()` în jurul intenției 068 și al tick-ului care o acceptă |
| Închidere LEARNING → admitere în coada 103 | 200 | fereastra sincronă a `onSegmentClosed` 112 până la `queue.submit`, cu un job secundar care ocupă workerul |

- Eșantionul de mod este 48 pentru că 069 protejează cel mult 64 de segmente per ciclu de viață; eșantionul de admitere este împărțit în scene proaspete, sub aceeași limită.
- Sonda raportează `min`, `p50`, `p95`, `max` și media, plus `busySamples`, `admissions` și `duplicateJobs`.
- Comparația „p95 sub un tick de 60 Hz” este o observație locală informativă (`budget`), niciodată un gate de trecere/eșec și niciodată o dovadă de FPS.
- Etichete fixe: `level: full`, `scope: LOCAL_NODE_SINGLE_PROCESS`, `provisional: true`, `hardwareClaim/fpsClaim/gpuClaim: NOT_MEASURED`.
- Preflight: `npm run modes:three` rulează suita completă o dată înainte de probă. Singura aserțiune sărită în preflight este verificarea de prospețime a raportului acestui PBI, care este prin definiție învechită înainte de regenerare.
- **Ce nu este:** nu este FPS, nu este timp de frame, nu este GPU, nu este o probă de hardware și nu certifică jocul integrat. Numerele sunt dependente de mașină.

### Normalizarea pentru `--check`

Valorile de latență sunt reale la fiecare rulare, deci nu pot fi comparate prin egalitate. `normalizeThreeModesReport` înlocuiește `min/p50/p95/max/mean` cu `0`, fixează observația „sub un tick” și păstrează toate câmpurile structurale (eșantioane, `busySamples`, `admissions`, `duplicateJobs`, verificările). `npm run modes:three -- --check` compară forma normalizată, exact cum este documentat aici. Raportul comis păstrează numerele măsurate.

## Comenzi și dovezi

```powershell
npm run modes:three            # preflight (npm test), probe, scrie report.json + report.md
npm run modes:three -- --check # compară forma normalizată, fără preflight
```

Dovezile sunt în [Docs/Evidence/217-three-modes](Evidence/217-three-modes/README.md). Testele sunt în `tests/app/three-modes.test.ts` (20 de teste, inclusiv probele negative injectate).

## Limitări

- Fizica scenei este o citire deterministă cu viteză constantă, folosită pentru a dovedi absența unei discontinuități la tranziție; nu este o simulare Rapier a vehiculului.
- Estimatoarele rulează în worker; harness-ul folosește blend-ul real 101, nu re-estimează stilul.
- Nu există captură de browser și nicio pretenție de FPS/GPU/hardware; integrarea vizuală completă rămâne gate-ul de release.
- HUD-ul este verificat prin DOM-ul determinist al testelor, cu aceleași contracte 067, nu printr-o captură de browser.

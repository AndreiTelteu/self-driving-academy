# PBI 111 — continuitatea manevrelor la activarea profilului

Implementat în `src/fleet/profile-continuity.ts` (`111-profile-continuity-v1`) și
`src/app/profile-continuity.ts` (`111-profile-continuity-app-v1`), exportate aditiv prin
`src/fleet/index.ts` și `src/app/index.ts`. Guard-ul completează 110: activarea scrie în continuare
doar `tick` și `appliedProfileVersion`, iar 111 verifică faptul că restul manevrei rămâne identic.

Modulul de contract stă în `src/fleet` pentru că flotă → autonomy este deja o direcție existentă, iar
`src/autonomy` nu depinde de `src/fleet`; plasarea inversă ar fi creat un ciclu. Guard-ul nu importă
politicile 050/053/066, ci primește un snapshot structural produs de composition root.

## Contract

- `ManeuverSnapshot` — `vehicleId`, `tick`, `positionM`, `speedMps`, `headingRad`, `controlMode`,
  `appliedProfileVersion`, latch 053 (`phase`/`targetLaneId`/`startedTick`/`progress`/
  `lastChangeTick`), oportunitate 050 (`opportunityId`/`occurrence`/`decision`/`sampledTick`/
  `profileVersion`) și autoritate manuală (`seat`/`mode`/comandă). Piesele absente sunt `null`.
- `verifyContinuity(before, after, { vehicleId, versionId, tick })` — liste închise, în ordine
  canonică: `POSITION_CHANGED`, `SPEED_CHANGED`, `HEADING_CHANGED`, `CONTROL_MODE_CHANGED`,
  `LANE_CHANGE_CANCELLED`, `MANUAL_COMMAND_OVERRIDDEN`, `OPPORTUNITY_RESAMPLED`,
  `VERSION_NOT_APPLIED`. Egalitatea este exactă (`Object.is`), toleranță 0 pentru câmpurile de
  stare; snapshot-ul `after` trebuie citit la tick-ul activării.
- `createOpportunityDecisionMemo({ capacity? })` — 256 intrări implicit, maximum 4096, evacuare FIFO;
  cheie `vehicleId + opportunityId + occurrence`, fără tick și fără versiune; `decideOnce` apelează
  sampler-ul o singură dată pe cheie, păstrează `profileVersion` și `sampledTick` de la eșantionare și
  întoarce cache hit pentru orice apel ulterior; `stats()` expune `decisions`, `cached`, `sampled`,
  `evictions`, `size`, `capacity`.
- `publishWithContinuity({ activation, before, read, tick?, memo?, sampler? })` — aplică 110 la
  tick-ul comun, citește `after` prin portul `read`, verifică, probează memo-ul cu versiunea nouă și
  întoarce `APPLIED`/`BLOCKED` plus raportul 110 real. `BLOCKED` nu anulează și nu repară scrierile
  deja produse.
- `readManeuverSnapshot({ fleet, vehicle, laneChange, signal, authority }, tick)` — citește registrul
  057 și porturile reale; lipsa vehiculului/readback-ului întoarce `null`, un tick în urmă aruncă
  `STALE_TICK`.
- `createSignalDecisionSampler({ seed, scope, profile, observation, speedMps, incarnation?, policy? })`
  — folosește `evaluateSignalPolicy` real și seed-ul 006 derivat din vehicul + oportunitate; nu
  reimplementează politica.
- `applyActivationDuringManeuver(...)` — eșantionează oportunitatea o dată înainte de schimbarea
  versiunii, apoi compune 110 + guard; erori închise `VEHICLE_MISSING`, `FOREIGN_ACTIVATION`,
  `STALE_TICK`.

## Reguli demonstrate

- **Stare păstrată**: poziția, viteza, heading-ul și modul de control sunt identice înainte/după
  tick-ul comun; se schimbă numai versiunea aplicată și tick-ul. Un reset de viteză injectat produce
  `SPEED_CHANGED` și `BLOCKED`, dar raportul 110 rămâne `APPLIED`.
- **Schimbare de bandă**: faza `COMMITTED`, ținta, tick-ul de start, progresul și cooldown-ul rămân
  identice; nu este anulată, nu este repornită.
- **Oportunitate de roșu**: decizia deja evaluată, `sampledTick` și versiunea de eșantionare rămân
  neschimbate; sampler-ul este apelat exact o dată, iar proba de după activare este cache hit. O
  oportunitate nouă (altă ocurență) este miss și folosește versiunea activă nouă.
- **Prioritate manuală**: `MANUAL`/`LEARNING`, scaunul `PLAYER` și comanda ținută sunt citite, nu
  scrise; activarea nu este takeover, iar comenzile continuă.
- **Fără reaplicare**: 59 frame-uri după tick-ul comun sunt `IDLE`, fără scrieri suplimentare, fără
  drift și fără reeșantionare.

## Dovezi

`tests/fleet/profile-continuity.test.ts` + `tests/app/profile-continuity.test.ts` — 21 teste, 21
pass. Acoperă: numai versiune/tick pot diferi; poziție/viteză/heading/mod injectate; latch de bandă
anulat/repornit/progresat; scaun și comandă modificate; oportunitate alterată sau pierdută; versiune
neaplicată; memo o singură eșantionare + cache + oportunitate nouă; memo mărginit cu evacuări;
`publishWithContinuity` real cu 110; raport real păstrat la reset injectat; fără reeșantionare;
snapshot cu piese `null`; activare în viraj; activare în schimbare de bandă; roșu cached; oportunitate
nouă cu versiune nouă; prioritate manuală; erori închise; 60 frame-uri; doar `tick` și
`appliedProfileVersion` scrise.

`tests/app/profile-continuity-report.ts` + `scripts/run-profile-continuity-report.mjs` — 7 scenarii,
45 verificări, 45 PASS. Transcript: [report.json](report.json) / [report.md](report.md).

Comenzi (rulate din rădăcină):

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (242 TypeScript files)` |
| `npm test` | exit 0, `tests 1643`, `pass 1643`, `fail 0` |
| `npm run profile:continuity` | exit 0, `SUMMARY checks 45/45, scenarios 7, overall PASS` |
| `npm run profile:continuity -- --check` | exit 0, `Profile continuity report is current` |

## Limite

- Readback-ul de poziție/viteză/heading este un port injectat, derivat de proprietarul fizicii/047;
  dovada nu este o probă fizică Babylon/Rapier și nu include captură de browser.
- Egalitatea este intenționat exactă: o variație legitimă de float între citiri ar fi raportată ca
  violare, nu tolerată tacit.
- Memo-ul este exclusiv în memorie; după evacuarea FIFO, o oportunitate foarte veche ar fi
  reeșantionată. Nu există persistență, reluare după crash sau istoric în afara capacității.
- `BLOCKED` nu face rollback peste 110; raportul real este păstrat, iar decizia de a opri/prelucra
  revine orchestratorului.
- Guard-ul nu are store de profil, deci „store neatins” este structural (nu importă niciun store) și
  este verificat prin suprafețele scrise ale registrului, nu printr-un checksum de store.
- PBI-ul rămâne în `In Progress`; acest raport nu mută task-ul și nu rulează validatorul de board.

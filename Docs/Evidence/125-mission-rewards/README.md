# Dovezi 125 — progres, recompense și deblocări

Status: implementare și validare funcțională locală, PASS. Nivel de validare: `funcțional izolat`
(corectitudine izolată + cost local), conform [politicii proporționale](../../validation-policy.md).
Nu se revendică FPS, GPU, Rapier, soak sau hardware; contractul este de domeniu, fără UI, DOM sau
efect în `main.ts`.

## Ce s-a livrat

- `src/missions/rewards.ts` — contractul `125-mission-rewards-v1`: registrul de progres al campaniei,
  registrul de recompense cu identitate stabilă, lista monotonă de deblocări, resetul de misiune și
  dovada de acces pe flota reală.
- `src/missions/index.ts` — exporturile publice ale modulului.
- `tests/missions/mission-rewards-fixture.ts` — fixture real: fiecare finalizare este produsă de
  trackerul 116 real (misiune pornită din catalog, avansată de evenimente 007 validate, încheiată de
  obiectivul autorat), flota este registry-ul real 057 (24 taxiuri, 40 civili), iar profilul este un
  store 109 real cu validatorul 102.
- `tests/missions/mission-rewards.test.ts` — 11 teste deterministe: vocabular/limite, cele trei read
  modeluri separate, recompensă unică la reluare, finalizare nouă și versiune nouă, reset fără
  pierdere de recompense, reset fără atingerea profilului, accesul la taxiuri/vehicule după fiecare
  deblocare, ordinea deblocărilor, refuzul intrărilor invalide, determinism/imutabilitate și
  transcriptul raportului.
- `tests/missions/mission-rewards-report.ts` + `scripts/run-mission-rewards-report.mjs` — raport
  determinist cu 41 de verificări, 3 scenarii și suport `--check`.
- [Docs/13-misiuni-si-progres.md](../../13-misiuni-si-progres.md) — secțiunea „Contract implementat
  în V1 (PBI 125): progres, recompense și deblocări".
- `package.json` — scriptul `missions:rewards`, adăugat la finalul blocului `scripts`.
- `Docs/Evidence/125-mission-rewards/report.json` și `report.md` — transcriptul real.
- `PBI/Done/125-mission_rewards.md` — taskul mutat fizic în Done.

## Cum garantez recompensa unică

Finalizarea este un fapt real 116: `settle` primește o instanță în starea `COMPLETED` și verifică
identitatea stabilă `missionInstanceId(namespace, missionId, attempt)`, versiunea definiției din
catalog și tick-ul de finalizare. Modulul nu inventează finalizări și nu judecă din nou obiectivul.

Cheia de recompensă este identitatea 116 deja livrată,
`missionRewardId(namespace, missionId, definitionVersion, rewardId)`, iar cheia de finalizare este
`missionInstanceId(namespace, missionId, attempt)`. Cheia este suficientă pentru că recompensa este
autorată per versiune de definiție:

- aceeași finalizare livrată a doua oară are aceeași identitate de finalizare → `DUPLICATE`, motiv
  `COMPLETION_ALREADY_SETTLED`, zero recompense;
- o încercare nouă (reluare reală 116) are altă identitate de finalizare, dar aceeași cheie de
  recompensă → `NO_REWARD`, motiv `REWARD_ALREADY_GRANTED`, zero recompense;
- o versiune nouă a definiției are altă cheie de recompensă → `GRANTED`.

Altfel spus: reluarea nu dublează nimic, iar XP-ul nu poate fi fermat prin reluare. Regula este
publicată în `MISSION_REWARD_IDENTITY` (`MISSION_VERSION`), deci panoul și documentația nu pot
diverge de implementare.

## Ce se întâmplă exact la reluare și la reset

**Reluare** (`replay` 116): se creează o încercare nouă, cu identitate stabilă proprie, dar
recompensele rămân ale versiunii de definiție. Rezultatul este `NO_REWARD` cu toate rândurile
`DUPLICATE`; progresul campaniei înregistrează a doua încercare (`attempts: 2`), iar totalurile de XP
și deblocări rămân neschimbate (800 XP, 16 acordări, 8 deblocări în scenariul complet).

**Reset de misiune** readuce doar progresul acelei misiuni în stare jucabilă:

- se resetează: înregistrările de finalizare ale misiunii și contorul de încercări al ei (stare
  `AVAILABLE`, `attempts: 0`, `nextAttempt: 1`, `playable: true`), plus un contor explicit `resets`;
- rămân: toate recompensele acordate, toate deblocările (lista este monotonă), celelalte misiuni și
  profilurile. Modulul nu primește niciun store de profil, iar rezultatele au `profileWrites: 0`
  structural;
- consecință documentată: o misiune care era doar `AVAILABLE` datorită celei resetate revine `LOCKED`
  până la recompletare, iar recompletarea este raportată `NO_REWARD` — nimic nu se dublează.

Resetul este granița de scenariu și se folosește împreună cu `reset` al trackerului 116, exact ca în
contractul 116, care păstrează și el registrele de idempotență.

## Cum demonstrez accesul la taxiuri și vehicule existente

`missionVehicleAccess` citește flota reală 057 și răspunde, pentru fiecare vehicul, dacă poate fi
condus și dacă poate fi selectat ca taxi. Capabilitățile de bază sunt mereu primele:
`access:drive-existing-vehicles`, `access:select-any-taxi` și câte o `vehicle-class:<id>` pentru
fiecare clasă reală 023 (`sedan`, `compact`). Testul și raportul calculează accesul **înainte de orice
misiune și după fiecare dintre cele 8 deblocări** (9 puncte de control) pe aceeași flotă:

| Punct de control | Capabilități | Taxiuri | Taxiuri selectabile | Vehicule | Conduse | Revocate | Taxiuri blocate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| înainte de orice misiune | 0 | 24 | 24 | 64 | 64 | 0 | 0 |
| după fiecare dintre cele 8 deblocări | 1…8 | 24 | 24 | 64 | 64 | 0 | 0 |

`revoked` și `blockedTaxis` sunt structural zero, iar `baseCapabilitiesPresent` este `true` la fiecare
punct. Deblocarea `vehicle-class:comfort-sedan` (etapa 5) se adaugă listei fără să scoată vreo clasă
existentă.

## Numerele celor trei scenarii cerute

1. **Recompensă unică și reluare** (scenariul „sequential"): 8 misiuni × 2 recompense = 16 acordări,
   800 XP, 8 deblocări. Reluarea reală a primei misiuni (încercarea 2) dă `NO_REWARD`: 0 acordate,
   2 duplicate, 800 XP și 16 acordări neschimbate.
2. **Finalizare nouă**: a doua misiune completată acordă propria recompensă (`analysis:learning-review`,
   +100 XP, total 200 XP); o versiune nouă a definiției (`campaign-1-first-taxi` v2) este `GRANTED` cu
   identitate de recompensă diferită și +100 XP.
3. **Reset de misiune** (scenariul „reset"): după 5 misiuni există 10 acordări, 500 XP și 5 deblocări.
   Resetul misiunii 5 și al misiunii 1 păstrează 10 acordări, 500 XP și 5 deblocări; misiunea revine
   `AVAILABLE` cu `attempts: 0`, `nextAttempt: 1`. Recompletarea după granița de scenariu este
   `NO_REWARD`, cu XP-ul neschimbat la 500.

## Comenzi executate și rezultat real

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0 (src + `tsconfig.tests.json`) |
| `npm run lint` | exit 0, 0 warnings |
| `npm run format:check` | „All matched files use Prettier code style!" |
| `npm run check:architecture` | PASS, 325 fișiere TypeScript, probe negative PASS |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized." |
| `npm test` | 2301 teste, 2301 pass, 0 fail, 0 skipped (70.4 s) |
| `node --import ./scripts/register-typescript.mjs --test "tests/missions/mission-rewards.test.ts"` | 11 teste, 11 pass, 0 fail |
| `node --import ./scripts/register-typescript.mjs scripts/run-mission-rewards-report.mjs` | 41/41 verificări PASS, 3 scenarii, overall PASS |
| `... scripts/run-mission-rewards-report.mjs --check` | „Mission rewards report is current" |

## Limitări

- Rulare Node deterministă: finalizările vin din trackerul 116 real și vehiculele din registry-ul 057
  real, dar nu există browser, renderer sau sesiune umană.
- Partea autorată este comportamentul jucătorului: ce evenimente 007 reale satisfac fiecare obiectiv.
- Persistarea registrului de recompense într-un savefile rămâne în afara scope-ului (127–136).
- UI-ul de progres/deblocări și aplicarea XP în `PlayerProgress` nu fac parte din contract.
- Nu se revendică FPS, frame, GPU sau măsurători hardware.

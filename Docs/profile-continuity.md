# Continuitatea manevrelor la activarea profilului — PBI 111

`src/fleet/profile-continuity.ts` (contract `111-profile-continuity-v1`) verifică faptul că publicarea
unei versiuni prin 110 nu atinge o manevră deja angajată. `src/app/profile-continuity.ts` (contract
`111-profile-continuity-app-v1`) este composition root-ul care citește starea acceptată reală și
leagă guard-ul de `applyAt`-ul 110.

Modulul stă în `src/fleet` pentru că 110 (activarea de flotă) și dependența flotă → modele de citire
autonomy există deja acolo. `src/autonomy` nu depinde de `src/fleet`, deci plasarea inversă ar crea un
ciclu de module. Guard-ul nu importă politicile 050/053/066: primește un snapshot structural, iar
composition root-ul proiectează starea lor acceptată.

```typescript
import { createOpportunityDecisionMemo, publishWithContinuity } from '../fleet';
import { applyActivationDuringManeuver, readManeuverSnapshot } from '../app';

const before = readManeuverSnapshot(sources, tick); // null dacă vehiculul/readback-ul lipsește
const result = applyActivationDuringManeuver({
  ...sources,
  activation,
  tick,
  memo,
  sampler,
});
// result.status: APPLIED | BLOCKED | REJECTED
```

## Ce se păstrează

`ManeuverSnapshot` conține `vehicleId`, `tick`, `positionM`, `speedMps`, `headingRad`,
`controlMode`, `appliedProfileVersion`, latch-ul de schimbare de bandă
(`phase`/`targetLaneId`/`startedTick`/`progress`/`lastChangeTick`), oportunitatea de semnal deja
evaluată (`opportunityId`, `occurrence`, `decision`, `sampledTick`, `profileVersion`) și autoritatea
manuală (`seat`, `mode`, comanda ținută). Piesele absente sunt `null` explicit.

La activare pot diferi **numai** `appliedProfileVersion` și `tick`. Toate celelalte câmpuri sunt
comparate cu egalitate exactă (`Object.is`); toleranța documentată pentru câmpurile de stare este
**0**. Nu există teleport, reset de viteză, rescriere de heading, anulare de schimbare de bandă sau
reîncepere a progresului.

`verifyContinuity(before, after, { vehicleId, versionId, tick })` întoarce lista închisă, în ordine
canonică, a violărilor. Snapshot-ul `after` trebuie citit exact la tick-ul de activare; un snapshot
pentru alt vehicul ori un tick în urmă este eroare structurală, nu violare de continuitate.

| Violare | Când |
| --- | --- |
| `POSITION_CHANGED` | orice componentă a poziției diferă |
| `SPEED_CHANGED` | viteza longitudinală diferă |
| `HEADING_CHANGED` | heading-ul diferă |
| `CONTROL_MODE_CHANGED` | `AUTO`/`MANUAL`/`LEARNING` se schimbă |
| `LANE_CHANGE_CANCELLED` | faza, ținta, tick-ul de start, progresul sau cooldown-ul latch-ului diferă |
| `MANUAL_COMMAND_OVERRIDDEN` | scaunul, modul sau comanda ținută diferă (inclusiv eliberarea) |
| `OPPORTUNITY_RESAMPLED` | oportunitatea evaluată își schimbă identitatea, decizia, tick-ul eșantionului sau versiunea, ori dispare |
| `VERSION_NOT_APPLIED` | `appliedProfileVersion` nu este versiunea activării |

## Memo-ul de decizii

`createOpportunityDecisionMemo({ capacity? })` ține cel mult 256 de decizii (maximum configurabil
4096), cu evacuare FIFO și contoare `decisions`, `cached`, `sampled`, `evictions`. Cheia este
`vehicleId + opportunityId + occurrence`; **nu** conține tick-ul sau versiunea profilului.

`decideOnce(input, sampler)` eșantionează exact o dată pe cheie și întoarce decizia memorată pentru
orice apel ulterior, inclusiv după activare. Eșantionul păstrează `profileVersion` și `sampledTick`
de la momentul eșantionării. O oportunitate nouă este un miss și folosește sampler-ul furnizat la
acel apel, deci versiunea activă nouă. Memo-ul nu are frame-uri, ceas, store de profil sau istoric în
afara celor 256 de intrări.

## Prioritatea manuală

Activarea nu este un takeover. Guard-ul citește scaunul 066 și comanda ținută, nu le scrie; comenzile
continuă neschimbate. `MANUAL`/`LEARNING` rămân în planul 110 și primesc versiunea, dar
`controlMode`, scaunul și inputul rămân identice. O modificare a oricăreia dintre ele este
`MANUAL_COMMAND_OVERRIDDEN`.

## Publicare cu continuitate

`publishWithContinuity({ activation, before, read, tick?, memo?, sampler? })`:

1. aplică comanda 110 la tick-ul comun (`tick`, altfel `pending.activateAtTick`, altfel tick-ul
   snapshot-ului `before`);
2. citește snapshot-ul `after` la `report.appliedTick`;
3. rulează `verifyContinuity`;
4. dacă exista o oportunitate evaluată, probează memo-ul cu versiunea nouă: un cache hit nu
   apelează sampler-ul, iar orice eșantionare sau semnătură schimbată este
   `OPPORTUNITY_RESAMPLED`.

Rezultatul este `APPLIED` numai când lista de violări este goală. `BLOCKED` nu repară și nu anulează
nimic: scrierile 110 s-au produs deja, iar `report` rămâne rezultatul real (`PENDING`, `APPLIED` sau
`REJECTED`). Un `report` care nu este `APPLIED` produce `BLOCKED` cu zero violări.

## Composition root

`readManeuverSnapshot({ fleet, vehicle, laneChange, signal, authority }, tick)` citește registrul 057
și porturile reale: readback-ul SI de poziție/viteză/heading (proiecția longitudinală rămâne a
proprietarului fizicii/047), latch-ul 053, decizia 050 deja evaluată și scaunul 066. Lipsa
vehiculului sau a readback-ului întoarce `null`; un `tick` cerut înaintea stării acceptate aruncă
`STALE_TICK`.

`createSignalDecisionSampler({ seed, scope, profile, observation, speedMps, incarnation?, policy? })`
folosește politica reală 050 (`evaluateSignalPolicy`, injectabilă doar pentru composition root) și
seed-ul 006 derivat din vehicul și oportunitate. Nu reimplementează politica; înregistrează
`profileVersion` și semnătura `actiune:motiv`.

`applyActivationDuringManeuver(...)` eșantionează oportunitatea o singură dată **înainte** de
schimbarea versiunii, apoi compune 110 + guard. Erori închise, întoarse înainte de orice scriere 110:
`VEHICLE_MISSING`, `FOREIGN_ACTIVATION`, `STALE_TICK`.

## Ce nu este

Nu este estimator, store de profil, publicare de versiuni, UI sau captură de browser. Nu decide
acceptarea unui delta (102/103/109) și nu mișcă vehicule. Nu înlocuiește regulile 053 de finalizare
sau abandon a unei schimbări de bandă și nici eșantionarea 050: le verifică rezultatul. Nu
certifică performanța jocului integrat.

Verificare: `npm run profile:continuity`, `npm run profile:continuity -- --check`, plus
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run check:architecture` și
`npm test`. Dovezile sunt în [Evidence/111-profile-continuity](Evidence/111-profile-continuity/README.md).

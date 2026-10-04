# Contractele de date implementate în 005

Schema runtime inițială este **1**, separată de revizia 0.5 a planului și de engineVersion/versionId. Contractele sunt exportate prin entry points publice ale modulelor proprietare. Nu execută fizică, dispecerizare, colectare, estimare, propagare sau persistență.

| Modul | Tip și parser public |
| --- | --- |
| vehicles | VehicleCommand / parseVehicleCommand, VehicleState / parseVehicleState |
| fleet | Ride / parseRide |
| simulation | SimulationEvent / parseSimulationEvent |
| telemetry | InterventionSegment / parseInterventionSegment, TelemetrySample / parseTelemetrySample |
| profiles | DrivingProfile / parseDrivingProfile, ParameterEvidence / parseParameterEvidence |
| sessions | ContractContext, ContractValidationError și cititori comuni pentru date necunoscute |

Parserii primesc `unknown`, verifică toate câmpurile și construiesc copii noi înghețate recursiv. Nu convertesc numere din stringuri și nu execută getters/coercion. Se acceptă obiecte de date cu prototip Object/null; se resping obiecte de clasă, câmpuri moștenite, simboluri, accessors, câmpuri ascunse, lipsă sau suplimentare. Array-urile trebuie să fie dense și să conțină numai câmpuri de date. Invalidarea aruncă ContractValidationError. Decodarea JSON precede validarea:

```typescript
import { parseVehicleCommand } from '../vehicles';

const imported: unknown = JSON.parse(serializedCommand);
const command = parseVehicleCommand(imported);
```

## Identitate, unități și versiuni

Comanda/starea vehiculului, Ride, SimulationEvent și InterventionSegment includ schemaVersion=1, units=SI, sessionId și worldEpoch (întreg sigur nenegativ). Identitatea sesiunii diferă de controlMode. Verificarea împotriva lumii live rămâne responsabilitatea consumatorului. DrivingProfile este portabil, fără identitatea lumii; izolarea țintei se face prin segment/job/comanda de activare.

Tick-urile sunt întregi siguri nenegativi, fără conversie implicită în secunde sau calendar. Vec3 are x/y/z finite; positionM folosește metri și velocityMps m/s. Rotația este quaternion normalizat cu toleranță 1e-6. Accelerațiile sunt m/s², curbura 1/m, durata secunde și impulsul N·s. Throttle/brake sunt [0,1], steering [-1,1], handbrake boolean. Folosirea simultană a accelerației/frânei este permisă structural; arbitrajul aparține controllerului.

Schema respinge explicit versiuni vechi/noi și extensii necunoscute; nu face migrare tacită. Prima schemă nu are un format anterior migrabil. Compatibilitatea engine-ului și migrările aparțin PBI-urilor dedicate.

## Vehicule și curse

VehicleCommand are vehicleId, tick, throttle, brake, steering, handbrake, turnSignal OFF/LEFT/RIGHT/HAZARD și source AUTONOMY/PLAYER. VehicleState are vehicleId, classId, tick, transform `{positionM, rotationQuaternion}`, velocityMps, laneId nullable, controlMode AUTO/MANUAL/LEARNING, appliedProfileVersion și maneuverState IDLE/FOLLOWING/STOPPING/TURNING/LANE_CHANGING/RECOVERING. Vocabularele nu implementează controllerul.

Ride are rideId, taxiId nullable, pickupId, dropoffId, routeLaneIds, eventIds unice, status AVAILABLE/TO_PICKUP/PICKUP/TO_DROPOFF/DROPOFF/COMPLETED/FAILED/CANCELLED, createdTick, assignedTick/completedTick nullable și failureReason nullable. Taxiul și assignedTick sunt prezente împreună; AVAILABLE nu este alocat, etapele active și COMPLETED sunt alocate. Stările terminale au completedTick; numai FAILED/CANCELLED au motiv. Ordinea este createdTick ≤ assignedTick ≤ completedTick când câmpurile există. FAILED/CANCELLED pot apărea înaintea alocării. Tranzițiile dintre două versiuni ale cursei vor fi verificate de flotă.

## Segmente și eșantioane

InterventionSegment păstrează segmentId, vehicleId, controlMode, learningEligible, playerId, profileId, baseVersionId, learningEpoch, controlPreferencesVersion, startTick/endTick, closeReason, engineVersion, mapVersion, inputType KEYBOARD/GAMEPAD/AUTONOMY, samples, events și completeness OPEN/CLOSED/INCOMPLETE. AUTO/MANUAL nu sunt eligibile; LEARNING poate fi neeligibil când contextul nu permite demonstrații. AUTONOMY aparține numai AUTO. OPEN are endTick/closeReason null; CLOSED/INCOMPLETE au ambele completate.

Motivele închiderii sunt RETURN_TO_AUTO, MODE_CHANGE, RIDE_COMPLETED, VEHICLE_SWITCH, PROFILE_CHANGE, CONTROL_PREFERENCES_CHANGE, SESSION_CHANGE, WORLD_RESET, RECOVERY, ROLLOVER, SHUTDOWN și DATA_LOSS. MANUAL↔LEARNING și finalizarea cursei închid segmentul fără salt fizic. Pauza și pierderea focusului suspendă segmentul conform modulului 08; nu sunt închideri implicite.

Samples au tick-uri strict crescătoare în intervalul segmentului. Events sunt ordonate nedescrescător (pot împărți un tick), cu eventId unic. State/command au același tick, vehicul și lume; source este AUTONOMY pentru AUTO, PLAYER pentru MANUAL/LEARNING. Sample-urile au modul segmentului și appliedProfileVersion=baseVersionId. Evenimentele au aceeași lume și, când payloadul numește vehicleId, același vehicul.

TelemetrySample are state, command și rawInput (throttle/brake/steering/handbrake separat de comanda filtrată), longitudinalAccelerationMps2/lateralAccelerationMps2, capabilities mecanice pozitive și context: roadType RESIDENTIAL/URBAN/ARTERIAL, speedLimitMps, curvaturePerM, leaderId/leaderGapM, signalId/signalState, stopLineId/distanceToStopLineM, conflictEntityIds și rideId. Perechile opționale sunt prezente sau null împreună; liderul diferă de vehicul. ExcludedReason null/COLLISION_IMPULSE/RECOVERY/TELEPORT/PAUSE/FOCUS_LOST marchează observațiile de exclus de estimator. Schema nu calculează eligibilitatea statistică și nu fixează frecvența capturii.

## Profiluri și dovezi

DrivingProfile are schemaVersion/units, profileId, versionId, parentVersionId nullable (diferit de versionId), engineVersion, parameters numerice finite, unitsByParameter, provenanceByParameter, evidenceByParameter, sourceSegmentIds unice, createdAt și checksum. CreatedAt este UTC ISO 8601 canonic (secunde, 0–3 cifre fracționare, Z); datele imposibile sunt respinse. Checksum este un șir nenul opac, **nu dovadă de integritate verificată**. Algoritmul/formatul/verificarea aparțin persistenței și savefile-ului.

Mapurile auxiliare au exact cheile parameters. Cheile au forma `[a-z][a-z0-9_]*`, fără constructor/prototype/__proto__. UnitsByParameter acceptă m, s, m/s, m/s², m/s³, rad, rad/s, 1/s, ratio, weight, probability; probability impune [0,1]. Catalogul de proiectare traduce raport→ratio, pondere→weight, probabilitate→probability; s/semafor și s/viraj folosesc s, cu context semantic separat. Registry-ul și intervalele calibrate nu sunt duplicate aici: PBI092 adaugă [registry-ul și gate-ul de publicare](parameter-registry.md): parsePublishableDrivingProfile verifică chei cunoscute, unitatea per cheie și intervalele, cere implemented + estimable pentru LEARNED și implemented pentru MANUAL_TUNING. Toate capabilitățile sunt încă false, distincte de cele 24 ținte M. BASE/IMPORTED pot păstra valori cunoscute rezervate fără a acorda suport controllerului. Serviciul viitor trebuie să folosească gate-ul înainte de publicare și să adauge verificările de engine/bază/epoch și activarea atomică. Acceptarea structurală a unei chei rezervate nu o declară implementată/învățabilă.

Proveniența valorii este LEARNED/MANUAL_TUNING/BASE/IMPORTED. EvidenceByParameter folosește null pentru „neobservat”, distinct de effectiveCount=0. ParameterEvidence are key, effectiveCount nenegativ (poate fi ponderat/fracționar), contexts, quality [0,1], uncertainty nenegativ, sourceSegmentIds unice și estimatorVersion. Dovezile au cheia valorii și surse prezente în profil. LEARNED cere effectiveCount>0 și surse; MANUAL_TUNING poate păstra dovezi istorice fără a pretinde că noua valoare a fost învățată. ProfileSnapshot bootstrap rămâne separat, cu porturile existente.

## Evenimente discriminate

SimulationEvent are eventId, type, tick, entityIds unice și payload exact pentru type. Referințele fizice din payload sunt incluse în entityIds; profileId/rideId/opportunityId și reperele semantice nu sunt automat entități fizice. Tipul public este uniune discriminată.

| Tip | Payload |
| --- | --- |
| MANUAL_START / MANUAL_END | vehicleId, controlMode MANUAL/LEARNING |
| LEADER_ACQUIRED | vehicleId, leaderId distinct, gapM ≥0 |
| SIGNAL_CHANGED | signalId, state RED/YELLOW/GREEN |
| STOP_APPROACH / STOP_LINE_CROSSED | vehicleId, opportunityId, stopLineId |
| FULL_STOP | vehicleId, opportunityId, durationS ≥0 |
| LANE_CHANGE_STARTED / LANE_CHANGE_COMPLETED | vehicleId, opportunityId, fromLaneId/toLaneId distincte |
| COLLISION | vehicleId/otherEntityId distincte, impulseNs ≥0 |
| PICKUP / DROPOFF | vehicleId, rideId |
| PROFILE_ACTIVATE | profileId, versionId, learningEpoch, activationTick ≥ event tick |
| VEHICLE_RECOVERED | vehicleId, recoveryPointId |
| WORLD_RESET | previousWorldEpoch, reason SCENARIO_RESET; worldEpoch=previousWorldEpoch+1 |
| DESTRUCTIBLE_BROKEN | objectId, instigatorId nullable, impulseNs ≥0 |

PROFILE_ACTIVATE descrie o publicare programată; WORLD_RESET descrie commitul în noua generație. Tipurile viitoare primesc payload/parser specific și teste în PBI-ul proprietar, cu schimbare explicită de schemă sau migrare când compatibilitatea o cere. Nu există fallback arbitrar pentru tip necunoscut.

## Verificare și dependențe

`npm test` rulează TS real prin loaderul Node PBI004. Cele 32 teste de contracte acoperă roundtrip, toate câmpurile numerice din fixture injectate cu NaN/±Infinity, câmpuri obligatorii lipsă, forme/versiuni invalide, getters/simboluri/prototipuri/array-uri sparse, mod/lume/tick/surse, 16 tipuri de eveniment și copii defensive imuabile. Un test citește cele 80 valori implicite din catalog pentru compatibilitate structurală, fără registry runtime. `npm run check` adaugă typecheck strict, lint, format și check:architecture; `npm run build` verifică bootstrapul.

Cititorii comuni sunt în sessions/validation.ts deoarece contractele live împart sessionId/worldEpoch. Acesta este un strat pur de date, fără lifecycle de sesiune. Profiles→sessions folosește numai primitivele de validare, fără acces la lume. Importurile dintre module trec prin index.ts public și graful rămâne fără cicluri.

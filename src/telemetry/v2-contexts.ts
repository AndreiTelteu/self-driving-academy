import {
  boolean,
  choice,
  fields,
  list,
  number,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { SimulationEvent } from '../simulation';
import { FOLLOWING_LIMITS } from '../autonomy';
import type { BlockedRecoveryStage } from '../autonomy';
import type { RouteStatus } from '../world';
import { parseTelemetrySample } from './contracts';
import type { TelemetrySample } from './contracts';
import { eligibilityLabelClasses } from './eligibility-windows';
import type { EligibilityLabel } from './eligibility-windows';
import type { OpportunityKind } from './opportunities';

/**
 * 163 V2 contexts, labels and representative scenarios for the 56 R parameters.
 *
 * The catalog is a pure telemetry read model: it owns one observable context definition per R key,
 * derives the observable facets from the already authoritative contracts (085/069 telemetry sample,
 * 007 event stream, 030 hazard observation shape, 033/219 route fact, 061 ride fact) and counts how
 * many frames of a declared scenario really expose each key. It owns no clock, no physics, no
 * renderer, no scheduler and no event bus, and it never publishes.
 *
 * The 24 V1 (M) keys are not redefined here. Their catalog definition, thresholds and scenario
 * evidence stay exactly as delivered; this module only refuses to overlap them (see V1_COMPATIBILITY
 * and `validateV2ContextCatalog`). No key is renamed and no V1 threshold is re-tuned, therefore no
 * migration exists.
 */

export const V2_CONTEXT_VERSION = '163-v2-contexts-v1' as const;

/** The ten R categories of `Docs/driving-parameters.json`, with correct Romanian names. */
export const v2ContextCategories = [
  'SPEED',
  'LONGITUDINAL',
  'FOLLOWING',
  'SIGNALS',
  'STOP_PRIORITY',
  'LANE_CHANGE',
  'LATERAL',
  'ROUTING',
  'HAZARDS',
  'SERVICE',
] as const;
export type V2ContextCategory = (typeof v2ContextCategories)[number];

export const v2ContextCategoryTitles: Readonly<Record<V2ContextCategory, string>> = Object.freeze({
  SPEED: 'Viteză și ritm',
  LONGITUDINAL: 'Accelerație și frânare',
  FOLLOWING: 'Urmărire și distanțe',
  SIGNALS: 'Semafoare',
  STOP_PRIORITY: 'STOP și prioritate',
  LANE_CHANGE: 'Schimbare de bandă și depășire',
  LATERAL: 'Control lateral și viraje',
  ROUTING: 'Trasee și recuperare',
  HAZARDS: 'Pietoni și pericole',
  SERVICE: 'Pickup și confortul pasagerilor',
});

/**
 * The closed facet vocabulary. A facet is the smallest observable fact a context needs; every facet
 * is derived from an existing contract, never authored by this module.
 */
export const v2ContextFacets = [
  'SPEED_MEASURED',
  'ROAD_TYPE_RESIDENTIAL',
  'ROAD_TYPE_URBAN',
  'ROAD_TYPE_ARTERIAL',
  'CURVATURE',
  'LEADER_GAP',
  'LEADER_QUEUE',
  'LEADER_CHANGE',
  'SIGNAL_RED',
  'SIGNAL_YELLOW',
  'SIGNAL_GREEN',
  'STOP_LINE',
  'STEERING_INPUT',
  'BRAKE_INPUT',
  'THROTTLE_INPUT',
  'COASTING',
  'LONGITUDINAL_ACCEL',
  'LATERAL_ACCEL',
  'PASSENGER_ONBOARD',
  'CONFLICT',
  'TURN_SIGNAL',
  'LANE_CHANGE_OPEN',
  'LANE_CHANGE_CLOSED',
  'IMPACT',
  'PEDESTRIAN',
  'OBSTACLE',
  'ROUTE_ALTERNATIVE',
  'ROUTE_BLOCKED',
  'ROUTE_TURN',
  'ROUTE_SIGNAL',
  'ROUTE_CONGESTION',
  'REROUTE',
  'U_TURN',
  'REVERSE_RECOVERY',
  'CURB_DISTANCE',
  'SERVICE_APPROACH',
  'STOP_PRECISION',
  'PICKUP_EVENT',
  'DROPOFF_EVENT',
  'HORN_ACTION',
] as const;
export type V2ContextFacet = (typeof v2ContextFacets)[number];

/**
 * External constraint carried by a context, using the real 087 external-constraint vocabulary.
 * `NONE` means the context is preference evidence (`FREE_TRAFFIC` in 087). The mapping is validated
 * against `eligibilityLabelClasses`, so this module cannot invent a class 087 does not own.
 */
export const v2ContextConstraints = [
  'NONE',
  'LEADER',
  'BLOCKED_GREEN',
  'MECHANICAL_LIMIT',
  'IMPACT',
] as const;
export type V2ContextConstraint = (typeof v2ContextConstraints)[number];

export const v2ContextConstraintLabels = Object.freeze({
  NONE: 'FREE_TRAFFIC',
  LEADER: 'LEADER',
  BLOCKED_GREEN: 'BLOCKED_GREEN',
  MECHANICAL_LIMIT: 'MECHANICAL_LIMIT',
  IMPACT: 'IMPACT',
} as const satisfies Readonly<Record<V2ContextConstraint, EligibilityLabel>>);

/** The representative scenario ids. One per R category, plus one negative control. */
export const v2RepresentativeScenarioIds = [
  'speed-arterial-rhythm',
  'longitudinal-coast-brake',
  'following-leader-gap',
  'signals-red-green-cycle',
  'stop-priority-conflict',
  'lane-change-overtake',
  'lateral-curve-tracking',
  'routing-blocked-reroute',
  'hazards-crosswalk-obstacle',
  'service-pickup-dropoff',
] as const;
export type V2RepresentativeScenarioId = (typeof v2RepresentativeScenarioIds)[number];
export const V2_CONTROL_SCENARIO_ID = 'control-flat-cruise' as const;

export interface V2ManualGuide {
  /** Where the player stands before the context can appear. */
  readonly setup: string;
  /** What the player must do to meet the context. */
  readonly action: string;
  /** What the telemetry must show for the context to count as met. */
  readonly evidence: string;
}

export interface V2ContextDefinition {
  readonly key: string;
  readonly category: V2ContextCategory;
  readonly contextId: string;
  /** Clear Romanian label of the context. */
  readonly label: string;
  readonly scenarioId: V2RepresentativeScenarioId;
  /** Every facet must be observed in the scenario; the context completes at the last missing one. */
  readonly requires: readonly V2ContextFacet[];
  /** The real 086 opportunity kind this context attaches to, or null when none exists. */
  readonly opportunityKind: OpportunityKind | null;
  readonly constraint: V2ContextConstraint;
  readonly manual: V2ManualGuide;
}

const definition = (
  key: string,
  category: V2ContextCategory,
  contextId: string,
  label: string,
  scenarioId: V2RepresentativeScenarioId,
  requires: readonly V2ContextFacet[],
  opportunityKind: OpportunityKind | null,
  constraint: V2ContextConstraint,
  manual: V2ManualGuide,
): V2ContextDefinition =>
  Object.freeze({
    key,
    category,
    contextId,
    label,
    scenarioId,
    requires: Object.freeze([...requires]),
    opportunityKind,
    constraint,
    manual: Object.freeze(manual),
  });

/**
 * One context per R key, in catalog order per category. The keys are the real catalog keys; nothing
 * here invents a parameter. `manual` is the QA/manual contract: deterministic and verifiable in the
 * real game, with the observable evidence named explicitly.
 */
export const v2ContextDefinitions: readonly V2ContextDefinition[] = Object.freeze([
  definition(
    'speed_delta_arterial',
    'SPEED',
    'v2c-arterial-cruise',
    'Croazieră pe arteră, fără lider',
    'speed-arterial-rhythm',
    ['ROAD_TYPE_ARTERIAL', 'SPEED_MEASURED'],
    null,
    'NONE',
    {
      setup: 'Pornește un taxi în LEARNING pe o arteră cu limită ridicată și fără trafic în față.',
      action: 'Menține 20–30 s o viteză constantă, fără frână și fără schimbare de bandă.',
      evidence: 'Eșantioane cu roadType ARTERIAL, viteza peste 5 m/s și leaderId null.',
    },
  ),
  definition(
    'cruise_speed_variability',
    'SPEED',
    'v2c-cruise-variability',
    'Variație naturală a vitezei de croazieră',
    'speed-arterial-rhythm',
    ['SPEED_MEASURED', 'LONGITUDINAL_ACCEL', 'COASTING'],
    null,
    'NONE',
    {
      setup: 'Rulează în LEARNING pe același drum drept, cu banda liberă.',
      action:
        'Lasă accelerația să varieze natural câteva secunde, apoi ridică piciorul de pe accelerație.',
      evidence:
        'Cel puțin un eșantion cu throttle 0 și brake 0 la viteză peste 1 m/s, plus accelerație longitudinală nenulă.',
    },
  ),
  definition(
    'overtake_speed_bonus',
    'SPEED',
    'v2c-overtake-bonus',
    'Bonus de viteză la depășire',
    'speed-arterial-rhythm',
    ['LEADER_GAP', 'LANE_CHANGE_OPEN', 'THROTTLE_INPUT'],
    null,
    'NONE',
    {
      setup: 'Așază-te în spatele unui vehicul mai lent, pe o bandă cu a doua bandă liberă.',
      action: 'Semnalizează, schimbă banda și depășește vehiculul din față.',
      evidence:
        'Eșantion cu lider măsurat, eveniment LANE_CHANGE_STARTED și throttle peste 0 în aceeași fereastră.',
    },
  ),
  definition(
    'cruise_accel_deadband',
    'SPEED',
    'v2c-accel-deadband',
    'Bandă moartă a accelerației de croazieră',
    'speed-arterial-rhythm',
    ['THROTTLE_INPUT', 'SPEED_MEASURED', 'LONGITUDINAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Rulează în LEARNING la viteză de croazieră pe drum drept.',
      action: 'Ține accelerația aproape constantă, cu mici corecții sub 10 %.',
      evidence:
        'Eșantioane consecutive cu throttle peste 0, viteză peste 5 m/s și accelerație longitudinală mică, dar nenulă.',
    },
  ),
  definition(
    'braking_jerk',
    'LONGITUDINAL',
    'v2c-braking-jerk',
    'Jerk la intrarea în frână',
    'longitudinal-coast-brake',
    ['BRAKE_INPUT', 'LONGITUDINAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Abordează o intersecție cu semafor roșu, la viteză de oraș.',
      action: 'Apasă frâna progresiv până la oprire, fără să eliberezi brusc pedala.',
      evidence:
        'Eșantioane cu brake peste 0 și accelerație longitudinală negativă în aceeași fereastră.',
    },
  ),
  definition(
    'throttle_release_delay',
    'LONGITUDINAL',
    'v2c-throttle-release',
    'Întârzierea ridicării accelerației',
    'longitudinal-coast-brake',
    ['COASTING', 'LEADER_GAP'],
    null,
    'LEADER',
    {
      setup: 'Intră în urmărirea unui vehicul mai lent, cu spațiu de 15–25 m.',
      action: 'Ridică accelerația când spațiul scade, apoi rulează în coasting înainte de a frâna.',
      evidence: 'Eșantion cu lider măsurat, throttle 0 și brake 0 la viteză peste 1 m/s.',
    },
  ),
  definition(
    'launch_intensity',
    'LONGITUDINAL',
    'v2c-launch-intensity',
    'Intensitatea plecării de pe loc',
    'longitudinal-coast-brake',
    ['THROTTLE_INPUT', 'LONGITUDINAL_ACCEL', 'STOP_LINE'],
    null,
    'NONE',
    {
      setup: 'Oprește complet la o linie STOP sau la un semafor verde.',
      action: 'Pleacă de pe loc cu accelerație moderată, fără patinare.',
      evidence:
        'Eșantioane cu linie de oprire măsurată, throttle peste 0 și accelerație longitudinală pozitivă.',
    },
  ),
  definition(
    'coasting_bias',
    'LONGITUDINAL',
    'v2c-coasting-bias',
    'Preferința pentru coasting',
    'longitudinal-coast-brake',
    ['COASTING', 'SPEED_MEASURED', 'LONGITUDINAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Rulează pe un drum drept, cu o coborâre ușoară sau o apropiere de intersecție.',
      action:
        'Eliberează complet accelerația și lasă mașina să încetinească singură câteva secunde.',
      evidence: 'Cel puțin două eșantioane cu throttle 0, brake 0 și viteză peste 1 m/s.',
    },
  ),
  definition(
    'cutin_brake_response',
    'FOLLOWING',
    'v2c-cutin-brake',
    'Reacția la un vehicul care se bagă în față',
    'following-leader-gap',
    ['LEADER_GAP', 'BRAKE_INPUT', 'LEADER_CHANGE'],
    null,
    'LEADER',
    {
      setup: 'Rulează în urmărirea unui lider, cu un al doilea vehicul pe banda alăturată.',
      action: 'Lasă vehiculul lateral să intre în față și frânează ca să refaci spațiul.',
      evidence:
        'Eveniment LEADER_ACQUIRED, lider măsurat în eșantion și brake peste 0 imediat după.',
    },
  ),
  definition(
    'closing_ttc_threshold',
    'FOLLOWING',
    'v2c-closing-ttc',
    'Prag de închidere a timpului până la coliziune',
    'following-leader-gap',
    ['LEADER_GAP', 'SPEED_MEASURED', 'LONGITUDINAL_ACCEL'],
    null,
    'LEADER',
    {
      setup: 'Apropie-te de un lider care merge cu 3–5 m/s mai încet.',
      action: 'Menține apropierea fără să frânezi până când spațiul devine incomod, apoi reglează.',
      evidence: 'Eșantioane consecutive cu lider, viteză peste 5 m/s și spațiu în scădere.',
    },
  ),
  definition(
    'leader_change_delay',
    'FOLLOWING',
    'v2c-leader-change',
    'Întârzierea la schimbarea liderului',
    'following-leader-gap',
    ['LEADER_CHANGE', 'LEADER_GAP'],
    null,
    'LEADER',
    {
      setup: 'Urmează un lider care părăsește banda (virează) și lasă loc unui al doilea lider.',
      action: 'Continuă fără să accelerezi până când noul lider este confirmat.',
      evidence:
        'Două evenimente LEADER_ACQUIRED cu id-uri diferite și lider măsurat în eșantionul din aceeași fereastră.',
    },
  ),
  definition(
    'following_hysteresis',
    'FOLLOWING',
    'v2c-following-hysteresis',
    'Histerezisul distanței de urmărire',
    'following-leader-gap',
    ['LEADER_GAP', 'SPEED_MEASURED', 'LONGITUDINAL_ACCEL'],
    null,
    'LEADER',
    {
      setup: 'Urmează un lider care își variază ușor viteza, pe o bandă dreaptă.',
      action: 'Lasă spațiul să oscileze și corectează doar când se atinge limita de confort.',
      evidence:
        'Cel puțin trei eșantioane cu lider și accelerație longitudinală atât pozitivă, cât și negativă.',
    },
  ),
  definition(
    'yellow_stop_probability',
    'SIGNALS',
    'v2c-yellow-stop',
    'Decizia de oprire pe galben',
    'signals-red-green-cycle',
    ['SIGNAL_YELLOW', 'STOP_LINE'],
    null,
    'NONE',
    {
      setup: 'Abordează o intersecție semaforizată la 40–60 m, cu semaforul verde.',
      action: 'Continuă până când semaforul devine galben, apoi decide oprirea sau trecerea.',
      evidence: 'Eșantioane cu signalState YELLOW și distanță la linia de oprire măsurată.',
    },
  ),
  definition(
    'red_run_gap_acceptance',
    'SIGNALS',
    'v2c-red-run-gap',
    'Acceptarea unui interval de trecere pe roșu',
    'signals-red-green-cycle',
    ['SIGNAL_RED', 'STOP_LINE', 'CONFLICT'],
    'RED',
    'NONE',
    {
      setup: 'Stai la roșu, cu un vehicul care traversează pe direcția conflictuală.',
      action: 'Așteaptă roșul și evaluează dacă intervalul dintre vehicule permite trecerea.',
      evidence:
        'Oportunitate RED cu linie de oprire măsurată și conflict activ în aceeași fereastră.',
    },
  ),
  definition(
    'yellow_commit_time',
    'SIGNALS',
    'v2c-yellow-commit',
    'Timpul de angajare pe galben',
    'signals-red-green-cycle',
    ['SIGNAL_YELLOW', 'SPEED_MEASURED', 'STOP_LINE'],
    null,
    'NONE',
    {
      setup: 'Apropie-te de intersecție cu 8–12 m/s, la 30 m de linie.',
      action: 'Menține viteza când apare galbenul, fără frână bruscă.',
      evidence: 'Eșantioane cu signalState YELLOW, viteză peste 5 m/s și linie de oprire măsurată.',
    },
  ),
  definition(
    'green_launch_acceleration',
    'SIGNALS',
    'v2c-green-launch',
    'Accelerația la plecarea pe verde',
    'signals-red-green-cycle',
    ['SIGNAL_GREEN', 'THROTTLE_INPUT', 'LONGITUDINAL_ACCEL'],
    'GREEN',
    'NONE',
    {
      setup: 'Fii primul în coadă la un semafor roșu, în LEARNING.',
      action: 'Pleacă imediat ce semaforul devine verde, cu accelerație constantă.',
      evidence:
        'Oportunitate GREEN urmată de eșantioane cu throttle peste 0 și accelerație longitudinală pozitivă.',
    },
  ),
  definition(
    'rolling_stop_speed',
    'STOP_PRIORITY',
    'v2c-rolling-stop',
    'Viteza la un STOP rostogolit',
    'stop-priority-conflict',
    ['STOP_LINE', 'SPEED_MEASURED', 'BRAKE_INPUT'],
    'STOP',
    'NONE',
    {
      setup: 'Abordează o intersecție fără semafor, cu linie STOP marcată.',
      action: 'Ridică accelerația devreme și rulează prin zonă fără oprire completă.',
      evidence: 'Oportunitate STOP cu viteză peste 0.5 m/s la linie și brake peste 0 în apropiere.',
    },
  ),
  definition(
    'priority_assertiveness',
    'STOP_PRIORITY',
    'v2c-priority-assertiveness',
    'Asertivitatea la cedarea de prioritate',
    'stop-priority-conflict',
    ['CONFLICT', 'LEADER_GAP'],
    'YIELD',
    'LEADER',
    {
      setup:
        'Ajunge la o intersecție cu prioritate din toate direcțiile, cu un vehicul care are prioritate.',
      action: 'Alege să insiști sau să cedezi, în funcție de intervalul disponibil.',
      evidence: 'Stimul YIELD cu id-uri de relație și lider măsurat în aceeași fereastră.',
    },
  ),
  definition(
    'allway_stop_patience',
    'STOP_PRIORITY',
    'v2c-allway-patience',
    'Răbdarea la o intersecție cu prioritate din toate direcțiile',
    'stop-priority-conflict',
    ['STOP_LINE', 'LEADER_QUEUE'],
    'STOP',
    'LEADER',
    {
      setup: 'Ajunge al doilea la o intersecție cu prioritate din toate direcțiile.',
      action: 'Așteaptă oprirea liderului din față înainte de a intra în intersecție.',
      evidence: 'Oportunitate STOP cu lider oprit în față, sub pragul de standstill.',
    },
  ),
  definition(
    'blocked_intersection_entry_probability',
    'STOP_PRIORITY',
    'v2c-blocked-entry',
    'Intrarea într-o intersecție blocată',
    'stop-priority-conflict',
    ['CONFLICT', 'STOP_LINE', 'LEADER_GAP'],
    'STOP',
    'LEADER',
    {
      setup: 'Intersecție aglomerată, cu coadă care blochează ieșirea.',
      action: 'Hotărăște dacă intri în intersecție sau aștepți eliberarea ei.',
      evidence: 'Linie de oprire măsurată, conflict activ și lider în aceeași fereastră.',
    },
  ),
  definition(
    'lane_change_duration',
    'LANE_CHANGE',
    'v2c-lane-change-duration',
    'Durata manevrei de schimbare a benzii',
    'lane-change-overtake',
    ['LANE_CHANGE_OPEN', 'LANE_CHANGE_CLOSED'],
    'LANE_CHANGE',
    'NONE',
    {
      setup: 'Rulează pe un bulevard cu două benzi pe sens, banda din dreapta liberă.',
      action: 'Semnalizează și schimbă banda o singură dată, lin, fără corecții.',
      evidence:
        'Evenimente LANE_CHANGE_STARTED și LANE_CHANGE_COMPLETED pentru aceeași bandă sursă și destinație.',
    },
  ),
  definition(
    'signal_lead_time',
    'LANE_CHANGE',
    'v2c-signal-lead-time',
    'Timpul dintre semnalizare și manevră',
    'lane-change-overtake',
    ['LANE_CHANGE_OPEN', 'TURN_SIGNAL', 'STEERING_INPUT'],
    'LANE_CHANGE',
    'NONE',
    {
      setup: 'Pregătește o depășire pe un drum cu două benzi.',
      action: 'Semnalizează cu câteva secunde înainte de a începe virajul de bandă.',
      evidence:
        'Eșantion cu turnSignal LEFT/RIGHT înainte de LANE_CHANGE_STARTED și viraj peste 0.',
    },
  ),
  definition(
    'signal_use_probability',
    'LANE_CHANGE',
    'v2c-signal-use',
    'Probabilitatea de a semnaliza',
    'lane-change-overtake',
    ['LANE_CHANGE_OPEN', 'TURN_SIGNAL'],
    'LANE_CHANGE',
    'NONE',
    {
      setup: 'Ai de făcut o schimbare de bandă pe un drum liber.',
      action: 'Alege conștient dacă semnalizezi sau nu înainte de manevră.',
      evidence:
        'Eveniment LANE_CHANGE_STARTED cu turnSignal LEFT/RIGHT în eșantionul din aceeași fereastră.',
    },
  ),
  definition(
    'pass_on_right_probability',
    'LANE_CHANGE',
    'v2c-pass-on-right',
    'Depășirea prin dreapta',
    'lane-change-overtake',
    ['LANE_CHANGE_OPEN', 'LEADER_GAP', 'THROTTLE_INPUT'],
    'LANE_CHANGE',
    'LEADER',
    {
      setup: 'Un vehicul lent ocupă banda din stânga pe un drum cu două benzi.',
      action: 'Continuă pe banda din dreapta și depășește prin dreapta.',
      evidence: 'Lider măsurat, LANE_CHANGE_STARTED în aceeași fereastră și throttle peste 0.',
    },
  ),
  definition(
    'lane_center_offset',
    'LATERAL',
    'v2c-lane-center-offset',
    'Offsetul față de centrul benzii',
    'lateral-curve-tracking',
    ['STEERING_INPUT', 'CURVATURE', 'LATERAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Intră într-o curbă de rază medie, pe o bandă marcată.',
      action: 'Parcurge curba cu corecții mici, fără să atingi marcajul.',
      evidence: 'Eșantioane cu curbură nenulă, viraj nenul și accelerație laterală măsurată.',
    },
  ),
  definition(
    'steering_response_time',
    'LATERAL',
    'v2c-steering-response',
    'Timpul de răspuns al direcției',
    'lateral-curve-tracking',
    ['STEERING_INPUT', 'LATERAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Rulează pe un drum drept, apoi intră într-o curbă ușoară.',
      action: 'Aplică o corecție scurtă de direcție și observă când apare accelerația laterală.',
      evidence: 'Eșantioane cu viraj nenul și accelerație laterală nenulă în aceeași fereastră.',
    },
  ),
  definition(
    'steering_rate_limit',
    'LATERAL',
    'v2c-steering-rate',
    'Limita vitezei de bracare',
    'lateral-curve-tracking',
    ['STEERING_INPUT', 'LATERAL_ACCEL', 'SPEED_MEASURED'],
    null,
    'NONE',
    {
      setup: 'Abordează o curbă strânsă la 50–60 km/h.',
      action: 'Braciază rapid la intrare și menține direcția prin curbă.',
      evidence: 'Eșantioane cu viteză peste 5 m/s, viraj nenul și accelerație laterală măsurată.',
    },
  ),
  definition(
    'turn_entry_speed',
    'LATERAL',
    'v2c-turn-entry-speed',
    'Viteza de intrare în viraj',
    'lateral-curve-tracking',
    ['CURVATURE', 'SPEED_MEASURED', 'STEERING_INPUT'],
    null,
    'NONE',
    {
      setup: 'Apropie-te de un viraj de 90 de grade, cu vizibilitate bună.',
      action: 'Frânează înainte de viraj și intră cu viteză constantă.',
      evidence: 'Eșantioane cu curbură peste prag, viteză peste 5 m/s și viraj nenul.',
    },
  ),
  definition(
    'turn_exit_acceleration',
    'LATERAL',
    'v2c-turn-exit-accel',
    'Accelerația la ieșirea din viraj',
    'lateral-curve-tracking',
    ['CURVATURE', 'LONGITUDINAL_ACCEL', 'THROTTLE_INPUT'],
    null,
    'NONE',
    {
      setup: 'Ieși dintr-un viraj de 90 de grade pe un drum drept.',
      action: 'Accelerează progresiv după ce direcția este stabilizată.',
      evidence:
        'Eșantioane cu curbură măsurată, throttle peste 0 și accelerație longitudinală pozitivă.',
    },
  ),
  definition(
    'corner_cutting_bias',
    'LATERAL',
    'v2c-corner-cutting',
    'Tendința de a tăia virajul',
    'lateral-curve-tracking',
    ['CURVATURE', 'STEERING_INPUT', 'LATERAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Virează la stânga într-o intersecție fără trafic.',
      action: 'Alege traiectoria: arcuiește larg sau taie colțul.',
      evidence: 'Eșantioane cu curbură mare, viraj susținut și accelerație laterală măsurată.',
    },
  ),
  definition(
    'lateral_clearance',
    'LATERAL',
    'v2c-lateral-clearance',
    'Distanța laterală față de un obstacol',
    'lateral-curve-tracking',
    ['CONFLICT', 'LATERAL_ACCEL', 'STEERING_INPUT'],
    null,
    'IMPACT',
    {
      setup: 'Treacă pe lângă un vehicul oprit pe marginea benzii.',
      action: 'Alege cât de aproape treci și corectează direcția.',
      evidence: 'Conflict activ în eșantion, viraj nenul și accelerație laterală măsurată.',
    },
  ),
  definition(
    'lateral_correction_deadband',
    'LATERAL',
    'v2c-lateral-deadband',
    'Banda moartă a corecțiilor laterale',
    'lateral-curve-tracking',
    ['STEERING_INPUT', 'CURVATURE', 'LATERAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Rulează pe un drum drept, cu derivă mică spre marginea benzii.',
      action: 'Lasă deriva să crească și corectează doar când este vizibilă.',
      evidence: 'Eșantioane cu viraj mic, curbură măsurată și accelerație laterală nenulă.',
    },
  ),
  definition(
    'route_time_weight',
    'ROUTING',
    'v2c-route-time',
    'Ponderea timpului în alegerea traseului',
    'routing-blocked-reroute',
    ['ROUTE_ALTERNATIVE', 'ROUTE_SIGNAL'],
    null,
    'NONE',
    {
      setup: 'Pornește o cursă cu două trasee comparabile, unul cu mai puține semafoare.',
      action: 'Lasă planificatorul să aleagă și repetă cursa de trei ori.',
      evidence: 'Fapt de rutare cu cel puțin două alternative și semafoare numărate pe traseu.',
    },
  ),
  definition(
    'route_distance_weight',
    'ROUTING',
    'v2c-route-distance',
    'Ponderea distanței în alegerea traseului',
    'routing-blocked-reroute',
    ['ROUTE_ALTERNATIVE', 'ROUTE_TURN'],
    null,
    'NONE',
    {
      setup: 'Pornește o cursă cu un traseu scurt cu viraje și unul lung drept.',
      action: 'Compară cele două alegeri în două curse identice.',
      evidence: 'Fapt de rutare cu alternative multiple și viraje numărate.',
    },
  ),
  definition(
    'route_turn_penalty',
    'ROUTING',
    'v2c-route-turn-penalty',
    'Penalizarea virajelor în costul traseului',
    'routing-blocked-reroute',
    ['ROUTE_ALTERNATIVE', 'ROUTE_TURN'],
    null,
    'NONE',
    {
      setup: 'Alege între un traseu cu două viraje și unul drept, de lungime apropiată.',
      action: 'Rulează ambele variante și compară timpii.',
      evidence: 'Alternative comparabile cu număr de viraje măsurat pe fiecare.',
    },
  ),
  definition(
    'route_signal_penalty',
    'ROUTING',
    'v2c-route-signal-penalty',
    'Penalizarea semafoarelor în costul traseului',
    'routing-blocked-reroute',
    ['ROUTE_ALTERNATIVE', 'ROUTE_SIGNAL', 'SIGNAL_RED'],
    null,
    'NONE',
    {
      setup: 'Alege între un traseu cu trei semafoare și unul cu unul singur.',
      action: 'Rulează traseul cu semafoare și oprește la roșu, apoi compară.',
      evidence: 'Alternative cu semafoare numărate și cel puțin un eșantion cu semafor roșu.',
    },
  ),
  definition(
    'route_congestion_penalty',
    'ROUTING',
    'v2c-route-congestion',
    'Penalizarea congestiei în costul traseului',
    'routing-blocked-reroute',
    ['ROUTE_ALTERNATIVE', 'ROUTE_CONGESTION', 'CONFLICT'],
    null,
    'LEADER',
    {
      setup: 'Pornește într-o zonă cu trafic, cu o alternativă liberă.',
      action: 'Observă dacă planificatorul ocolește zona congestionată.',
      evidence: 'Alternative cu congestie raportată și conflict activ în aceeași fereastră.',
    },
  ),
  definition(
    'reroute_patience',
    'ROUTING',
    'v2c-reroute-patience',
    'Răbdarea înainte de rerutare',
    'routing-blocked-reroute',
    ['ROUTE_BLOCKED', 'REROUTE'],
    null,
    'MECHANICAL_LIMIT',
    {
      setup: 'Intră pe o bandă blocată de un vehicul oprit, cu alternativă disponibilă.',
      action: 'Așteaptă fără să ocolești până când decizia de rerutare apare.',
      evidence: 'Fapt de rutare BLOCKED urmat de etapa REROUTE în aceeași fereastră.',
    },
  ),
  definition(
    'u_turn_willingness',
    'ROUTING',
    'v2c-u-turn',
    'Disponibilitatea pentru întoarcere',
    'routing-blocked-reroute',
    ['U_TURN', 'ROUTE_ALTERNATIVE'],
    null,
    'NONE',
    {
      setup: 'Ratează intrarea pe destinație și primește o alternativă cu întoarcere.',
      action: 'Alege între întoarcere și un ocol lung.',
      evidence: 'Fapt de rutare cu întoarcere disponibilă și alternative multiple.',
    },
  ),
  definition(
    'reverse_recovery_duration',
    'ROUTING',
    'v2c-reverse-recovery',
    'Durata recuperării prin mers înapoi',
    'routing-blocked-reroute',
    ['REVERSE_RECOVERY', 'SPEED_MEASURED'],
    null,
    'MECHANICAL_LIMIT',
    {
      setup: 'Blochează-te într-o fundătură îngustă, fără spațiu de întoarcere.',
      action: 'Execută manevra de recuperare prin mers înapoi până la ieșire.',
      evidence: 'Fapt de recuperare în etapa RECOVERY și eșantioane cu viteză măsurată.',
    },
  ),
  definition(
    'pedestrian_yield_probability',
    'HAZARDS',
    'v2c-pedestrian-yield',
    'Cedarea către un pieton',
    'hazards-crosswalk-obstacle',
    ['PEDESTRIAN', 'BRAKE_INPUT'],
    null,
    'NONE',
    {
      setup: 'Apropie-te de o trecere de pietoni cu un pieton observabil pe trotuar.',
      action: 'Decide dacă oprești sau continui când pietonul intră în zonă.',
      evidence: 'Observație de pericol PEDESTRIAN activă și observabilă, plus brake peste 0.',
    },
  ),
  definition(
    'pedestrian_clearance',
    'HAZARDS',
    'v2c-pedestrian-clearance',
    'Distanța de siguranță față de pieton',
    'hazards-crosswalk-obstacle',
    ['PEDESTRIAN', 'SPEED_MEASURED'],
    null,
    'NONE',
    {
      setup: 'Treacă pe lângă un pieton care așteaptă la marginea trecerii.',
      action: 'Alege viteza și traiectoria de trecere.',
      evidence: 'Pericol PEDESTRIAN observabil și viteză măsurată în aceeași fereastră.',
    },
  ),
  definition(
    'hazard_reaction_delay',
    'HAZARDS',
    'v2c-hazard-reaction',
    'Întârzierea de reacție la pericol',
    'hazards-crosswalk-obstacle',
    ['PEDESTRIAN', 'BRAKE_INPUT', 'LONGITUDINAL_ACCEL'],
    null,
    'NONE',
    {
      setup: 'Pietonul apare la 25 m, pe o trecere fără semafor.',
      action: 'Frânează cât de repede consideri necesar.',
      evidence:
        'Pericol observabil, brake peste 0 și accelerație longitudinală negativă imediat după.',
    },
  ),
  definition(
    'obstacle_clearance',
    'HAZARDS',
    'v2c-obstacle-clearance',
    'Distanța față de un obstacol',
    'hazards-crosswalk-obstacle',
    ['OBSTACLE', 'SPEED_MEASURED'],
    null,
    'NONE',
    {
      setup: 'Un obstacol oprește banda la 30 m.',
      action: 'Alege dacă încetinești sau ocolești.',
      evidence: 'Pericol OBSTACLE observabil și viteză măsurată în aceeași fereastră.',
    },
  ),
  definition(
    'emergency_brake_intensity',
    'HAZARDS',
    'v2c-emergency-brake',
    'Intensitatea frânei de urgență',
    'hazards-crosswalk-obstacle',
    ['OBSTACLE', 'BRAKE_INPUT', 'LONGITUDINAL_ACCEL'],
    null,
    'IMPACT',
    {
      setup: 'Obstacolul apare brusc la 15 m, fără timp de ocolire.',
      action: 'Apasă frâna la maximum.',
      evidence: 'Pericol observabil, brake peste 0 și decelerație măsurată în aceeași fereastră.',
    },
  ),
  definition(
    'evasive_steer_willingness',
    'HAZARDS',
    'v2c-evasive-steer',
    'Disponibilitatea pentru viraj de evitare',
    'hazards-crosswalk-obstacle',
    ['OBSTACLE', 'STEERING_INPUT', 'LATERAL_ACCEL'],
    null,
    'IMPACT',
    {
      setup: 'Obstacol pe bandă, cu banda alăturată liberă.',
      action: 'Alege între frână și viraj de evitare.',
      evidence: 'Pericol observabil, viraj nenul și accelerație laterală măsurată.',
    },
  ),
  definition(
    'crosswalk_approach_speed',
    'HAZARDS',
    'v2c-crosswalk-approach',
    'Viteza de apropiere de trecerea de pietoni',
    'hazards-crosswalk-obstacle',
    ['PEDESTRIAN', 'STOP_LINE', 'SPEED_MEASURED'],
    null,
    'NONE',
    {
      setup: 'Apropie-te de o trecere de pietoni marcată, cu pieton vizibil.',
      action: 'Menține viteza de oraș până la trecere.',
      evidence: 'Pericol PEDESTRIAN observabil, linie de oprire măsurată și viteză peste 5 m/s.',
    },
  ),
  definition(
    'horn_use_probability',
    'HAZARDS',
    'v2c-horn-use',
    'Folosirea claxonului într-o oportunitate',
    'hazards-crosswalk-obstacle',
    ['PEDESTRIAN', 'HORN_ACTION'],
    null,
    'NONE',
    {
      setup: 'Pietonul întârzie pe trecere, iar banda este liberă.',
      action: 'Apasă claxonul când pietonul nu reacționează.',
      evidence:
        'Pericol PEDESTRIAN observabil și acțiunea de claxon declarată de fixture-ul controlat.',
    },
  ),
  definition(
    'pickup_approach_speed',
    'SERVICE',
    'v2c-pickup-approach',
    'Viteza de apropiere de pickup',
    'service-pickup-dropoff',
    ['SERVICE_APPROACH', 'SPEED_MEASURED', 'CURB_DISTANCE'],
    null,
    'NONE',
    {
      setup: 'Acceptă o cursă cu punct de pickup pe o stradă îngustă.',
      action: 'Apropie-te de zona de serviciu și oprește la bordură.',
      evidence:
        'Fapt de serviciu în faza TO_PICKUP, distanță la bordură măsurată și viteză peste 1 m/s.',
    },
  ),
  definition(
    'pickup_curb_distance',
    'SERVICE',
    'v2c-pickup-curb',
    'Distanța la bordură la pickup',
    'service-pickup-dropoff',
    ['CURB_DISTANCE', 'SERVICE_APPROACH'],
    null,
    'NONE',
    {
      setup: 'Oprește la un pickup cu bordură înaltă.',
      action: 'Alege cât de aproape de bordură oprești.',
      evidence: 'Fapt de serviciu cu distanță la bordură măsurată în faza de apropiere.',
    },
  ),
  definition(
    'pickup_stop_precision',
    'SERVICE',
    'v2c-pickup-precision',
    'Precizia opririi la pickup',
    'service-pickup-dropoff',
    ['STOP_PRECISION', 'CURB_DISTANCE'],
    null,
    'NONE',
    {
      setup: 'Punctul de pickup este marcat pe trotuar, cu o singură poziție validă.',
      action: 'Oprește cât mai aproape de marcajul pasagerului.',
      evidence: 'Fapt de serviciu cu precizie de oprire și distanță la bordură măsurate.',
    },
  ),
  definition(
    'pickup_dwell_time',
    'SERVICE',
    'v2c-pickup-dwell',
    'Timpul de staționare la pickup',
    'service-pickup-dropoff',
    ['PICKUP_EVENT', 'STOP_PRECISION'],
    null,
    'NONE',
    {
      setup: 'Pasagerul urcă la un pickup aglomerat.',
      action: 'Așteaptă până când pasagerul este urcat, apoi pleacă.',
      evidence: 'Eveniment PICKUP cu precizia opririi măsurată în aceeași fereastră.',
    },
  ),
  definition(
    'dropoff_approach_speed',
    'SERVICE',
    'v2c-dropoff-approach',
    'Viteza de apropiere de dropoff',
    'service-pickup-dropoff',
    ['SERVICE_APPROACH', 'PASSENGER_ONBOARD', 'SPEED_MEASURED'],
    null,
    'NONE',
    {
      setup: 'Ai pasager la bord și te apropii de destinație.',
      action: 'Încetinești progresiv până la zona de dropoff.',
      evidence: 'Fapt de serviciu în faza TO_DROPOFF, pasager la bord și viteză peste 1 m/s.',
    },
  ),
  definition(
    'dropoff_curb_distance',
    'SERVICE',
    'v2c-dropoff-curb',
    'Distanța la bordură la dropoff',
    'service-pickup-dropoff',
    ['CURB_DISTANCE', 'DROPOFF_EVENT'],
    null,
    'NONE',
    {
      setup: 'Destinația are o bordură joasă, fără refugiu.',
      action: 'Oprește cât mai aproape de bordură fără să blochezi banda.',
      evidence: 'Eveniment DROPOFF cu distanță la bordură măsurată în aceeași fereastră.',
    },
  ),
  definition(
    'occupied_acceleration_scale',
    'SERVICE',
    'v2c-occupied-accel',
    'Scalarea accelerației cu pasager',
    'service-pickup-dropoff',
    ['PASSENGER_ONBOARD', 'LONGITUDINAL_ACCEL', 'THROTTLE_INPUT'],
    null,
    'NONE',
    {
      setup: 'Pornește de la pickup cu pasagerul la bord.',
      action: 'Pleacă lin și accelerează progresiv.',
      evidence: 'Pasager la bord, throttle peste 0 și accelerație longitudinală pozitivă.',
    },
  ),
  definition(
    'occupied_lateral_accel_scale',
    'SERVICE',
    'v2c-occupied-lateral',
    'Scalarea accelerației laterale cu pasager',
    'service-pickup-dropoff',
    ['PASSENGER_ONBOARD', 'LATERAL_ACCEL', 'CURVATURE'],
    null,
    'NONE',
    {
      setup: 'Cu pasager la bord, intră într-o curbă de rază medie.',
      action: 'Alege viteza de trecere prin curbă.',
      evidence: 'Pasager la bord, accelerație laterală măsurată și curbură nenulă.',
    },
  ),
]);

/** The 24 delivered V1 (M) keys. This module never redefines, renames or re-thresholds them. */
export const v1ParameterKeys = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'yield_time_gap',
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
] as const);

/**
 * Declared V1 compatibility. Nothing was renamed and no threshold moved, so the migration entry is
 * explicit rather than implicit: `migration: 'none'` plus the exact preserved catalog fields.
 */
export const V1_COMPATIBILITY = Object.freeze({
  version: '163-v1-compatibility-v1',
  protectedKeys: v1ParameterKeys,
  preservedCatalogFields: Object.freeze([
    'default',
    'min',
    'max',
    'unit',
    'category',
    'implementationStage',
  ]),
  renamedKeys: Object.freeze([] as readonly string[]),
  changedThresholds: Object.freeze([] as readonly string[]),
  migration: 'none: no V1 key was renamed or re-thresholded by 163',
  evidencePreserved: Object.freeze([
    'Docs/Evidence/151-scenario-suite/report.json',
    'Docs/Evidence/216-v1-regression/report.json',
    'Docs/Evidence/142-experiment-rerun/report.json',
    'Docs/Evidence/056-auto-scenarios/report.json',
  ]),
});

/** A closed reason a catalog rule is refused; the catalog itself is validated at module load. */
export const v2ContextRejectionCodes = [
  'DUPLICATE_KEY',
  'UNKNOWN_KEY',
  'V1_KEY_REDEFINED',
  'CATEGORY_MISMATCH',
  'EMPTY_REQUIREMENTS',
  'UNKNOWN_FACET',
  'UNKNOWN_SCENARIO',
  'CONSTRAINT_CLASS_MISMATCH',
  'INCOMPLETE_CATEGORY',
  'FRAME_TICK_MISMATCH',
  'EVENT_TICK_MISMATCH',
  'TICK_REGRESSION',
] as const;
export type V2ContextRejectionCode = (typeof v2ContextRejectionCodes)[number];

export type V2ContextValidation =
  | { readonly valid: true; readonly keys: number; readonly categories: number }
  | { readonly valid: false; readonly code: V2ContextRejectionCode; readonly detail: string };

const categoryKeyCounts: Readonly<Record<V2ContextCategory, number>> = Object.freeze({
  SPEED: 4,
  LONGITUDINAL: 4,
  FOLLOWING: 4,
  SIGNALS: 4,
  STOP_PRIORITY: 4,
  LANE_CHANGE: 4,
  LATERAL: 8,
  ROUTING: 8,
  HAZARDS: 8,
  SERVICE: 8,
});

/**
 * Validates the full catalog: 56 unique R keys, 24 V1 keys untouched, every category complete, every
 * required facet known, every scenario a declared representative one, and every constraint mapped to
 * the real 087 label class (NONE must be ELIGIBLE, any other value must be EXTERNAL_CONSTRAINT).
 */
export function validateV2ContextCatalog(): V2ContextValidation {
  const seen = new Set<string>();
  const perCategory = new Map<V2ContextCategory, number>();
  const v1 = new Set<string>(v1ParameterKeys);
  for (const entry of v2ContextDefinitions) {
    if (v1.has(entry.key))
      return { valid: false, code: 'V1_KEY_REDEFINED', detail: `${entry.key} is a V1 key` };
    if (seen.has(entry.key)) return { valid: false, code: 'DUPLICATE_KEY', detail: entry.key };
    seen.add(entry.key);
    if (entry.requires.length === 0)
      return { valid: false, code: 'EMPTY_REQUIREMENTS', detail: entry.key };
    for (const facet of entry.requires)
      if (!(v2ContextFacets as readonly string[]).includes(facet))
        return { valid: false, code: 'UNKNOWN_FACET', detail: `${entry.key}: ${facet}` };
    if (!(v2RepresentativeScenarioIds as readonly string[]).includes(entry.scenarioId))
      return {
        valid: false,
        code: 'UNKNOWN_SCENARIO',
        detail: `${entry.key}: ${entry.scenarioId}`,
      };
    const expectedLabel = v2ContextConstraintLabels[entry.constraint];
    const expectedClass = entry.constraint === 'NONE' ? 'ELIGIBLE' : 'EXTERNAL_CONSTRAINT';
    if (eligibilityLabelClasses[expectedLabel] !== expectedClass)
      return {
        valid: false,
        code: 'CONSTRAINT_CLASS_MISMATCH',
        detail: `${entry.key}: ${expectedLabel}`,
      };
    perCategory.set(entry.category, (perCategory.get(entry.category) ?? 0) + 1);
  }
  for (const category of v2ContextCategories)
    if ((perCategory.get(category) ?? 0) !== categoryKeyCounts[category])
      return {
        valid: false,
        code: 'INCOMPLETE_CATEGORY',
        detail: `${category}: ${perCategory.get(category) ?? 0}/${categoryKeyCounts[category]}`,
      };
  if (seen.size !== 56)
    return { valid: false, code: 'INCOMPLETE_CATEGORY', detail: `keys ${seen.size}/56` };
  return { valid: true, keys: seen.size, categories: v2ContextCategories.length };
}

export const v2ContextCatalogValidation = validateV2ContextCatalog();
if (!v2ContextCatalogValidation.valid)
  throw new Error(
    `Invalid V2 context catalog: ${v2ContextCatalogValidation.code} ${v2ContextCatalogValidation.detail}`,
  );

const definitionsByKey = new Map(v2ContextDefinitions.map((entry) => [entry.key, entry]));
export const v2ContextKeys: readonly string[] = Object.freeze(
  v2ContextDefinitions.map((entry) => entry.key),
);

/** Rejects an unknown key explicitly instead of returning an empty context. */
export function getV2Context(key: string): V2ContextDefinition {
  const found = definitionsByKey.get(text(key));
  requireContract(found !== undefined, `Unknown V2 context key: ${key}`);
  return found!;
}

export function v2ContextsByCategory(category: V2ContextCategory): readonly V2ContextDefinition[] {
  return Object.freeze(v2ContextDefinitions.filter((entry) => entry.category === category));
}

/** Signed frame inputs: real contracts where they exist, provenance-labelled facts elsewhere. */
export interface V2HazardFact {
  readonly entityId: string;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly radiusM: number;
  readonly active: boolean;
  readonly observable: boolean;
}

export type V2RouteFactStatus = RouteStatus;
export type V2RouteRecoveryStage = BlockedRecoveryStage;

export interface V2RouteFact {
  readonly status: V2RouteFactStatus;
  /** Comparable alternatives the planner actually evaluated (1 when there is a single route). */
  readonly alternatives: number;
  readonly selectedIndex: number;
  readonly costSeconds: number;
  readonly turnCount: number;
  readonly signalCount: number;
  readonly congestedAlternatives: number;
  readonly blockedLaneIds: readonly string[];
  readonly recoveryStage: V2RouteRecoveryStage;
  readonly uTurnAvailable: boolean;
  /** Who measured the fact: the real 033/219 planner, or a controlled fixture. */
  readonly source: 'ROUTE_PLANNER' | 'CONTROLLED_FIXTURE';
}

export interface V2ServiceFact {
  readonly phase: 'TO_PICKUP' | 'AT_PICKUP' | 'TO_DROPOFF' | 'AT_DROPOFF';
  readonly curbDistanceM: number;
  readonly stopPrecisionM: number;
  readonly passengerOnboard: boolean;
  /** Who measured the fact: the real 061 ride FSM, or a controlled fixture. */
  readonly source: 'RIDE_FSM' | 'CONTROLLED_FIXTURE';
}

/**
 * A driver action that has no live telemetry channel yet. Only the controlled fixture source exists
 * today; the report names it as a limitation instead of pretending it is live input.
 */
export interface V2DriverAction {
  readonly action: 'HORN';
  readonly source: 'CONTROLLED_FIXTURE';
}

export interface V2ContextFrame {
  readonly tick: number;
  readonly sample: TelemetrySample;
  readonly events: readonly SimulationEvent[];
  readonly hazards: readonly V2HazardFact[];
  readonly route: V2RouteFact | null;
  readonly service: V2ServiceFact | null;
  readonly driverActions: readonly V2DriverAction[];
}

export interface V2ContextScenario {
  readonly scenarioId: string;
  /** null for the negative control, which belongs to no R category. */
  readonly category: V2ContextCategory | null;
  readonly title: string;
  readonly frames: readonly V2ContextFrame[];
}

export interface V2ContextKeyResult {
  readonly key: string;
  readonly category: V2ContextCategory;
  readonly contextId: string;
  readonly label: string;
  readonly observable: boolean;
  readonly observableFrames: number;
  readonly firstObservableTick: number | null;
  readonly missingFacets: readonly V2ContextFacet[];
  readonly opportunityKind: OpportunityKind | null;
  readonly constraint: V2ContextConstraint;
}

export interface V2TriggerResult {
  readonly id: string;
  readonly description: string;
  readonly observed: boolean;
  readonly evidence: string;
}

export interface V2ScenarioEvaluation {
  readonly version: typeof V2_CONTEXT_VERSION;
  readonly scenarioId: string;
  readonly category: V2ContextCategory | null;
  readonly title: string;
  readonly frames: number;
  readonly firstTick: number;
  readonly lastTick: number;
  readonly categoryKeys: number;
  readonly observableKeys: number;
  readonly keys: readonly V2ContextKeyResult[];
  readonly triggers: readonly V2TriggerResult[];
  /** A category scenario is representative only when every key and every trigger is observed. */
  readonly representative: boolean;
  readonly missingKeys: readonly string[];
  readonly failedTriggers: readonly string[];
}

const frameFields = [
  'tick',
  'sample',
  'events',
  'hazards',
  'route',
  'service',
  'driverActions',
] as const;
const hazardFields = ['entityId', 'kind', 'radiusM', 'active', 'observable'] as const;
const routeFields = [
  'status',
  'alternatives',
  'selectedIndex',
  'costSeconds',
  'turnCount',
  'signalCount',
  'congestedAlternatives',
  'blockedLaneIds',
  'recoveryStage',
  'uTurnAvailable',
  'source',
] as const;
const serviceFields = [
  'phase',
  'curbDistanceM',
  'stopPrecisionM',
  'passengerOnboard',
  'source',
] as const;
const driverActionFields = ['action', 'source'] as const;
const scenarioFields = ['scenarioId', 'category', 'title', 'frames'] as const;
const routeStatuses = [
  'READY',
  'BLOCKED',
  'UNREACHABLE',
  'ORIGIN_UNKNOWN',
  'DESTINATION_UNKNOWN',
  'SERVICE_ACCESS_MISMATCH',
  'BUDGET_EXHAUSTED',
] as const satisfies readonly V2RouteFactStatus[];
const recoveryStages = [
  'NONE',
  'WAITING',
  'REROUTE',
  'RECOVERY',
  'STAY_BLOCKED',
] as const satisfies readonly V2RouteRecoveryStage[];
const servicePhases = ['TO_PICKUP', 'AT_PICKUP', 'TO_DROPOFF', 'AT_DROPOFF'] as const;

const readHazard = (value: unknown): V2HazardFact => {
  const data = fields(value, hazardFields);
  return Object.freeze({
    entityId: text(data.entityId),
    kind: choice(data.kind, ['PEDESTRIAN', 'OBSTACLE'] as const),
    radiusM: number(data.radiusM, 0, 10),
    active: boolean(data.active),
    observable: boolean(data.observable),
  });
};

const readRoute = (value: unknown): V2RouteFact => {
  const data = fields(value, routeFields);
  const alternatives = readTick(data.alternatives);
  const selectedIndex = readTick(data.selectedIndex);
  requireContract(
    alternatives >= 1 && alternatives <= 8 && selectedIndex < alternatives,
    'Route alternatives out of range',
  );
  return Object.freeze({
    status: choice(data.status, routeStatuses),
    alternatives,
    selectedIndex,
    costSeconds: number(data.costSeconds, 0, 100000),
    turnCount: readTick(data.turnCount),
    signalCount: readTick(data.signalCount),
    congestedAlternatives: readTick(data.congestedAlternatives),
    blockedLaneIds: list(data.blockedLaneIds, (entry) => text(entry)),
    recoveryStage: choice(data.recoveryStage, recoveryStages),
    uTurnAvailable: boolean(data.uTurnAvailable),
    source: choice(data.source, ['ROUTE_PLANNER', 'CONTROLLED_FIXTURE'] as const),
  });
};

const readService = (value: unknown): V2ServiceFact => {
  const data = fields(value, serviceFields);
  return Object.freeze({
    phase: choice(data.phase, servicePhases),
    curbDistanceM: number(data.curbDistanceM, 0, 100),
    stopPrecisionM: number(data.stopPrecisionM, 0, 100),
    passengerOnboard: boolean(data.passengerOnboard),
    source: choice(data.source, ['RIDE_FSM', 'CONTROLLED_FIXTURE'] as const),
  });
};

const readDriverAction = (value: unknown): V2DriverAction => {
  const data = fields(value, driverActionFields);
  return Object.freeze({
    action: choice(data.action, ['HORN'] as const),
    source: choice(data.source, ['CONTROLLED_FIXTURE'] as const),
  });
};

/** Parses one frame and refuses a sample/event tick that does not belong to the frame tick. */
export function parseV2ContextFrame(value: unknown): V2ContextFrame {
  const data = fields(value, frameFields);
  const frameTick = readTick(data.tick);
  const sample = parseTelemetrySample(data.sample);
  requireContract(sample.tick === frameTick, 'V2 frame tick does not match its sample');
  const events = list(data.events, (entry) => parseSimulationEvent(entry));
  for (const event of events)
    requireContract(event.tick === frameTick, 'V2 frame event tick does not match the frame');
  const route = data.route === null ? null : readRoute(data.route);
  return Object.freeze({
    tick: frameTick,
    sample,
    events,
    hazards: list(data.hazards, readHazard),
    route,
    service: data.service === null ? null : readService(data.service),
    driverActions: list(data.driverActions, readDriverAction),
  });
}

export function parseV2ContextScenario(value: unknown): V2ContextScenario {
  const data = fields(value, scenarioFields);
  const category = data.category === null ? null : choice(data.category, v2ContextCategories);
  const frames = list(data.frames, parseV2ContextFrame);
  requireContract(frames.length > 0, 'V2 scenario requires at least one frame');
  let previous = -1;
  for (const frame of frames) {
    requireContract(frame.tick > previous, 'V2 scenario ticks must increase');
    previous = frame.tick;
  }
  return Object.freeze({
    scenarioId: text(data.scenarioId),
    category,
    title: text(data.title),
    frames,
  });
}

/** Speed magnitude of the real 085/069 state, in m/s. */
export function frameSpeedMps(sample: TelemetrySample): number {
  const { x, y, z } = sample.state.velocityMps;
  return Math.hypot(x, y, z);
}

/**
 * Derives the observable facets of one frame from the authoritative contracts it carries. Pure and
 * total: no clock, no random, no hidden state.
 */
export function readV2FrameFacets(frame: V2ContextFrame): ReadonlySet<V2ContextFacet> {
  const facets = new Set<V2ContextFacet>();
  const { sample } = frame;
  const speed = frameSpeedMps(sample);
  if (speed > 0.1) facets.add('SPEED_MEASURED');
  if (sample.context.roadType === 'RESIDENTIAL') facets.add('ROAD_TYPE_RESIDENTIAL');
  if (sample.context.roadType === 'URBAN') facets.add('ROAD_TYPE_URBAN');
  if (sample.context.roadType === 'ARTERIAL') facets.add('ROAD_TYPE_ARTERIAL');
  if (Math.abs(sample.context.curvaturePerM) > 0) facets.add('CURVATURE');
  if (sample.context.leaderId !== null && sample.context.leaderGapM !== null) {
    facets.add('LEADER_GAP');
    // Proxy declarat: `TelemetrySample` nu transportă viteza liderului, deci coada oprită este
    // standstill-ul propriu în spatele unui lider măsurat, cu pragul real al lui 048.
    if (speed <= FOLLOWING_LIMITS.standstillMps) facets.add('LEADER_QUEUE');
  }
  if (sample.context.signalState === 'RED') facets.add('SIGNAL_RED');
  if (sample.context.signalState === 'YELLOW') facets.add('SIGNAL_YELLOW');
  if (sample.context.signalState === 'GREEN') facets.add('SIGNAL_GREEN');
  if (sample.context.stopLineId !== null && sample.context.distanceToStopLineM !== null)
    facets.add('STOP_LINE');
  if (Math.abs(sample.rawInput.steering) > 0) facets.add('STEERING_INPUT');
  if (sample.rawInput.brake > 0) facets.add('BRAKE_INPUT');
  if (sample.rawInput.throttle > 0) facets.add('THROTTLE_INPUT');
  if (sample.rawInput.throttle === 0 && sample.rawInput.brake === 0 && speed > 1)
    facets.add('COASTING');
  if (Math.abs(sample.longitudinalAccelerationMps2) > 0) facets.add('LONGITUDINAL_ACCEL');
  if (Math.abs(sample.lateralAccelerationMps2) > 0) facets.add('LATERAL_ACCEL');
  if (sample.context.rideId !== null) facets.add('PASSENGER_ONBOARD');
  if (sample.context.conflictEntityIds.length > 0) facets.add('CONFLICT');
  if (sample.command.turnSignal !== 'OFF') facets.add('TURN_SIGNAL');
  if (sample.excludedReason === 'COLLISION_IMPULSE') facets.add('IMPACT');

  for (const event of frame.events) {
    if (event.type === 'LEADER_ACQUIRED') facets.add('LEADER_CHANGE');
    if (event.type === 'LANE_CHANGE_STARTED') facets.add('LANE_CHANGE_OPEN');
    if (event.type === 'LANE_CHANGE_COMPLETED') facets.add('LANE_CHANGE_CLOSED');
    if (event.type === 'PICKUP') facets.add('PICKUP_EVENT');
    if (event.type === 'DROPOFF') facets.add('DROPOFF_EVENT');
    if (event.type === 'COLLISION') facets.add('IMPACT');
  }
  for (const hazard of frame.hazards) {
    if (!hazard.active || !hazard.observable) continue;
    if (hazard.kind === 'PEDESTRIAN') facets.add('PEDESTRIAN');
    else facets.add('OBSTACLE');
  }
  const route = frame.route;
  if (route !== null) {
    if (route.status === 'READY' && route.alternatives >= 2) facets.add('ROUTE_ALTERNATIVE');
    if (route.status === 'BLOCKED') facets.add('ROUTE_BLOCKED');
    if (route.turnCount > 0) facets.add('ROUTE_TURN');
    if (route.signalCount > 0) facets.add('ROUTE_SIGNAL');
    if (route.congestedAlternatives > 0) facets.add('ROUTE_CONGESTION');
    if (route.recoveryStage === 'REROUTE') facets.add('REROUTE');
    if (route.recoveryStage === 'RECOVERY') facets.add('REVERSE_RECOVERY');
    if (route.uTurnAvailable && route.alternatives >= 2) facets.add('U_TURN');
  }
  const service = frame.service;
  if (service !== null) {
    facets.add('CURB_DISTANCE');
    if (service.phase === 'TO_PICKUP' || service.phase === 'TO_DROPOFF')
      facets.add('SERVICE_APPROACH');
    if (service.phase === 'AT_PICKUP' || service.phase === 'AT_DROPOFF')
      facets.add('STOP_PRECISION');
    if (service.passengerOnboard) facets.add('PASSENGER_ONBOARD');
  }
  if (frame.driverActions.some((action) => action.action === 'HORN')) facets.add('HORN_ACTION');
  return facets;
}

interface CategoryTrigger {
  readonly id: string;
  readonly description: string;
  readonly evaluate: (
    frames: readonly V2ContextFrame[],
    facets: readonly ReadonlySet<V2ContextFacet>[],
  ) => { readonly observed: boolean; readonly evidence: string };
}

const countFacet = (facets: readonly ReadonlySet<V2ContextFacet>[], facet: V2ContextFacet) =>
  facets.filter((entry) => entry.has(facet)).length;

const eventTypes = (frames: readonly V2ContextFrame[]) =>
  frames.flatMap((frame) => frame.events.map((event) => event.type));

/**
 * Typed constructor so every trigger arrow receives `V2ContextFrame[]`/facet-set parameters from the
 * declared contract instead of relying on inference through nested `Object.freeze` calls.
 */
const triggerTable = (
  value: Record<V2ContextCategory, readonly CategoryTrigger[]>,
): Readonly<Record<V2ContextCategory, readonly CategoryTrigger[]>> => Object.freeze(value);

const categoryTriggers: Readonly<Record<V2ContextCategory, readonly CategoryTrigger[]>> =
  triggerTable({
    SPEED: Object.freeze([
      {
        id: 'CRUISING_ON_TWO_ROAD_TYPES',
        description: 'Croazieră măsurată pe cel puțin două tipuri de drum, fără lider.',
        evaluate: (frames, facets) => {
          const roadTypes = new Set(
            frames
              .filter((_frame, index) => facets[index]!.has('SPEED_MEASURED'))
              .filter((frame) => frame.sample.context.leaderId === null)
              .map((frame) => frame.sample.context.roadType),
          );
          return {
            observed: roadTypes.size >= 2,
            evidence: `${roadTypes.size} tipuri de drum fără lider: ${[...roadTypes].sort().join(', ') || 'niciunul'}`,
          };
        },
      },
      {
        id: 'SPEED_ABOVE_AND_BELOW_LIMIT',
        description: 'Aceeași croazieră conține atât depășire, cât și respectare a limitei.',
        evaluate: (frames) => {
          let above = 0;
          let below = 0;
          for (const frame of frames) {
            const speed = frameSpeedMps(frame.sample);
            const limit = frame.sample.context.speedLimitMps;
            if (limit <= 0) continue;
            if (speed > limit) above += 1;
            if (speed < limit) below += 1;
          }
          return {
            observed: above > 0 && below > 0,
            evidence: `${above} eșantioane peste limită, ${below} sub limită`,
          };
        },
      },
    ]),
    LONGITUDINAL: Object.freeze([
      {
        id: 'ACCELERATION_AND_DECELERATION',
        description: 'Fereastra conține atât accelerare, cât și decelerare măsurată.',
        evaluate: (frames) => {
          const values = frames.map((frame) => frame.sample.longitudinalAccelerationMps2);
          const maximum = Math.max(...values);
          const minimum = Math.min(...values);
          return {
            observed: maximum > 0 && minimum < 0,
            evidence: `accelerație maximă ${maximum.toFixed(2)} m/s², minimă ${minimum.toFixed(2)} m/s²`,
          };
        },
      },
      {
        id: 'BRAKE_ONSET_BEHIND_LEADER',
        description: 'Frâna este aplicată în timp ce un lider este măsurat în față.',
        evaluate: (frames, facets) => {
          const count = frames.filter(
            (_frame, index) =>
              facets[index]!.has('BRAKE_INPUT') && facets[index]!.has('LEADER_GAP'),
          ).length;
          return { observed: count > 0, evidence: `${count} eșantioane cu frână și lider` };
        },
      },
    ]),
    FOLLOWING: Object.freeze([
      {
        id: 'LEADER_GAP_SEQUENCE',
        description: 'Cel puțin trei eșantioane consecutive cu lider și spațiu în scădere.',
        evaluate: (frames, facets) => {
          let run = 0;
          let decreasing = 0;
          let previous: number | null = null;
          for (let index = 0; index < frames.length; index += 1) {
            const gap = frames[index]!.sample.context.leaderGapM;
            if (!facets[index]!.has('LEADER_GAP') || gap === null) {
              run = 0;
              previous = null;
              continue;
            }
            run += 1;
            if (previous !== null && gap < previous) decreasing += 1;
            previous = gap;
          }
          return {
            observed: run >= 3 && decreasing > 0,
            evidence: `${run} eșantioane cu lider, ${decreasing} pași de scădere`,
          };
        },
      },
      {
        id: 'LEADER_CHANGE_OBSERVED',
        description: 'Liderul se schimbă cel puțin o dată, cu faptul publicat de 007.',
        evaluate: (_frames, facets) => {
          const count = countFacet(facets, 'LEADER_CHANGE');
          return { observed: count > 0, evidence: `${count} eșantioane cu LEADER_ACQUIRED` };
        },
      },
    ]),
    SIGNALS: Object.freeze([
      {
        id: 'RED_TO_GREEN_CYCLE',
        description: 'Ciclul roșu → verde este observat cu linie de oprire măsurată.',
        evaluate: (frames, facets) => {
          let red = 0;
          let green = 0;
          let stopLines = 0;
          for (let index = 0; index < frames.length; index += 1) {
            if (facets[index]!.has('SIGNAL_RED')) red += 1;
            if (facets[index]!.has('SIGNAL_GREEN')) green += 1;
            if (facets[index]!.has('STOP_LINE')) stopLines += 1;
          }
          return {
            observed: red > 0 && green > 0 && stopLines > 0,
            evidence: `${red} roșu, ${green} verde, ${stopLines} cu linie de oprire`,
          };
        },
      },
      {
        id: 'SIGNAL_PHASE_CHANGE_EVENT',
        description: 'Tranziția de fază este publicată de fluxul real 036.',
        evaluate: (frames) => {
          const count = eventTypes(frames).filter((type) => type === 'SIGNAL_PHASE_CHANGED').length;
          return { observed: count > 0, evidence: `${count} evenimente SIGNAL_PHASE_CHANGED` };
        },
      },
    ]),
    STOP_PRIORITY: Object.freeze([
      {
        id: 'STOP_APPROACH_AND_FULL_STOP',
        description: 'Apropierea STOP și oprirea completă sunt ambele publicate.',
        evaluate: (frames) => {
          const types = eventTypes(frames);
          const approach = types.filter((type) => type === 'STOP_APPROACH').length;
          const fullStop = types.filter((type) => type === 'FULL_STOP').length;
          return {
            observed: approach > 0 && fullStop > 0,
            evidence: `${approach} STOP_APPROACH, ${fullStop} FULL_STOP`,
          };
        },
      },
      {
        id: 'PRIORITY_CONFLICT_SERIES',
        description: 'Un conflict de prioritate este măsurat în cel puțin două eșantioane.',
        evaluate: (_frames, facets) => {
          const count = countFacet(facets, 'CONFLICT');
          return { observed: count >= 2, evidence: `${count} eșantioane cu conflict` };
        },
      },
    ]),
    LANE_CHANGE: Object.freeze([
      {
        id: 'LANE_CHANGE_START_AND_COMPLETE',
        description: 'Manevra are început și final publicate, pentru aceleași benzi.',
        evaluate: (frames) => {
          const completed = frames.flatMap((frame) =>
            frame.events.filter((event) => event.type === 'LANE_CHANGE_COMPLETED'),
          );
          const started = frames.flatMap((frame) =>
            frame.events.filter((event) => event.type === 'LANE_CHANGE_STARTED'),
          );
          const matched = completed.filter((done) =>
            started.some(
              (begin) =>
                begin.payload.opportunityId === done.payload.opportunityId &&
                begin.payload.fromLaneId === done.payload.fromLaneId &&
                begin.payload.toLaneId === done.payload.toLaneId,
            ),
          );
          return {
            observed: matched.length > 0,
            evidence: `${started.length} începute, ${completed.length} finalizate, ${matched.length} perechi`,
          };
        },
      },
      {
        id: 'TURN_SIGNAL_BEFORE_MANOEUVRE',
        description: 'Semnalizarea este prezentă înainte de începerea manevrei.',
        evaluate: (frames, facets) => {
          const signalled = frames.findIndex((_frame, index) => facets[index]!.has('TURN_SIGNAL'));
          const started = frames.findIndex((frame) =>
            frame.events.some((event) => event.type === 'LANE_CHANGE_STARTED'),
          );
          return {
            observed: signalled >= 0 && started >= 0 && signalled < started,
            evidence: `semnalizare la index ${signalled}, manevră la index ${started}`,
          };
        },
      },
    ]),
    LATERAL: Object.freeze([
      {
        id: 'CURVATURE_WITH_STEERING',
        description: 'Curba are curbură măsurată, viraj aplicat și accelerație laterală.',
        evaluate: (_frames, facets) => {
          const curved = countFacet(facets, 'CURVATURE');
          const steered = countFacet(facets, 'STEERING_INPUT');
          const lateral = countFacet(facets, 'LATERAL_ACCEL');
          return {
            observed: curved > 0 && steered > 0 && lateral > 0,
            evidence: `${curved} cu curbură, ${steered} cu viraj, ${lateral} cu accelerație laterală`,
          };
        },
      },
      {
        id: 'SUSTAINED_LATERAL_LOAD',
        description: 'Accelerația laterală este susținută în cel puțin trei eșantioane.',
        evaluate: (_frames, facets) => {
          const count = countFacet(facets, 'LATERAL_ACCEL');
          return { observed: count >= 3, evidence: `${count} eșantioane cu accelerație laterală` };
        },
      },
    ]),
    ROUTING: Object.freeze([
      {
        id: 'COMPARABLE_ALTERNATIVES',
        description: 'Planificatorul a evaluat cel puțin două alternative comparabile.',
        evaluate: (frames) => {
          const best = Math.max(0, ...frames.map((frame) => frame.route?.alternatives ?? 0));
          return { observed: best >= 2, evidence: `${best} alternative evaluate` };
        },
      },
      {
        id: 'BLOCKED_THEN_REROUTE',
        description: 'O bandă blocată este urmată de decizia de rerutare.',
        evaluate: (frames) => {
          const blocked = frames.some((frame) => frame.route?.status === 'BLOCKED');
          const reroute = frames.some((frame) => frame.route?.recoveryStage === 'REROUTE');
          return {
            observed: blocked && reroute,
            evidence: `blocat ${blocked}, rerutare ${reroute}`,
          };
        },
      },
      {
        id: 'REVERSE_RECOVERY_OBSERVED',
        description: 'Recuperarea prin mers înapoi este observată cu viteză măsurată.',
        evaluate: (_frames, facets) => {
          const reverse = countFacet(facets, 'REVERSE_RECOVERY');
          const speed = countFacet(facets, 'SPEED_MEASURED');
          return {
            observed: reverse > 0 && speed > 0,
            evidence: `${reverse} eșantioane în recuperare, ${speed} cu viteză`,
          };
        },
      },
    ]),
    HAZARDS: Object.freeze([
      {
        id: 'PEDESTRIAN_OBSERVABLE',
        description: 'Un pieton activ și observabil este în zona de conflict.',
        evaluate: (_frames, facets) => {
          const count = countFacet(facets, 'PEDESTRIAN');
          return { observed: count > 0, evidence: `${count} eșantioane cu pieton observabil` };
        },
      },
      {
        id: 'OBSTACLE_OBSERVABLE',
        description: 'Un obstacol activ și observabil este pe bandă.',
        evaluate: (_frames, facets) => {
          const count = countFacet(facets, 'OBSTACLE');
          return { observed: count > 0, evidence: `${count} eșantioane cu obstacol observabil` };
        },
      },
      {
        id: 'HAZARD_RESPONSE',
        description: 'Răspunsul (frână sau viraj) apare în timpul pericolului.',
        evaluate: (frames, facets) => {
          let count = 0;
          for (let index = 0; index < frames.length; index += 1) {
            const hazard = facets[index]!.has('PEDESTRIAN') || facets[index]!.has('OBSTACLE');
            const response =
              facets[index]!.has('BRAKE_INPUT') || facets[index]!.has('STEERING_INPUT');
            if (hazard && response) count += 1;
          }
          return { observed: count > 0, evidence: `${count} eșantioane cu pericol și răspuns` };
        },
      },
    ]),
    SERVICE: Object.freeze([
      {
        id: 'PICKUP_AND_DROPOFF_EVENTS',
        description: 'Ambele capete ale cursei sunt publicate de FSM-ul real 061.',
        evaluate: (frames) => {
          const types = eventTypes(frames);
          const pickup = types.filter((type) => type === 'PICKUP').length;
          const dropoff = types.filter((type) => type === 'DROPOFF').length;
          return {
            observed: pickup > 0 && dropoff > 0,
            evidence: `${pickup} PICKUP, ${dropoff} DROPOFF`,
          };
        },
      },
      {
        id: 'PASSENGER_ONBOARD_SEGMENT',
        description: 'Segmentul cu pasager este măsurat cu accelerații și viteză.',
        evaluate: (_frames, facets) => {
          const onboard = countFacet(facets, 'PASSENGER_ONBOARD');
          return { observed: onboard >= 2, evidence: `${onboard} eșantioane cu pasager la bord` };
        },
      },
    ]),
  });

/**
 * Evaluates one scenario against the whole catalog. Every key result is counted from the frames; a
 * category scenario is representative only when all of its keys are observable and all of its
 * category triggers are observed. The negative control (category null) must not be representative.
 */
export function evaluateV2ContextScenario(value: unknown): V2ScenarioEvaluation {
  const scenario = parseV2ContextScenario(value);
  const facets = scenario.frames.map((frame) => readV2FrameFacets(frame));
  const keys = v2ContextDefinitions.map((entry): V2ContextKeyResult => {
    const satisfied = entry.requires.map((facet) => ({
      facet,
      firstIndex: facets.findIndex((set) => set.has(facet)),
    }));
    const observable = satisfied.every((requirement) => requirement.firstIndex >= 0);
    const completedIndex = observable
      ? satisfied.reduce((latest, requirement) => Math.max(latest, requirement.firstIndex), 0)
      : -1;
    const observableIndexes =
      completedIndex < 0
        ? []
        : scenario.frames
            .map((_frame, index) => index)
            .filter(
              (index) =>
                index >= completedIndex &&
                entry.requires.some((facet) => facets[index]!.has(facet)),
            );
    return Object.freeze({
      key: entry.key,
      category: entry.category,
      contextId: entry.contextId,
      label: entry.label,
      observable,
      observableFrames: observableIndexes.length,
      firstObservableTick: completedIndex >= 0 ? scenario.frames[completedIndex]!.tick : null,
      missingFacets: Object.freeze(
        satisfied
          .filter((requirement) => requirement.firstIndex < 0)
          .map((requirement) => requirement.facet),
      ),
      opportunityKind: entry.opportunityKind,
      constraint: entry.constraint,
    });
  });
  const categoryEntries =
    scenario.category === null ? v2ContextDefinitions : v2ContextsByCategory(scenario.category);
  const categoryKeys = new Set(categoryEntries.map((entry) => entry.key));
  const categoryResults = keys.filter((entry) => categoryKeys.has(entry.key));
  const triggers =
    scenario.category === null
      ? []
      : categoryTriggers[scenario.category].map((trigger): V2TriggerResult => {
          const result = trigger.evaluate(scenario.frames, facets);
          return Object.freeze({
            id: trigger.id,
            description: trigger.description,
            observed: result.observed,
            evidence: result.evidence,
          });
        });
  const missingKeys = categoryResults
    .filter((entry) => !entry.observable)
    .map((entry) => entry.key);
  const failedTriggers = triggers.filter((entry) => !entry.observed).map((entry) => entry.id);
  const representative =
    scenario.category !== null &&
    scenario.frames.length >= 3 &&
    missingKeys.length === 0 &&
    failedTriggers.length === 0;
  return Object.freeze({
    version: V2_CONTEXT_VERSION,
    scenarioId: scenario.scenarioId,
    category: scenario.category,
    title: scenario.title,
    frames: scenario.frames.length,
    firstTick: scenario.frames[0]!.tick,
    lastTick: scenario.frames[scenario.frames.length - 1]!.tick,
    categoryKeys: categoryResults.length,
    observableKeys: categoryResults.filter((entry) => entry.observable).length,
    keys,
    triggers: Object.freeze(triggers),
    representative,
    missingKeys: Object.freeze(missingKeys),
    failedTriggers: Object.freeze(failedTriggers),
  });
}

/**
 * Coverage counted from the catalog, not asserted: 56 keys, 10 categories and the per-category key
 * counts. Used by the report and the tests so a missing context is a number, not a promise.
 */
export function v2ContextCoverage(): {
  readonly version: typeof V2_CONTEXT_VERSION;
  readonly keys: number;
  readonly categories: number;
  readonly perCategory: readonly { readonly category: V2ContextCategory; readonly keys: number }[];
  readonly withOpportunityKind: number;
  readonly v1Keys: number;
} {
  return Object.freeze({
    version: V2_CONTEXT_VERSION,
    keys: v2ContextDefinitions.length,
    categories: v2ContextCategories.length,
    perCategory: Object.freeze(
      v2ContextCategories.map((category) =>
        Object.freeze({ category, keys: v2ContextsByCategory(category).length }),
      ),
    ),
    withOpportunityKind: v2ContextDefinitions.filter((entry) => entry.opportunityKind !== null)
      .length,
    v1Keys: v1ParameterKeys.length,
  });
}

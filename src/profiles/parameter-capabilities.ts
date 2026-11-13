import { parameterCatalogData } from './parameter-catalog.generated';

/**
 * Source of truth for the V2 capability of every catalog key (PBI 187).
 *
 * The registry derives `implemented`/`estimable` from this table; the data catalog in
 * `Docs/driving-parameters.json` stays fail-closed. A key is capable only when a real policy
 * consumer and a real estimator are declared here, and the gate
 * (`scripts/run-v2-parameter-gate.mjs`) verifies every declaration against the delivered files.
 */

export type CapabilityKey = (typeof parameterCatalogData.parameters)[number]['key'];

/** `CORE` marks the 24 keys delivered by the V1 policies 046-053; `V2` the 56 extension keys. */
export type PolicyKind = 'CORE' | 'V2';

export interface PolicyCapability {
  readonly kind: PolicyKind;
  /** Module path relative to the repository root. */
  readonly module: string;
  /** Exported function that applies the key. */
  readonly symbol: string;
}

export interface EstimatorCapability {
  readonly module: string;
  readonly symbol: string;
}

export interface CapabilityTestAnchor {
  readonly path: string;
  /** Exact title of the test that verifies the scenario and the effect of the key. */
  readonly title: string;
}

export interface ParameterCapability {
  readonly key: CapabilityKey;
  /** `null` means `NONE`: the key has no policy consumer and can never be MANUAL_TUNING/LEARNED. */
  readonly policy: PolicyCapability | null;
  /** `null` means the key is not estimable and can never be published as LEARNED. */
  readonly estimator: EstimatorCapability | null;
  /** Evidence directory relative to the repository root, always ending with `/`. */
  readonly evidence: string;
  readonly test: CapabilityTestAnchor;
  /** Canonical scenario and observable effect, without invented numbers. */
  readonly scenario: string;
}

/**
 * Canonical conventions for the known ambiguities of the catalog. Every convention is derived
 * from the catalog itself (affix, unit or explicit key list), so a new matching key cannot be
 * added without a convention.
 */
export interface AmbiguitySelector {
  readonly kind: 'prefix' | 'suffix' | 'unit' | 'probability' | 'keys' | 'sourceUnit';
  readonly value?: string;
  readonly keys?: readonly string[];
}

export interface AmbiguityConvention {
  readonly id: string;
  readonly selectors: readonly AmbiguitySelector[];
  readonly statement: string;
  readonly anchor: CapabilityTestAnchor;
}

function corePolicy(module: string, symbol: string): PolicyCapability {
  return Object.freeze({ kind: 'CORE', module, symbol });
}

function v2Policy(module: string, symbol: string): PolicyCapability {
  return Object.freeze({ kind: 'V2', module, symbol });
}

function estimator(module: string, symbol: string): EstimatorCapability {
  return Object.freeze({ module, symbol });
}

function test(path: string, title: string): CapabilityTestAnchor {
  return Object.freeze({ path, title });
}

interface GroupSpec {
  readonly evidence: string;
  readonly test: CapabilityTestAnchor;
  readonly policy: PolicyCapability;
  readonly estimator: EstimatorCapability;
}

interface GroupEntry {
  readonly key: CapabilityKey;
  readonly scenario: string;
  readonly policy?: PolicyCapability;
  readonly estimator?: EstimatorCapability;
}

function group(spec: GroupSpec, entries: readonly GroupEntry[]): ParameterCapability[] {
  return entries.map((entry) =>
    Object.freeze({
      key: entry.key,
      policy: entry.policy ?? spec.policy,
      estimator: entry.estimator ?? spec.estimator,
      evidence: spec.evidence,
      test: spec.test,
      scenario: entry.scenario,
    }),
  );
}

const SPEED_M = corePolicy('src/autonomy/cruise-targets.ts', 'evaluateCruiseTarget');
const ACCEL_M = corePolicy('src/autonomy/longitudinal-control.ts', 'createLongitudinalController');
const FOLLOW_M = corePolicy('src/autonomy/following.ts', 'evaluateFollowingTarget');
const SIGNAL_M = corePolicy('src/autonomy/signal-policy.ts', 'evaluateSignalPolicy');
const STOP_M = corePolicy('src/autonomy/stop-policy.ts', 'evaluateStopPolicy');
const YIELD_M = corePolicy('src/autonomy/yield-policy.ts', 'evaluateYieldPolicy');
const LANE_M = corePolicy('src/autonomy/lane-change-policy.ts', 'evaluateLaneChange');

const speedGroup = group(
  {
    evidence: 'Docs/Evidence/167-v2-speed-policy/',
    test: test(
      'tests/autonomy/cruise-targets.test.ts',
      '046 each of four parameters individually changes target in an unsaturated isolated scenario',
    ),
    policy: SPEED_M,
    estimator: estimator('src/learning/speed-estimator.ts', 'estimateSpeedParameters'),
  },
  [
    {
      key: 'speed_delta_urban',
      scenario:
        'Trafic liber urban: ținta de drum este limita postată plus delta, iar un delta pozitiv crește ținta până la plafonul legal.',
    },
    {
      key: 'speed_delta_residential',
      scenario:
        'Trafic liber rezidențial: delta se adaugă la limita rezidențială și nu înlocuiește ținta 046.',
    },
    {
      key: 'curve_lateral_accel',
      scenario:
        'Curbă cu rază cunoscută: plafonul de viteză derivă din accelerația laterală preferată, deci o valoare mai mare permite o viteză de trecere mai mare.',
    },
    {
      key: 'intersection_approach_speed',
      scenario:
        'Apropiere de intersecție fără oprire impusă: ținta scade la viteza de apropiere, iar oprirea impusă rămâne dominantă.',
    },
  ],
);

const speedTempoGroup = group(
  {
    evidence: 'Docs/Evidence/167-v2-speed-policy/',
    test: test(
      'tests/autonomy/speed-policy.test.ts',
      '167 arterial delta is the only key that moves the arterial road target',
    ),
    policy: v2Policy('src/autonomy/speed-policy.ts', 'evaluateSpeedPolicy'),
    estimator: estimator('src/learning/tempo-estimator.ts', 'estimateSpeedPolicyTempo'),
  },
  [
    {
      key: 'speed_delta_arterial',
      scenario:
        'Drum arterial fără lider la limita postată: delta mută ținta de drum de la valoarea joasă la plafonul legal.',
    },
    {
      key: 'cruise_speed_variability',
      scenario:
        'Țintă urbană constantă pe 600 de tick-uri: amplitudinea undei deterministe crește cu valoarea cheii, fără să depășească limita postată.',
    },
    {
      key: 'overtake_speed_bonus',
      scenario:
        'Depășire observată pe o țintă urbană: bonusul ridică ținta, saturată la limita legală, și nu are efect fără depășire.',
    },
    {
      key: 'cruise_accel_deadband',
      scenario:
        'Țintă commitată anterior și viteză curentă în interiorul benzii: banda mare păstrează comanda HOLD, banda mică accelerează spre țintă.',
    },
  ],
);

const accelGroup = group(
  {
    evidence: 'Docs/Evidence/169-v2-accel-policy/',
    test: test(
      'tests/autonomy/longitudinal-control.test.ts',
      '047 each of four parameters is individually observable; braking_jerk stays outside this contract',
    ),
    policy: ACCEL_M,
    estimator: estimator(
      'src/learning/acceleration-estimator.ts',
      'estimateAccelerationParameters',
    ),
  },
  [
    {
      key: 'desired_acceleration',
      scenario:
        'Accelerare pe drum uscat: cererea de accelerație este limitată de valoarea preferată și nu o depășește.',
    },
    {
      key: 'comfort_deceleration',
      scenario:
        'Frânare obișnuită: modulul decelerației cerute este plafonat la valoarea de confort.',
    },
    {
      key: 'acceleration_jerk',
      scenario:
        'Pornire de la oprire: creșterea accelerației este limitată de jerk, deci rampa devine mai lungă la valori mici.',
    },
    {
      key: 'brake_reaction_delay',
      scenario:
        'Stimul de frânare observat: frânarea începe după întârzierea declarată, fără să sară peste limitele de siguranță.',
    },
  ],
);

const accelStyleGroup = group(
  {
    evidence: 'Docs/Evidence/169-v2-accel-policy/',
    test: test(
      'tests/autonomy/accel-policy.test.ts',
      '169 braking_jerk only changes how fast the demanded braking grows',
    ),
    policy: v2Policy('src/autonomy/accel-policy.ts', 'evaluateAccelPolicy'),
    estimator: estimator('src/learning/accel-estimator.ts', 'estimateAccelPolicyStyle'),
  },
  [
    {
      key: 'braking_jerk',
      scenario:
        'Frânare cerută: jerk-ul de frânare schimbă doar cât de repede crește cererea, nu nivelul final.',
    },
    {
      key: 'throttle_release_delay',
      scenario:
        'Ridicarea accelerației: accelerația anterioară este ținută până la expirarea întârzierii, apoi este eliberată.',
    },
    {
      key: 'launch_intensity',
      scenario:
        'Plecare sub viteza de lansare: intensitatea scalează cererea de accelerație, fără a depăși limita 047.',
    },
    {
      key: 'coasting_bias',
      scenario:
        'Cruise blând peste viteza de lansare: biasul eliberează cererea de accelerație proporțional, fără a frâna.',
    },
  ],
);

const followGroup = group(
  {
    evidence: 'Docs/Evidence/171-v2-follow-policy/',
    test: test(
      'tests/autonomy/following.test.ts',
      '048 all four parameters individually effective, queue gap does not inherit moving minimum',
    ),
    policy: FOLLOW_M,
    estimator: estimator('src/learning/following-estimator.ts', 'estimateFollowingParameters'),
  },
  [
    {
      key: 'following_time_headway',
      scenario:
        'Lider cu viteză constantă: spațiul țintă crește cu intervalul temporal înmulțit cu viteza.',
    },
    {
      key: 'following_min_gap',
      scenario:
        'Lider apropiat: spațiul fix minim se adaugă intervalului temporal și crește distanța țintă.',
    },
    {
      key: 'queue_standstill_gap',
      scenario:
        'Coadă oprită: spațiul de staționare cere distanța proprie, fără să moștenească minimul de mers.',
    },
    {
      key: 'following_speed_gain',
      scenario:
        'Diferență de viteză față de lider: câștigul scalează reacția, deci aceeași diferență produce o cerere mai mare.',
    },
  ],
);

const followStyleGroup = group(
  {
    evidence: 'Docs/Evidence/171-v2-follow-policy/',
    test: test(
      'tests/autonomy/follow-policy.test.ts',
      '171 cutin_brake_response only changes the size of the cut-in reaction',
    ),
    policy: v2Policy('src/autonomy/follow-policy.ts', 'evaluateFollowPolicy'),
    estimator: estimator('src/learning/follow-estimator.ts', 'estimateFollowPolicyStyle'),
  },
  [
    {
      key: 'cutin_brake_response',
      scenario:
        'Intrare în față: răspunsul de frânare scalează doar mărimea reacției, nu pragul de siguranță.',
    },
    {
      key: 'closing_ttc_threshold',
      scenario:
        'Apropiere în închidere: pragul TTC plafonează viteza cerută cât timp timpul până la contact este sub valoare.',
    },
    {
      key: 'leader_change_delay',
      scenario:
        'Lider nou: creșterea țintei este întârziată, în timp ce reducerea de siguranță se aplică imediat.',
    },
    {
      key: 'following_hysteresis',
      scenario:
        'În interiorul benzii de toleranță: histereza ține angajamentul anterior și evită oscilația comenzii.',
    },
  ],
);

const signalGroup = group(
  {
    evidence: 'Docs/Evidence/173-v2-signal-policy/',
    test: test(
      'tests/autonomy/signal-policy-v2.test.ts',
      '173 M keys keep their units, their 050 consequences and the yellow probability scaling',
    ),
    policy: SIGNAL_M,
    estimator: estimator('src/learning/signal-estimator.ts', 'estimateSignalParameters'),
  },
  [
    {
      key: 'red_stop_probability',
      scenario:
        'Oportunitate de roșu: probabilitatea 1 oprește și 0 traversează, cu un singur eșantion per oportunitate.',
    },
    {
      key: 'green_start_delay',
      scenario:
        'Primul în coadă la verde: plecarea este întârziată cu valoarea cheii, apoi accelerația de lansare preia.',
    },
    {
      key: 'red_stop_line_offset',
      scenario:
        'Roșu cu oprire fezabilă: oprirea este plasată înaintea liniei cu offsetul declarat.',
    },
    {
      key: 'late_red_brake_threshold',
      scenario:
        'Roșu surprins la orizont: frânarea este inițiată când timpul rămas este sub pragul cheii.',
    },
  ],
);

const signalStyleGroup = group(
  {
    evidence: 'Docs/Evidence/173-v2-signal-policy/',
    test: test(
      'tests/autonomy/signal-policy-v2.test.ts',
      '173 yellow_stop_probability changes only the yellow stop of a feasible approach',
    ),
    policy: v2Policy('src/autonomy/signal-policy-v2.ts', 'evaluateSignalPolicyV2'),
    estimator: estimator('src/learning/signal-v2-estimator.ts', 'estimateSignalPolicyStyleV2'),
  },
  [
    {
      key: 'yellow_stop_probability',
      scenario:
        'Galben cu oprire fezabilă: probabilitatea decide oprirea pe eșantionul oportunității.',
    },
    {
      key: 'red_run_gap_acceptance',
      scenario:
        'Traversare pe roșu: gap-ul temporal acceptat este strâns de cheie și de plafonul explicit de 3 s.',
    },
    {
      key: 'yellow_commit_time',
      scenario: 'Galben: angajarea se produce doar în orizontul cheii și în galbenul rămas.',
    },
    {
      key: 'green_launch_acceleration',
      scenario:
        'Plecare de la verde: accelerația de lansare se aplică după întârzierea M și rămâne mărginită.',
    },
  ],
);

const stopGroup = group(
  {
    evidence: 'Docs/Evidence/175-v2-stop-policy/',
    test: test(
      'tests/autonomy/stop-priority-policy.test.ts',
      '175 M keys keep their units and their 051/052 consequences with neutral and active R keys',
    ),
    policy: STOP_M,
    estimator: estimator('src/learning/stop-yield-estimator.ts', 'estimateStopYieldParameters'),
  },
  [
    {
      key: 'stop_full_probability',
      scenario: 'Oportunitate STOP: probabilitatea 1 produce oprirea completă, iar 0 o omite.',
    },
    {
      key: 'stop_dwell_time',
      scenario: 'STOP oprit: durata de staționare este cea declarată înainte de reluare.',
    },
    {
      key: 'stop_line_offset',
      scenario: 'STOP: oprirea este plasată înaintea liniei cu offsetul declarat.',
    },
    {
      key: 'yield_time_gap',
      policy: YIELD_M,
      scenario:
        'Cedare de prioritate: gap-ul temporal acceptat decide traversarea, iar sub pragul efectiv se refuză.',
    },
  ],
);

const stopStyleGroup = group(
  {
    evidence: 'Docs/Evidence/175-v2-stop-policy/',
    test: test(
      'tests/autonomy/stop-priority-policy.test.ts',
      '175 rolling_stop_speed changes only the rolling speed and is capped below a crossing at speed',
    ),
    policy: v2Policy('src/autonomy/stop-priority-policy.ts', 'evaluateStopPriorityPolicy'),
    estimator: estimator('src/learning/stop-priority-estimator.ts', 'estimateStopPriorityStyle'),
  },
  [
    {
      key: 'rolling_stop_speed',
      scenario: 'STOP ratat: viteza de rulare este plafonată de cheie, sub viteza de traversare.',
    },
    {
      key: 'priority_assertiveness',
      scenario:
        'Conflict de prioritate: asertivitatea decide revendicarea doar în interiorul podelei de siguranță.',
    },
    {
      key: 'allway_stop_patience',
      scenario:
        'STOP în patru direcții: răbdarea ține eliberarea unui vehicul care nu este primul.',
    },
    {
      key: 'blocked_intersection_entry_probability',
      scenario:
        'Intersecție blocată: probabilitatea 0 interzice intrarea fără spațiu de ieșire, iar 1 eșantionează intrarea.',
    },
  ],
);

const laneGroup = group(
  {
    evidence: 'Docs/Evidence/177-v2-lane-policy/',
    test: test(
      'tests/autonomy/lane-policy-v2.test.ts',
      '177 keeps the delivered 053 results with the four M keys unchanged',
    ),
    policy: LANE_M,
    estimator: estimator('src/learning/lane-estimator.ts', 'estimateLaneChangeParameters'),
  },
  [
    {
      key: 'lane_change_front_gap',
      scenario:
        'Spațiu liber în față: sub gap-ul minim schimbarea de bandă este refuzată, iar peste el este admisă.',
    },
    {
      key: 'lane_change_back_gap',
      scenario: 'Vehicul în spate: gap-ul minim din spate trebuie acoperit înainte de inițiere.',
    },
    {
      key: 'lane_change_speed_gain',
      scenario: 'Schimbare opțională: avantajul de viteză trebuie să atingă câștigul cerut.',
    },
    {
      key: 'lane_change_cooldown',
      scenario: 'Două schimbări opționale: cooldown-ul impune timpul minim între ele.',
    },
  ],
);

const laneStyleGroup = group(
  {
    evidence: 'Docs/Evidence/177-v2-lane-policy/',
    test: test(
      'tests/autonomy/lane-policy-v2.test.ts',
      '177 lane_change_duration changes the lateral progress in its own episode',
    ),
    policy: v2Policy('src/autonomy/lane-policy-v2.ts', 'evaluateLanePolicyV2'),
    estimator: estimator('src/learning/lane-v2-estimator.ts', 'estimateLaneV2Style'),
  },
  [
    {
      key: 'lane_change_duration',
      scenario:
        'Maneveră de bandă: durata cheii controlează progresul lateral și nu poate deveni instantanee.',
    },
    {
      key: 'signal_lead_time',
      scenario: 'Semnalizare: indicatorul pornește cu timpul declarat înaintea manevrei.',
    },
    {
      key: 'signal_use_probability',
      scenario:
        'Oportunitate de semnalizare: probabilitatea decide aprinderea indicatorului pe eșantion.',
    },
    {
      key: 'pass_on_right_probability',
      scenario:
        'Depășire prin dreapta: probabilitatea este subordonată hărții și spațiului declarat.',
    },
  ],
);

const lateralGroup = group(
  {
    evidence: 'Docs/Evidence/179-v2-lateral-policy/',
    test: test(
      'tests/autonomy/lateral-policy-v2.test.ts',
      '179 each of the eight keys changes its own observable in an isolated scene',
    ),
    policy: v2Policy('src/autonomy/lateral-policy-v2.ts', 'evaluateLateralPolicyV2'),
    estimator: estimator('src/learning/lateral-v2-estimator.ts', 'estimateLateralV2Style'),
  },
  [
    {
      key: 'lane_center_offset',
      scenario:
        'Urmărire de bandă: offsetul mută ținta lateral față de centru, în interiorul coridorului.',
    },
    {
      key: 'steering_response_time',
      scenario: 'Comandă de direcție: timpul de răspuns netezește atingerea unghiului cerut.',
    },
    {
      key: 'steering_rate_limit',
      scenario: 'Viraj strâns: limita de rată împiedică saltul comenzii de direcție.',
    },
    {
      key: 'turn_entry_speed',
      scenario:
        'Intrare în viraj: viteza de intrare este plafonată de aderența și geometria reală.',
    },
    {
      key: 'turn_exit_acceleration',
      scenario:
        'Ieșire din viraj: accelerația urmează valoarea M a accelerației dorite și nu o depășește.',
    },
    {
      key: 'corner_cutting_bias',
      scenario: 'Viraj: biasul scurtează traiectoria doar în interiorul coridorului 049.',
    },
    {
      key: 'lateral_clearance',
      scenario:
        'Obstacol lateral: spațiul cerut este o podea peste lățimea vehiculului plus marjă.',
    },
    {
      key: 'lateral_correction_deadband',
      scenario: 'Abatere laterală mică: deadband-ul oprește corecția, nu urmărirea geometriei.',
    },
  ],
);

const routeGroup = group(
  {
    evidence: 'Docs/Evidence/181-v2-route-policy/',
    test: test(
      'tests/autonomy/route-policy-v2.test.ts',
      '181 gives every key its own observable effect, on comparable real alternatives',
    ),
    policy: v2Policy('src/autonomy/route-policy-v2.ts', 'evaluateRoutePolicyV2'),
    estimator: estimator('src/learning/route-v2-estimator.ts', 'estimateRouteV2Style'),
  },
  [
    {
      key: 'route_time_weight',
      scenario:
        'Alternative comparabile: ponderea timpului schimbă alegerea, normalizată ca parte dintr-un buget unic.',
    },
    {
      key: 'route_distance_weight',
      scenario:
        'Alternative comparabile: ponderea distanței schimbă alegerea la orice scală, prin share normalizat.',
    },
    {
      key: 'route_turn_penalty',
      scenario: 'Rută cu viraje: fiecare viraj adaugă penalitatea în secunde la costul rutei.',
    },
    {
      key: 'route_signal_penalty',
      scenario: 'Rută cu semafoare: fiecare semafor adaugă penalitatea în secunde la costul rutei.',
    },
    {
      key: 'route_congestion_penalty',
      scenario:
        'Rută aglomerată: sensibilitatea la aglomerație crește costul relativ al rutei încărcate.',
    },
    {
      key: 'reroute_patience',
      scenario: 'Blocaj: recalcularea așteaptă răbdarea declarată înainte de a schimba ruta.',
    },
    {
      key: 'u_turn_willingness',
      scenario:
        'Întoarcere interzisă de hartă: disponibilitatea nu poate admite o întoarcere nedorită și se eșantionează o dată per oportunitate.',
    },
    {
      key: 'reverse_recovery_duration',
      scenario:
        'Recuperare: durata de marșarier este podeaua cerută și nu se aplică fără spațiu liber declarat.',
    },
  ],
);

const hazardGroup = group(
  {
    evidence: 'Docs/Evidence/183-v2-hazard-policy/',
    test: test(
      'tests/autonomy/hazard-policy-v2.test.ts',
      '183 gives every key its own observable effect at the two catalog extremes',
    ),
    policy: v2Policy('src/autonomy/hazard-policy-v2.ts', 'evaluateHazardPolicyV2'),
    estimator: estimator('src/learning/hazard-v2-estimator.ts', 'estimateHazardV2Style'),
  },
  [
    {
      key: 'pedestrian_yield_probability',
      scenario: 'Pieton în traversare: probabilitatea decide cedarea pe eșantionul oportunității.',
    },
    {
      key: 'pedestrian_clearance',
      scenario: 'Pieton: spațiul cerut este o podea fizică peste marja vehiculului.',
    },
    {
      key: 'hazard_reaction_delay',
      scenario:
        'Stimul de pericol: reacția este întârziată și saturată de spațiul real disponibil.',
    },
    {
      key: 'obstacle_clearance',
      scenario:
        'Obstacol pe bandă: spațiul cerut este o podea fizică și nu permite avansarea prin obstacol.',
    },
    {
      key: 'emergency_brake_intensity',
      scenario:
        'Frânare de urgență: intensitatea este fracția din capacitatea disponibilă, plafonată de aderență.',
    },
    {
      key: 'evasive_steer_willingness',
      scenario: 'Maneveră evazivă: disponibilitatea este subordonată spațiului lateral verificat.',
    },
    {
      key: 'crosswalk_approach_speed',
      scenario: 'Apropiere de trecere: viteza este un plafon, limitat de distanța de oprire.',
    },
    {
      key: 'horn_use_probability',
      scenario:
        'Oportunitate de claxon: probabilitatea este subordonată permisiunii lumii și eșantionată o dată.',
    },
  ],
);

const pickupGroup = group(
  {
    evidence: 'Docs/Evidence/185-v2-pickup-policy/',
    test: test(
      'tests/autonomy/pickup-policy-v2.test.ts',
      '185 gives every key its own observable effect at the two catalog extremes',
    ),
    policy: v2Policy('src/autonomy/pickup-policy-v2.ts', 'evaluatePickupPolicyV2'),
    estimator: estimator('src/learning/pickup-v2-estimator.ts', 'estimatePickupV2Style'),
  },
  [
    {
      key: 'pickup_approach_speed',
      scenario: 'Apropiere de pickup: viteza este plafonată de distanța până la punctul marcat.',
    },
    {
      key: 'pickup_curb_distance',
      scenario: 'Zonă de serviciu: distanța față de bordură este o bandă cu podea.',
    },
    {
      key: 'pickup_stop_precision',
      scenario: 'Oprire la pickup: fereastra de precizie rămâne în interiorul zonei.',
    },
    {
      key: 'pickup_dwell_time',
      scenario:
        'Staționare la pickup: durata crește până la dovada îmbarcării și nu pleacă înainte de confirmarea 061.',
    },
    {
      key: 'dropoff_approach_speed',
      scenario: 'Apropiere de dropoff: viteza este plafonată de distanța până la punctul marcat.',
    },
    {
      key: 'dropoff_curb_distance',
      scenario: 'Dropoff: distanța față de bordură este o bandă cu podea.',
    },
    {
      key: 'occupied_acceleration_scale',
      scenario:
        'Cu pasager la bord: scara înmulțește accelerația M și este plafonată de confort și aderență.',
    },
    {
      key: 'occupied_lateral_accel_scale',
      scenario:
        'Cu pasager la bord: scara înmulțește accelerația laterală M și este plafonată de confort și aderență.',
    },
  ],
);

export const parameterCapabilities: readonly ParameterCapability[] = Object.freeze([
  ...speedGroup,
  ...speedTempoGroup,
  ...accelGroup,
  ...accelStyleGroup,
  ...followGroup,
  ...followStyleGroup,
  ...signalGroup,
  ...signalStyleGroup,
  ...stopGroup,
  ...stopStyleGroup,
  ...laneGroup,
  ...laneStyleGroup,
  ...lateralGroup,
  ...routeGroup,
  ...hazardGroup,
  ...pickupGroup,
]);

const capabilitiesByKey: Record<string, ParameterCapability> = Object.create(null);
for (const capability of parameterCapabilities) {
  capabilitiesByKey[capability.key] = capability;
}
Object.freeze(capabilitiesByKey);

export const parameterCapabilityByKey: Readonly<Record<string, ParameterCapability>> =
  Object.freeze(capabilitiesByKey);

export function getParameterCapability(key: string): ParameterCapability | undefined {
  return parameterCapabilityByKey[key];
}

export const ambiguityConventions: readonly AmbiguityConvention[] = Object.freeze([
  Object.freeze({
    id: 'speed-delta',
    selectors: Object.freeze([Object.freeze({ kind: 'prefix' as const, value: 'speed_delta_' })]),
    statement:
      'speed_delta_* este o diferență în m/s față de limita de circulație (viteza liberă), adăugată țintei de drum, niciodată o viteză absolută; rezultatul rămâne plafonat de limita legală.',
    anchor: test(
      'tests/autonomy/speed-policy.test.ts',
      '167 arterial delta is the only key that moves the arterial road target',
    ),
  }),
  Object.freeze({
    id: 'event-penalty-seconds',
    selectors: Object.freeze([
      Object.freeze({ kind: 'sourceUnit' as const, value: 's/viraj' }),
      Object.freeze({ kind: 'sourceUnit' as const, value: 's/semafor' }),
    ]),
    statement:
      'route_*_penalty este un cost în secunde per eveniment (un viraj, respectiv un semafor), adăugat la costul rutei; unitatea canonică este s, iar numărul de evenimente vine din ruta evaluată.',
    anchor: test(
      'tests/autonomy/route-policy-v2.test.ts',
      '181 gives every key its own observable effect, on comparable real alternatives',
    ),
  }),
  Object.freeze({
    id: 'route-share-weights',
    selectors: Object.freeze([Object.freeze({ kind: 'suffix' as const, value: '_weight' })]),
    statement:
      'route_*_weight este o pondere normalizată: coeficienții sunt împărțiți la suma ponderilor, deci doar raportul contează, nu scara absolută; două seturi proporționale produc aceeași alegere.',
    anchor: test(
      'tests/autonomy/route-policy-v2.test.ts',
      '181 normalizes the weights: shares of one budget, identical coefficients at every scale',
    ),
  }),
  Object.freeze({
    id: 'route-congestion-sensitivity',
    selectors: Object.freeze([
      Object.freeze({
        kind: 'keys' as const,
        keys: Object.freeze(['route_congestion_penalty']),
      }),
    ]),
    statement:
      'route_congestion_penalty este o sensibilitate adimensională la aglomerație (factor peste costul de bază), nu o penalitate în secunde; este singura cheie route_*_penalty fără unitate de timp.',
    anchor: test(
      'tests/autonomy/route-policy-v2.test.ts',
      '181 gives every key its own observable effect, on comparable real alternatives',
    ),
  }),
  Object.freeze({
    id: 'upstream-line-offset',
    selectors: Object.freeze([Object.freeze({ kind: 'suffix' as const, value: '_line_offset' })]),
    statement:
      'stop_line_offset și red_stop_line_offset sunt metri măsurați în amonte de linie (pozitiv înaintea liniei), nu o depășire a liniei; oprirea rămâne înaintea marcajului.',
    anchor: test(
      'tests/autonomy/stop-policy.test.ts',
      '051 a free STOP approaches the offset point, holds until the authoritative proof and then releases',
    ),
  }),
  Object.freeze({
    id: 'probability-per-opportunity',
    selectors: Object.freeze([Object.freeze({ kind: 'probability' as const })]),
    statement:
      'Cheile de tip probabilitate se aplică pe oportunitate, cu un singur eșantion determinist per oportunitate, nu per tick; valoarea 0 nu produce niciodată evenimentul, valoarea 1 îl produce mereu.',
    anchor: test(
      'tests/autonomy/hazard-policy-v2.test.ts',
      '183 subordinates the horn to the world permission and samples once per opportunity',
    ),
  }),
  Object.freeze({
    id: 'occupied-scale-factor',
    selectors: Object.freeze([Object.freeze({ kind: 'prefix' as const, value: 'occupied_' })]),
    statement:
      'occupied_* este un factor multiplicativ peste valoarea M (accelerație longitudinală, respectiv laterală), aplicat numai cu pasager la bord și plafonat de confort și aderență; nu este o valoare absolută în m/s².',
    anchor: test(
      'tests/autonomy/pickup-policy-v2.test.ts',
      '185 applies the occupied scales only with a passenger and caps them by comfort and adhesion',
    ),
  }),
  Object.freeze({
    id: 'approach-speed-ceiling',
    selectors: Object.freeze([
      Object.freeze({ kind: 'suffix' as const, value: '_approach_speed' }),
      Object.freeze({ kind: 'keys' as const, keys: Object.freeze(['turn_entry_speed']) }),
    ]),
    statement:
      'Vitezele de apropiere (intersecție, trecere, pickup, dropoff) și viteza de intrare în viraj sunt plafoane superioare, limitate de distanța de oprire, geometrie și aderență; nu sunt ținte care cer accelerarea.',
    anchor: test(
      'tests/autonomy/hazard-policy-v2.test.ts',
      '183 saturates the reaction delay at the room that is really there',
    ),
  }),
]);

/** Everything the pure gate needs from the file system, injected so the check stays deterministic. */
export interface CapabilityProbe {
  readonly moduleExports: (modulePath: string, symbol: string) => boolean;
  readonly pathExists: (path: string) => boolean;
  readonly fileContains: (filePath: string, text: string) => boolean;
  readonly readJson: (path: string) => unknown;
}

export interface GateCatalogEntry {
  readonly key: string;
  readonly unit: string;
  readonly sourceUnit: string;
}

export interface GateDerivedCapability {
  readonly key: string;
  readonly implemented: boolean;
  readonly estimable: boolean;
}

export interface GateFinding {
  readonly check: string;
  readonly key: string | null;
  readonly message: string;
}

export interface GateMeasuredEffect {
  readonly kind: 'MEASURED';
  readonly scenario: string;
  readonly unit: string;
  readonly lowValue: number;
  readonly highValue: number;
  readonly lowOutcome: number;
  readonly highOutcome: number;
  readonly difference: number;
}

export interface GatePreservedEffect {
  readonly kind: 'PRESERVED_M';
  readonly title: string;
}

export type GateEffect = GateMeasuredEffect | GatePreservedEffect;

export interface GateKeyReport {
  readonly key: string;
  readonly policy: PolicyCapability | null;
  readonly estimator: EstimatorCapability | null;
  readonly evidence: string;
  readonly test: CapabilityTestAnchor;
  readonly scenario: string;
  readonly effect: GateEffect;
}

export interface GateConventionReport {
  readonly id: string;
  readonly statement: string;
  readonly keys: readonly string[];
  readonly anchor: CapabilityTestAnchor;
}

export interface GateResult {
  readonly passed: boolean;
  readonly findings: readonly GateFinding[];
  readonly keys: readonly GateKeyReport[];
  readonly conventions: readonly GateConventionReport[];
}

export interface GateInput {
  readonly definitions: readonly GateCatalogEntry[];
  readonly capabilities: readonly ParameterCapability[];
  readonly probe: CapabilityProbe;
  /** Values read back from the registry, to prove the registry derives from this table. */
  readonly derived?: readonly GateDerivedCapability[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function effectRows(report: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(report) || !Array.isArray(report.effects)) return [];
  return report.effects.filter(isRecord);
}

function selectorKeys(
  selector: AmbiguitySelector,
  definitions: readonly GateCatalogEntry[],
): string[] {
  switch (selector.kind) {
    case 'prefix':
      return definitions
        .filter((definition) => definition.key.startsWith(selector.value ?? ''))
        .map((definition) => definition.key);
    case 'suffix':
      return definitions
        .filter((definition) => definition.key.endsWith(selector.value ?? ''))
        .map((definition) => definition.key);
    case 'unit':
      return definitions
        .filter((definition) => definition.unit === selector.value)
        .map((definition) => definition.key);
    case 'sourceUnit':
      return definitions
        .filter((definition) => definition.sourceUnit === selector.value)
        .map((definition) => definition.key);
    case 'probability':
      return definitions
        .filter((definition) => definition.unit === 'probability')
        .map((definition) => definition.key);
    case 'keys':
      return [...(selector.keys ?? [])];
  }
}

function conventionKeys(
  convention: AmbiguityConvention,
  definitions: readonly GateCatalogEntry[],
): string[] {
  const keys: string[] = [];
  for (const selector of convention.selectors) {
    for (const key of selectorKeys(selector, definitions)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return definitions.map((definition) => definition.key).filter((key) => keys.includes(key));
}

/**
 * Fail-closed gate over the capability table. Every declared key is verified against the catalog,
 * the real policy and estimator modules, the committed evidence and the independent test; the
 * data catalog itself must never grant a capability.
 */
export function evaluateParameterGate(input: GateInput): GateResult {
  const findings: GateFinding[] = [];
  const keyed: GateKeyReport[] = [];
  const catalogKeys = new Set(input.definitions.map((definition) => definition.key));
  const declared = new Map<string, ParameterCapability>();

  const fail = (check: string, key: string | null, message: string): void => {
    findings.push(Object.freeze({ check, key, message }));
  };

  for (const capability of input.capabilities) {
    if (!catalogKeys.has(capability.key)) {
      fail(
        'capability-unknown',
        capability.key,
        `Capability declared for a key that is not in the catalog: ${capability.key}`,
      );
      continue;
    }
    if (declared.has(capability.key)) {
      fail(
        'capability-duplicate',
        capability.key,
        `Duplicate capability declaration: ${capability.key}`,
      );
      continue;
    }
    declared.set(capability.key, capability);
  }

  for (const definition of input.definitions) {
    const capability = declared.get(definition.key);
    if (capability === undefined) {
      fail(
        'capability-missing',
        definition.key,
        `Catalog key without a capability declaration: ${definition.key}`,
      );
      continue;
    }

    if (capability.policy === null) {
      fail(
        'policy-consumer-missing',
        definition.key,
        `No policy consumer declared for: ${definition.key}`,
      );
    } else {
      if (capability.policy.kind !== 'CORE' && capability.policy.kind !== 'V2') {
        fail('policy-kind-invalid', definition.key, `Invalid policy kind: ${definition.key}`);
      }
      if (!input.probe.moduleExports(capability.policy.module, capability.policy.symbol)) {
        fail(
          'policy-consumer-missing',
          definition.key,
          `Declared policy consumer is missing or does not export ${capability.policy.symbol}: ${capability.policy.module}`,
        );
      }
    }

    const estimatorCapability = capability.estimator;
    if (estimatorCapability !== null) {
      if (!input.probe.moduleExports(estimatorCapability.module, estimatorCapability.symbol)) {
        fail(
          'estimator-missing',
          definition.key,
          `Declared estimator is missing or does not export ${estimatorCapability.symbol}: ${estimatorCapability.module}`,
        );
      }
    }

    const evidenceReadme = `${capability.evidence}README.md`;
    if (!input.probe.pathExists(evidenceReadme)) {
      fail('evidence-missing', definition.key, `Missing evidence file: ${evidenceReadme}`);
    }

    if (!input.probe.pathExists(capability.test.path)) {
      fail('test-missing', definition.key, `Missing independent test: ${capability.test.path}`);
    } else if (!input.probe.fileContains(capability.test.path, capability.test.title)) {
      fail(
        'test-name-missing',
        definition.key,
        `Test title not found in ${capability.test.path}: ${capability.test.title}`,
      );
    }

    if (capability.scenario.trim().length < 20) {
      fail(
        'scenario-missing',
        definition.key,
        `Scenario is empty or too short for: ${definition.key}`,
      );
    }

    let effect: GateEffect;
    if (capability.policy === null || capability.policy.kind === 'CORE') {
      effect = Object.freeze({ kind: 'PRESERVED_M', title: capability.test.title });
    } else {
      const reportPath = `${capability.evidence}report.json`;
      const report = input.probe.pathExists(reportPath)
        ? effectRows(input.probe.readJson(reportPath)).find((row) => row.key === definition.key)
        : undefined;
      if (report === undefined) {
        fail(
          'effect-missing',
          definition.key,
          `Missing measured effect row in ${reportPath} for: ${definition.key}`,
        );
        effect = Object.freeze({ kind: 'PRESERVED_M', title: capability.test.title });
      } else {
        const measured = {
          kind: 'MEASURED' as const,
          scenario: String(report.scenario ?? report.episode ?? ''),
          unit: String(report.unit ?? ''),
          lowValue: Number(report.lowValue),
          highValue: Number(report.highValue),
          lowOutcome: Number(report.lowOutcome),
          highOutcome: Number(report.highOutcome),
          difference: Number(report.difference),
        };
        if (
          !Number.isFinite(measured.lowValue) ||
          !Number.isFinite(measured.highValue) ||
          !Number.isFinite(measured.lowOutcome) ||
          !Number.isFinite(measured.highOutcome) ||
          !Number.isFinite(measured.difference) ||
          measured.scenario.length === 0
        ) {
          fail(
            'effect-invalid',
            definition.key,
            `Measured effect row is not numeric or has no scenario: ${definition.key}`,
          );
        }
        effect = Object.freeze(measured);
      }
    }

    keyed.push(
      Object.freeze({
        key: definition.key,
        policy: capability.policy,
        estimator: estimatorCapability,
        evidence: capability.evidence,
        test: capability.test,
        scenario: capability.scenario,
        effect,
      }),
    );
  }

  if (input.derived !== undefined) {
    const derivedByKey = new Map(input.derived.map((entry) => [entry.key, entry]));
    if (derivedByKey.size !== input.definitions.length) {
      fail(
        'registry-size-mismatch',
        null,
        `The registry exposes ${derivedByKey.size} keys, the catalog has ${input.definitions.length}`,
      );
    }
    for (const definition of input.definitions) {
      const derived = derivedByKey.get(definition.key);
      const capability = declared.get(definition.key);
      if (derived === undefined) {
        fail('registry-key-missing', definition.key, `Registry is missing: ${definition.key}`);
        continue;
      }
      if (capability === undefined) continue;
      const expectedImplemented = capability.policy !== null;
      const expectedEstimable = capability.estimator !== null;
      if (derived.implemented !== expectedImplemented) {
        fail(
          'registry-implemented-mismatch',
          definition.key,
          `Registry implemented=${derived.implemented} but the table declares a policy consumer`,
        );
      }
      if (derived.estimable !== expectedEstimable) {
        fail(
          'registry-estimable-mismatch',
          definition.key,
          `Registry estimable=${derived.estimable} but the table declares an estimator`,
        );
      }
    }
  }

  const conventions: GateConventionReport[] = [];
  for (const convention of ambiguityConventions) {
    const keys = conventionKeys(convention, input.definitions);
    if (keys.length === 0) {
      fail('convention-empty', null, `Convention ${convention.id} does not select any catalog key`);
    }
    if (!input.probe.pathExists(convention.anchor.path)) {
      fail(
        'convention-anchor-missing',
        null,
        `Convention ${convention.id} anchor is missing: ${convention.anchor.path}`,
      );
    } else if (!input.probe.fileContains(convention.anchor.path, convention.anchor.title)) {
      fail(
        'convention-anchor-title-missing',
        null,
        `Convention ${convention.id} anchor title is missing in ${convention.anchor.path}`,
      );
    }
    conventions.push(
      Object.freeze({
        id: convention.id,
        statement: convention.statement,
        keys: Object.freeze(keys),
        anchor: convention.anchor,
      }),
    );
  }

  return Object.freeze({
    passed: findings.length === 0 && keyed.length === input.definitions.length,
    findings: Object.freeze(findings),
    keys: Object.freeze(keyed),
    conventions: Object.freeze(conventions),
  });
}

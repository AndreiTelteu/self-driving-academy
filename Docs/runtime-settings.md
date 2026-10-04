# Configurare runtime și preferințe

PBI 009 implementează modulul pur [src/settings](../src/settings/index.ts). Setările aparțin unui `playerId`; modulul nu importă rendererul, UI, profilurile, progresul sau persistența. Nu modifică Babylon.js, fizica sau stilul AI. Storage-ul și aplicarea la un tick sunt responsabilități ale integrării viitoare.

## Contract public

`RuntimeSettings` are `schemaVersion: 1`, `playerId`, `input`, `units`, `quality` și `scenario`. Parserele primesc `unknown`, resping câmpuri lipsă/suplimentare, obiecte exotice, simboluri, getters, valori nefinite și versiuni necunoscute. Construiesc copii defensive readonly, înghețate recursiv. Nu există migrare implicită din altă schemă.

| Contract | Conținut și limite |
| --- | --- |
| `ControlPreferences` | `schemaVersion: 1`, `version` întreg sigur ≥0, `mappingVersion: provisional-v1`; steeringSensitivity, returnRate, speedAttenuation, throttleRamp, brakeRamp și cameraMotion în 0–100; `fov` în 60–100 grade UI |
| `InputPreferences` | `bindings` cu exact cele 15 `inputActions` publice, coduri tastatură distincte și `cameraMode: CHASE/FIRST_PERSON`; preferințe `control` distincte |
| `UnitPreferences` | Viteză km/h sau mph și distanță m sau ft; doar afișare, simularea rămâne SI |
| `QualityPreferences` | LOW/MEDIUM/HIGH, preferredBackend AUTO/WEBGPU/WEBGL2, resolutionScale 0,5–1 și adaptive boolean |
| `ScenarioConfiguration` | scenarioId/mapVersion nenule, seed uint32, taxiCount/civilianCount întregi siguri ≥0; configurație de lansare, nu snapshot de lume |

Codurile tastaturii acceptate sunt KeyA–KeyZ, Digit0–Digit9, săgeți, Space, Tab, Escape, Enter, Backspace, Shift/Control/Alt Left/Right și F1–F12. Conflictul dintre două acțiuni respinge întregul candidat. Bindingurile nu implementează capturarea inputului, focusul sau dialogurile; acestea sunt scope-ul input/UI. Gamepadul și remaparea hardware se extind printr-o schemă explicită.

`ControlPreferences.version` este revizia monotonă per jucător. `getControlPreferencesVersion(settings)` produce un string prin serializarea JSON a tuplei `[playerId, mappingVersion, version]`, compatibil cu `InterventionSegment.controlPreferencesVersion` din 005. Tuplele evită ambiguitatea separatorilor din ID. Revizia nu este versiunea profilului și nu reprezintă o observație de learning.

`cameraMotion: 0` este valid pentru cameră stabilă. FOV este un reglaj de UI în grade; adaptorul camerei va converti explicit în radiani. Nicio valoare 0–100 nu este rată fizică și modulul nu implementează o mapare către comenzi. `provisional-v1` semnalează explicit lipsa calibrării în 203/025; o mapare viitoare cere versiune/schemă explicită, nu reinterpretarea tăcută a salvărilor.

## Valori inițiale și limite provizorii

`createDefaultSettings(playerId, controlVersion = 0)` validează argumentele și întoarce o copie înghețată nouă. Propunerea pentru control este 50 pentru cele șase slidere și FOV 80°. Camera inițială este CHASE. Bindingurile sunt W/S/A/D, Space, M/L/K, Tab, Q/E/C/P, Escape și R, conform modulului 08. Afișarea inițială este km/h și m.

Calitatea inițială MEDIUM/AUTO, resolutionScale 1 și adaptive false sunt preferințe declarative. Domeniul resolutionScale 0,5–1 este provizoriu înainte de 203; preseturile nu conțin bugete calibrate sau o promisiune de FPS. preferredBackend este o preferință, nu dovada suportului; inițializarea rendererului și fallbackul WebGL2 rămân independente. Setările grafice nu conțin populația, timestepul, parametrii profilului sau recompense.

Scenariul inițial `provisional-city-v1`, mapVersion `provisional-v1`, seed 1, 24 taxiuri și 40 civili este un fixture propus, nu o hartă implementată sau o populație măsurată. Parserul validează forma și domeniul numeric; existența hărții/scenariului și admiterea unei populații în buget sunt verificări viitoare ale lansării. Nu se inventează un plafon hardware înainte de calibrare.

## Store atomic și reset independent

`createSettingsStore(initial: unknown)` deține exclusiv o copie validată a setărilor. API-ul înghețat oferă `getSnapshot()`, `replace(candidate: unknown)` și `reset()`. Cititorul primește snapshot imuabil; modificarea candidatului original nu îl afectează.

`replace` parsează întregul candidat înainte de înlocuire și păstrează playerId. Respinge revizii control mai vechi; schimbarea unei valori de control cere revizie strict mai nouă. Un candidat identic este no-op și păstrează referința snapshotului. Eșecul unui singur câmp păstrează integral snapshotul anterior. Modificarea calității/unităților/scenariului nu cere crearea artificială a unei revizii de control.

`reset` reconstruiește numai setările implicite pentru același playerId. Când controlul se schimbă, publică revizia curentă+1; când se schimbă doar alte setări, păstrează revizia controlului. Resetul deja implicit este no-op. Depășirea întregului sigur maxim respinge resetul fără mutație. Store-ul nu acceptă profiluri/progres și nu are callback de ștergere; resetul nu poate reseta lumea, DrivingProfile, istoricul sau XP. Persistența trebuie să salveze rezultatul în domeniul de setări, separat de profiluri și progres.

Modulul nu activează preferințe într-un vehicul live, nu închide segmente de telemetrie și nu implementează draft/Aplică/Anulează din 229. Integrarea viitoare aplică preferințele și deschide/închide segmente la limita tick-ului, conform modulului 27. Modificarea stilului din 230 folosește exclusiv registry-ul profilurilor.

## Probe

[tests/settings/settings.test.ts](../tests/settings/settings.test.ts) acoperă valori valide și extreme, camera stabilă/FOV, setări invalide, schema/mapare necunoscută, conflictul bindingurilor, respingerea DrivingProfile reciprocă, getters fără execuție, copii înghețate, înlocuire atomică, identitatea jucătorului, revizii stale, no-op și reset independent cu profil/progres păstrate, inclusiv depășirea reviziei maxime. Comanda izolată este `node --import ./scripts/register-typescript.mjs --test "tests/settings/*.test.ts"`; verificările globale sunt `npm run check` și `npm run build`.

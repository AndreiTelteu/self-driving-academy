# Setări unități, cameră, grafică și audio 081

Status: implementare și validare funcțională locală. `src/ui/game-settings-format.ts` deține
contractul draftului, conversia de afișare și proiecția pură; `src/ui/game-settings.ts` este adaptorul
DOM cu controale native; `src/app/game-settings.ts` compune setările reale 009. Modulul nu definește
profiluri, parametri învățați, stil de flotă, telemetrie sau XP.

## Ce face

Panoul are cinci secțiuni stabile: Unități (viteză și distanță), Cameră (CHASE/FIRST_PERSON), Confort
(șapte slidere 009), Grafică (preset, backend preferat, scală de rezoluție, adaptare) și Audio
(explicit indisponibil). Toate controalele sunt native (`select`, `input[type=range]`, checkbox), au
un singur listener `change` și modifică doar draftul local. „Salvează” emite exact o intenție
`save(draft)` prin portul injectat; „Resetează” cere o confirmare vizibilă, iar „Renunță” readuce
secțiunile salvate.

```ts
import { createGameSettingsPanel } from './ui';
import { applyGameSettings, readGameSettingsDraft, resetGameSettings } from './app';

const draft = readGameSettingsDraft(settings, currentPlayerId); // aruncă pentru alt jucător
const panel = createGameSettingsPanel(host, draft, {
  save: (next) => applyGameSettings({ store, settings }, next),
  cancel: () => undefined,
});
panel.update(nextDraft, nowMs); // sau setDraft(nextDraft)
panel.getView();
panel.getStats();
panel.dispose(); // idempotent
```

Funcțiile pure exportate sunt `createGameSettingsDraft`, `parseGameSettingsDraft`,
`projectGameSettings`, `setDisplayUnits`, `setCameraMode`, `setComfortValues`, `setGraphics`,
`resetGameSettingsDraft`, `revertGameSettingsDraft`, `gameSettingsRuntimeCandidate`,
`gameSettingsRangeIssues`, `formatSpeedDisplay`, `formatDistanceDisplay` și `unitPreview`.
`GAME_SETTINGS_VERSION` este `081-game-settings-v1`.

## Contractul draftului

Un `GameSettingsDraft` este înghețat și are câmpuri exacte: `schemaVersion: 1`, `version`, `playerId`,
`saved`, `proposed`, `defaults`, `audio` și `revision`. `saved` este citirea reală din
`RuntimeSettings`, `defaults` provine din `createDefaultSettings(playerId)`, iar `proposed` este
propunerea locală. Fiecare secțiune are exact cheile 009:

| Secțiune | Câmpuri și limite |
| --- | --- |
| `units` | `speed: km/h\|mph`, `distance: m\|ft`; doar afișare |
| `cameraMode` | `CHASE` sau `FIRST_PERSON` |
| `comfort` | `schemaVersion`, `version`, `mappingVersion`, `steeringSensitivity`, `returnRate`, `speedAttenuation`, `throttleRamp`, `brakeRamp`, `cameraMotion` în 0–100 și `fov` în 60–100° |
| `graphics` | `preset: LOW\|MEDIUM\|HIGH`, `preferredBackend: AUTO\|WEBGPU\|WEBGL2`, `resolutionScale` în 0,5–1, `adaptive` boolean |
| `audio` | numai `state: UNAVAILABLE` și `reason: PBI_148_PENDING` |

Parserul respinge câmpuri suplimentare, obiecte exotice, getters, enum-uri necunoscute, numere
nefinite și valori în afara limitelor pentru `saved`/`defaults`. O valoare finită din afara limitelor
în `proposed` este păstrată și raportată ca `INVALID`, cu motiv vizibil, în loc să fie tăcut
clampată; salvarea este blocată până la corectare. `defaults.comfort.version` și
`defaults.comfort.mappingVersion` păstrează revizia și maparea persistate, deci resetul nu upgradează
implicit o mapare legacy și nu refolosește revizia 0.

## SI rămâne autoritar

`formatSpeedDisplay(speedMps, units)` și `formatDistanceDisplay(distanceM, units)` primesc exclusiv
valori SI și întorc obiecte de afișare cu `siMps`/`siM` nemodificat. `12,5 m/s` este `45 km/h` sau
`28 mph`; `120 m` este `394 ft`. `unitPreview()` afișează simultan ambele unități:
`12.5 m/s = 45 km/h = 28 mph · 120 m = 394 ft`. Panoul arată „Afișat: … Simularea rămâne 12.5 m/s
(SI)”, deci schimbarea km/h↔mph este vizibilă fără să scrie viteză, distanță, fizică sau profil.
Niciun modul din 081 nu convertește valori înapoi în SI și nu modifică o mărime fizică.

## Revizia de control și resetul

- Unitățile, camera și grafica nu incrementează `input.control.version`; schimbă numai secțiunile lor.
- Orice schimbare a celor șapte valori de confort cere o revizie strict mai nouă în store-ul 009.
  `applyGameSettings` o calculează o singură dată (`revizie curentă + 1`), indiferent de revizia
  propusă în draft.
- `applyGameSettings` refuză închis `INVALID_DRAFT`, `PLAYER_MISMATCH`, `STALE_DRAFT` și
  `CONTROL_VERSION`; un draft identic este `SAVED` fără nicio scriere.
- `resetGameSettings` restaurează valorile reale pentru unități, cameră, confort și grafică, păstrând
  `input.bindings`, `playerId` și scenariul. O resetare care schimbă confortul incrementează revizia o
  singură dată; una deja implicită este no-op.
- `input.bindings`, `scenario` și `playerId` sunt copiate din setările reale; candidatul complet este
  parsat înainte de `SettingsStore.replace`.

## Audio indisponibil

Secțiunea Audio afișează `Indisponibil · 148 · PBI_148_PENDING`, marcată `aria-disabled="true"` și
`data-state="UNAVAILABLE"`. Nu există slider de volum, buton de mut și nici alt control inventat;
preferințele audio aparțin lui 148. Un port injectat viitor poate extinde schema explicit, dar
implicitul rămas este indisponibil.

## Separarea de stilul învățat

Textul politicii este „Setări dispozitiv · nu modifică profilul învățat, AI-ul sau stilul flotei”.
Editorul de stil cu slidere pentru parametrii învățați este o suprafață separată (230) și nu face
parte din acest panou. `src/app/game-settings.ts` nu importă `src/profiles` sau `src/fleet`, nu
citește `DrivingProfile`, parametri învățați, telemetrie ori XP, nu mută vehicule și nu are altă
persistență decât `SettingsStore` injectat. Camera și grafica schimbă numai preferințe de prezentare.

## Accesibilitate, stabilitate și limite

`section[aria-label]` cu `aria-describedby` descrie contractul; fiecare control are etichetă
asociată, iar valorile sliderelor sunt vizibile în `output`. Sumarul și erorile sunt text, nu doar
culoare; focusul are contur explicit. `update(draft, nowMs)` păstrează noduri stabile, refuză un ceas
descrescător și nu scrie nimic pentru o semnătură identică. `dispose()` este idempotent și elimină
toți listenerii.

| Limită | Valoare |
| --- | ---: |
| Secțiuni | 5 |
| Controale native | 14 |
| Elemente DOM | 85 |
| Noduri de text (cu erori) | 49 |
| Listenere permanente | 17 (14 `change` + 3 click) |
| Drafturi reținute | 1 |
| Listenere globale | 0 |

## Verificare

`tests/ui/game-settings.test.ts` (17 teste) acoperă contractul, conversiile SI↔afișare, preview-ul,
draftul neschimbat, unitățile, confortul, valorile invalide, camera/grafica, resetul, revert-ul,
round-trip-ul către `RuntimeSettings`, randarea, schimbarea live a unităților, intenția de salvare,
confirmarea resetării, stabilitatea `update` și `dispose`.
`tests/app/game-settings.test.ts` (8 teste) acoperă citirea pentru jucătorul curent, păstrarea
bindingurilor/scenariului/jucătorului, revizia de control, no-op-ul, resetul, refuzurile închise,
limita maximă de revizie și separarea de profil/flotă/stil.

```powershell
npm run game:settings
npm run game:settings -- --check
```

Runnerul scrie [report.json](Evidence/081-game-settings/report.json) și
[report.md](Evidence/081-game-settings/report.md): 7 scenarii deterministe (km/h, mph, schimbare în
sesiune, schimbare de confort, schimbare grafică/cameră, reset cu bindinguri păstrate, audio
indisponibil) și 45 de verificări, inclusiv DOM-ul serializat. Raportul este un transcript determinist,
nu o captură de browser, o probă audio sau o măsurătoare hardware.

## Ce NU este

- Nu este 009: nu modifică schema, parserul, store-ul sau valorile implicite ale setărilor.
- Nu este 016/017: nu creează renderer, cameră Babylon sau umbre; consumă preferințele existente.
- Nu este 229: nu livrează popup-ul complet de control și pauză.
- Nu este 230: nu editează parametri învățați și nu publică stil.
- Nu este 148: nu inventează volum, mut sau redare audio.
- Nu persistă singur: fără portul `save` și fără `SettingsStore.replace` nimic nu este scris.

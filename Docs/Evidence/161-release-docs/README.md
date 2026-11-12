# PBI 161 — Manual de utilizare și operare (V1)

## Ce s-a livrat

Manualul pentru jucător și operator, în `Docs/manual/`, plus o secțiune de registru în
`Docs/18-validare-si-release.md`. Manualul nu este documentație de arhitectură: descrie pași, taste,
butoane și praguri, iar fiecare afirmație a fost confruntată cu codul reviziei `cfb1e558` sau cu
documentul de modul care o deține.

### Structura

| Fișier | Conținut |
| --- | --- |
| `Docs/manual/README.md` | scop, versiune, cuprins, convenții, ce rămâne nevalidat |
| `Docs/manual/01-pornire-si-control.md` | `npm ci`/`dev`/`build`/`preview`, stările bootstrapului, backend, diagnostic, toate cele 15 taste implicite, condus, camera, pauză/focus |
| `Docs/manual/02-moduri-si-invatare.md` | AUTO/MANUAL/LEARNING, cele șase tranziții, ce nu face MANUAL, ce învață orașul, revenire în AUTO |
| `Docs/manual/03-academie-haos-recuperare.md` | sesiuni izolate, ce poate trece între ele, `R`, reset de oraș, restaurare de stil, decor destructibil, provocări Haos |
| `Docs/manual/04-kpi-si-economie.md` | revenue, rating 0–5, cele trei ceasuri, tarif, pop-up KPIs, proiecție, limite |
| `Docs/manual/05-misiuni-xp-si-provocari.md` | exact trei zilnice, praguri XP, de ce XP nu scade, oferte, cooldown, recorduri, reluare |
| `Docs/manual/06-slidere-si-camera.md` | „Reglaje”, 7 slidere de control, 8 de stil, aplicare/versionare, first-person, findings reale |
| `Docs/manual/07-salvare-si-recuperare.md` | `.sdasave`, checksum, tabel de refuzuri, sumar + înlocuire atomică, limite, ce nu poate face checksum-ul |

**De ce `Docs/manual/` și nu `Docs/30-*`:** manualul se adresează jucătorului, nu dezvoltatorului, și
nu descrie arhitectura. Un director propriu separă suprafața de utilizare de contractele tehnice, astfel
încât manualul poate fi rescris fără să atingă documentele de modul; cuprinsul propriu ține șapte
secțiuni scurte, fiecare citibilă într-o singură rundă.

## Ce am verificat, afirmație cu afirmație

Tabelul de mai jos leagă fiecare grup de afirmații din manual de sursa reală. Toate fișierele sunt în
checkout-ul worktree-ului `docs-161-01`, la commitul de bază `cfb1e558`.

| Afirmație din manual | Sursă verificată (fișier + simbol) |
| --- | --- |
| Node/npm/Vite/TS/Babylon, versiunea `0.1.0` | `package.json` (`engines`, `version`, `devDependencies`) |
| Comenzile `dev`, `build`, `preview` și porturile | `package.json` (`scripts`), `README.md` |
| Textele de stare, butoanele Pornește/Pauză/Reia/Reîncearcă/Reîncarcă | `src/ui/rendering-view.ts` (`show`, textContent) |
| Mesajul „WebGPU și WebGL 2 nu sunt disponibile” | `src/rendering/backend-policy.ts` (`RenderingInitializationError`) |
| Câmpurile panoului Diagnostic și „Indisponibil” | `src/ui/diagnostics-panel.ts` (`fields`, `value.textContent`) |
| Cele 15 taste implicite | `src/settings/store.ts` (`createDefaultSettings` → `input.bindings`) |
| Tastele sunt remapabile, conflicte, captură, `Escape` | `Docs/key-remapping.md`, `src/ui/key-remapping*` |
| Frână → marșarier sub `0,2 m/s` timp de 6 tick-uri; `W+S`; `Space` | `Docs/braking-reverse.md` |
| Etichetele și simbolurile modurilor | `src/ui/taxi-hud-format.ts` (`MODE_VIEWS`) |
| Cele șase tranziții și motivele de închidere | `Docs/three-modes.md`, `src/app/three-modes.ts` |
| MANUAL nu produce job/versiune (`SKIPPED_MANUAL`) | `Docs/three-modes.md` (tabelul sursă → efect), `Docs/13` (116) |
| Etichetele sesiunilor „Academie” / „Joacă liberă / Haos” | `src/persistence/session-kinds.ts` (`SESSION_KIND_LABELS`) |
| Izolarea Haos, `SESSION_KIND_ISOLATED`, `PROMOTION_REFUSED` | `src/persistence/session-kinds.ts`, `Docs/26` |
| `R`, `RECOVERED_WITH_PASSENGER`, `SCENARIO_RESET`, `WORLD_RESET` | `src/persistence/world-recovery.ts` (constante), `Docs/26` |
| `R` nu retrage XP (`XP_WITHDRAWN`), punct sigur (`NO_SAFE_POINT`) | `src/persistence/world-recovery.ts`, `Docs/26` §226 |
| Plafoane decor 96/192, 6 arhetipuri, 35 obiecte, `LOW` doar fragmente | `src/world/destructible-decor.ts` (`maxObjects`, `maxActiveFragments`), `Docs/26` §227 |
| Revenue, tarif din distanță/durată planificată, `SDA` | `src/economy/*`, `Docs/22` §209 |
| Ceas economic 1200 s/zi, 30 zile/lună, 60 Hz | `src/economy/kpi.ts` (`ECONOMY_CLOCK`) |
| Prag proiecție 10 curse + 300 s, motive `FEW_RIDES`/`SHORT_EXPOSURE`/`NO_MONTH` | `src/economy/kpi.ts` (`KPI_PROJECTION_MINIMUM`, `projectionFor`) |
| Textele „fără date”, „Lună parțială…”, „Date insuficiente” | `src/ui/kpi-history-format.ts` |
| Formula notei și vocabularul de motive | `src/economy/*`, `Docs/22` §209 |
| Exact trei misiuni/zi, 100 XP, fereastra zilei | `src/missions/daily.ts` (`DAILY_MISSIONS_PER_DAY`, `DAILY_MISSION_XP`) |
| XP 1/min, 30 s = 0,5 XP, AFK 120 000 ms, fereastră 30 000 ms | `src/missions/player-progress.ts` (`XP_PER_ACTIVE_MINUTE`, `PLAYER_XP_POLICY`, `microXp`) |
| Praguri de nivel `100×(n−1)×n/2`, nivel 50 = 122 500 XP | `src/missions/player-progress.ts` (`LEVEL_STEP_XP`, `MAX_PLAYER_LEVEL`, `levelThresholdXp`) |
| Doar credit, fără debit; cinci căi fără pierdere | `src/missions/player-progress.ts`, `Docs/23` §213/§214, `Docs/18` §216 |
| 12 șabloane, 6 familii, cooldown 10 800 tick-uri, 8 încercări | `src/missions/challenges.ts` (`minimumTemplates`), `src/missions/director.ts` (`cooldownTicks`, `attemptsPerTemplate`) |
| Refuz fără penalizare, `LOCAL_RECORD_ONLY`, `NOT_FAILED` | `src/missions/director.ts`, `src/missions/challenge-experience.ts`, `Docs/28` §233 |
| Taburile „Cum controlez mașina” / „Cum conduce orașul”, placeholder `Indisponibil · 230` | `src/ui/control-sliders-format.ts` (`CONTROL_SLIDERS_CONTROL_TAB`, `CONTROL_SLIDERS_CITY_TAB`, `CONTROL_SLIDERS_CITY_TAB_LABEL`) |
| 7 slidere, intervale, capete, preseturi | `src/ui/control-sliders-format.ts` (`CONTROL_SLIDER_LABELS`, `CONTROL_SLIDER_ENDS`, `CONTROL_SLIDER_PRESETS`) |
| 8 slidere de stil și domeniile lor | `src/ui/style-sliders-format.ts`, `Docs/27` tabelul de stil |
| Aplică/Anulează/Revino la valorile inițiale; 10 Hz; publicare la tick | `src/ui/control-sliders.ts`, `Docs/27` §229/§230 |
| Camera CHASE 2–15 m, +4 m; look ±110°/±70°; FOV 60–100 | `Docs/vehicle-camera.md` |
| `.sdasave`: envelope, sloturi, checksum, ordinea de citire | `src/persistence/savefile.ts` (`SAVEFILE_LIMITS`, `computeSaveFileChecksum`) |
| Tabelul codurilor de refuz | `src/persistence/savefile.ts` (`savefileCodes`), `Docs/29` §234 |
| Plafoane 3 215 360 B / 65 536 B / 4 MiB / 12 285 272 | `src/persistence/savefile.ts` (`SAVEFILE_LIMITS`), `Docs/29` §234 |
| `FILE_READY` ≠ `AUTOSAVE_SAVED`, `claimsBrowserWrite: false` | `src/persistence/savefile.ts` (`saveView`) |
| Findings de accesibilitate D4–D8 | `Docs/27` §235 (raport 153) |

Verificare suplimentară de legături: toate linkurile relative din cele nouă fișiere atinse (manual +
`Docs/18`) au fost rezolvate pe disc, inclusiv ancorele cu diacritice. Rezultatul rulării finale este în
secțiunea „Comenzi executate”.

## Ce am declarat ca nevalidat

- **Onboarding uman.** PBI cere „verifică documentele printr-o sesiune de onboarding”. Nu a fost
  executată cu participanți (zero), deci lizibilitatea, ordinea pașilor și confortul de lectură sunt
  `NOT_RUN`. Verificarea făcută aici este o confruntare afirmație-cu-cod, nu un playtest de documentație.
- **Învățarea și retenția.** Manualul explică mecanismul (segment → job → candidat → activare) și spune
  explicit că nu există dovadă că stilul rezultat este „mai bun” sau că jucătorii revin. Nu conține
  procente, rate sau promisiuni.
- **FPS/GPU.** Manualul nu promite nicio rată de cadre; gate-ul de performanță rămâne `NOT_VALIDATED`.
- **Montarea în bootstrap.** `src/main.ts` montează doar suprafața de randare și panoul Diagnostic.
  Manualul afirmă explicit că HUD-ul, panourile și acțiunile de fișier sunt la nivel de contract/modul, cu
  numele funcției și documentul care le deține.

## Comenzi executate (rezultate reale)

Rulează din `C:\Users\aandr\Sites\self-driving-academy\.worktrees\docs-161-01`.

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, fără erori (`tsc --noEmit` + `tsconfig.tests.json`) |
| `npm run lint` | exit 0, `eslint . --max-warnings 0`, fără avertismente |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | PASS, 365 fișiere TypeScript; 6 + 4 + 3 sonde negative respinse |
| `npm run check:parameter-catalog` | „Parameter catalog is synchronized.” |
| `npm test` | `tests 2898`, `pass 2898`, `fail 0`, `cancelled 0`, `skipped 0`, `duration_ms 90353.3339` |
| verificare legături (script local, în afara repo-ului) | 30 de linkuri verificate în cele 9 fișiere; 0 rupte, 0 ancore lipsă |
| `pwsh -File ./PBI/Validate-Board.ps1` (la început) | `Valid: true`, 235 total, In Progress 1 |
| `pwsh -File ./PBI/Validate-Board.ps1 -RequireDone '161'` | vezi raportul final al PBI-ului |

## Fișiere atinse

Create:

- `Docs/manual/README.md`
- `Docs/manual/01-pornire-si-control.md`
- `Docs/manual/02-moduri-si-invatare.md`
- `Docs/manual/03-academie-haos-recuperare.md`
- `Docs/manual/04-kpi-si-economie.md`
- `Docs/manual/05-misiuni-xp-si-provocari.md`
- `Docs/manual/06-slidere-si-camera.md`
- `Docs/manual/07-salvare-si-recuperare.md`
- `Docs/Evidence/161-release-docs/README.md`

Modificate:

- `Docs/18-validare-si-release.md` (secțiune nouă la final)
- `PBI/To Do/161-release_docs.md` → `PBI/Done/161-release_docs.md` (mutare fizică + metadate)

Nemodificate intenționat: `src/`, `tests/`, `scripts/`, `package.json`, `Docs/performance-budgets.json`,
`Docs/README.md`, `PBI/README.md` și celelalte documente de modul (doar citite).

## Limitări

- Sesiunea de onboarding umană nu a fost rulată: `NOT_RUN`, zero participanți.
- Manualul descrie contractele reviziei `cfb1e558`; dacă un PBI ulterior schimbă tastele, pragurile sau
  numele panourilor, secțiunea corespunzătoare trebuie actualizată în același PBI.
- Defectele de accesibilitate D4–D8 aparțin `src/ui` și sunt raportate în manual, nu reparate aici
  (ownership-ul interzice modificarea `src/`).

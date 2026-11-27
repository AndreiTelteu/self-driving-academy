# 279 — Setări live, remapare și slidere

Status: implementare live în compunerea V3, verificată determinist și într-o probă reală de browser.
PBI-ul rămâne In Progress până când orchestratorul îl integrează și îl mută fizic în Done.

## Ce este montat

- Butonul nativ „Setări” din ecranul de start și din meniul de pauză, plus butonul din bara shell-ului,
  deschid aceeași suprafață reală `src/ui/live-settings.ts`.
- Suprafața are trei taburi: „Joc și control” (081: unități, cameră, cele șapte slidere de control,
  grafică, audio indisponibil), „Taste” (080: toate cele 15 acțiuni) și „Stil oraș” (230: opt slidere).
- `src/app/live-settings.ts` compune drafturile peste exact `SettingsStore` 009, `applyGameSettings`,
  `applyKeyRemapping` și `createStyleSlidersSession`; nu creează un al doilea store, profil, ledger sau
  model de simulare.
- „Salvează” scrie numai dispozitivul; „Aplică” din tabul de stil trece prin bariera 205 și activarea
  110. Setările de dispozitiv nu importă `src/profiles`, nu scriu XP și nu ating profilul învățat.
- Focusul, Tab/Shift+Tab și Escape trec prin `createPanelFocusController`; numai panoul activ este
  montat, iar captura 080 oprește propagarea Escape. Nu există listeneri pe `window`/`document`.

## Verificări

| Comandă | Rezultat |
| --- | --- |
| `npm run settings:live` | 8 scenarii, **27/27** verificări, PASS |
| `npm run settings:live -- --check` | raportul comis este curent |
| `npm run settings:live:probe` | Chrome headless 157, WEBGPU, 1024×640, **PASS** |
| `npm test` | 3791 teste, 3777 pass, 14 skip, 0 fail |
| `npm run typecheck`, `npm run lint`, `npm run format:check` | PASS |
| `npm run build` | PASS |
| `npm run check:architecture`, `npm run docs:check -- --check` | PASS |
| `npm run composition:report -- --check` | PASS |

Raportul determinist [report.json](report.json) și [report.md](report.md) acoperă conflictul, remaparea
validă, unitățile, camera, confortul, resetul și publicarea de stil. Proba de browser
[browser.json](browser.json) păstrează capturile din `screenshots/`.

## Numerele probei de browser

- Remapare: `brake` `KeyS` → `ArrowDown`; conflict `KeyW` blocat; `control.version` rămâne `0`.
- Slider control: `steeringSensitivity` `50` → `80`; `control.version` `0` → `1`.
- Profil/XP după setările de dispozitiv: fingerprint `1c4d32b2f4e3829a` neschimbat, XP
  `fnv1a32:76ab935a` neschimbat.
- Unități: `km/h` → `mph`; HUD-ul central afișează `mph`; resetarea confirmată revine la `km/h`.
- Stil: `settings-279-session-261-academy-1`, epoch `0` → `1`, o barieră 205, activare 110
  `MANUAL_TUNING`, profil `1c4d32b2f4e3829a` → `1598abac3d0ec678`, nicio intrare XP de stil.
- Shell: 24 listeneri, 0 globali, 0 erori de pagină/consolă.

## Limitări

- Camera `FIRST_PERSON` este salvată și validată ca preferință de prezentare; randarea first-person
  rămâne PBI 280. HUD-ul central afișează mph, dar HUD-ul taxiului 073 păstrează km/h până la
  extinderea lui proprie.
- 069 păstrează ținta segmentului deschis când o aplicare manuală de stil avansează bariera 205;
  profilul, flota, stilul orașului și read model-ul 273 adoptă noua versiune, iar următorul segment
  adoptă noua generație. Rotirea țintei în același tick ar invalida fenza 069; nu este simulată.
- Proba este Chrome headless/WEBGL2/WEBGPU, nu un playtest uman și nu o măsurare hardware. Pagina a
  fost deschisă cu `?nofocuspause` pentru ca pierderea de focus a browserului headless să nu
  transforme pauza 070 într-un rezultat fals.

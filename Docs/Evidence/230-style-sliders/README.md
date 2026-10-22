# 230 — slidere de stil și versiuni MANUAL_TUNING

Dovezile pentru PBI 230: tabul „Cum conduce orașul” din popup-ul 229, cele opt slidere peste cheile
reale 092, publicarea numai a diferențelor ca versiune `MANUAL_TUNING`, bariera 205, activarea comună
110, restaurarea 114 și verificarea vizuală la 1280×720.

- Cod: `src/ui/style-sliders-format.ts` (contract pur, conversii, draft, layout),
  `src/ui/style-sliders.ts` (adaptor DOM al tabului), `src/app/control-sliders-style.ts` (sesiunea
  de publicare/restaurare), `src/ui/control-sliders.ts` (tab opțional în popup-ul 229),
  `src/style.css` (stilurile).
- Teste: `tests/ui/style-sliders.test.ts`, `tests/app/style-sliders.test.ts`,
  `tests/ui/style-sliders-fixture.ts`, `tests/app/style-sliders-fixture.ts`.
- Raport determinist: [report.json](report.json) și [report.md](report.md).
- Playtest: [playtest.json](playtest.json) și capturile `capture-*.png`.

## Contract livrat

| Aspect | Contract |
| --- | --- |
| Tab | „Cum conduce orașul” devine funcțional când gazda 229 injectează `style`; fără el, tabul rămâne exact placeholder-ul 229 (`Indisponibil · 230`, `PBI_230_PENDING`) |
| Opt slidere | `speed_delta_urban`, `desired_acceleration`, `comfort_deceleration`, `following_time_headway`, `following_min_gap`, `red_stop_probability`, `stop_full_probability`, `green_start_delay` — toate `implemented` în 092 |
| Conversii | km/h ↔ m/s prin 3,6 (54 km/h = 15 m/s, −28,8 km/h = −8 m/s) și % ↔ probabilitate prin 100, rotunjite la 4 zecimale; domeniile UI coincid exact cu `min`/`max` din catalog |
| Chei nesuportate | `speed_delta_residential`, `launch_intensity`, `signal_use_probability` rămân vizibile, `aria-disabled`, badge `R` și motiv (`OUTSIDE_TUNING_MAP` / `NO_POLICY`); nu sunt ascunse și nu sunt scrise |
| Draft | sliderul scrie doar citirea locală, plafonat la 10 Hz; o revizie de draft la eliberarea gestului; nimic nu se scrie până la Aplică |
| Aplică | derivează **numai diferențele** din `baseVersionId`, cu `reason = MANUAL_TUNING 230-style-map-v1`, valori SI înainte/după; publicarea trece prin bariera 205 (`learningEpoch` +1, segment închis/redeschis, joburi 103 anulate) și prin activarea 110 cu origine `MANUAL_TUNING`, la un tick comun pentru taxiuri și civili |
| Proveniență | valoarea ajustată apare `MANUAL_TUNING`; `evidence = HISTORICAL_ONLY`; versiunea nu inventează observații, încredere sau segmente LEARNING (`sourceSegmentIds` conține doar `manual:<versionId>`) și nu creează job 103 sau progres |
| Draft depășit | dacă head-ul se schimbă între deschidere și aplicare, `queueApply` întoarce `STALE_BASE`, Aplică este blocat, iar „Reîncarcă baza” adoptă explicit noul head fără să contopească propunerea veche |
| No-op / anulare | fără diferențe → `UNCHANGED`, zero versiuni și zero bariere; „Anulează” retrage aplicarea în așteptare și revine la versiunea editată |
| Restore | listă Mărginită la 8 versiuni, două clicuri de confirmare, apoi 114 `restoreVersion`: activare nouă, versiunile existente rămân imuabile; LEARNING ulterior poate modifica din nou aceleași chei |
| Sesiune | draftul este legat de `sessionId`/`worldEpoch`/`playerId`/`profileId`; aplicarea în Haos schimbă doar profilul Haos, iar schimbarea sesiunii invalidează draftul (`SESSION_CHANGED`) fără traversare de lumi |
| Storage | o versiune per aplicare (`storeWrites == versionsAdded`), istoric de versiuni plafonat de 109 (128/profil), listă de restore ≤ 8, un singur draft reținut |
| Layout | 1280×720: popup 416×648, conținutul tabului derulează, footerul rămâne vizibil; 1920×1080 și zoom 150% trec pragul `fits` |

## Verificări executate

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0, `--max-warnings 0`) |
| `npm run format:check` | PASS (exit 0) |
| `npm run check:architecture` | PASS (260 fișiere TypeScript, toate probele negative) |
| `npm test` | PASS 1850/1850 teste |
| `node --import ./scripts/register-typescript.mjs scripts/run-style-sliders-report.mjs` | PASS 70/70 checks, 10 scenarii, `overall PASS` |
| `... scripts/run-style-sliders-report.mjs --check` | `Style sliders report is current` (exit 0) |
| Playtest Chromium headed, 1280×720, port 5230 | PASS 46/46 checks, 0 page errors, `playtest.json` |

Raportul determinist acoperă: cele opt conversii dus-întors față de catalogul 092, cheile
nesuportate vizibile, publicarea a două diferențe cu before/after SI, originea 110 `MANUAL_TUNING`,
bariera 205 cu epoch 1→2, flota comună taxi+civil la același tick, jobul 103 în curs anulat și
rezultatul târziu ignorat, draftul depășit refuzat fără scriere, no-op/anulare, restore fără versiune
nouă plus LEARNING ulterior, separarea Academia/Haos, reload-ul din store, plafonarea scrierilor și
layout-ul la cele trei ancore 084.

## Playtest în browser (1280×720, Chromium headed)

Pagina `tests/browser/style-sliders/index.html` compune popup-ul real, sesiunea 230 reală, store-ul
109 real cu validatorul 102, bariera 205 reală, activarea 110 reală și un registry 057 real. Trei
adaptoare sunt locale paginii și NU sunt contracte de producție: oglinda versiunilor în
`localStorage` (pentru reload), porturile 069/103 în memorie (pagina nu are renderer/fizică/worker) și
înghețarea ceasului cât timp popup-ul suspendă lumea. Driverul este
`tests/browser/style-sliders/playtest.mjs`; serverul a rulat pe portul explicit 5230.

| Scenariu | Ce s-a văzut | Captură |
| --- | --- | --- |
| Deschidere | popup 416×648 în viewport, tabul „Cum conduce orașul” activ, 8 slidere (0 km/h, 1.5 m/s², 2 m/s², 1.8 s, 3 m, 100%, 100%, 0.7 s), footer fix, `tick`, `PAUZĂ` | `capture-01-open-city-1280x720.png` |
| Chei nesuportate | 3 rânduri dezactivate cu badge `R` și motiv, vizibile după derulare, fără slider | `capture-02-unsupported-visible.png` |
| Draft editat | +18 km/h, 55%, 2.5 s; Aplică activat; `Neschimbat` → `Modificat local` | `capture-03-edited-draft.png` |
| Aplică | popup închis, ceasul repornește, `manual-playtest-academia-1`, epoch 2, flota pe versiunea nouă la tick 8, job 103 anulat | `capture-04-applied-published.png` |
| Draft depășit | publicare externă `external-v3`; banner „Versiunea activă este alta decât baza”, Aplică blocat, valoarea propusă păstrată | `capture-05-stale-draft.png` |
| Reîncarcă baza | baza devine `external-v3`, propunerea este renunțată, `Neschimbat` | `capture-06-rebased.png` |
| Restore | select `style-v1`, două confirmări; head `style-v1`, epoch 4, flota restaurată, versiunile rămân 3 | `capture-07-restored.png` |
| Reload | head și epoch se păstrează, valorile versiunii active se recitesc, niciun draft nu supraviețuiește | `capture-08-reload-persisted.png` |
| Sesiune schimbată | `playtest-haos`/worldEpoch 2 invalidează draftul, Aplică blocat, mesaj explicit | `capture-09-session-changed.png` |
| Tastatură | Tab în dialog, Escape închide prin port și readuce focusul pe butonul gazdă | `capture-10-keyboard-escape.png` |

## Cost local (performance_checks ui/frame/storage)

- `frame`: 600 apeluri `update()` identice la ~60 Hz produc **0 scrieri DOM și 0 randări**
  suplimentare; tabul nu înregistrează `requestAnimationFrame`, niciun listener global și nu face
  lucru pe frame. Sesiunea citește ținta o dată pe tick și atinge store-ul numai la aplicare.
- `ui`: citirea sliderului este plafonată la 10 Hz, iar un gest produce o singură revizie de draft.
- `storage`: o singură versiune per aplicare, istoric 109 existent (128/profil), listă de restore ≤ 8,
  un draft reținut; reload-ul recitește head-ul imuabil, nu acumulează copii.

## Limitări

- Playtestul rulează popup-ul și lanțul 109/205/110/057 real, dar fără renderer, fizică sau worker
  real: porturile 069 și 103 sunt în memorie, iar coada 103 reală este verificată în testele Node
  (job anulat, rezultat târziu) și în raport. Performanța jocului integrat rămâne la 220/224/235.
- Harta 230 peste catalog este explicită și versionată; nu expune alte chei din catalog. Cheile din
  afara mapei rămân vizibile, dezactivate și explicate.
- Persistența între reload este oglinda `localStorage` a paginii de playtest; portul de salvare
  per jucător rămâne al integrării de persistență.
- 205 nu are un motiv propriu `MANUAL_TUNING`; sesiunea folosește motivul `NEW_PROFILE`, singurul pe
  care 110 îl publică cu originea `MANUAL_TUNING` (aceeași mapare ca la 114). Vocabularul 205 nu a
  fost modificat.

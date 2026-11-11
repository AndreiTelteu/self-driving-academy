# PBI 210 — pop-up KPIs și grafice istorice ale flotei

Implementare livrată în `src/economy/kpi-history.ts` (`210-kpi-history-v1`), `src/ui/kpi-history-format.ts`
(`210-kpi-history-popup-v1`) și `src/ui/kpi-history.ts`, cu exporturi aditive prin `src/economy/index.ts`
și `src/ui/index.ts`. Pop-up-ul consumă exclusiv citirea 209: nu atinge ledgerul, review-urile,
store-ul, rendererul sau bucla 3D.

## Contract

- `selectKpiHistory(snapshot, { months?, maximumDailyPoints? })` validează un `209-fleet-kpi-v1` cu
  `historyScans: 0` și întoarce fereastra de 12 luni, totalurile, punctele zilnice exacte, punctele
  vizuale, histograma 0–5, proiecția și `historyScans: 0` structural.
- `createKpiHistoryPanel(host, { read, setSurface?, open?, idPrefix? })` montează butonul
  `<button type="button">KPIs</button>` și dialogul. `read` este portul compus de host din
  `selectKpiHistory(kpi.snapshot(tick))`; `setSurface` este portul 070
  (`pauseFocus.setSurface('panel', open)`). API: `open`, `close`, `toggle`, `refresh`, `isOpen`,
  `getView`, `getTrigger`, `getPanel`, `getStats`, `dispose`.
- `refresh()` este singura re-citire: când panoul este închis întoarce `SKIPPED_CLOSED` fără citire
  și fără randare; o semnătură neschimbată întoarce `SKIPPED_UNCHANGED`; altfel `RENDERED`.

## Cum arată pop-up-ul și din ce citește

- Dialog `role="dialog"` cu `aria-modal="true"`, nume din `<h2>KPIs și istoricul flotei` și
  descriere despre media ponderată și lipsa datelor. Butonul are `aria-haspopup="dialog"`,
  `aria-expanded` și `aria-controls`.
- Cinci grafice din valori, ca bare HTML deterministe: revenue lunar efectiv + proiectat, curse/zi,
  review-uri/zi, media notelor/zi (scară 0–5) și distribuția 0–5. Fiecare bară are `data-series`,
  `data-state`, `data-value`, înălțime procentuală calculată și `title` cu valorile exacte; culoarea
  nu este singura diferență (proiectat = contur întrerupt, lipsă = linie punctată).
- Trei tabele accesibile: 12 rânduri lunare (`<th scope="row">` pe prima coloană), rândurile zilnice
  (exacte sau grupate) și cele șase note ale distribuției. Fiecare tabel are `<caption>` și
  `<th scope="col">`.
- `data-*` pe dialog: `data-tick`, `data-months`, `data-exact-points`, `data-visual-points`,
  `data-downsampled`, `data-empty`, `data-projection`, `data-history-scans`.
- Stilurile sunt inline, limitate la pop-up, ca să nu se modifice `src/style.css` în afara
  ownership-ului PBI 210.

## Media ponderată, lunile fără date și cele parțiale

- Media este `ratingSum / reviewCount` peste sumele exacte, atât pe fereastră, cât și pe grupuri:
  `ratingSum` și `reviewCount` se adună, media se calculează o singură dată la final. Nicio medie de
  medii nu este expusă.
- O lună fără bucket este `NO_DATA`: revenue, curse, review-uri, sumă și medie sunt `null`, iar UI-ul
  scrie „fără date”. Nu devine `0` și nu primește o medie inventată.
- Un zero real rămâne `0` (de exemplu o lună cu curse anulate fără încasare) și își păstrează
  eșantionul; o zi cu curse dar fără review-uri are media indisponibilă (`NO_REVIEWS`).
- Luna curentă este `PARTIAL`, are nota „Lună parțială: arată doar intervalul observat și nu se
  compară cu o lună încheiată” și o bară proiectată separată. Proiecția păstrează pragurile 209
  (10 curse terminale, 300 s) și raportează `INSUFFICIENT_DATA` cu motivul închis când nu le atinge.
- Histograma 0–5 însumează exact review-urile ferestrei.

## Downsampling, focus, Escape și pauză

- Plafonul implicit este 60 de puncte (maximum 90); 310 zile exacte devin 52 de grupuri. Fiecare grup
  păstrează suma exactă a membrilor, `exactPoints` și media `ratingSum / reviewCount`; sumele
  vizuale egalează sumele exacte (dovadă în raport).
- La deschidere focusul trece pe butonul „Închide”, Tab/Shift+Tab rămân între „Închide” și corpul
  derulabil, Escape închide, iar focusul anterior (butonul KPIs sau elementul care a deschis
  pop-up-ul) este restaurat. Toate listeners sunt pe buton, pe „Închide” și pe dialog: zero listeners
  pe `window`/`document`.
- Pauza este a lui 070: în MANUAL și LEARNING deschiderea suspendă cu cauza `panel`, închiderea reia
  exact modul anterior; în observare AUTO pop-up-ul rămâne live. Portul este apelat o dată la
  deschidere și o dată la închidere. Hotkey-ul K rămâne al hostului și apelează `open()`.

## Cum se demonstrează că citirea KPI nu rescanează ledgerul

1. `selectKpiHistory` refuză un snapshot fără `historyScans: 0` și nu are nicio referință la ledger,
   settle-uri sau review-uri; singurul input este snapshotul de bucketuri.
2. `getStats()` al lui 209 raportează `historyScans: 0` înainte și după deschidere, iar
   `settlements`/`reviews`/`retainedDays` rămân neschimbate (310/284).
3. Popup-ul citește o singură dată la deschidere (`reads: 1`) și doar la `refresh()` cât timp este
   deschis; închis, `refresh()` nu citește nimic (`SKIPPED_CLOSED`, `reads: 0`, `renders: 0`).

## Rezultate reale

`npm run kpi:history` (determinist, fără ceas de perete): **26/26 verificări, overall PASS**,
`historyScans 0/0`.

| Mărime | Rezultat |
| --- | --- |
| settle-uri / review-uri | 310 / 284 |
| luni în fereastră | 12 (11 cu date, 1 fără date, 1 parțială, 10 încheiate) |
| zile exacte → puncte vizuale | 310 → 52 (plafon 60, `downsampled: true`) |
| revenue fereastră | 31960 SDA |
| curse terminale / review-uri | 310 / 284 |
| media ponderată | 2.552817 (725 / 284) |
| media mediilor lunare (nefolosită) | 2.5 |
| distribuția 0–5 | 49, 45, 45, 45, 45, 55 |
| proiecție | PROJECTED, 3483 SDA din 10800.15 s observate |
| `historyScans` înainte/după | 0 / 0 |
| pop-up | 1369 elemente, 748 noduri text, 175 bare, 70 rânduri de tabel |
| listeners | 3, globali 0 |
| deschideri/închideri/randări/citiri | 1/1/1/1 |
| focus/Escape | focus mutat 1, restaurat 1, Escape 1 |

Costul `ui`/`frame` este raportat la nivelul `targeted`: panoul închis are zero citiri și zero
randări, scrierile se fac doar la deschidere/refresh, iar barele sunt mărginite de fereastra de 12
luni și plafonul de 60 de puncte. Nu se pretinde FPS, timp de cadru sau cost GPU pe hardware real.

## Comenzi executate și rezultat

```powershell
npm run typecheck                 # exit 0 (src + tests)
npm run lint                      # exit 0
npm run format:check              # exit 0, All matched files use Prettier code style
npm run check:architecture        # exit 0, 314 fișiere TS, toate probele PASS
npm run check:parameter-catalog   # exit 0, catalog sincronizat
npm test                          # 2186 teste, 2186 pass, 0 fail, 1 suite, ~74 s
node --import ./scripts/register-typescript.mjs --test "tests/ui/kpi-history.test.ts"
                                  # 21 teste, 21 pass, 0 fail
npm run kpi:history               # 26/26 verificări, report.json + report.md scrise
npm run kpi:history -- --check    # exit 0, raportul committed este curent
```

## Fișiere atinse

- `src/economy/kpi-history.ts` (nou), `src/economy/index.ts` (export aditiv).
- `src/ui/kpi-history.ts` (nou), `src/ui/kpi-history-format.ts` (nou), `src/ui/index.ts` (exporturi).
- `tests/ui/kpi-history-fixture.ts` (nou), `tests/ui/kpi-history.test.ts` (nou),
  `tests/ui/kpi-history-report.ts` (nou).
- `scripts/run-kpi-history-report.mjs` (nou), `package.json` (`kpi:history`, ultima intrare).
- `Docs/22-kpi-economie-si-review-uri.md` (contractul 210), `Docs/08-interfata-camera-si-control.md`
  (pointer), `Docs/Evidence/210-kpi-history-popup/` (acest README, `report.json`, `report.md`).
- `PBI/In Progress/210-kpi_history_popup.md` → `PBI/Done/210-kpi_history_popup.md`.

## Limitări

- Nivel `targeted`: dovezile sunt deterministe (DOM propriu, fără browser real, fără ceas de perete);
  nu există captură Playwright, măsurătoare FPS/GPU sau probă de cadru pe hardware. Gate-urile
  integrate rămân 155/159/220/224.
- Pop-up-ul nu este înregistrat în lista închisă a descriptorilor 083 (cele 10 panouri auditate), ca
  să nu schimbe contractul și dovezile 083; respectă aceleași reguli de focus/Escape/fără listener
  global și refolosește selecția 209. Montarea butonului în panoul flotei și bindingul tastei K sunt
  ale hostului, care apelează `open()`.
- Stilurile sunt inline, intenționat, pentru a nu modifica `src/style.css` în afara ownership-ului.

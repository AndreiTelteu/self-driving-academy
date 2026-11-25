# Mod AUTO/MANUAL, HUD de viteză și coliziune cu mașinile AI (PBI 257)

Status: implementat și verificat în browser real (WebGL2/SwiftShader) pe 25 noiembrie 2026.
Contractele de simulare rămân 023/024/033/041/058/236; modulul nou este adaptorul de joc care le
leagă de HUD și de camera compunerii.

## Comutarea AUTO/MANUAL

- **Tasta `M`** comută mașina condusă între `MANUAL` și `AUTO`. Butonul din HUD face exact aceeași
  tranziție; nu există o a doua cale de schimbare a modului.
- Butonul este un `<button>` real, cu `aria-keyshortcuts="M"`, focusabil și cu text explicit:
  `AUTO · Conduce AI-ul (M)` sau `MANUAL · Conduci tu (M)`. Simbolul `AI` marchează starea AUTO,
  ca să nu mai fie confundat cu tasta `A` (viraj stânga).
- Pe jos butonul este dezactivat și explică „intră într-o mașină”; `M` nu are efect.
- După click, focusul revine pe canvas, altfel inputul 025 ar rămâne blocat de butonul activ.

În `AUTO`, `src/app/vehicle-auto-drive.ts` construiește o rută cu planner-ul 041 peste graful 033,
pornește de pe banda reală cea mai apropiată și avansează pe path cu mecanica 023. Viteza-țintă este
80% din limita benzii, accelerarea este de confort, iar la capătul rutei se alege o conexiune
declarată. În `MANUAL`, driverul este oprit și comanda 024 a jucătorului redevine autoritară.

## HUD

HUD-ul central nu mai este HTML static. `src/main.ts` citește `CompositionFrame` după fiecare tick
și trimite la `rendering-view.updatePlayHud` viteza și modul entității controlate, la ~10 Hz:

- viteza este `round(|speedMps| × 3.6)` km/h, atât pentru personaj cât și pentru mașină;
- modul și simbolul (`AI` / `M` / `L`) vin din `frame.hud.mode`;
- butonul este activ numai în vehicul și are `data-mode`, `title` și `aria-label` actualizate.

HUD-ul de personaj păstrează detaliile (clip, m/s, cameră) și adaugă `M AUTO/MANUAL` în hint.

## Coliziunea cu mașinile

PBI 238 acoperea doar solidele statice. PBI 257 adaugă `vehicleBodiesOverlap` în
`src/app/vehicle-collision.ts`: SAT pentru două dreptunghiuri rotite în planul X/Z. Compunerea
verifică poza candidată a mașinii conduse față de toate celelalte caroserii (AI, civilul static,
taxiul) după măturarea statică. La suprapunere, mașina rămâne pe poza anterioară și viteza devine 0.
Driverul AUTO folosește aceeași verificare. Astfel, taxiul nu mai traversează o mașină AI și se
oprește la contact; AI-ul continuă să o vadă ca lider 044 și frânează în spate.

## Camera

Orbita de cameră se rotește cu 90° numai cât timp este complet blocată sub distanța minimă. După
30 de tick-uri (0,5 s) fără obstrucție, `orbitYawRad` revine la valoarea implicită din spate.
Intrarea, ieșirea și resetul scenariului readuc imediat orbita în spate. Fără acest reset, o orbită
rotită o dată pentru a ieși de lângă un obstacol rămânea lateral după depășire.

## Verificare

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check:architecture
npm test
npm run composition:report -- --browser
```

Teste țintite:

- `tests/app/vehicle-mode-hud.test.ts` — SAT OBB, tranziția M AUTO/MANUAL cu auto-drive real,
  revenirea la MANUAL, oprirea la civilul static și resetul orbitei după depășirea clădirii.
- `tests/app/vehicle-collision.test.ts` — coliziunea statică existentă rămâne neschimbată.
- `tests/character/walking-composition.test.ts` — tick-ul, autoritatea, HUD-ul de personaj și
  intrarea/ieșirea rămân verzi.

Proba de browser [236-browser-composition](../Docs/Evidence/236-browser-composition/browser.json)
include acum pașii `AUTO` (`M`), `revenire MANUAL prin buton`, iar HUD-ul raportează viteza în km/h.
Dovezile acestui PBI sunt în [Evidence/257-mode-hud-collision](Evidence/257-mode-hud-collision/README.md).

## Limite

- `LEARNING` nu este activat în compunerea V3; `M` acoperă numai AUTO/MANUAL. Contractul 067 rămâne
  sursa semanticii pentru cele trei moduri în harness-ul dedicat.
- Driverul AUTO urmează ruta și limita benzii, dar nu negociază semafoare, prioritate, STOP sau
  yield; acestea rămân 036/037/038/045/050–054. Nu face schimbări de bandă.
- Coliziunea oprește mașina condusă; nu aplică impuls fizic mașinii AI. AI-ul este oprit semantic
  prin liderul 044, nu împins.
- Proba de browser este pe SwiftShader, nu pe GPU real; frame-ul rămâne o măsurătoare software.

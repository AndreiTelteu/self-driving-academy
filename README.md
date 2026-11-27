# Self Driving Academy

Joc 3D pentru browser în care jucătorul conduce manual, iar taxiurile autonome și civilii îi adoptă stilul, inclusiv greșelile. Învățarea se face doar în LEARNING; MANUAL permite condus fără învățare. KPI-urile flotei, trei misiuni zilnice și XP urmăresc consecințele și progresul. Engine-ul ales este Babylon.js.



## Stare curentă

| Zonă | Stare |
| --- | --- |
| Mers, intrare/ieșire, conducere de bază, AUTO/MANUAL, trafic AI, ora din zi, vizual V4 | **Jucabil** |
| LEARNING, profil, propagare în flotă | **Contract**, neconectat |
| Flotă 20–30 taxiuri, curse, pasageri, ETA | **Contract/parțial**, neconectat |


| Sesiuni Academie/Haos, checkpoint și reset | **Jucabil** (261); conținutul Haos rămâne la 262+ |
| Companie: costuri, profit, cash, evoluție | **Propunere neconfirmată** în [Docs/32](Docs/32-companie-profit-si-evolutie.md) |
| Persistență, setări, first-person, minimapă, audio, destructibile | **Contract**, neconectat |
| Fizica Rapier și regulile de trafic live | **Lipsesc** din buildul jucabil |

## Dezvoltare locală

Runtime verificat: Node.js **24.21.0** (și `.node-version`), npm **11.19.0**. Versiunile directe sunt fixate în `package.json`: Vite **8.3.2**, TypeScript **7.0.2**, `@babylonjs/core` și `@babylonjs/loaders` **9.29.0**. `package-lock.json` fixează și dependențele tranzitive. Nu încărcăm biblioteci de pe CDN.

Din rădăcina proiectului:

```powershell
npm ci
npm run dev
```

Deschide URL-ul local afișat de Vite (implicit `http://localhost:5173`). Pentru un port fix: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`.

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Buildul verifică TypeScript și generează bundle-ul în `dist/`. Preview servește acel build la `http://localhost:4173`; este pentru verificare locală. Pentru instalarea reproductibilă folosește `npm ci`, fără regenerarea lockfile-ului. [Registry-ul GLB2](Docs/asset-registry.md) folosește loaderul Babylon cu cache, texturi PNG/JPEG embedded și ownership explicit al resurselor comune.

Verificările statice și formatul codului:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run docs:check
npm run check
```

`npm run format` aplică formatul în cod/configuri, iar `npm run check` include verificarea arhitecturii, garda de sincronizare a documentației (`npm run docs:check -- --check`) și testele. [Convențiile de dezvoltare](Docs/development-conventions.md) explică unitățile SI, validarea datelor `unknown`, scope-ul comenzilor și separarea ESLint de verificarea semantică TypeScript.

- [Planul modular](Docs/README.md): 32 de documente de produs și arhitectură.
- [Backlog Kanban](PBI/README.md): 29 task-uri curente (259–287), cu dependențe explicite; 001–258 sunt istorice.
- [Starea implementării și lacunele](Docs/31-stare-implementare-si-lacune.md): ce se joacă, ce este doar contract și ce lipsește.
- [Workflow pentru agenți](PBI/AGENTS.md): To Do → In Progress → Done, cu mutare fizică obligatorie la finalizare.
- [Catalogul parametrilor](Docs/11-catalog-parametri.md): 80 de parametri planificați; 24 pentru prima versiune.

## Teste și scenarii

`npm test` rulează testele de domeniu TypeScript în Node, iar `npm run test:domain` execută exemplul headless. `npm run check` include testele. Harnessul browser este disponibil în dev la `http://localhost:5173/tests/browser/`: seed 41 și 12 tick-uri capturează 13 stări și un eveniment verificat. [Ghidul harnessului](Docs/test-harness.md) explică runnerul reutilizabil, fixture-ul de test și verificarea separată în browser real.

Fundația de [identificatori și random determinist](Docs/identity-random.md) păstrează eșantionarea pe scenariu, vehicul și oportunitate independentă de ordinea altor evenimente.

[Setările runtime](Docs/runtime-settings.md) separă preferințele de input, afișare, calitate și scenariu de profilurile învățate și progres; resetul afectează numai setările.

[Registry-ul parametrilor](Docs/parameter-registry.md) validează cele 80 de definiții și blochează publicarea drept învățate a cheilor nesuportate. După modificarea catalogului canonic, rulează `npm run generate:parameter-catalog`; `npm run check:parameter-catalog` verifică sincronizarea, inclusă și în `npm test`.

[Event bus](Docs/event-bus.md) livrează evenimente validate și deduplicate în ordinea listenerelor. [Protocolul workers](Docs/worker-protocol.md) separă execuția joburilor de publicarea rezultatelor în lumea activă.

[Backendul Babylon](Docs/rendering-backend.md) documentează inițializarea, fallbackul și eliberarea resurselor. Fixture-ul `/tests/browser/rendering/` verifică backendurile reale, eșecurile injectate și retry-ul; dovezile disting aceste probe de benchmarkurile viitoare de gameplay/FPS.

[Bucla cu pas fix](Docs/fixed-tick.md) rulează la 60 Hz, cu recuperare plafonată și pauză explicită de suprasarcină. [Adaptorul de scenă](Docs/scene-adapter.md) păstrează identitatea entităților la înlocuirea reprezentării vizuale. [Schema hărții](Docs/map-schema.md) separă geometria de regulile rutiere și validează legăturile, mișcările și accesibilitatea serviciilor. Aceste API-uri sunt fundații testate; buildul browser conține acum lumea V3, personajul, taxiul și traficul AI civil, dar nu bucla completă de Academie.

[Lifecycle-ul aplicației](Docs/app-lifecycle.md) oferă Pornește/Pauză/Reia/Reîncarcă în bootstrap și exclude timpul petrecut în pauză sau background din simulare. Fixture-ul `/tests/browser/app-lifecycle/` verifică tranzițiile, erorile și cleanup-ul repetat.

## Verificarea boardului

Din rădăcina proiectului, în PowerShell:

```powershell
& './PBI/Validate-Board.ps1'
& './PBI/Validate-Plan.ps1'
```

Etapele planificate sunt V1 cu gameplay, flotă și învățare inițială; V2 cu întregul catalog de parametri; V3 cu mers pe jos și intrare/ieșire din mașini.

V1 include și Joacă liberă / Haos cu decor destructibil, provocări random, cameră first-person, slidere de control/stil și savefile complet cu checksum. XP nu scade prin gameplay. Aceste funcționalități sunt planificate în backlog.

## Stare după resetarea boardului — 26 noiembrie 2026

Mersul pe jos V3 este deja livrat, iar buildul curent este un sandbox de mers și condus. Boardul vechi 001–258 a fost retras; boardul curent are 29 de taskuri, 259–287. Vezi [Docs/31](Docs/31-stare-implementare-si-lacune.md) și [PBI/README](PBI/README.md).

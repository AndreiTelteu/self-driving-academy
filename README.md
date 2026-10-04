# Self Driving Academy

Joc 3D pentru browser în care jucătorul conduce manual, iar taxiurile autonome și civilii îi adoptă stilul, inclusiv greșelile. Învățarea se face doar în LEARNING; MANUAL permite condus fără învățare. KPI-urile flotei, trei misiuni zilnice și XP urmăresc consecințele și progresul. Engine-ul ales este Babylon.js.

Aplicația browser are bootstrap TypeScript/Vite și randare Babylon.js: preferă WebGPU, revine la WebGL2 verificat și oferă reîncercare după eșecul inițializării. Scena de bootstrap conține o cameră fixă și un cadru de culoare; gameplay-ul rămâne în PBI-urile următoare.

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

Buildul verifică TypeScript și generează bundle-ul în `dist/`. Preview servește acel build la `http://localhost:4173`; este pentru verificare locală. Pentru instalarea reproductibilă folosește `npm ci`, fără regenerarea lockfile-ului. Loaderul glTF este disponibil ca pachet; integrarea asseturilor urmează contractele din modulul 03.

Verificările statice și formatul codului:

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run check
```

`npm run format` aplică formatul în cod/configuri, iar `npm run check` include și verificarea arhitecturii. [Convențiile de dezvoltare](Docs/development-conventions.md) explică unitățile SI, validarea datelor `unknown`, scope-ul comenzilor și separarea ESLint de verificarea semantică TypeScript.

- [Planul modular](Docs/README.md): 29 de documente de produs și arhitectură.
- [Backlog Kanban](PBI/README.md): 235 task-uri cu ID-uri stabile și dependențe explicite.
- [Workflow pentru agenți](PBI/AGENTS.md): To Do → In Progress → Done, cu mutare fizică obligatorie la finalizare.
- [Catalogul parametrilor](Docs/11-catalog-parametri.md): 80 de parametri planificați; 24 pentru prima versiune.

## Teste și scenarii

`npm test` rulează testele de domeniu TypeScript în Node, iar `npm run test:domain` execută exemplul headless. `npm run check` include testele. Harnessul browser este disponibil în dev la `http://localhost:5173/tests/browser/`: seed 41 și 12 tick-uri capturează 13 stări și un eveniment verificat. [Ghidul harnessului](Docs/test-harness.md) explică runnerul reutilizabil, fixture-ul de test și verificarea separată în browser real.

Fundația de [identificatori și random determinist](Docs/identity-random.md) păstrează eșantionarea pe scenariu, vehicul și oportunitate independentă de ordinea altor evenimente.

[Setările runtime](Docs/runtime-settings.md) separă preferințele de input, afișare, calitate și scenariu de profilurile învățate și progres; resetul afectează numai setările.

[Registry-ul parametrilor](Docs/parameter-registry.md) validează cele 80 de definiții și blochează publicarea drept învățate a cheilor nesuportate. După modificarea catalogului canonic, rulează `npm run generate:parameter-catalog`; `npm run check:parameter-catalog` verifică sincronizarea, inclusă și în `npm test`.

[Event bus](Docs/event-bus.md) livrează evenimente validate și deduplicate în ordinea listenerelor. [Protocolul workers](Docs/worker-protocol.md) separă execuția joburilor de publicarea rezultatelor în lumea activă.

[Backendul Babylon](Docs/rendering-backend.md) documentează inițializarea, fallbackul și eliberarea resurselor. Fixture-ul `/tests/browser/rendering/` verifică backendurile reale, eșecurile injectate și retry-ul; dovezile disting aceste probe de benchmarkurile viitoare de gameplay/FPS.

## Verificarea boardului

Din rădăcina proiectului, în PowerShell:

```powershell
& './PBI/Validate-Board.ps1'
& './PBI/Validate-Plan.ps1'
```

Etapele planificate sunt V1 cu gameplay, flotă și învățare inițială; V2 cu întregul catalog de parametri; V3 cu mers pe jos și intrare/ieșire din mașini.

V1 include și Joacă liberă / Haos cu decor destructibil, provocări random, cameră first-person, slidere de control/stil și savefile complet cu checksum. XP nu scade prin gameplay. Aceste funcționalități sunt planificate în backlog.

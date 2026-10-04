# Self Driving Academy

Joc 3D pentru browser în care jucătorul conduce manual, iar taxiurile autonome și civilii îi adoptă stilul, inclusiv greșelile. Învățarea se face doar în LEARNING; MANUAL permite condus fără învățare. KPI-urile flotei, trei misiuni zilnice și XP urmăresc consecințele și progresul. Engine-ul ales este Babylon.js.

Aplicația browser are bootstrap TypeScript/Vite și pachete Babylon.js ES modules. Pagina confirmă încărcarea modulului Babylon; gameplay-ul și inițializarea backendului de randare sunt planificate în PBI-urile următoare.

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

## Verificarea boardului

Din rădăcina proiectului, în PowerShell:

```powershell
& './PBI/Validate-Board.ps1'
& './PBI/Validate-Plan.ps1'
```

Etapele planificate sunt V1 cu gameplay, flotă și învățare inițială; V2 cu întregul catalog de parametri; V3 cu mers pe jos și intrare/ieșire din mașini.

V1 include și Joacă liberă / Haos cu decor destructibil, provocări random, cameră first-person, slidere de control/stil și savefile complet cu checksum. XP nu scade prin gameplay. Aceste funcționalități sunt planificate în backlog.

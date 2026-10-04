# Dovezi 002 — layout modular

Verificat la 5 octombrie 2026, pe proiectul local Windows, Node.js 24.21.0 / npm 11.19.0. PBI 001 era fizic în Done înainte de începere; validatorul boardului a trecut după mutarea 002 în In Progress. Probele nu implementează harnessul de scenarii din 004.

## Comenzi și rezultate

`npm run check` a trecut cu exit code 0: `typecheck`, `lint`, `format:check`, `check:architecture`. Outputul verificării de arhitectură:

```text
Architecture imports: PASS (23 TypeScript files)
Architecture negative probes: PASS (6 forbidden dependencies rejected)
Renderer injection, readonly snapshots, defensive persistence and lifecycle: PASS
```

`npm run build` a trecut cu exit code 0:

```text
vite v8.3.2 building client environment for production...
✓ 255 modules transformed.
dist/assets/index-CBrWRo2K.js 333.94 kB │ gzip: 83.98 kB
✓ built in 282ms
```

Vite include chunk-uri Babylon auxiliare; outputul de mai sus păstrează identificatorul bundle-ului principal verificat. Nu este un benchmark GPU sau de gameplay.

Node afișează `ExperimentalWarning: stripTypeScriptTypes is an experimental feature and might change at any time`; comanda trece cu această avertizare. npm afișează avertismentul moștenit de mediu `Unknown env config "msvs-version"`; nu afectează rezultatul verificărilor.

O rerulare a `check:architecture` s-a suprapus cu reinstalarea `npm ci` din 003 și a ieșit cu `ERR_MODULE_NOT_FOUND` pentru TypeScript, deoarece `node_modules` era incomplet. După terminarea reinstalării, `npm run check` a fost executat din nou și a trecut integral cu exit code 0, inclusiv aserțiunile finale pentru entry point Babylon și salvarea după disposal.

## Scenarii executate

- Inventarierea tuturor entry points; importuri/reexporturi fără încălcarea izolării domeniului sau cicluri de domeniu.
- Șase probe negative resping UI, adaptor Babylon, pachet Babylon, DOM, import dinamic și entry point intern consumat din alt modul.
- Aplicația reală cu renderer injectat pornește o singură dată, livrează snapshotul tick 0 și eliberează rendererul o singură dată.
- Snapshotul, profilul și parametrii sunt înghețate; o scriere JavaScript în parametrii livrați rendererului aruncă TypeError.
- Constructorul profilului copiază parametrii; modificarea sursei nu schimbă rezultatul.
- Store-ul începe fără date, salvează o copie a snapshotului și a profilului și păstrează copia după modificarea sursei; datele încărcate sunt înghețate și nu pot rescrie profilul salvat.
- Pornirea și salvarea după disposal sunt respinse.

## Browser

Preview producție `http://localhost:4173/`, tab `tab_1`, reîncărcat după build. O evaluare imediat după reload a surprins pagina în încărcare; evaluarea ulterioară a confirmat:

```json
{
  "headingCount": 1,
  "statusCount": 1,
  "scripts": ["http://localhost:4173/assets/index-CBrWRo2K.js"],
  "text": "Self Driving Academy\n\nBootstrap pregătit\n\nBabylon.js 9.29.0 · TypeScript · Vite"
}
```

Refactorul păstrează ecranul bootstrap. Nu se revendică backend GPU, scenă 3D sau playtest de driving.

## Limite de scope

Entry points pentru modulele viitoare sunt rezervate; nu sunt servicii implementate. ProfileSnapshot/SimulationSnapshot sunt read models minime, nu contractele complete 005. Adaptorul persistence este volatil. Backendul Babylon este metadata bootstrap; backendul GPU aparține 011. Politica importurilor externe se extinde explicit când PBI-urile de adaptoare introduc biblioteci noi.

## Tranziție finală

002 a fost mutat fizic în `PBI/Done/002-layout.md`, cu status Done și completed_at real cu offset. Există o singură copie a fișierului, numai în Done. `PBI/Validate-Board.ps1 -RequireDone '002'` a trecut cu exit code 0 și `Valid: true` (235 PBI; To Do 232, In Progress 1, Done 2 la momentul verificării), iar `RequiredDonePaths` indică fișierul 002 din Done.

# Layoutul modular implementat în 002

Compoziția browser pornește în `src/main.ts`: construiește view-ul DOM și injectează fabrica asincronă Babylon în `createRenderingLifecycle` din `src/app/index.ts`. Fundația inițială `createApplication`, cu porturile publice `Renderer` și `SnapshotStore`, rămâne disponibilă pentru proba din `scripts/verify-architecture.mjs`; aceasta injectează un renderer de înregistrare și rulează fără DOM sau Babylon.

## Module și entry points

Fiecare modul din layoutul planificat are un `index.ts` public. `app`, `simulation`, `profiles`, `rendering`, `rendering/babylon`, `ui` și `persistence` conțin fundația bootstrapului. Contractele validate din 005 aparțin modulelor `vehicles`, `fleet`, `telemetry`, `profiles`, `simulation` și `sessions`. `settings` este un modul pur pentru preferințe și configurație, separat de profilurile învățate. `world` conține schema statică și validatorul semantic al hărții; `simulation` expune core-ul cu pas fix, iar `rendering/babylon` deține maparea entităților vizuale. `autonomy`, `input`, `learning`, `experiments`, `missions`, `economy`, `progression`, `challenges`, `destructibles` și `audio` păstrează entry points rezervate, fără implementare de gameplay. Serviciile de gameplay rămân în PBI-urile dedicate.

Importurile dintre module trec numai prin `<modul>/index.ts`; un `index.ts` intern nu devine automat public. Excepția explicită este composition root (`main.ts` sau `app`) către `rendering/babylon/index.ts`, pentru construirea adaptorului. Modulele de domeniu pot importa alte module de domeniu, fără cicluri. Nu importă `app`, `rendering`, `ui`, `input`, `persistence` sau `audio`, pachete externe ori identificatori DOM. Babylon este importat numai în `rendering/babylon`. Randarea, UI și input consumă contractele domeniului prin `import type`, fără executarea serviciilor lui. Composition root este locul care leagă porturile de adaptoare.

Lista pachetelor externe permise este politica bootstrapului 002. La introducerea fizicii, validării sau altor biblioteci, PBI-ul dedicat extinde explicit politica pentru adaptoarele potrivite; interdicția actuală nu reprezintă o limitare permanentă a produsului.

`workers` extinde lista modulelor pure cu protocolul, clientul și runtime-ul cooperativ. Transportul este un port injectat; implementarea nu importă API-uri Node, Babylon sau starea lumii. Adaptorul structural `messageTransport` poate primi un Worker/MessagePort din composition root. Modulul are aceleași restricții de import ca domeniul; schedulerul global rămâne în PBI 221.

## Read models și proprietatea datelor

`SimulationSnapshot` expune un tick și un `ProfileSnapshot` minimal, cu identificator, versiune și parametri numerici readonly. Sunt modele pentru bootstrap; nu înlocuiesc `DrivingProfile`, schema savefile-ului sau contractele complete din 005. Simularea oferă exclusiv `getSnapshot`, fără mutator de profil. Copia parametrilor și snapshoturile sunt înghețate și la runtime, inclusiv când un consumator JavaScript încearcă să scrie în ele.

`SnapshotStore.save` primește doar read modelul public. Adaptorul în memorie face propria copie defensivă a profilului și îngheață rezultatul înainte de expunerea prin `load`; modificarea obiectului inițial nu schimbă datele salvate. Store-ul este volatil, fără IndexedDB, migrare sau restaurare a unei simulări. Acestea aparțin PBI-urilor de persistență.

Rendererul metadata din 002 este păstrat pentru probele inițiale. Aplicația browser folosește [backendul din 011](rendering-backend.md), cu engine/scenă reale, frame-uri și resize, fallback și retry. Lifecycle-ul asincron reunește pornirile concurente și eliberează resursele la HMR/disposal. În API-ul inițial `createApplication`, `start` și `dispose` rămân idempotente; după disposal, pornirea și salvarea sunt respinse.

## Verificare

Rulează `npm run check:architecture`. Scannerul lexical TypeScript 7 verifică entry points, importuri/reexporturi, izolarea domeniului, importurile Babylon și ciclurile. Importurile dinamice și `require` sunt respinse până la definirea unei politici explicite. Șase probe negative verifică efectiv respingerea UI, Babylon, DOM și importului dinamic din simulare, plus accesul unui consumator la un entry point intern al altui modul.

Apoi comanda încarcă modulele TypeScript reale prin hooks Node 24 și verifică injecția rendererului, pornirea/eliberarea idempotentă, readonly la runtime și copiile defensive ale profilului și persistenței. Nu generează fișiere și nu necesită browser. `stripTypeScriptTypes` din Node afișează în versiunea fixată un avertisment experimental; verificările trec cu acesta. Verificarea TypeScript a contractelor este separată: `npm run typecheck`.

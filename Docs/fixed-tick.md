# Bucla pură la 60 Hz

PBI 008 exportă `createFixedTickLoop<T, View>` din `src/simulation/index.ts`. Bucla nu deține renderer, clock de browser, fizică, comenzi, rewards sau schedulerul 219. Apelantul injectează trei porturi sincrone:

- `step({ tick, dtSeconds })` aplică numai comenzile adresate tick-ului primit și întoarce `undefined`. Primul tick este `initialTick + 1`, cu `initialTick` implicit 0. Pasul este întotdeauna `1/60` secunde, inclusiv la recuperare.
- `captureSnapshot()` întoarce o proiecție de date a stării autoritare. Bucla capturează inițial și după fiecare step reușit.
- `interpolate(previous, current, alpha)` întoarce proiecția pentru afișare. Nu primește starea autoritară mutabilă; portul generic permite interpolarea transformărilor fără Babylon în simulation.

`frame(nowMs)` primește timp monoton în milisecunde, în intervalul finit `[0, Number.MAX_SAFE_INTEGER]`. Prima frame ancorează clockul fără tick-uri sau timp activ retroactiv. `frame` întoarce `{ state, steps, interpolated }`; fiecare apel reprezintă un cadru al apelantului. Nu programează RAF sau alte callbacks. Clockuri regresive/nefinite sunt respinse fără a schimba baseline-ul sau starea.

## Accumulator și timp observabil

Timpul activ dintre frames intră în accumulator. Fiecare tick consumă exact `1000/60` ms; sunt executate maximum patru tick-uri per apel `frame`. Restul datoriei rămâne în accumulator. Nu există dt mărit, tick sărit, tăiere de timp sau simulare accelerată. O toleranță de `1e-7` ms, mai mică decât o nanosecundă, compensează numai eroarea numerică de reprezentare la limita unui tick; nu reprezintă un prag de recuperare sau o scurtare de gameplay.

`getState()` și rezultatul unei frame expun `tick`, `simulatedSeconds`, `activeRealSeconds`, `debtSeconds`, `alpha`, `status`, `overloadCount`, `fault` și perechea de snapshots. Timpul simulat reprezintă tick-urile finalizate de această instanță, calculat relativ la `initialTick`. Timpul real activ include întregul stall observat înaintea suprasarcinii, dar exclude intervalele oprite și recuperarea. Raportul simulat/activ și datoria dezvăluie întârzierea; nu sunt convertite în XP sau KPI de acest modul.

Snapshotul inițial este folosit ca previous/current. După un tick, previous devine vechiul current și current devine noua captură. Pentru datoria sub un tick, `alpha = debt/dt`; dacă există backlog de unul sau mai multe tick-uri, alpha este plafonat la 1 și afișează current. Nu se extrapolează viitorul. Interpolarea obișnuită între previous și current are întârzierea de un tick proprie acestei metode.

## Pauză, background și suprasarcină

`pause(nowMs, 'manual' | 'background')` contabilizează doar intervalul activ până la limita pauzei, apoi oprește pașii. Datoria existentă rămâne. Frames în pauză pot produce proiecții de afișare, dar nu admit timp real și nu execută ticks. `resume(nowMs)` reancorează clockul la momentul reluării și exclude tot intervalul oprit. Nu se apelează resume pe o buclă deja activă.

Dacă limita pauzei întâlnește deja o datorie peste 250 ms, contorul și markerul de recuperare sunt păstrate, iar statusul rămâne motivul explicit al pauzei; resume intră în recovering.

O datorie **mai mare de 250 ms** oprește frame înainte de orice step și setează status `overload`, incrementând contorul. Tick-urile și datoria nu sunt șterse. Frames ulterioare în overload nu admit timp și nu produc câștiguri de gameplay. Exact 250 ms poate fi procesat prin limita normală de patru pași.

După reducerea costului vizual/joburilor de către integrare, `resume(nowMs)` intră explicit în `recovering`. În această stare, fiecare frame consumă până la patru tick-uri reale cu același dt și aceleași comenzi tick-addressed, fără a admite timp real nou. Când datoria scade sub un tick, starea devine `running`; clockul este deja ancorat la ultima frame de recuperare. O pauză manuală/background în timpul recuperării păstrează nevoia de recuperare la resume. Nu există retry automat, reset fictiv de epoch sau credite calculate din durata oprită. Recuperarea poate executa efectele tick-urilor care erau deja datorate; acestea sunt step-uri reale, nu wall-clock gains.

Composition root trebuie să lege `visibilitychange` de `pause(timestamp, 'background')` și revenirea de `resume(timestamp)` folosind aceeași origine monotonă ca RAF/`performance.now()`. Adapterul browser nu face parte din 008 și nu este conectat artificial la simularea bootstrap. În absența acestei notificări, un interval lung fără frames este un stall observat, iar bucla îl raportează ca overload; nu poate deduce singură vizibilitatea tabului.

## Ownership, erori și lifecycle

Capturile și rezultatele interpolării sunt copiate defensiv și înghețate recursiv. Sunt acceptate arbori de plain objects/dense arrays, stringuri, booleeni, numere finite și null. Accessors nu sunt executate, ciclurile/prototipurile exotice/functions sunt respinse, iar adâncimea este limitată la 64. Bucla reține numai previous/current; apelantul poate păstra rezultatele mai vechi pe propria răspundere. Costul copiei și interpolării depinde de mărimea proiecției și trebuie măsurat la integrare; acest PBI verifică un fixture compact.

Operațiile mutabile reentrante sunt respinse în timpul step/capture/interpolate. `getState` este read-only. Erorile callbackurilor, inclusiv o returnare async/nepermisă din step sau o captură invalidă, produc un `fault` terminal cu `stage`, `attemptedTick` și eroarea originală. Frame întoarce starea faultată, fără a reapela callbackul. Step/capture fault lasă tick-ul și snapshots la ultimul commit coerent; interpolate fault poate apărea după commit-ul unor tick-uri. Orice efect extern deja executat rămâne posibil: bucla nu pretinde rollback și nu retry un step care poate fi fost aplicat. Integrarea trebuie să recupereze lumea/checkpointul explicit și să creeze o instanță nouă. Un constructor fără captură inițială validă aruncă eroarea și nu produce instanță.

`dispose()` este idempotent, eliberează snapshots deținute de loop și respinge frame/pause/resume ulterioare. `getState()` rămâne disponibil, cu `status: 'disposed'` și `snapshots: null`. Referințele deja returnate și starea autoritară a apelantului nu sunt șterse de disposal.

## Verificare și probe CPU

`tests/fixed-tick/fixed-tick.test.ts` compară 30 și 60 frames/secundă pe zece minute sintetice: 36.000 tick-uri și aceeași secvență de comenzi, timp simulat și rezultat. Alte probe acoperă limite fracționare, maximum patru pași, debt păstrat, pragul 250 ms, stall de o secundă, recovery explicit, pause/background, clock invalid/regresiv, ownership, disposal și fault-uri step/capture/interpolate/reentrancy.

`node --import ./scripts/register-typescript.mjs scripts/benchmark-fixed-tick.mjs --baseline` păstrează proba fixture-ului existent înaintea implementării. Fără flag, scriptul repetă aceeași probă și raportează separat 10.000 frames sintetice cu loop/captură/interpolare. Sunt cinci repetări și un warmup pe probă. Observatorul CPU cu 10.000 samples plafonate raportează p50/p95/p99; costul total cu observator activ/inactiv este păstrat separat. Artefactele din `Docs/Evidence/008-fixed-tick` identifică revizia, runtime-ul și hardware-ul observat.

Probele CPU sintetice nu dovedesc FPS hardware, p95 al fizicii, scenei sau tick-ului autoritar complet și nu închid bugetele jocului. Presetul/rezoluția/GPU sunt indisponibile. Pragurile Docs/25 rămân propuneri înainte de 203; fixture-ul compact și testul determinist nu substituie steady-state/soak/browser gates din 218–224.

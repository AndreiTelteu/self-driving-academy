# Protocol workers — PBI 010

API pur în `src/workers/index.ts`: `parsePacket`, `WorkerClient`, `WorkerRuntime`, `messageTransport`. Nu importă lumea, profilurile, simularea ori Babylon; rezultatul este o propunere returnată către serviciul apelant, care validează și publică separat la limita tickului.

## Identitate și mesaje

Fiecare pachet păstrează jobId, segmentId, baseVersionId, profileId, learningEpoch, sessionId și worldEpoch. Tipurile sunt start/progress/result/cancel/cancelled/error; sequence crește la worker, iar start/cancel au sequence 0. Clientul ignoră identități nepotrivite, sequence duplicate/mai mici și rezultate fără job pending. La schimbarea țintei curente, rezultatul devine stale; după cancel, nici un rezultat întârziat nu devine result.

**jobId este un întreg pozitiv safe reprezentat decimal canonic, crescător pe întreaga viață a transportului**, de exemplu "1", "2". Callerul folosește un contor comun pentru toate joburile transportului, nu createStableId și nu un contor resetat la schimbarea profilului. Ambele capete păstrează watermark O(1); refolosirea/ordinea descrescătoare este respinsă inclusiv după evacuarea istoricului. La epuizarea MAX_SAFE_INTEGER este necesar un transport nou izolat de cel vechi. Retry primește jobId nou; segmentId păstrează cauza. Idempotenta persistată a segmentelor/publicarea rămân responsabilitatea serviciului de profiluri, nu a istoricului local al transportului.

Parserul primește unknown și cere obiect simplu cu câmpuri proprii enumerabile de date, fără getters, simboluri ori câmpuri necunoscute. Epoch-urile și sequence sunt întregi safe nenegative. Bufferul trebuie să fie ArrayBuffer fix, atașat, cu byteLength egal payloadBytes; SharedArrayBuffer, resizable și detached sunt respinse. Error este text de maximum 256 caractere; progresul este finit în [0,1]. Controalele nu transportă payload.

## Ownership și limite

Callerul furnizează numai snapshoturi/copii private. Bufferul autoritar al lumii nu poate fi cedat acestui API. `copy` cere clonarea prin postMessage; `transfer` trimite exact bufferul indicat în transfer list și senderul nu îl mai folosește după send. Metadata păstrează bytes originali după detachment. Result are un buffer privat produs de task și ownershipul cerut de job. Nu există transferuri ascunse și nu clonăm lumea.

Capacitate per client/runtime: maximum 8 joburi inclusiv activ, 8 MiB payload pending, vârstă 30 s, 64 ID-uri de diagnostic. Bytes numără payload pending, nu pretinde să estimeze overheadul JS sau memoria internă a algoritmului. Watermark protejează de replay independent de FIFO. Clientul are un singur timer pentru cel mai apropiat deadline; `expire()` permite verificare explicită cu clock injectat. Runtime verifică lease-ul între felii și la scoaterea din coadă. La capacitate clientul aruncă înainte de transfer; runtime răspunde error. Nu persistă automat date protejate: callerul păstrează/admite ulterior segmentul, iar PBI221 implementează governorul comun.

Prioritatea logicală protected/interactive/optional este validată și transmisă; această fundație are coadă FIFO serială, fără prioritate OS și fără preempție de governor. Un cancel produce cel mult un mesaj din client. Progresul este cel mult un mesaj la 200 ms per job (5 Hz), fără progres final redundant; clientul plafonează și notificările observatorului. Rezultatele/erorile/cancelled sunt terminale. Payloadurile terminale au același plafon 8 MiB. Nu există logging per felie, queue de notificări sau istoric de rezultate. Ingressul unui transport ostil arbitrar nu este un rate limiter de rețea; adaptorul este destinat unui worker local controlat.

## Runtime cooperativ și lifecycle

TaskFactory produce `step(deadline)` și `dispose()`. Step este sincron și trebuie să respecte deadlineul (propunere provizorie ≤10 ms); runtime nu poate întrerupe un callback JS blocant. După fiecare felie incompletă runtime cedează efectiv event loop prin setTimeout(0), apoi verifică cancel/lease. Promise.resolve nu este folosit pentru yield. Taskurile următoare rulează după anulare, eroare ori excepție de cleanup; resursele/accounting sunt curățate în finally. O excepție de cleanup este izolată, fără a rescrie rezultatul deja trimis. Observerul de progres nu deține lifecycleul jobului.

WorkerClient.dispose dezabonează portul, stinge timerul și rezolvă toate promiseurile pending cu error. WorkerRuntime.dispose dezabonează, elimină coada și oprește taskul activ la următoarea limită de felie. Proprietarul transportului termină workerul și închide portul; nu refolosește un canal vechi pentru un client nou. messageTransport include error și messageerror. Erorile fatale de transport rezolvă joburile pending; restabilirea unui worker este o decizie explicită a callerului.

## Verificări și performanță

`node --import ./scripts/register-typescript.mjs --test tests/workers/protocol.test.ts`: parser invalid, rezultate stale/duplicate/out-of-order, cancel tardiv, eroare transport/task, cleanup, observator, capacitate/bytes/vârstă/history, replay după 100 rezultate, progres plafonat și thread Node real cu transfer/detachment, cancel și job ulterior. Nu este simulare de event loop prin microtasks: fixture-ul rulează în worker_threads.

`node --import ./scripts/register-typescript.mjs scripts/benchmark-workers.mjs Docs/Evidence/010-workers/final.json --new`: repetă exact proba baseline de clone 4096 bytes ×1000, cinci repetări, apoi măsoară separat pornirea workerului, felii CPU de 2 ms, 450 ms progres, anulare, job ulterior și 100 joburi seriale. Pragurile sunt provizorii din Docs25: felie≤10 ms, cancel≤100 ms, progres≤5 Hz. Raportul păstrează CPU/RAM/OS/Node observate, heap worker și RSS proces; nu declară FPS/GPU/browser, retenție heap exactă ori gate hardware203/224. Browser lifecycle/rendering este verificat în PBI011; integrarea reală learning/experimente și governor221 rămâne viitoare.

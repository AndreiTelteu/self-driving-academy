# Governor comun pentru workers — PBI221

API-ul pur `WorkerResourceGovernor` este exportat din `src/workers/index.ts`. Aplicația creează **un singur governor și un singur transport/runtime serial pentru toate joburile grele** learning, encode, hash și comparison. Producătorii nu trimit joburi grele direct altui WorkerClient. Limita este logică per aplicație, nu prioritate OS, și nu justifică ocuparea tuturor nucleelor din hardwareConcurrency. Fizica live rămâne autoritară în firul principal.

## Admitere, identitate și preempție

`submit(startPacket, operation)` acceptă operation `learning | encode | hash | comparison`. Implicit, optional înseamnă comparison, celelalte learning. Cheia logică include operation, segmentId, sessionId/worldEpoch/learningEpoch/profileId/baseVersionId; nu include jobId al tentativei. Operații diferite pe același segment rămân distincte. SegmentId este identitatea logică a cererii în interiorul operației; un encode nou folosește un segment/generație nouă. Retry/preempția păstrează această cheie și primește un jobId monotonic nou pe transport.

Ordinea este protected, learning interactiv, encode/hash cerut, comparison secundar. Un job mai urgent anulează cooperativ tentativa mai puțin urgentă, așteaptă acknowledgement, apoi rulează. Snapshotul privat rămâne disponibil pentru restart. Reînceperea secundarului este de la începutul jobului; loturile callerului trebuie împărțite în unități rezonabile/checkpoint-uri. Nu se pretinde salvarea continuării interne a algoritmului. Tentativa anulată nu publică rezultatul tardiv, iar fiecare ticket are un singur outcome. Publicarea profilului/XP/ledgerului este responsabilitatea callerului la tick și cu idempotenta cheii logice.

Admiterea întoarce `PENDING` cu ticket când este în coada RAM; fără ticket și cu motiv când dovezile sunt păstrate în store și așteaptă capacitate. `CAPACITY_INSUFFICIENT` refuză optional înainte de transfer. `SESSION_SUSPENDED` indică imposibilitatea persistenței protejate; aplicația trebuie să suspende sesiunea și să ofere retry/export/curățare, păstrând bufferul callerului. Governorul nu modifică el însuși timpul de simulare.

Presiunea în context active amână encode/hash/comparison și întrerupe tentativa secundară curentă. `setPressure(true, 'idle' | 'paused')` permite reluarea lor fără avansarea simulării. `resume()` încarcă în mod plafonat joburi protejate pending după capacitate/restart. Lease-ul de 30s privește numai retenția optional din governor; timeoutul transportului poate termina o tentativă protected, dar dovezile rămân persistate pentru retry. Nici cancel, stale, error, dispose sau epoch nou nu șterg ledger/XP/dovezi.

## Ownership și limite finite

`governorLimits.version = 221-synthetic-1`; valori sintetice provizorii, fără calibrare gameplay.

| Categorie de ownership | Plafon | Contor |
| --- | --- | --- |
| Snapshoturi private pending/active deținute de governor | 8 joburi,16MiB | usage.jobs/bytes |
| Snapshoturi de ingress în așteptarea persistenței async | separat8 operații,16MiB | persistenceIngressJobs/Bytes |
| Tentativa trimisă pe transport | 1 job greu,8MiB | usage.transport; bufferul metadata sender este detașat la transfer |
| Experiment activ | 1 lume/task | runtime serial și dispose înaintea taskului următor; fixture folosește token sintetic, nu Rapier |
| Istoric diagnostic governor | 64 măsurători | usage.history |
| Store de probe | separat8 înregistrări,16MiB inclusiv rezultate | fixture store.usage |

16MiB este plafonul snapshoturilor governorului, **nu RAM totală workers**. Ingressul, copia privată a tentativei, memoria internă a taskului și persistența sunt categorii distincte. Heap/RSS/external nu se adună ca RAM independentă. Un store production trebuie să declare/admită propria capacitate finită; un algoritm production trebuie să declare memoria internă/WASM. Clonele temporare sunt plafonate de ingress/record batch, dar timpul sincron de copiere crește cu payloadul și se măsoară separat în integrările222/234. Probe cu4bytes nu calibrează copierea savefile maxim.

Callerul își păstrează bufferul live/dovezile atașate. Governorul capturează o copie privată înainte de await la persistence; modificarea ulterioară a callerului nu schimbă snapshotul admis. Fiecare tentativă transferă o copie suplimentară și consumă numai acea copie. Finish/dispose elimină referințele snapshotului din ticket/closure, accounting revine la zero; rezultatul ticketului este owned de caller și se retrage prin lifecycle-ul său. Nu există clone ale lumii live per mesaj.

## Persistență protejată injectată

`ProtectedJobStore` este un port, **nu implementare IndexedDB**. `retain` este atomic/idempotent pe key și întoarce PENDING/COMPLETED/CAPACITY_INSUFFICIENT. `list(limit)` oferă numai pending, în lot plafonat. `complete(key, result)` păstrează propunerea înainte de outcome către caller; `completed(limit)` recuperează propuneri complete după restart. O resubmit pentru COMPLETED nu execută/publică din nou. `invalidateResult` înlătură numai o propunere anulată în timpul commitului async, păstrând dovezile. `acknowledge(key)` este exclusiv după publicarea idempotentă confirmată; callerul este responsabil să nu retire date la suspendare/import invalid.

Implementarea de test `GovernorMemoryStore` păstrează exact bufferele de evidence/result și are capacitate inclusiv pe rezultate. Un store production trebuie să asigure durabilitatea crash-safe și validarea contractului; integrarea de learning/A/B/savefile reală urmează în103/144/234/224. Datele XP/reward nu sunt calculate, reduse ori trunchiate în governor.

## Probe

Testele de protocol verifică serializare globală, cancel acknowledgement, rezultat tardiv, restart cu ID nou, operation distinct, dedup completed/recovery, presiune/idle, lease optional, ingress async saturat, mutarea bufferului callerului în timpul await, bytes/cozi/history, protejarea dovezilor la capacity/dispose și un worker_threads real cu transfer/detachment.

`node --import ./scripts/register-typescript.mjs scripts/benchmark-worker-governor.mjs Evidence/221/cpu.json` produce baseline-ul clone4096×1000 folosit în010 și costul nou separat, cinci repetări reale. `./scripts/Run-WorkerGovernorProbe.ps1` construiește fixture-ul production, apoi Chrome deschide5193 și rulează butonul; exportul păstrează identitatea build/hash artefacte/hardware și cinci ferestre pereche1s rAF baseline/worker. Frame scheduling sintetic și probele CPU nu substituie gameplay120s, FPS/GPU pe laptop ori gate224. Felie≤10ms/cancel≤100ms/progres≤5Hz sunt contractele provizorii; taskul cooperativ trebuie să respecte deadline, runtime nu poate întrerupe un callback sincron blocant.

Rezultatele măsurate și comenzile finale sunt în PBI221 și Evidence/221 după execuție. Nicio probă hardware/laptop neexecutată nu este declarată PASS.

Verifierul `node scripts/verify-worker-governor-evidence.mjs` compară hashurile surselor actuale și bytes/hashurile artefactelor production, cele cinci perechi browser și cele cinci repetări CPU, limitele cooperării/progresului și ownershipul după cleanup. [Dovezile și limitările](../Evidence/221/verification.md) păstrează separat baseline-ul original010, costul nou și scope-ul burst al cadrelor. Snapshotul CIM/alimentare este punctual înaintea probei, fără monitorizare continuă. Proba browser respinge pierderea focusului/visibility în fiecare fereastră; nu pretinde Long Tasks sau memorie exactă colectate.

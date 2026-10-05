# Registry de asseturi Babylon (PBI015)

`BabylonAssetRegistry(scene, manifest, limits?)` este un serviciu de prezentare local scenei. Manifestul conține `id`, `version`, `url`, `critical`, `source`, `license`; definițiile sunt validate, copiate și înghețate. Același ID este unic în manifest, inclusiv versiunea lui. O versiune nouă cere alt registry sau alt ID, evitând resurse stale. Nu deține scena, engine-ul sau datele simulării și nu adaugă decor la bootstrap.

Loaderul Babylon **9.29.0** se înregistrează prin `@babylonjs/loaders/glTF/2.0/glTFLoader`, conform sursei pachetului instalat. Acest entry point înregistrează pluginul GLB/glTF și glTF2 fără glTF1 și fără registrul tuturor extensiilor. Importul este static; costul de bundle este documentat în [dovezi](Evidence/015-asset-registry/report.md).

## Încărcare și ownership

- `acquire(id)` întoarce un `AssetLease` cu root detașat, `placeholder` și `release()` idempotent. Cererile concurente pentru același ID partajează aceeași promisiune și același AssetContainer. Instanțele Babylon partajează materialele și geometria; materialele nu sunt clonate.
- Lipsa/coruperea unui asset critic respinge promisiunea cu ID, URL și cauză explicită. Un ID necunoscut este eroare de manifest și respinge indiferent de rol. Decorul opțional poate produce un cub magenta cu ownership propriu; placeholderul nu înlocuiește un asset critic.
- `unload(id)` eliberează numai un container încărcat cu zero referințe și întoarce false pentru resurse încă folosite sau aflate în loading. `clearIdle()` eliberează cache-ul idle. Cache-ul păstrează containerele după ultimul release pentru reutilizare, apoi le elimină LRU la presiune.
- Resursele sursă ale containerului se eliberează numai după ultimul lease. `release()` elimină nodurile instanței, grupurile de animație și skeleton-urile clonei, apoi decrementează referința. Containerul rămâne proprietarul materialelor/texturilor și geometriei comune.
- Pentru `BabylonSceneAdapter`, transmite `{ root: lease.root }`, fără materiale/texturi exclusive. După `adapter.remove(id)` sau înlocuire, cheamă `lease.release()`. Pentru shutdown: elimină reprezentările/adaptorul, registry-ul, apoi backendul. Nu distruge manual materialele comune.
- `dispose()` este idempotent, elimină listener-ele de progres/observerul scenei, eliberează lease-urile și cache-ul, anulează transferurile și drenează joburile queued. Un container întors târziu este curățat înainte de a respinge acquire. Cleanup continuă și dacă un observer Babylon aruncă; `cleanupFailures` consemnează incidentele. Nu se garantează recuperarea unui obiect Babylon corupt de un observer extern.

## Plafoane provizorii înainte de 203

Implicit: 2 joburi transfer/decode active, 32 queued, 32 containere, 512 instanțe, 4 MiB transfer per GLB, 20 MiB transfer + resurse rezidente estimate, 100.000 vertices pentru primitive, 512 noduri/primitive/accessors, 32 materiale și 64 rapoarte. Listener-ele de progres sunt plafonate la 32. Texturile sunt limitate la 2048 per dimensiune și 16 MiB estimate per asset; count-ul lor are și plafon derivat din materiale. Rezervările și admiterea resurselor se verifică înaintea decodării.

Transferul folosește stream, verifică Content-Length și bytes reali și este întrerupt după 10 secunde. Joburile critice queued au prioritate; un job deja pornit nu este preemptat. Concurența include decodarea și pregătirea shaderelor, deci o cerere lentă nu eliberează prematur un slot pentru încă un decoder.

Preflight-ul GLB2 verifică headerul, JSON-ul, plafoanele primitive/vertices/accessors și estimarea bufferelor. Sunt acceptate geometrie necomprimată, materiale, animații și **PNG/JPEG încorporate**, cu dimensiunile citite din header înaintea decodării. Texturile sunt estimate RGBA cu mip chain complet și multiplicare conservatoare pentru mai mulți sampleri. Dimensiunea comprimată nu este folosită drept memorie GPU. URL-uri externe de buffers/images, accessors sparse și extensii/codecs sunt respinse cu mesaj explicit; KTX2/Draco/meshopt se admit ulterior numai cu bugetele decoderelor. glTF text și glTF1 nu fac parte din acest contract GLB2.

Bugetul de 2 secunde pentru decode/upload CPU și separat shader preparation este **un gate măsurat la terminare**, nu un timeout capabil să întrerupă cod sincron Babylon sau GPU. Asseturile peste buget sunt respinse și containerul este curățat. Preflight-ul și concurența limitează lucrul admis; nu pretind garanție de timp real a decoderului nativ. Materialele importate sunt pregătite prin `forceCompilationAsync` înainte de ready.

## Progres și măsurare

`subscribe(listener)` primește `queued`, `transfer`, `decode-upload`, `ready`, `error`, `placeholder` cu ID, bytes reali și total cunoscut/null. Excepțiile listenerelor nu schimbă ownership-ul. Funcția returnată elimină listenerul.

`metrics` returnează copii ale contoarelor și ale istoriei limitate: active/queued, cache, bytes rezervați, instanțe, cache hits, decodări și cleanup failures. Fiecare raport păstrează rolul critic, queue/transfer/decode-upload/shader/total ms, bytes transferați și resurse decodate estimate, status și eroare. Timpii fazelor completate sunt disponibili; pentru o fază care eșuează înainte de finalizare, durata este cuprinsă în total și faza poate rămâne zero. `decodeUploadMs` este timpul până la readiness-ul loaderului, incluzând decodare și submit de resurse CPU; upload GPU exact și timpul GPU nu sunt expuse drept valori fictive.

Fixture-ul `/tests/browser/asset-registry/` exportă `assetProbe('WEBGL2'|'AUTO', keep?)`. Include GLB original CC0, PNG original, JPEG generat pe canvas, lipsă critică/opțională, două instanțe comune, limite, priorități, retry și disposal repetat. Injecția HTTP503 din scenariul de retry este declarată; încercarea următoare folosește fetch-ul real și loaderul Babylon real. Fixture-ul nu reprezintă jocul complet sau asseturile finale.

# Sănătatea flotei și resetul de scenariu 065

Status: implementare și validare funcțională locală. Contractul este pur: fără DOM, browser, Babylon, Rapier, renderer sau ceas de perete. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

`src/fleet/fleet-health.ts` leagă disponibilitatea reală a taxiurilor 057 de revendicările 060, lifecycle-ul 061, coada 059 și ETA 064. Modulul nu inventează avarii, nu deduce blocaje din viteză și nu creează identități paralele: primește fapte explicite din 029/030 și compoziție și le aplică exact peste contractele reale. Un taxi indisponibil este eliberat din orice revendicare și orice cursă cu motivul terminal corect, iar resetul de scenariu readuce cursele, asignările, sănătatea, cererile și ETA într-o stare inițială coerentă.

## API

```typescript
const health = createFleetHealth({
  dispatcher,   // dispecerul real 060
  lifecycle,    // lifecycle-ul real 061
  demand,       // coada reală 059
  eta,          // ETA reală 064
  registry,     // registry-ul real 057; deține taxiurile și profilele aplicate
});

health.health(taxiId);   // FleetHealthEntry | undefined; un taxi nemarcat este AVAILABLE
health.list();           // toate taxiurile reale, în ordine stabilă după taxiId
health.report();         // contoare pe stare + assigned + consistent
health.apply({ taxiId, fact, factId, tick });
health.reset({ tick, stats: 'RESET' | 'PRESERVE', profiles: 'RESET' | 'PRESERVE' });
health.history();        // jurnal plafonat de fapte
health.stats();
health.dispose();
```

`createFleetScenario(options)` din `src/fleet/scenario-fixture.ts` compune aceleași contracte peste harta reală 032 și este fixture-ul reproductibil pentru gate-ul 220: 20/24/30 de taxiuri, 20–40 de civili, 32 de cereri implicite, poziții deterministe pe benzile `TAXI` și `dispose()` la zero.

## Stări și fapte

| Stare | Semnificație |
| --- | --- |
| `AVAILABLE` | poate primi o cerere; o revendicare activă apare separat ca `ASSIGNED` în 060 |
| `BLOCKED` | blocat în trafic sau imobilizat 029 |
| `DAMAGED` | avariat 029 |
| `OFFLINE` | scos din serviciu |

Vocabularul de fapte este închis. Fiecare fapt are exact o consecință:

| Fapt | Stare | Eliberare 060 fără cursă | Motiv terminal 061 cu cursă |
| --- | --- | --- | --- |
| `TRAFFIC_BLOCK` | `BLOCKED` | `TAXI_BLOCKED` | `TAXI_BLOCKED` |
| `IMMOBILIZATION` | `BLOCKED` | `TAXI_BLOCKED` | `TAXI_BLOCKED` |
| `COLLISION_DAMAGE` | `DAMAGED` | `TAXI_DAMAGED` | `TAXI_DAMAGED` |
| `RECOVERY` | `AVAILABLE` | — | — |
| `SERVICE_WITHDRAWN` | `OFFLINE` | `TAXI_REMOVED` | `TAXI_REMOVED` |
| `SERVICE_RETURNED` | `AVAILABLE` | — | — |

`IMMOBILIZATION` este `BLOCKED`, nu `DAMAGED`, pentru că tabelul de disponibilitate 060 tratează deja un vehicul imobilizat 029 ca blocat. `COLLISION_DAMAGE` este `DAMAGED`. Faptele nu formează o mică mașină de stări ascunsă: sunt adevărul extern, iar ultimul fapt câștigă. `RECOVERY`/`SERVICE_RETURNED` nu inventează o revendicare și nu retargetează o cursă.

Fiecare aplicare are `factId` semantic, unic pentru apelant. Rejucarea exactă a aceluiași `(taxiId, fapt)` întoarce intrarea originală cu `duplicate: true`, fără nicio eliberare; refolosirea aceluiași `factId` cu alt taxi sau alt fapt aruncă `Fleet health fact id conflict`. Tick-ul este monoton și nu există ceas de perete.

## Integrarea cu dispecerul și lifecycle-ul

Ordinea este verificabilă și nu poate ascunde o ocupare:

1. Se validează taxiul real, faptul, `factId` și tick-ul.
2. Dacă taxiul are o revendicare 060 și o cursă activă 061, cursa este închisă cu `FAILED` și motivul din tabel; 061 eliberează exact revendicarea prin `dispatcher.release(taxiId, 'FAILED', tick)`.
3. Dacă taxiul are revendicare dar nu are cursă activă, revendicarea este eliberată direct cu `TAXI_BLOCKED`/`TAXI_DAMAGED`/`TAXI_REMOVED`.
4. Dacă taxiul nu are revendicare, i se publică direct starea de sănătate.
5. Abia apoi se înregistrează intrarea de sănătate, faptul și jurnalul.

`BLOCKED`, `DAMAGED` și `OFFLINE` nu apar niciodată în `availableTaxis()` și nu pot fi asignate; un taxi revendicat nu poate fi marcat disponibil peste o revendicare activă. `report().consistent` este oracolul de integritate: fiecare status 060 trebuie să corespundă stării publicate, iar un taxi `ASSIGNED` trebuie să fie sănătos `AVAILABLE`.

## Resetul de scenariu

`reset({ tick, stats, profiles })` este singura operație care rewindează lumea. Politicile sunt explicite:

- `stats: 'RESET'` (implicit) readuce contoarele cumulative la zero; `'PRESERVE'` le păstrează.
- `profiles: 'RESET'` (implicit) readuce `appliedProfileVersion` la versiunea comună configurată pentru fiecare vehicul; `'PRESERVE'` păstrează referința aplicată. `controlMode` nu este un profil și rămâne neatins.
- Sănătatea este întotdeauna readusă la `AVAILABLE`; nu este un contor cumulativ.

Ordinea resetului:

1. Se validează tick-ul față de sănătate, lifecycle și starea fiecărui vehicul, înainte de orice mutație.
2. Fiecare cursă activă este închisă prin lifecycle cu `SCENARIO_RESET`; o cursă a cărei revendicare a dispărut deja este raportată în `discardedRides` cu `CLAIM_MISSING`, nu ascunsă.
3. Revendicările rămase (fără cursă) sunt eliberate cu `FAILED`.
4. `lifecycle.reset`, `dispatcher.reset`, `demand.reset` și `eta.reset` golesc cursele, memoria cererilor deja dispecerizate, coada, cursorul de program și estimările.
5. Se resetează profilele conform politicii.
6. Se golesc marcajele de sănătate, istoricul de fapte și, conform politicii, contoarele.

Rezultatul raportează exact `closedRides`, `discardedRides`, `releasedAssignments`, `clearedHealth` și `resetProfiles`. Un al doilea reset la același tick nu creează nicio cursă, revendicare, eliberare sau marcaj: `closedRides`, `releasedAssignments` și `clearedHealth` sunt zero, iar starea structurală este identică. Tick-ul rămâne monoton; resetul nu inventează un ceas nou.

După reset, următorul scenariu poate reutiliza exact aceleași identități 006: cererea, asignarea și cursa au din nou ID-urile stabile, fără ca ETA sau ruta veche să fie servite din cache. Un taxi dispărut din registry nu poate păstra o cursă alocată: `release` 060 permite eliberarea explicită a unei revendicări al cărei taxi a fost scos, iar pasul normal continuă să eșueze zgomotos dacă o revendicare a rămas fără vehicul.

## Porturile de reset adăugate modulelor existente

Resetul de scenariu este aditiv și păstrează contractele 059–064:

| Modul | Port | Efect |
| --- | --- | --- |
| 059 `demand` | `reset({ preserveStats? })` | rewindează cursorul și coada, păstrează planul, validările și plannerul |
| 060 `dispatcher` | `reset({ tick, preserveStats? })` | cere zero revendicări, golește statusurile, cererile deja dispecerizate și jurnalele; tick monoton |
| 061 `lifecycle` | `reset({ tick, preserveStats? })` | golește cursele reținute și raportează cursele active încă deschise |
| 064 `eta` | `reset({ preserveStats? })` | golește rutele, progresul și estimările, rebazează semnătura plannerului și starea serviciului |

`release(taxiId, reason, tick)` din 060 păstrează refuzul `Unknown taxi` pentru un ID fără revendicare, dar permite eliberarea explicită a unei revendicări active al cărei taxi a fost scos din registry. `step` nu eliberează nimic silent: o revendicare fără vehicul rămâne o eroare de compoziție până la eliberarea explicită sau reset.

## Limite

| Limită | Valoare |
| --- | ---: |
| Taxiuri urmărite | 30 |
| Intrări în jurnalul de fapte | 256 |
| ID-uri de fapte reținute | 1024 |
| Code units per `factId` | 200 |
| Code units per ID de taxi | 256 |
| Fixture: taxiuri / civili | 20–30 / 20–40 |
| Fixture: ferestre × cereri implicit | 4 × 8 = 32 |

Un `factId` evacuat din memoria plafonată este raportat prin `stats().droppedFactIds`; rejucarea lui după evacuare nu mai este recunoscută ca duplicat. Jurnalul de fapte este plafonat și își păstrează doar cele mai recente intrări.

## Ownership și disposal

Modulul deține numai marcajele de sănătate, memoria de `factId`, jurnalul plafonat și contoarele. Dispecerul, lifecycle-ul, coada, ETA și registry-ul sunt injectate și rămân ale apelantului. `dispose()` este idempotent, readuce structurile și contoarele la zero și nu eliberează revendicările 060 (ar fi o eliberare fără motiv de business). Fixture-ul composează contractele și le eliberează pe toate, în ordine inversă, o singură dată.

## Verificare

`tests/fleet/fleet-health.test.ts` acoperă: vocabularul închis de stări și fapte, închiderea cursei cu `TAXI_DAMAGED`/`TAXI_BLOCKED`/`TAXI_REMOVED`, eliberarea unei revendicări fără cursă, refuzul de a asigna un taxi avariat/blocat/offline, resetul după dispariția unui taxi din registry, coerența și idempotența resetului, rewind-ul real al cozii și ETA, politicile de statistici/profile, fixture-ul 20/24/30 reproductibil, puritatea, disposal-ul și validarea contractului. Reportul rulează aceleași reguli pe fixture-ul real și păstrează 28 de verificări.

```powershell
npm run fleet:health
npm run fleet:health -- --check
```

Runnerul scrie [report.json](Evidence/065-fleet-health/report.json) și [report.md](Evidence/065-fleet-health/report.md). `--check` eșuează dacă transcriptul comis diferă; `npm test` include aceeași comparație.

## Ce NU este

- Nu detectează avarii sau blocaje: primește fapte explicite de la 029/030 și compoziție; nu citește poziția, viteza, coliziunile sau renderer-ul.
- Nu creează taxiuri, cereri, asignări, curse sau rute și nu modifică revendicarea în afară de eliberarea explicită cerută de un fapt sau de reset.
- Nu este un model de recuperare fizică 030: nu teleportează, nu repară corpul și nu șterge istoricul de avarii al 029.
- Nu persistă singur în savefile și nu are ceas de perete; tick-ul este furnizat de apelant.
- Nu este HUD, tarifare sau review; acelea rămân PBI-urilor 075/209.
- Raportul este o probă funcțională deterministă, nu o măsurătoare de FPS/GPU/Rapier/hardware; gate-ul 220 rămâne proprietarul probei de performanță.

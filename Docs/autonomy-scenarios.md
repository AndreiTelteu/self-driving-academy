# Suita autonomiei de bază 056

Status: implementare cu validare funcțională locală. Boardul canonic și publicarea rămân ale părintelui.

Suita rulează comportamentele autonome de bază peste controllerele și fixture-urile reale, fără DOM, browser, temporizatoare sau ceas de perete. Ea produce un raport mașină-citibil și un tabel uman; ambele sunt deterministe pentru aceleași intrări.

## API și runner

`tests/autonomy/auto-scenarios.ts` exportă `runAutoScenarioSuite(): Promise<AutoScenarioReport>`. Raportul are schema `056-auto-scenarios-v1`:

- `version` — versiunea schemei;
- `oracleRule` — regula de oracle, repetată în raport;
- `scenarios[]` — `{ id, behavior, title, oracle, ticks, checks[], pass }`;
- `negativeCases[]` — `{ id, behavior, title, stimulus, expected, actual, checks[], pass }`;
- `mutationProbes[]` — probe care dovedesc că implementări plauzibil greșite sunt respinse;
- `summary` — numărătorile și `pass`.

Fiecare `check` are `{ name, expected, actual, pass, detail }`, deci raportul păstrează simultan valoarea așteptată, valoarea reală și motivul. Runnerul scrie `Docs/Evidence/056-auto-scenarios/report.json` și `report.md`:

```powershell
npm run scenarios:autonomy
npm run scenarios:autonomy -- --check
```

`--check` compară transcriptul curent cu raportul comis și eșuează dacă suita sau datele s-au schimbat. `npm test` include testul care verifică aceeași egalitate.

## Scenarii pozitive

| ID | Comportament | Lanț real | Oracle |
| --- | --- | --- | --- |
| `cruise-urban-free-road` | cruise | 044 context + 045 FSM + 046 cruise | `referenceCruise`: `posted + speed_delta_urban`, plafon 30 m/s |
| `cruise-residential-curve` | cruise | 044 + 045 + 046 | `referenceCruise`: `posted + speed_delta_residential`, `sqrt(curve_lateral_accel × radius)` |
| `cruise-intersection-approach` | cruise | 044 + 045 + 046 | `referenceCruise`: `intersection_approach_speed` |
| `signal-red-green` | signals | 219 + 044 + 036 + 050 + 045, 64 actori | `referenceSignal`: verde, întârziere de plecare, linie de oprire, roșu târziu, trecere |
| `stop-rule-profiles` | stop | 219 + 037 + 051 + 045 | `referenceStop`: profil FULL versus ROLLING, offset, dwell, crossing |
| `route-junction-cautious` | cruise/signals/accelerate | 219-like 10 Hz + 044 + 036 + 050 + 045 + 046 + 047, rută authored | `referenceSignal` + `referenceCruise`; profil prudent oprește la roșu și traversează pe verde |
| `route-junction-risky` | cruise/signals/accelerate | același lanț, profil riscant | `referenceSignal`; probabilitatea 0 produce `CROSS_RED_BY_PROFILE`, iar consecința este trecerea în faza roșie |
| `follow-leader` | follow | 044 + 045 + 046 + 048 + 047 | `referenceFollowing`: `queue_standstill_gap` pentru lider oprit, `min_gap + headway × v` pentru lider în mișcare |
| `yield-conflict` | yield | 052 + 045, fapte 038 explicite | `referenceYield`: separarea semnată `max(oEnter − cExit, cEntry − oExit)` față de `yield_time_gap` |
| `lane-change` | lane-change | 033 adjacency + 053 latch + 045 + 046 | `referenceLaneChange`: gap față/spate, câștig de viteză, cooldown, continuitate, release |
| `blocked-recovery` | blocked | 033 + 041 + 044 + 045 + 054 | `referenceBlockedCause` și `referenceBlockedFirstAction`: tabelul de cauze și acțiuni 054 |
| `accelerate-native` | accelerate | 044 + 045 + 046 + 047 + 024 + Rapier | invarianți de contract: comandă pozitivă, viteză și distanță cresc, fără contact |

Scenariile de rută folosesc o plantă longitudinală deterministă care integrează accelerația cerută de 047. Planta este un fixture de scenariu, nu o revendicare de fizică; `accelerate-native` rulează lanțul real 024/Rapier pentru dovada fizică V1.

## Regula de oracle

Oracle-ul este o implementare de referință independentă a formulelor și tabelelor publicate, nu o copie a transcriptului controllerului. El primește exact intrările scenariului: valorile profilului publicat, faptele authored, tick-ul și eșantionul adresat. Nicio valoare așteptată nu este hardcodată din output-ul curent.

Pentru politicile probabilistice, eșantionul este o intrare, nu o observație ascunsă: `randomUnit(deriveOpportunitySeed(vehicleSeed, opportunityKey), 'red-compliance' | 'full-stop', 0)` din adresarea 006. Astfel, reevaluarea aceleiași oportunități produce același eșantion, iar oracle-ul poate verifica regula fără să citească starea internă a politicii.

Referințele existente pentru 046/048/050/051/053 sunt refolosite; 052 și 054 au referințe noi în `tests/autonomy/auto-scenarios-oracle.ts`. Separarea este justificată pentru că testele trebuie să eșueze pe implementări plauzibil greșite (de exemplu un cruise care ignoră delta de stil, un follow care ignoră liderul, un lane-change care acceptă `LOCAL_ONLY`).

## Cazuri negative

Următoarele stimulente trebuie să eșueze închis, cu motiv explicit și fără țintă, faptă sau aprobare fabricată:

| Guard | Stimul | Rezultatul așteptat |
| --- | --- | --- |
| `wrong-context-actor` | context pentru alt actor | `FOREIGN_CONTEXT`, țintă 0 |
| `stale-context` | sursă veche sau din viitor | `STALE_CONTEXT`, țintă 0 |
| `foreign-behavior-tick` | decizie 045 de la alt tick | `FOREIGN_OR_STALE_BEHAVIOR`, țintă 0 |
| `missing-leader` | lider absent din snapshot | `NO_LEADER`, fără gap inventat |
| `signal-unobservable` | observație 036 mai veche de 6 tick-uri | `UNAVAILABLE`, fără oprire; 045 `MISSING_POLICY_FACTS` |
| `stop-leader-induced` | coadă condusă de lider, fără oportunitate 037 | `LEADER_STOP_NOT_STOP_INTENT`, 045 `FOLLOW_LEADER` |
| `lane-local-only` | acoperire laterală `LOCAL_ONLY` | `INCOMPLETE_LANE_COVERAGE`, fără faptă `VALIDATED` |
| `yield-local-only` | acoperire de trafic locală | `UNAVAILABLE`, fără faptă de cedare |
| `blocked-missing-graph` | graf 033 absent | `MISSING_LANE_GRAPH`, fără reroute/recovery |
| `profile-version-mismatch` | versiune de profil străină | `PROFILE_VERSION_MISMATCH`, țintă 0 |

## Limite

- Ruta și intersecția sunt parcurse de o plantă cinematică deterministă care consumă comanda reală 047; numai `accelerate-native` dovedește fizica 024/Rapier. Nu se revendică un drum fizic complet prin intersecție.
- Suita nu acoperă `SERVICE`, planificarea de trasee sau traficul inteligent; acestea rămân module separate.
- Faptele de prioritate 038 și observațiile 036/037 sunt furnizate de fixture-urile authored; suita nu certifică percepția globală sau acoperirea live. În `stop-rule-profiles`, poziția și dovada de staționare sunt ale fixture-ului 037: profilul ROLLING este evaluat ca decizie care nu cere oprire, nu ca o trecere fizică independentă.
- Nu se revendică browser, GPU, FPS, soak sau acceptare hardware. Raportul este o probă funcțională deterministă.
- `route-junction-risky` documentează consecința politicii (trecere pe roșu), nu o coliziune sau o sancțiune de gameplay.

Dovezile executate sunt în [Docs/Evidence/056-auto-scenarios](Evidence/056-auto-scenarios/README.md).

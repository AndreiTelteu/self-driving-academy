# 140 — snapshot complet pentru experiment

Contract `140-experiment-snapshot-v1` și `140-experiment-ledger-isolation-v1`. Un experiment pornește din checkpointul complet al lumii (206) și nu poate scrie în ledger-ele live.

## Ce conține snapshotul și ce refolosește din 206

Nu există un al doilea format și nici un al doilea envelope. `runExperimentSnapshot` primește prin porturi exact funcțiile reale ale lui 206 — `captureWorldSnapshot`, `readWorldSnapshot`, `decodeWorldCheckpoint` — și construiește envelope-ul `CheckpointRecord` 129/206 din valorile snapshotului (tick, `profileId`, `learningEpoch`, `worldEpoch`) plus versiunile engine/fizică/hartă. Integritatea este cea din [modulul 29](../../29-savefile-si-integritate.md): formă canonică `SDA-CJSON-1`, checksum `SHA-256` peste payload-ul fără câmpul `checksum`. `EXPERIMENT_SNAPSHOT_INTEGRITY` este comparat în teste cu `WORLD_SNAPSHOT_INTEGRITY`, deci o schimbare de algoritm în 206 nu poate trece neobservată.

Snapshotul conține toate secțiunile 206: `snapshotVersion`, `units`, `tick`, `worldEpoch`, `profile`, `vehicles` (poziție, rotație, viteze, `entityId`↔`handle`, clasă, mod, FSM, rută, segment, pasageri), `controllers` (FSM plus memoria numerică), `rides`, `passengers`, `segments`, `opportunities`, `signals`, `dispatch` (joburi `PENDING` și rezultate acceptate), `learning`, `rng` (seed și cursorul fiecărui stream) și `dedup`.

## Ce se compară exact la roundtrip (numere reale)

Fixture-ul este cel real al lui 206: 70 de vehicule (30 taxiuri + 40 civile), 30 de pasageri, 8 semafoare, 64 de oportunități, 3 segmente și un dispecer cu 3 joburi pending + 1 rezultat acceptat. Snapshotul are **64 378 bytes** și checksum-ul determinist `c5a0738c0be1b8a149726738b9b9cccad5655229c542396b04d8aa9d24d8bcb5`.

Comparația nu se oprește la checksum: fiecare frunză a fiecărei secțiuni este comparată între starea capturată, starea citită înapoi și starea restaurată.

| Secțiune | Intrări | Câmpuri frunză |
| --- | ---: | ---: |
| vehicles | 70 | 1 680 |
| controllers | 70 | 560 |
| rides | 30 | 240 |
| passengers | 30 | 150 |
| segments | 3 | 21 |
| opportunities | 64 | 320 |
| signals | 8 | 32 |
| dispatch | 4 | 24 |
| learning | 1 | 33 |
| rng | 1 | 4 |
| dedup | 1 | 9 |
| profile / tick / epoch / versiuni | 5 | 7 |

Total: **287 de intrări de secțiune** și **3 080 de câmpuri frunză**, cu **0 diferențe**. Intrările includ secțiunile scalare (`tick`, `worldEpoch`, `profile`, `rng`, `dedup`, `learning`), numărate fiecare ca o intrare; listele sunt numărate pe rânduri. Un singur câmp diferit refuză încărcarea cu `ROUNDTRIP_FIELD_MISMATCH` și numește calea exactă.

## Cum sunt izolate ledger-ele live

Structural: experimentul primește un singur obiect cu suprafața `fingerprint`, `fork`, `write`, `verify`, `version`, `structuralIsolation`. Nu există `settle`, `observe`, `ingest` sau `append` pe handle, deci o scriere live nu este exprimabilă; `write()` răspunde întotdeauna `REFUSED`/`LIVE_LEDGER_READ_ONLY` cu `appliedToLive: false`.

Comportamental: amprenta fiecărui ledger este `SHA-256`-ul formei canonice `SDA-CJSON-1` a read model-ului real — 093 pentru learning (dovedi reală de oportunitate STOP), 125 pentru recompense (o misiune finalizată și decontată) și 137 pentru KPI (o cursă terminală plus o distanță măsurată). Amprenta este recalculată înainte și după încărcare și rămâne identică; `liveWrites` este `0`. O scriere identică într-un `fork` este `ACCEPTED_IN_COPY` cu `appliedToLive: false`, iar un fork refuză rândurile altui ledger cu `EXPERIMENT_LEDGER_MISMATCH`. Proba de control scrie efectiv în ledgerul KPI și schimbă numai amprenta KPI, deci detectorul nu este o constantă.

## Cum se verifică compatibilitatea engine/fizică/hartă

`decodeWorldCheckpoint` întoarce `INCOMPATIBLE` cu versiunile stocate și cele curente; contractul le traduce pe câmp în coduri închise: `ENGINE_VERSION_MISMATCH`, `PHYSICS_BACKEND_MISMATCH`, `MAP_VERSION_MISMATCH`, toate raportate simultan când diferă mai multe. Etapa este `COMPATIBILITY` și nu se încarcă nimic „așa cum e”. Un payload modificat este refuzat în etapa `READ` cu `CHECKSUM_MISMATCH` înainte de a folosi vreo valoare.

## Cum se demonstrează încărcarea la același tick

Snapshotul este capturat la tickul 60 al fixture-ului. Rezultatul `LOADED` raportează `tick: 60`, `expectedTick: 60` și `ticksAdvanced: 0`; un snapshot de la alt tick este refuzat în etapa `TICK` cu `TICK_MISMATCH`, iar o captură din interiorul pasului fix este refuzată ca `CAPTURE_REJECTED` (`TICK_NOT_BOUNDARY`). După încărcare, lumea restaurată și lumea originală sunt rulate încă 60 de tickuri și produc exact aceeași stare canonică (digest `c1347393390deb7bb6a5b504986720aff53c40348e7777362caa327c643f8a6a`), ceea ce arată că fizica, FSM-ul, semafoarele, oportunitățile, dispecerul și cursorii RNG sunt completați corect.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (`tsc --noEmit` + `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | PASS (0 erori, 0 warning-uri) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (345 fișiere TypeScript; toate probele negative trec) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `npm test` | 2 501 teste, 2 501 trecute, 0 eșuate, 0 sărite (65,4 s) |
| `node --import ./scripts/register-typescript.mjs --test "tests/experiments/experiment-snapshot.test.ts"` | 9 teste, 9 trecute, 0 eșuate |
| `npm run experiment:snapshot` | 43/43 verificări, 7 probe de refuz, 287 intrări, 3 080 câmpuri, PASS |
| `npm run experiment:snapshot -- --check` | „Experiment snapshot report is current” |

Raportul complet, determinist: [report.json](report.json) și [report.md](report.md). Niciun pas de mai sus nu folosește ceas de perete, `Math.random` sau măsurători ale mașinii, deci `--check` este o comparație exactă, nu o proiecție.

## Fișiere atinse

- `src/experiments/experiment-snapshot.ts` — contractul 140 (porturi 206, roundtrip câmp cu câmp, compatibilitate, încărcare la același tick).
- `src/experiments/experiment-ledger-isolation.ts` — izolarea ledger-elor (handle read-only, copie detașată, verificare de amprentă).
- `src/experiments/index.ts` — exporturi aditive.
- `tests/experiments/experiment-snapshot-fixture.ts` — fixture determinist (lumea 206, ledger-ele reale 093/125/137, porturile 206).
- `tests/experiments/experiment-snapshot.test.ts` — 9 teste deterministe.
- `tests/experiments/experiment-snapshot-report.ts` — raportul determinist cu verificări și tabel markdown.
- `scripts/run-experiment-snapshot-report.mjs` — scriptul cu `--check` și `--output`.
- `package.json` — intrarea `experiment:snapshot`, ultima din blocul `"scripts"`.
- `Docs/14-experimente-si-indicatori.md` — secțiunea contractului.
- `Docs/Evidence/140-experiment-snapshot/` — acest README, `report.json`, `report.md`.

## Limitări

- Compoziția (testele și raportul) injectează funcțiile 206; `src/experiments` nu importă `src/persistence`, pentru că politica de arhitectură interzice unui modul de domeniu să depindă de adaptor. Nu există o legare în `src/app` în acest PBI, pentru că `src/app` nu face parte din ownership-ul lui 140.
- Experimentul nu are un store propriu: snapshotul este documentul 206, iar persistența lui rămâne `checkpoints` (127/129/206). Nu s-a adăugat o a doua schemă.
- Nivelul de validare este funcțional izolat, conform [politicii](../../validation-policy.md): fixture determinist, fără browser, GPU sau măsurători de cost. Nu se pretinde identitate bit cu bit între browsere sau GPU-uri diferite.
- Amprenta KPI exclude contorul `snapshotCalls` al read model-ului 137, care numără citirile, nu rândurile din ledger; toate agregatele și numitorii rămân în digest.
- Proba de continuare rulează simularea deterministă a fixture-ului 206, nu pipeline-ul complet Babylon/randare.

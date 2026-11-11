# Dovezi PBI 225 — sesiuni Academie și Joacă liberă Haos

Implementarea adaugă dimensiunea `SessionKind` (`ACADEMY`/`CHAOS`) ca axă separată de modurile de
control `AUTO`/`MANUAL`/`LEARNING`, fără să atingă contractele deja livrate: profilul rămâne al lui
109, checkpointul lumii al lui 206, calendarul daily al lui 211/212, ledgerul XP al lui 213,
recompensele de campanie ale lui 125, iar reluarea PAUSED_AUTO refolosește 136.

## Ce s-a implementat

- `src/persistence/session-kinds.ts` (contract `225-session-kinds-v1`):
  - identitatea `SessionKind` și matricea de capabilități: ambele sesiuni publică aceleași 9
    capabilități, aceleași 3 moduri de control și `vehicleSelection: ANY_EXISTING`;
    `sessionKindCapabilityParity` întoarce `identical: true`.
  - copia explicită a profilului: `copyProfileForChaos` validează checksum-ul 109 al sursei și
    construiește un `ProfileVersion` independent (identitate proprie, proveniență `BASE`, zero
    segmente sursă, checksum recalculat); `applyChaosTuning` schimbă doar copia.
  - poarta de izolare peste instanțele reale 212/213/125: `fingerprint()` canonic
    `SDA-CJSON-1`/SHA-256; cele șase operații contabile sunt `ISOLATED` în Haos și delegate real în
    Academie.
  - checkpointuri separate pe tip de sesiune, cu `sessionKind`, `sessionId`, `worldEpoch`,
    `learningEpoch`, `tick`, `generation`, `launch: PAUSED_AUTO` și checksum SHA-256; refuz
    `FOREIGN_CHECKPOINT`/`CHECKPOINT_INVALID`.
  - gazda celor două lumi: o singură lume vie, închiderea segmentului, commit atomic, invalidarea
    joburilor după `sessionId`/`worldEpoch`/`learningEpoch`, eliberarea inputului, salvare eșuată care
    păstrează lumea, `reload()`/`restore()` în `PAUSED_AUTO`.
  - politica de transfer: doar `PROFILE_COPY` Academie→Haos și `STYLE_COPY` Haos→Academie;
    `IMPORT`/`EXPORT`/`CHECKPOINT`/`RESTORE`/`ARCHIVE` Haos→Academie sunt `PROMOTION_REFUSED`.
  - exporturile publice sunt adăugate la finalul `src/persistence/index.ts`.
- `tests/persistence/session-kinds-fixture.ts`, `session-kinds.test.ts`,
  `session-kinds-report.ts`, `session-kinds-report.test.ts`.
- `scripts/run-session-kinds-report.mjs` cu `--check`; scriptul `session:kinds` este ultima intrare
  din blocul `"scripts"` al `package.json`.
- Documentația contractului în `Docs/26-joaca-libera-haos-si-distrugere.md` și în
  `Docs/15-salvare-si-import-export.md`.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS (proiect + `tsconfig.tests.json`, fără erori) |
| `npm run lint` | PASS (`eslint . --max-warnings 0`) |
| `npm run format:check` | PASS („All matched files use Prettier code style!”) |
| `npm run check:architecture` | PASS (348 fișiere TypeScript, toate probele negative) |
| `npm run check:parameter-catalog` | PASS („Parameter catalog is synchronized.”) |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/session-kinds.test.ts"` | 13/13 teste PASS |
| `node --import ./scripts/register-typescript.mjs --test "tests/persistence/session-kinds-report.test.ts"` | 2/2 teste PASS (transcript curent + determinism) |
| `npm test` (suita completă) | 2530 teste, 2530 pass, 0 fail, 79 351 ms |
| `npm run session:kinds` | 45/45 verificări PASS, `report.json` + `report.md` scrise |
| `npm run session:kinds -- --check` | „Session kinds report is current” (transcript determinist) |

## Numere reale (din `report.json`)

- Capabilități: 9 în ambele sesiuni, 3 moduri de control (`MANUAL`, `LEARNING`, `AUTO`),
  `parityIdentical: true`, `sessionKindIsControlMode: false`.
- Profil: sursa `profile-1@1` (`fnv1a64:0ed612cdcb47c703`), copia `chaos:haos-copy-1@1`
  (`fnv1a64:75d6cb7a8c268687`); reglare Haos 10 → 14, Academia rămâne 10, copia rămâne 10 după o
  versiune nouă a Academiei; `progressTransferred: false`, `sourceSegmentsTransferred: 0`.
- Izolare: amprenta combinată `sha256:0756ca4b7ebc914f06a48e883c5674e2eaad1eedef48137f5a2f28a7e5ce3b68`
  este identică înainte și după sesiunea Haos; 6 operații refuzate (`DAILY_INGEST`, `DAILY_ADVANCE`,
  `XP_MISSION`, `XP_DAILY`, `XP_ACTIVE_TIME`, `CAMPAIGN_SETTLE`), `dailyRewards: 0`,
  `rewardGrants: 0`, `xpBalanceMicroXp: 0`, `historyScans: 0`.
- Delegare reală în Academie: o fereastră activă de 30 s creditează 500 000 micro-XP (1 intrare), iar
  settle-ul `campaign-1-first-taxi` acordă 2 recompense autorate.
- Checkpointuri: 20 de tranziții → 20 commituri (10 Academie, 10 Haos), 773 B în total, maxim 40 B
  per checkpoint, checksum de 64 caractere, 20/20 checkpointuri verificate.
- Resurse după 20 de tranziții: 1 lume vie, 2 joburi și 1 listener rezidente, 1 copie de profil,
  0 lumi orfane, 0 joburi orfane; `exactHeapBytes: null`.
- Salvare eșuată: `failedSwitches: 1`, lumea păstrată `ACADEMY`, epoca rămasă 1, 0 checkpointuri
  scrise, reîncercarea a comis.
- Revenire la checkpoint Haos: `RESTORED`, `PAUSED_AUTO`, amprenta ledgerelor Academiei neschimbată,
  rândurile Academiei neschimbate.
- Copierea stilului Haos în Academie: `ADOPTED`, profil valid, amprenta ledgerelor neschimbată,
  `xp: 0`, `dailyRewards: 0`, `campaignRewards: 0`, `checkpoints: 0`, `records: 0`, `unlocks: 0`.
- Promovare: 5 căi refuzate (`IMPORT`, `EXPORT`, `CHECKPOINT`, `RESTORE`, `ARCHIVE`), `STYLE_COPY` și
  `PROFILE_COPY` permise, importul Academie→Haos refuzat.

## Fișiere atinse

- `src/persistence/session-kinds.ts` (nou)
- `src/persistence/index.ts` (exporturi adăugate la final)
- `tests/persistence/session-kinds-fixture.ts` (nou)
- `tests/persistence/session-kinds.test.ts` (nou)
- `tests/persistence/session-kinds-report.ts` (nou)
- `tests/persistence/session-kinds-report.test.ts` (nou)
- `scripts/run-session-kinds-report.mjs` (nou)
- `package.json` (scriptul `session:kinds`, ultima intrare din blocul `"scripts"`)
- `Docs/26-joaca-libera-haos-si-distrugere.md` (secțiunea contractului 225)
- `Docs/15-salvare-si-import-export.md` (secțiunea contractului 225)
- `Docs/Evidence/225-session-kinds/README.md`, `report.json`, `report.md` (noi)
- `PBI/To Do` → `PBI/Done` (fișierul 225)

## Cum se verifică

1. `npm run session:kinds` regenerează transcriptul; `npm run session:kinds -- --check` îl verifică.
2. `tests/persistence/session-kinds.test.ts` acoperă: capabilități egale în ambele sesiuni, copia de
   profil independentă în ambele direcții, refuzul copiei modificate, izolarea daily/XP/recompense cu
   amprentă identică, delegarea reală în Academie, închiderea segmentului + invalidarea joburilor +
   eliberarea inputului, salvare eșuată care păstrează lumea, checkpointuri separate, refuzul unui
   checkpoint străin/modificat, 20 de tranziții fără reziduuri, reload PAUSED_AUTO, copierea stilului
   fără progres și refuzul tuturor căilor de promovare.
3. Testele compară valori canonice (amprente, contoare, identități de checkpoint), nu absența
   excepțiilor.

## Performanță (nivel `targeted`)

- `storage`: 773 B pentru 20 de checkpointuri (maxim 40 B per document), sub bugetul 206 de 262 144 B
  per checkpoint; rândurile sunt separate pe tip de sesiune, iar plafonul pe tip este explicit.
- `memory`: contoare de proprietate (1 lume, 2 joburi, 1 listener, 1 copie de profil, 20 de
  checkpointuri). `totalHeapBytes` este `null` în manifestul de bugete, deci nu este inventat și nu
  este însumat cu contoarele de proprietate.
- `frame`: modulul nu introduce muncă pe tick/frame; comutarea este o singură captură și un singur
  commit, măsurate ca număr de tranziții și bytes, nu ca FPS. Nu se pretinde o măsurare hardware de
  frame pentru un PBI `targeted` fără cod de randare.

## Limitări

- Adaptorul durabil al portului `SessionKindCheckpointStore` rămâne al stratului de compoziție; aici
  este livrat magazinul determinist în memorie, cu aceleași reguli închise de verificare. Scrierea în
  IndexedDB prin repository-ul 127 nu schimbă contractul și nu este revendicată ca livrată.
- Captura lumii este un port: testul folosește o lume deterministă cu 4 vehicule, nu un physics world
  real. Costul hardware al capturii aparține probelor 206/224.
- Nivelul de validare este `targeted`: numerele de storage sunt bytes măsurați ai documentelor, iar
  memoria este raportată prin contoare de proprietate, nu ca heap.

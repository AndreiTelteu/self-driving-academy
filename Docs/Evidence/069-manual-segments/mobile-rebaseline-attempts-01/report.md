# 069 — Re-baseline pe mașina curentă (host controlat) și verdict real

2026-10-18. Scop: re-capturarea perechii BEFORE/AFTER pe același host, la cererea explicită a utilizatorului, pentru a decide dacă gate-ul de performanță 069 poate fi acceptat.

Host: **AMD Ryzen 7 7735U**, Windows 11 10.0.26300, node v24.21.0, AC + plan **High performance**, CPU idle măsurat **~2%** înainte de fiecare rulare (procese străine închise). Repo la commit-ul de bază d8e5756.

## BEFORE — `native-before-02` (produs 069 absent)

- Comandă: `node --import ./scripts/register-typescript.mjs scripts/benchmark-manual-segments-reference.mjs`
- Rezultat: EXIT0, `status: PASS`, `sourceHash: c88a6e1d…`, 24 lumi, protocol neschimbat.
- Reader `verify-reference.mjs` (CURRENT și HISTORICAL): `PASS_SUPPLEMENTAL_NATIVE_REFERENCE`, native `02dc6a4e…`.
- **normal70 tick p95: 4,1001 / 4,1245 / 4,1320 / 4,3797 / 4,3880 ms** (toate sub 5,5). rapierP95 ~0,90–0,95.

## AFTER — `native-after-04` (produs 069 prezent, verificat byte-exact față de receipt-ul 924c)

- Comandă: `node --import ./scripts/register-typescript.mjs scripts/benchmark-manual-segments-after.mjs`
- Rezultat: **EXIT1, `Normal tick absolute gate`**, la world-1 (`count=70, observer=true`), `failedAt 16:38:58.653Z`, `sourceHash 15eb9ed3…`. Captura incompletă păstrată (`failure.json`, `started.json`, `worlds/world-0,1`, `source`, `native`).
- Măsurat în world-1: `tickMs` **p50 3,8119 / p95 5,6364 / p99 6,8102**, cu defalcare `authorityMs p95 2,0954`, `boundaryMs p95 1,4063`, `rapierMs p95 1,0122`, `deliveryMs p95 0,0699`.

## Verdict

Costul nou al produsului 069 este **real**, nu un artefact de mașină:

| | tick p95 normal70 |
|---|---|
| BEFORE (referință, fără produs) | 4,10–4,39 ms |
| AFTER (cu produs 069) | **5,64 ms** → peste gate-ul de 5,5 |
| Desktop 7950X3D (capturi istorice) | 5,16–7,36 ms |

Aceeași depășire apare pe două mașini diferite, ambele liniștite, cu praguri neschimbate. Componentele noi (authority + boundary ≈ 3,5 ms p95) împing tick-ul peste limită. **069 nu poate fi închis pe performanță**; este nevoie de reducerea costului înainte de o nouă captură.

Niciun prag nu a fost relaxat și nicio rulare nu a fost repetată până la un rezultat favorabil.

## Adaptări de harness (documentate)

Namespace nou `native-before-02` / `native-after-04`; `PINNED_BEFORE` (sourceHash, manifestSha256), hash-ul `complete.json` și `relativePath` actualizate; inventar BEFORE nou generat (`native-before-02-inventory.json`, 179 rânduri) și `validateOriginalInventory` re-pinuit la digestul lui; `core.autocrlf=false` la checkout-ul surselor, altfel LF→CRLF rupe identitatea byte-exactă a produsului față de receipt-ul 924c.

Capturi respinse păstrate: `native-after-04-rejected-01` (receipt de produs — CRLF) și `native-after-04-rejected-02` (hash manifest BEFORE vechi).

## Diagnostic record-stage — nu poate rula pe acest host (încercat)

Am pornit preparatorul `scripts/prepare-manual-segments-record-stage-diagnostic.mjs` cu precondițiile îndeplinite (HEAD d8e5756, branch corect, produs byte-exact 924c, `native-after-03` prezent, output/runtime absente). S-a oprit **înainte de orice achiziție nativă**, din două motive independente, ambele de proveniență:

1. **Pin pe arborele live.** La liniile 214-217 preparatorul citește fiecare intrare din `native-after-03/manifest.json` și cere ca fișierul live să fie byte-identic cu cel arhivat. `Docs/Evidence/069-manual-segments/verify-after.mjs` are arhivat `cda5f71d…` (14808 B), dar live `87b6e71a…` după adaptările de re-baseline (namespace + hash-uri). Corectarea căilor F:→C: și acest pin nu pot coexista.
2. **Root F: în runtime-ul derivat.** Chiar dacă pinul ar fi satisfăcut, colectorul derivat păstrează `expectedRoot = 'F:/Sites/self-driving-academy/.worktrees/manual-segments-01'` din arhiva originală, deci ar eșua pe acest host.

Nu am forțat gardurile: modificarea lor ar invalida exact dovada pe care diagnosticul o produce. Artefactele parțiale create de preparator (3 fișiere în output, 3 în runtime) au fost șterse.

Pentru a rula diagnosticul ar fi nevoie de o **re-derivare a lui pe baseline-ul nou** (namespace, root C:, inventar re-pinuit), adică o revizuire de tooling separată — nu de o simplă rulare.

## Diagnostic record-stage re-derivat — executat (`record-stage-diagnostic-02`)

Re-derivat pe baseline-ul nou și **executat efectiv** (prima rulare reală a acestui diagnostic vreodată):

- Ancoră: arhiva `native-after-05` (sourceHash `9fa30829…`), cu produsul verificat byte-exact față de receipt-ul 924c.
- Fix de tooling necesar: walker-ul de closure (`scripts/manual-segments-archive-closure.mjs`) nu accepta `src/style.css`, importat de `src/main.ts`; acum extensiile non-script sunt tratate ca frunze, ca `.json`.
- Preparator EXIT0, collector instrumentat (10 lumi, 70 vehicule, 5 perechi OFF/ON, 180/600) EXIT0, reader independent → `VERIFIED_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE`.

Atribuire pe cele 8 stadii (5 lumi observer, 600 tick-uri/lume, medie):

| stadiu (perTick inclusive p95) | ms |
|---|---|
| **whole tick** | **5,910** (p50 3,958) |
| **bridge** | **3,375** |
| append | 1,373 |
| bytewalk | 0,996 |
| parse005 | 0,108 |
| immutability | 0,037 |
| authorityStats | 0,012 |
| cachehit / controllerStats | ≈ 0 |

Stadiile sunt inclusive (nested), iar suma p95 = 5,90 ms ≈ whole tick p95, deci acoperă integral tick-ul. `bridge` include `append` și `bytewalk`. **Ținta de optimizare este stadiul `bridge`** — bridge-ul de manual-segment plus calea de append/admisie a înregistrării — care rulează în fiecare tick. Față de referința fără produs (tick p95 4,10–4,39 ms), produsul adaugă ~1,5–1,8 ms la p95.

## Brief de optimizare (pe baza atribuirii de mai sus)

Cost exclusiv estimat: `bridge` 3,375 este inclusiv, iar din el `append` 1,373 + `bytewalk` 0,996 sunt nested, deci costul propriu al bridge-ului este ≈ 1,0 ms p95.

1. **`bytewalk` (0,996 ms p95, 476 apeluri/lume) — cel mai bun raport câștig/risc.**
   `src/telemetry/intervention-admission.ts::interventionRecordBytes` face contabilitate de octeți cu `new TextEncoder()` **per apel** și `encoder.encode(JSON.stringify(v))` **per literal**, iar `admitInterventionRecord` o cheamă **de două ori** pe fiecare admitere (odată pe valoarea externă, odată pe recordul parsat, linia 106 și 108).
   Optimizare propusă, fără schimbare de semantică: encoder la nivel de modul; cale rapidă pentru string-uri ASCII fără escape (lungime UTF-8 = length); lungime numerică fără `JSON.stringify` pentru cazurile uzuale. Testul existent „069 exact UTF8 envelope capacity includes commas/braces and escaped code units” validează exact această contabilitate.
2. **`append` (1,373 ms p95, 89 apeluri/lume)** — în `src/telemetry/intervention-lifecycle.ts`; instrumentarea actuală învelește funcția întreagă, deci următorul pas de măsurare este sub-instrumentarea în interiorul ei înainte de a optimiza orbește.
3. **Bridge propriu (~1,0 ms p95)** — verificările de fence/autoritate și copiile din `src/app/manual-segment-bridge.ts`.

**Bucla obligatorie după orice schimbare de produs** (nu există scurtătură, pentru că receipt-ul e pinuit):
1. editare produs → 2. rulează cele 132 de teste pure; 3. generează un receipt nou de 18 fișiere (`sourceFinal = sha256(path+':'+sha256+'\n' în ordinea fixată)`, verificat de `validateCheckedProduct`); 4. actualizează `REUSE_PRODUCT_SHA`/`REUSE_PRODUCT_RECEIPT` în `scripts/manual-segments-calibration-proof.mjs`; 5. re-captură AFTER (ancoră nouă, `native-after-06`); 6. re-derivare diagnostic + rulare; 7. pereche BEFORE/AFTER finală.

## Rezultat după prima optimizare (`native-after-06`, diagnostic `-03`)

Aplicat în `src/telemetry/intervention-admission.ts`: encoder UTF-8 la nivel de modul și cale rapidă pentru string-uri ASCII fără escape (aceeași contabilitate, fără `JSON.stringify` + `encode` per literal). Receipt nou de produs: `sourceFinal fb366a92…` (doar `intervention-admission.ts` s-a schimbat din cele 18 fișiere). 132/132 teste pure PASS.

| metric | înainte (`-02`) | după (`-03`) | Δ |
|---|---|---|---|
| whole tick p95 (diagnostic) | 5,910 | **5,471** | −0,439 (−7,4%) |
| bytewalk p95 | 0,996 | **0,453** | −0,543 (−54%) |
| append p95 | 1,373 | 0,843 | −0,530 (−39%) |
| parse005 / immutability | 0,108 / 0,037 | 0,109 / 0,037 | ~0 |

**Gate-ul de tick pe protocolul de acceptare (`native-after-06`, count=70, observer): 5,0388 / 4,8660 / 4,8333 / 4,8617 / 4,9715 ms — toate sub 5,5 → PASS** (înainte, `native-after-04` pica la 5,6364).

**Blocaj nou, diferit:** captura AFTER tot eșuează, dar la `Original chronological CPU/runtime-heap comparison gate`, nu la tick. Toate cele 5 perechi, la ambele populații, au heap-ul după peste cel dinainte (ratio 1,38–3,38 pe 70, 1,57–1,83 pe 110), cu variație mare între perechi (unele perechi au ratio 0,24) și fără forcedGC. Deci următorul pas este investigarea gate-ului de memorie (retenție reală vs. zgomot GC), nu optimizarea de CPU.

### Analiza gate-ului de memorie (executată)

Regula exactă (`scripts/manual-segments-after-records.mjs:434`): o pereche eșuează dacă `after > 1,1 × before` **și** `delta > 5 MiB`; rândul eșuează la ≥3 din 5 perechi.

Datele pentru count=70 observer (heapUsed post-fereastră, MB): înainte 68,4 / 47,5 / 45,4 / 45,6 / 42,4; după 97,3 / 160,5 / 97,5 / 97,2 / 96,8. **4 din 5 valori „după” sunt strânse la ~97 MB**, deci delta de +30…+55 MB este **consistentă, nu zgomot GC** (doar o pereche e outlier la 160 MB). La count=70 non-observer: după 74–98 MB vs înainte 36–54 MB, aceeași concluzie.

Bugetul declarat al produsului este 64 de înregistrări protejate × 64 KiB = **4 MiB**, dar delta observată este de ~10× atât. Deci diferența nu vine doar din înregistrările protejate: trebuie urmărit ownership-ul pe fereastră (snapshot-uri, receipt-uri, istoric, structuri de fence) — nu doar `process.memoryUsage()`.

Concluzie: gate-ul de memorie funcționează corect și semnalează o problemă reală de retenție în produsul 069, nu o artefactă de măsurare.






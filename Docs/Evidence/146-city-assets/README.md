# PBI 146 — decor de cartier, batchuri locale și cost

Nivel de validare: `targeted` (politica 2026-10-08). Probele: pagina de prezentare a orașului real
(PBI 042 + decor 146) pe backendul Babylon real, plus două probe DEV pe workload-ul gate-ului 220
(`maximum-30`), cu și fără decor, ca să atribuim costul. Nu este o rulare `full` și nu închide gate-ul
220 sau soak-ul 224.

## Ce s-a verificat

| Criteriu | Dovadă |
| --- | --- |
| Semantica hărții rămâne aliniată | `missingRendered=0`, `unknownRendered=0`, `phantom=0`, `alignmentIssues=0`; 923 elemente de layout, inclusiv 96 benzi, 25 intersecții, 16 zone de serviciu. Decorul nu modifică layout-ul. |
| Costul și sursele/licențele sunt inventariate | `cityDecorBudget` acceptat pe LOW/MEDIUM/HIGH (0 B transfer, 0 B texturi, 2 variante shader, 4,35 MB geometrie estimată din 64 MiB); 8 tipuri + material, fiecare cu sursă originală și licență de proiect. |
| Batchuri locale; texturi/draw calls/startup în buget pe workload-ul 220 | 1.585 de itemuri → 36 de batchuri de 120 m (max. 256 instanțe/batch, 36 celule); 0 texturi; startup decor 0,61–0,88 s; pe gate-ul 220 cu decor, frame p95 16,8 ms, p99 16,8–17,0 ms, 0 cadre >35 ms, GPU p95 0,78 ms, long tasks 0. |

## Decorul

| Aspect | Valoare |
| --- | ---: |
| Itemuri | 1.585 |
| Stâlpi / copaci / pubele / parcometre / indicatoare | 312 / 448 / 253 / 221 / 148 |
| Hidranți / bănci / adăposturi | 111 / 84 / 8 |
| Celule de 120 m | 36 |
| Mesh-uri (1 per celulă) | 36 |
| Vârfuri / triunghiuri decor | 81.620 / 90.824 |
| Geometrie estimată | 4.354.688 B |
| Texturi | 0 |
| Materiale | 1 partajat (culori de vârf) |

Geometria este procedurală și originală: cutii cu normale plate pentru mobilier, cilindri/conuri cu 8
segmente pentru stâlpi, copaci, hidranți și pubele. Fiecare item este respins dacă cercul lui de
siguranță atinge banda, marcajul, intersecția, trecerea, linia de stop sau clădirea, ori dacă nu stă pe
un trotuar/zonă de serviciu. `verifyCityDecor` rulează independent aceleași verificări și întoarce `[]`.

## Scena integrată 042 + decor

| Metrică | Valoare |
| --- | ---: |
| Elemente de layout | 923 |
| Mesh-uri totale | 191 |
| Draw calls totale | 191 (176 în vedere de ansamblu) |
| Vârfuri / triunghiuri | 100.792 / 100.878 |
| Texturi | 0 |
| Materiale | 13 |
| Startup layout / oraș / decor | 241 / 40 / 885 ms |
| Startup total | 1.166 ms |
| Trimitere CPU/render (sweep 300 cadre) | p50 1,5 ms, p95 3,0 ms, p99 3,5 ms, 0 cadre >25 ms |
| Heap JS | 52,8 MB |

Draw calls pe vedere: overview 176, intersecție 97, trotuar 69, bulevard 49. Diferența până la
capul indicativ `maxDrawCalls=128` din 223 provine din mesh-urile per-element ale layout-ului 042
(96 suprafețe de bandă + 52 mesh-uri de semafor), nu din decor: contribuția 146 este de 36 de batchuri
locale, sub capurile de celule/batchuri. Batchuirea suprafețelor de bandă ar schimba contractul de
identitate al 042 și rămâne o propunere de optimizare separată.

## Proba pe workload-ul gate-ului 220

Harness-ul 220 a fost refolosit fără rescriere: fixture-ul acceptă parametrul aditiv `assets=146`,
care construiește decorul real în aceeași scenă și mută camera pe vedere de ansamblu a orașului;
workload-ul fizic rămâne `maximum-30` (30 taxiuri + 40 civili, toate în lumea fizică). Capturile sunt
păstrate în `gate-probe/`.

| Sesiune | Captură | Profil | frame p95 | frame p99 | main p95 | tick p95 | Rapier p95 | GPU p95 | ratio | >35 ms | long task |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cu decor | `20261022T061708872Z` | DEV | 16,8 | 16,8–17,0 | 9,1–13,7 | 7,9–12,0 | 0,5–0,6 | 0,78 | 1,0001 | 0 | 0 |
| control fără decor | `20261022T062022290Z` | DEV | 16,8 | 16,8–16,9 | 7,0–12,9 | 6,3–12,0 | 0,4–0,7 | 1,02 | 1,0001 | 0 | 0 |
| preflight cu decor | `20261022T055307603Z` | smoke | 100,1* | 100,1* | 86,5* | 21,3* | 1,1 | 0,86 | 1,16 | 8* | 98* |

\* Smoke-ul are 1 s warmup + 3 s măsurare (9 cadre măsurate) și include compilarea shaderelor; este
preflight, nu verdict FPS, conform protocolului 220. Capturile de gate au fost făcute cu 1.577 de
itemuri, înainte de ajustarea finală a adăposturilor (1.585 de itemuri, +8 adăposturi de 0,95 m rază);
pagina de oraș și `measurement.json` sunt din sursa finală. Diferența de 8 obiecte mici nu schimbă
concluzia de frame, iar identitatea fiecărei capturi rămâne în `build-manifest.json`.

Ambele sesiuni DEV au ieșit `DEV_FAIL` pe reproductibilitate/tick, **inclusiv controlul fără decor**:
mașina a fost partajată cu un al doilea agent (încărcare CPU 4–88 %, vârfuri de 78–98 ms long task în
ambele sesiuni). Frame p95/p99, GPU p95, ratio și long tasks sunt identice cu/fără decor, deci nu
există o regresie atribuibilă asseturilor 146; tick-ul autoritar nu depinde de decor și a variat la fel
în control. Aceste probe nu sunt gate și nu se reclasifică.

## Comenzi

```powershell
# build + server pentru pagina de oraș (port explicit 5146)
node scripts/city-assets-server.mjs 5146
node scripts/city-assets-capture.mjs

# probe 220 refolosite (server + Chrome cu parametrul aditiv)
node --import ./scripts/register-typescript.mjs scripts/fleet-gate-server.mjs 5196
# http://127.0.0.1:5196/?backend=WEBGL2&profile=dev&assets=146&workloads=maximum-30&autostart=1

# contract: plan, clearance, batchuri, manifest, inventar, semantică
node --import ./scripts/register-typescript.mjs --test tests/rendering/city-decor.test.ts
```

## Capturi

- `overview.png` — orașul cu decor la vedere de ansamblu.
- `junction.png` — intersecție semaforizată cu mobilier pe trotuare.
- `sidewalk.png` — prim-plan cu stâlpi, copaci, pubelă și trotuar.
- `avenue.png` — bulevard la nivelul străzii.

## Limitări reale

- Draw calls integrate 191 > capul indicativ 128 din 223; excesul este baseline-ul 042 (mesh-uri
  per-bandă/semafor), nu decorul (36 batchuri). Propunere: batchuire spațială a suprafețelor de bandă
  într-un PBI de optimizare, cu păstrarea identității de picking.
- Probele DEV nu sunt gate: mașina a fost partajată, iar tick-ul a depășit 8 ms în ambele sesiuni,
  inclusiv fără decor. Rularea `full` pe hardware liniștit rămâne la 220/224/155.
- Nu există texturi, umbre proiectate de decor sau audio de decor; materialul primește umbre, dar
  scena de probă nu are shadow generator. Decorul nu creează collidere sau obiecte fizice.
- Startup-ul de decor (0,6–0,9 s) este măsurat pe această mașină încărcată; nu este un buget de
  loading certificat pentru hardware-ul laptopului.
- Adăposturile de stație sunt plasate doar când încap pe trotuarul de 2,4 m; 8 din 16 zone de
  serviciu au primit unul.

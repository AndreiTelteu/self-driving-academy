# Dovezi 056 — suita autonomiei de bază

Status: implementare și validare funcțională locală PASS. Boardul canonic, mutarea în Done și publicarea rămân ale părintelui.

## Ce s-a livrat

- `tests/autonomy/auto-scenarios.ts` — suita deterministă, fără DOM/browser/ceas, peste controllerele și fixture-urile reale 033/036/037/038/041/044–055.
- `tests/autonomy/auto-scenarios-oracle.ts` — oracle independent derivat din formulele și tabelele contractelor, plus probele de mutație.
- `tests/autonomy/auto-scenarios-support.ts` — profil publicat, cadence 219, verificări și schema raportului.
- `tests/autonomy/auto-scenarios.test.ts` — cinci teste: acoperire, fail-closed, mutații, determinism și egalitatea raportului comis.
- `scripts/run-auto-scenarios.mjs` și `npm run scenarios:autonomy` — runnerul care scrie [report.json](report.json) și [report.md](report.md).
- `Docs/autonomy-scenarios.md` — contractul suitei, tabelul de scenarii, regula de oracle și limitele.

## Rezultat

| Element | Rezultat |
| --- | ---: |
| Scenarii pozitive | 12/12 PASS |
| Verificări în scenarii | 146/146 PASS |
| Cazuri negative fail-closed | 10/10 PASS (40 verificări) |
| Probe de mutație | 5/5 PASS |
| Total aserțiuni în raport | 191/191 PASS |

Scenariile acoperă `cruise`, `accelerate`, `follow`, `signals`, `stop`, `yield`, `lane-change` și `blocked`, plus două rute authored (prudentă și riscantă) prin aceeași intersecție.

## Regula de oracle

Fiecare valoare așteptată este calculată la rulare de o referință independentă a formulelor/tabelelor publicate, din intrările scenariului. Nu există transcript hardcodat al controllerului. Pentru politicile probabilistice, eșantionul adresat este o intrare derivată prin adresarea 006 (`deriveOpportunitySeed` + `randomUnit`).

Cinci probe de mutație dovedesc sensibilitatea suitei: cruise fără delta de stil, follow fără lider, signal care oprește mereu, lane-change care acceptă `LOCAL_ONLY` și yield care ignoră gap-ul sunt toate respinse de oracle.

## Comenzi și rezultate exacte

```powershell
volta run --node 24.21.0 --npm 11.19.0 -- npm run typecheck
# PASS, exit 0 (tsc --noEmit și tsconfig.tests.json)

volta run --node 24.21.0 --npm 11.19.0 -- npm run lint
# PASS, exit 0 (eslint . --max-warnings 0)

volta run --node 24.21.0 --npm 11.19.0 -- npm run format:check
# All matched files use Prettier code style! exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:architecture
# Architecture imports: PASS (180 TypeScript files), negative probes PASS, exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm run check:parameter-catalog
# Parameter catalog is synchronized. exit 0

volta run --node 24.21.0 --npm 11.19.0 -- npm test
# tests 1159, pass 1159, fail 0; baseline înainte de 056: 1154/1154

volta run --node 24.21.0 --npm 11.19.0 -- npm run scenarios:autonomy -- --check
# SUMMARY scenarios 12/12, negative 10/10, mutations 5/5, overall PASS
# Scenario report is current: Docs/Evidence/056-auto-scenarios/report.json; exit 0
```

Rularea completă a runnerului scrie cele două fișiere de raport; `--check` nu le rescrie și eșuează dacă transcriptul comis diferă.

## Limite

- Ruta/intersecția este parcursă de o plantă cinematică deterministă care consumă comanda reală 047; `accelerate-native` este singura probă cu fizică 024/Rapier. Nu se revendică un drum fizic complet prin intersecție.
- Nu s-a executat o probă nouă în browser; suita este intenționat browser-independentă, iar probele browser ale modulelor 050–053 rămân separate.
- Nu se revendică FPS, GPU, soak, bugetul jocului integrat sau acceptare hardware.
- Faptele 036/037/038 și acoperirea de trafic sunt furnizate de fixture-uri authored; suita nu certifică percepția live. În `stop-rule-profiles`, poziția și dovada de staționare aparțin fixture-ului 037, iar profilul ROLLING este evaluat ca decizie fără cerere de oprire, nu ca o trecere fizică independentă.
- Comportamentul `SERVICE`, planificarea de trasee și traficul inteligent rămân în afara scope-ului.

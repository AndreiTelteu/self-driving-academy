# 214 — Feedbackul consecințelor fără pierdere de XP

Nivel de validare: `targeted` (politica `targeted-validation-v1`). `performance_checks: ["ui", "frame"]` este acoperit structural: citirile, randările și scrierile HUD sunt numărate determinist, fără FPS/GPU pe hardware real.

## Ce s-a implementat

**Read model-ul consecințelor.** `src/economy/kpi-impact.ts` (`214-kpi-impact-v1`) expune `selectKpiImpact(snapshot)`. Primește exclusiv `FleetKpiSnapshot`-ul 209 și compară ziua simulată curentă cu ziua precedentă reținută în același snapshot. Fiecare valoare este o copie a bucketului: venit, curse `completed`/`failed`/`cancelled`, `reviewCount`, `ratingSum`, histograma 0–5. Media este `ratingSum / reviewCount`, iar o zi fără review-uri rămâne `null`. Incidentele sunt cursele eșuate plus cele anulate; „review-urile mici” sunt notele 0–2 din histogramă. Read model-ul raportează structural `historyScans: 0` și `xp: { debits: 0, credits: 0, negativeCredits: false }`, deci nu are nicio cale către ledgerul de XP și nu rescanează istoricul.

**Feedbackul cu trei planuri.** `src/ui/kpi-impact-format.ts` (`214-kpi-impact-feedback-v1`) validează snapshotul compus și proiectează trei planuri separate — rezultatul misiunii (116/125), fidelitatea stilului (mod de control și termenul de confort 139) și consecințele de serviciu (read model-ul 214) — niciodată un mesaj combinat. Validatorul refuză sume de curse care nu corespund stărilor, histograme care nu corespund numărului de review-uri, medii diferite de `ratingSum / reviewCount`, direcții care contrazic delta, un tick diferit de al snapshotului, o misiune eșuată/refuzată cu XP și o livrare duplicată cu XP. `assertNoXpLossMessages` verifică fiecare text față de fragmentele interzise (`-xp`, „pierdere”, „penalizare”, „penalty”, „xp negativ”).

**HUD-ul plafonat.** `src/ui/kpi-impact-hud.ts` este apelat o dată per tick, dar citește portul cel mult o dată la `minimumReadIntervalTicks` (implicit 6 tick-uri = 10 Hz la 60 Hz) și scrie numai planul a cărui proiecție s-a schimbat. Are zero listeners, `historyRebuilds: 0` structural și un contor de mesaje de pierdere de XP care rămâne `0`.

**Invarianta XP.** `tests/economy/kpi-impact.test.ts` scade ambii KPI, produce un accident real (cursă 209 `FAILED` plus review-ul ei real) și un obiectiv 116 eșuat pe care ledgerul 125 refuză să îl deconteze, apoi compară soldul și nivelul înainte și după. Un credit negativ este refuzat explicit de validatorul 213 (`ContractValidationError`), un duplicat de recompensă acordă 0 XP, iar un reset/import de stil nu atinge ledgerul jucătorului.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | exit 0, zero erori (src + tests) |
| `npm run lint` | exit 0, zero erori/warnings |
| `npm run format:check` | exit 0, „All matched files use Prettier code style!” |
| `npm run check:architecture` | exit 0, `Architecture imports: PASS (340 TypeScript files)`, 6 + 4 + 3 probe negative |
| `npm run check:parameter-catalog` | exit 0, „Parameter catalog is synchronized.” |
| `npm test` | exit 0, **2451 teste, 2451 trecute, 0 eșecuri** (73 561 ms) |
| `node --import ./scripts/register-typescript.mjs --test tests/economy/kpi-impact.test.ts tests/ui/kpi-impact.test.ts` | exit 0, **30 teste, 30 trecute** (14 economie + 16 UI) |
| `npm run kpi:impact` | **16/16 verificări PASS**, raport scris |
| `npm run kpi:impact -- --check` | exit 0, raport curent (fără diferențe) |

## Numere din raportul determinist

Din `Docs/Evidence/214-kpi-impact/report.json` (16/16):

- scenarii: venit +500 cu rating 5 → 2 (`UP/DOWN`); invers −500 cu rating 2 → 5 (`DOWN/UP`); ambele în scădere −800 și 5 → 1 (`DOWN/DOWN`) cu 1 incident `INCREASED` și 1 review cu nota ≤ 2; zi staționară `FLAT/FLAT`; prima zi `NO_BASELINE` (rating `UNKNOWN`); lume fără evenimente `NO_EVENT`;
- incident real: cursă 209 `FAILED` cu review real de nota 1 → 1 cursă eșuată, 1 incident, 2 review-uri cu nota ≤ 2 în ziua curentă;
- moduri de control: MANUAL, LEARNING și AUTO dau același rating 4 pe aceleași fapte (209 nu are termen de mod), direcții `FLAT/DOWN`, 0 debit XP;
- XP: sold 100.5 → 100.5, nivel 2 → 2, nivel derivat din sold 2, 2 intrări în ledger (100 XP din misiunea 125 + fereastra activă de 30 000 ms); KPI care scade: venit 200, rating 1, accident cu rating 1; obiectiv eșuat refuzat de 125: `true`; credit negativ refuzat explicit: `true` (`Expected finite number in range`), sold neschimbat; recompensă duplicată 0 XP; import de profil: sold 200.5, nivel 2, `profileWrites: 0`, `debits: 0`;
- feedback: 3 planuri, 146 texte verificate față de 5 fragmente interzise, 0 potriviri; misiune eșuată 0 XP; livrare duplicată 0 XP;
- HUD: 600 tick-uri → **100 citiri, 2 randări, 4 scrieri de plan**, 500 tick-uri plafonate, 98 citiri identice, interval 6 tick-uri = 10 Hz, `historyRebuilds: 0`, 0 listeners, 0 mesaje de pierdere XP;
- determinism: 2 rulări, identice.

## Fișiere

Create:

- `src/economy/kpi-impact.ts`
- `src/ui/kpi-impact-format.ts`
- `src/ui/kpi-impact-hud.ts`
- `scripts/run-kpi-impact-report.mjs`
- `tests/economy/kpi-impact-fixture.ts`
- `tests/economy/kpi-impact.test.ts`
- `tests/economy/kpi-impact-report.ts`
- `tests/ui/kpi-impact-fixture.ts`
- `tests/ui/kpi-impact.test.ts`
- `Docs/Evidence/214-kpi-impact/README.md`, `report.json`, `report.md`

Modificate:

- `src/economy/index.ts` (export aditiv)
- `src/ui/index.ts` (export aditiv)
- `package.json` (scriptul `kpi:impact`, ultima intrare)
- `Docs/22-kpi-economie-si-review-uri.md` (secțiunea contractului 214)
- `Docs/23-misiuni-zilnice-si-experienta.md` (secțiunea contractului 214)
- `PBI/Done/214-kpi_impact_xp.md` (mutat fizic din `PBI/To Do`)

## Limitări

- Nivel `targeted`: costul UI este măsurat structural (citiri, randări, scrieri de plan), nu prin FPS/GPU pe hardware real; probele integrate rămân gate-urilor 155/159/220/224.
- Feedbackul citește agregatele 209 și nu paginează ledgerul de review-uri, deci nu afișează motivele individuale ale unui review; acelea rămân în contractul 209.
- Montarea în stratul HUD al hostului și hotkey-ul rămân ale compoziției (`src/app` nu este atins), ca la celelalte panouri.
- HUD-ul presupune apel o dată per tick din partea hostului; el plafonează citirile, dar nu poate limita un host care îl apelează de mai multe ori pe același tick (apelurile repetate pe același tick sunt plafonate de interval).

# 177 — politică extinsă pentru schimbare de bandă și depășire

Contractul `177-lane-policy-v2` din [`src/autonomy/lane-policy-v2.ts`](../../../src/autonomy/lane-policy-v2.ts)
activează cele patru chei R ale categoriei „Schimbare de bandă și depășire” ca strat de politică peste
rezultatul deja livrat de 053: `lane_change_duration` (s), `signal_lead_time` (s),
`signal_use_probability` (probabilitate) și `pass_on_right_probability` (probabilitate). Raportul
determinist este [report.json](report.json), iar varianta umană [report.md](report.md).

## Cum funcționează

Fiecare tick primește exact rezultatul `053-lane-change-v1` (cu cele patru chei M pe care le poartă) și
întoarce o comandă înghețată cu acțiunea, motivul, valorile de decizie și diagnosticele moștenite.
Stratul nu recalculează schimbarea de bandă: 053 rămâne autoritatea pentru gap-uri, avantajul de viteză,
cooldown și latch-ul de continuitate. Valorile, unitățile și proveniența se citesc prin
`parsePublishableDrivingProfile`, deci intervalele rămân exact cele ale catalogului 092:
`lane_change_duration` 0,5–5 s, `signal_lead_time` 0–5 s, `signal_use_probability` 0–1 probabilitate,
`pass_on_right_probability` 0–1 probabilitate. Catalogul nu este modificat.

- `lane_change_duration` este durata mișcării laterale: manevra avansează un progres normalizat
  `elapsed / ceil(max(cheie, 1 s) · 60)`, deci la 30 de tick-uri după start cheia de 0,5 s dă 0,500,
  iar cea de 5 s dă 0,100. Podeaua explicită de politică `minimumManoeuvreDurationS = 1` face ca nicio
  valoare admisă să nu schimbe banda instantaneu: minimul de catalog de 0,5 s comandă 60 de tick-uri.
- `signal_lead_time` este intervalul dintre schimbarea validată și prima mișcare laterală atunci când
  indicatorul este folosit: 0 s pornește manevra în același tick, 5 s o ține 300 de tick-uri cu progres
  lateral 0. Cât timp avansul rulează, stratul pornește mișcarea laterală numai dintr-o validare
  proaspătă a lui 053 (`OPTIONAL_CHANGE_VALIDATED`) din același tick; un `COMMITTED_CONTINUITY` produce
  `SIGNAL_LEAD_STALE` cu progres 0, deci avansul nu poate autoriza o manevră pe gap-uri vechi.
- `signal_use_probability` decide pornirea indicatorului cu un singur eșantion determinist per
  oportunitate (`deriveOpportunitySeed(seed, opportunityKey)` cu cheia fixă `signal-use`). Fără
  indicator nu există avans, deci manevra pornește în tick-ul validării.
- `pass_on_right_probability` se aplică numai unei depășiri opționale într-o bandă vecină din dreapta,
  după ce harta declară `PERMITTED` și spațiul liber declarat în banda dreaptă acoperă pragul M
  `lane_change_front_gap`; abia apoi un eșantion per oportunitate (cheia fixă `pass-on-right`) este
  comparat cu cheia. O hartă care interzice ori nu declară permisiunea, un spațiu nedeclarat și un
  spațiu sub prag sunt refuzate înaintea oricărui eșantion, indiferent de valoarea cheii.

## Tabelul cheie → scenariu → valoare joasă → valoare ridicată → diferență

| Cheie | Scenariu | Joasă | Rezultat | Ridicată | Rezultat | Diferență |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `lane_change_duration` | durata manevrei; progres lateral după 30 de tick-uri de la start | 0,5 | 0,500 | 5 | 0,100 | **−0,400** |
| `signal_lead_time` | semnalizare înainte de manevră; tick-uri până la prima mișcare laterală | 0 | 0 | 5 | 300 | **+300 tick-uri** |
| `signal_use_probability` | folosirea semnalizării; indicatorul este pornit | 0 | 0 | 1 | 1 | **+1,000** |
| `pass_on_right_probability` | depășire prin dreapta; oportunitatea este acceptată | 0 | 0 | 1 | 1 | **+1,000** |

Numere suplimentare din raport: eșantionul de semnalizare al oportunității este 0,324830, eșantionul de
depășire prin dreapta este 0,249755, iar ambele sunt identice la tick-uri diferite; durata efectivă la
0,5 s este 60 de tick-uri, iar la 5 s este 300; avansul de 5 s ține manevra exact 300 de tick-uri.

## Separarea cheilor

| Cheie | Scenariu | Rezultat joasă | Rezultat ridicată | Diferență |
| --- | --- | ---: | ---: | ---: |
| `signal_lead_time` | durata manevrei | 0,250 | 0,250 | 0,000 |
| `signal_use_probability` | durata manevrei | 0,250 | 0,250 | 0,000 |
| `pass_on_right_probability` | durata manevrei | 0,250 | 0,250 | 0,000 |
| `lane_change_duration` | semnalizare înainte de manevră | 300 | 300 | 0,000 |
| `pass_on_right_probability` | semnalizare înainte de manevră | 300 | 300 | 0,000 |
| `lane_change_duration` | folosirea semnalizării | 1,000 | 1,000 | 0,000 |
| `signal_lead_time` | folosirea semnalizării | 1,000 | 1,000 | 0,000 |
| `pass_on_right_probability` | folosirea semnalizării | 1,000 | 1,000 | 0,000 |
| `lane_change_duration` | depășire prin dreapta | 1,000 | 1,000 | 0,000 |
| `signal_lead_time` | depășire prin dreapta | 1,000 | 1,000 | 0,000 |
| `signal_use_probability` | depășire prin dreapta | 1,000 | 1,000 | 0,000 |

**Dependența explicită.** `signal_use_probability` în scenariul avansului are diferența 300 de tick-uri:
avansul de semnalizare există prin definiție numai când semnalizarea este folosită, deci fără indicator
manevra pornește în tick-ul validării. Dependența este raportată separat, nu contabilizată ca pereche
inertă: 11 perechi sunt 0,000, iar aceasta este singura cuplare intenționată dintre chei.

## Siguranță: durata nu devine instantanee, depășirea prin dreapta rămâne subordonată

| Verificare | Scenariu | Rezultat |
| --- | --- | ---: |
| podeaua duratei | 0,5 s comandă durata efectivă | 60 tick-uri |
| durata maximă | 5 s comandă durata efectivă | 300 tick-uri |
| durata zero | cheia 0 s (sub minimul de catalog) | refuzată; podeaua rămâne 1 s |
| dreapta interzisă | harta declară `FORBIDDEN`, cheia 1 | `RIGHT_OVERTAKE_FORBIDDEN`, fără eșantion |
| dreapta nedeclarată | harta declară `UNKNOWN`, cheia 1 | `RIGHT_OVERTAKE_FORBIDDEN`, fără eșantion |
| dreapta fără spațiu | 8 m liberi, sub `lane_change_front_gap` 12 m, cheia 1 | `RIGHT_OVERTAKE_NO_SPACE` |
| dreapta fără spațiu declarat | `rightLaneSpaceM = null`, cheia 1 | `RIGHT_OVERTAKE_NO_SPACE` |
| stânga nu consultă cheia de dreapta | schimbare validată pe stânga, cheia 1 | manevră pornită, eșantion de dreapta `null` |
| avansul nu pornește pe continuitate | 053 raportează `COMMITTED_CONTINUITY` în avans | `SIGNAL_LEAD_STALE`, progres 0 |
| avansul anulat de 053 | 053 refuză în avans, cheile la maxim | `SIGNAL_CANCELLED`, latch eliberat |
| 053 domină toate cheile | `INSUFFICIENT_FRONT_GAP`, cheile la maxim | `NO_LANE_CHANGE`, fără manevră |
| 053 indisponibil | rezultat 053 `UNKNOWN`, cheile la maxim | `LANE_CHANGE_UNAVAILABLE` → `UNKNOWN` |
| manevra abandonată | 053 nu mai validează după 10 tick-uri | `MANOEUVRE_ABANDONED`, progres 0,033 raportat |

Manevra începută este ținută de un latch deținut de apelant (`targetLaneId`, `signalTick`, `signalUsed`,
`manoeuvreStartTick`), returnat în `state`; o stare care contrazice latch-ul este refuzată înainte de
orice efect. O bandă țintă care nu mai este vecină autorată produce `MANOEUVRE_ABANDONED`, iar
finalizarea (`MANOEUVRE_COMPLETE`) eliberează latch-ul o singură dată.

## Compatibilitate cu cheile M

Profilul poartă simultan cele patru chei M ale lui 053 (`lane_change_front_gap` m, `lane_change_back_gap`
m, `lane_change_speed_gain` m/s, `lane_change_cooldown` s) plus cele patru chei 177. Cheile M rămân
citite de 053 cu unitățile lor, iar 177 le folosește fără să le schimbe sensul: pragurile de gap și
avantajul de viteză decid validarea, cooldown-ul rămâne al lui 053, iar `lane_change_front_gap` este și
spațiul cerut unei depășiri prin dreapta. Pe 60 de tick-uri cu stratul 053 real:

- **60/60 rezultate 053 identice** între profilul neutru și cel activ;
- **50/50 comenzi neutre** identice cu 053 pentru schimbările pe stânga și cele pe dreapta care nu sunt
  depășiri; cele **10 tick-uri** de depășire prin dreapta sunt refuzate de valoarea neutră 0 a cheii,
  adică de defaultul din catalog, nu de o schimbare a rezultatului 053;
- cu cheile active, **30 de tick-uri diferă**, cu până la **0,492** progres lateral.

Unitățile rămân cele ale catalogului: `lane_change_duration` și `signal_lead_time` în s,
`signal_use_probability` și `pass_on_right_probability` în probabilitate; cheile M păstrează m, m, m/s
și s.

## Determinism

Aceleași intrări, același seed și aceeași oportunitate produc exact aceeași comandă. Seria de 6 tick-uri
care parcurge cele patru scenarii are amprenta `fnv1a32:71505a55`, identică la o a doua rulare. Nu
există ceas, aleatorism ascuns sau istoric păstrat (`retainedHistory: 0`).

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | 0 erori (`tsc --noEmit` și `tsc -p tsconfig.tests.json --noEmit`) |
| `npm run lint` | 0 erori, 0 warnings |
| `npm run format:check` | toate fișierele formatate |
| `npm run check:architecture` | PASS (380 fișiere TypeScript, 6+4+3 probe negative) |
| `npm run check:parameter-catalog` | catalogul 092 sincronizat, neschimbat |
| `node --import ./scripts/register-typescript.mjs --test tests/autonomy/lane-policy-v2.test.ts` | 13 teste, 13 PASS, 0 fail |
| `npm test` | 3074 teste, 3074 PASS, 0 fail (102,9 s) |
| `npm run lane:policy` | 22/22 verificări PASS, raport scris |
| `npm run lane:policy -- --check` | `report.json` și `report.md` actuale |

Testele acoperă efectul izolat al fiecărei chei (joasă vs ridicată), inerția celorlalte trei chei în
fiecare scenariu, podeaua de 1 s a duratei și refuzul duratei zero, avansul de semnalizare cu validare
proaspătă și refuzul continuității vechi, eșantionul unic per oportunitate, subordonarea depășirii prin
dreapta față de hartă și spațiu, inerția cheii pe o schimbare pe stânga sau pe o schimbare cerută de rută,
dominanța refuzului 053, abandonul unei manevre începute, păstrarea rezultatelor 053 reale, refuzul
profilului/observației/rezultatului străin sau vechi, refuzul valorilor din afara intervalului și al
unității greșite, determinismul și înghețarea rezultatului.

## Fișiere atinse

- `src/autonomy/lane-policy-v2.ts` — contractul `177-lane-policy-v2`.
- `src/autonomy/index.ts` — export adăugat la finalul listei (append-only).
- `tests/autonomy/lane-policy-v2-reference.ts`, `tests/autonomy/lane-policy-v2.test.ts`,
  `tests/autonomy/lane-policy-v2-report.ts` — fixture-uri, teste și oracolul raportului.
- `scripts/run-v2-lane-policy-report.mjs`, `package.json` — raportul determinist `lane:policy`.
- `Docs/11-catalog-parametri.md` — secțiunea contractului, la final.
- `Docs/Evidence/177-v2-lane-policy/` — acest document, `report.json`, `report.md`.
- `PBI/Done/177-v2_policy_6.md` — PBI-ul finalizat și mutat fizic.

## Limitări

- Registry-ul 092 rămâne fail-closed: cele patru chei au încă `implemented: false`, deci
  `MANUAL_TUNING` și `LEARNED` sunt refuzate pentru ele. Stratul le consumă din valori `BASE` sau
  `IMPORTED` validate pe interval și unitate; activarea reglajului manual și a estimării rămâne la
  PBI-urile de învățare și la actualizarea registrului.
- Ca și 046/047/048/050/051/052/053/167/169/171/173/175, stratul este un contract de politică neexecutat
  încă în bucla live de simulare; montarea lui în compoziție și proba de browser rămân pași separați.
- Observația este a apelantului: lumea trebuie să declare vecinătatea laterală autorată, dacă manevra
  este o depășire, permisiunea de depășire prin dreapta și spațiul liber din banda dreaptă. Stratul nu
  face percepție și nu derivă aceste fapte din geometrie.
- Compoziția corectă cere ca apelantul să alimenteze 053 cu o stare goală cât timp avansul de
  semnalizare rulează și să latch-uieze 053 doar după ce 177 pornește manevra; altfel avansul rămâne
  în `SIGNAL_LEAD_STALE` și manevra nu pornește. Regula este impusă de contract, nu doar documentată.
- Podeaua de 1 s a duratei, cheia fixă `signal-use`/`pass-on-right`, precum și condiția ca spațiul cerut
  unei depășiri prin dreapta să fie `lane_change_front_gap` sunt constante și reguli de politică
  documentate în contract, nu chei de catalog.
- Performanța jocului integrat, browserul și hardware-ul nu sunt validate de acest PBI; nivelul de
  validare este „funcțional izolat” conform `Docs/validation-policy.md`.

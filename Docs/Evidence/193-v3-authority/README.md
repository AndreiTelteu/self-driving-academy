# 193 — autoritate input la personaj sau mașină

Contractul `193-input-authority-v1` din [`src/input/authority-arbiter.ts`](../../../src/input/authority-arbiter.ts) închide arbitrajul de input al lui V3: jucătorul comandă **personajul sau vehiculul**, niciodată amândouă. Modulul este pur, headless și determinist (fără DOM, fără ceas, fără `Math.random`, fără servicii de simulare) și produce exact o comandă per tick: `WalkerInput` (192) sau `VehicleCommand` (024).

## Cum garantează o singură autoritate

`step({ tick, characterYawRad })` are o singură ieșire discriminată: ramura `CHARACTER` are `input`, ramura `VEHICLE` are `command`, iar cealaltă ramură nu există în tip. Livrarea trece exclusiv prin `deliver(result, consumer, ports)`, care ține cont de tick.

Ce se întâmplă la o livrare dublă — refuz explicit, nu no-op tăcut:

| Încercare | Cod | Contor |
| --- | --- | ---: |
| A doua livrare în același tick, către personaj | `DOUBLE_DELIVERY_REFUSED` | 2 |
| A doua livrare în același tick, către vehicul | `DOUBLE_DELIVERY_REFUSED` | 2 |
| Livrare către vehicul când autoritatea este personajul | `INACTIVE_CONSUMER_REFUSED` | 1 |
| Rezultat dintr-un tick deja încheiat | `STALE_RESULT` | 1 |

Poarta de tick se verifică înaintea țintei, deci o a doua livrare este refuzată indiferent de consumatorul cerut. Proba exhaustivă acoperă toate cele **256** de submulțimi ale celor opt acțiuni pe ambele autorități: **512/512** tick-uri adresează exact un consumator, **0** tick-uri au comandă non-vidă la ambele entități, **0** livrări ajung la entitatea inactivă. Comenzile vide (gait NONE / throttle-brake-steering pe zero) sunt livrate tot entității active, ca să existe un singur canal cu o singură semantică.

## Regula pentru tastele ținute la tranziție

Aleasă: **neutralizare până la prima eliberare**. La `setAuthority`, fiecare acțiune ținută în acel moment este marcată neutralizată și rămâne inactivă până la o eliberare reală. O reapăsare fără eliberare (auto-repeat) nu ridică neutralizarea; eliberarea urmată de reapăsare readuce intenția exact la comanda de referință produsă de aceleași taste fără tranziție.

De ce nu celelalte variante: (a) re-armarea edge-urilor nu ajunge, pentru că arbitrajul consumă niveluri — un `throttle` ținut ar rămâne nivel activ; (b) o fereastră de grație ar depinde de timp de perete (interzis aici) și ar putea expira exact cât timp tasta este încă ținută; (c) neutralizarea până la eliberare nu poate produce niciodată accelerație accidentală și nu are nevoie de ceas.

Dovezi reale: **18/18** tranziții (9 seturi de taste × 2 direcții) au primul tick după tranziție **vid**; după eliberare + reapăsare comanda este identică cu referința fără tranziție. O tastă apăsată după tranziție este activă imediat (nicio fereastră oarbă).

## Focus refolosit din 066

Arbitrajul nu citește tastatura: `port` este exact `KeyboardDrivePort` din 066, deci `bindKeyboardDriveInput` îl alimentează direct, cu tot filtrul existent (câmpuri de text, `contenteditable`, butoane, dialoguri modale, `document.hidden`, blur, modificatori, compoziție). Cu focusul într-un câmp de text: **0** taste ținute, comandă vidă, **0 m** parcurși de walker-ul real, `preventDefault` false. După ieșirea din câmp, aceeași tastă produce `gait=WALK` și **0,5401 m** în 30 de tick-uri.

## Stare serializabilă pentru 200

`snapshot()` întoarce date pure, înghețate și versionate: `version`, `tick`, `authority`, `held`, `neutralized`, `transitions` (**169 B** în probă). `restore(state)` validează strict forma și refuză **4/4** stări invalide probate (versiune necunoscută, `neutralized` care nu e submulțime a `held`, tick negativ, autoritate incompletă). La reluare, fiecare tastă salvată ca ținută rămâne neutralizată, iar primul tick după reluare este vid; astfel 200 poate persista autoritatea fără să repornească o accelerație.

## Comenzi executate și rezultate reale

| Comandă | Rezultat |
| --- | --- |
| `npm run typecheck` | PASS, 0 erori (`tsc --noEmit` + `tsconfig.tests.json`) |
| `npm run lint` | PASS, 0 erori, 0 warning-uri |
| `npm run format:check` | PASS, toate fișierele conforme |
| `npm run check:architecture` | PASS, 403 fișiere TS; probe negative 6 + 4 + 3 |
| `npm run check:parameter-catalog` | PASS, „Parameter catalog is synchronized.” |
| `npm test` | **3310/3310** teste trecute, 0 eșecuri, 1 suită, 110.991 s |
| `node --import ./scripts/register-typescript.mjs --test "tests/input/authority-*.test.ts"` | **20/20** teste trecute |
| `npm run authority:report` | a scris `report.json` + `report.md`; verdict general **PASS** |
| `npm run authority:report -- --check` | „Authority report is current” + „Authority markdown is current” |

Rezumatul raportului: scenarii **13/13**, combinații exhaustive **256 × 2 = 512**, tranziții **18/18**, criteriu 1 **PASS**, criteriu 2 **PASS**, focus **PASS**, serializare **PASS**, determinism **2 rulări identice**, SHA-256 `9e31131be1109d754939d528961914c26c72942f9ff7ba8544735387c4bad418`.

## Fișiere atinse

- `src/input/authority-arbiter.ts` — contractul nou (arbitraj, proiecții 192/024, livrare, stare).
- `src/input/index.ts` — un export la final.
- `tests/input/authority-arbiter.test.ts` — 14 teste de contract.
- `tests/input/authority-focus.test.ts` — 5 teste cu legarea reală 066 și walker-ul real.
- `tests/input/focus-fixture.ts` — DOM minim deterministic pentru proba de focus.
- `tests/input/authority-suite.ts` — suita de dovezi (scenarii, exhaustiv, tranziții, focus, stare).
- `tests/input/authority-report.test.ts` — verificarea raportului determinist.
- `scripts/run-v3-authority-report.mjs` — generatorul `authority:report` cu `--check`.
- `package.json` — o singură intrare nouă, ultima din `scripts`: `authority:report`.
- `Docs/20-extensii-si-mers-pe-jos.md` — secțiunea de contract la final.
- `PBI/Done/193-character_input.md` — mutat fizic din In Progress.

## Limitări

- Walker-ul 192 are doar mers înainte: axa negativă comandă oprirea, nu mers înapoi.
- Virarea personajului este o direcție absolută derivată din fețarea curentă (±π/2 la capăt), nu un model de tanc cu viteză unghiulară proprie; urmărirea unghiului aparține walker-ului (12 rad/s).
- Arbitrajul nu citește tastatura și nu decide focusul: acesta este garantat de legarea 066, al cărei port este exact `arbiter.port`.
- Comutarea autorității este o decizie a compoziției (195 pentru intrarea în mașină, 194 pentru cameră); contractul oferă tranziția, refuzurile și starea, nu proximitatea.
- Persistarea efectivă și migrarea sesiunilor V3 aparțin PBI 200.
- Proba este headless: nu desenează camera third-person și nu măsoară latența percepută a tastelor.

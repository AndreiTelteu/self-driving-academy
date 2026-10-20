# Tests 057

Suita are nouă teste Node în `tests/fleet/fleet-registry.test.ts`. Timpii sunt cei observați în rularea țintită `volta run --node 24.21.0 -- node --import ./scripts/register-typescript.mjs --test "tests/fleet/*.test.ts"` (9/9 PASS, 179 ms total).

| Test | Ce verifică | Timp observat |
| --- | --- | ---: |
| `057 creates the default 24 taxis and 40 civilians with unique stable identities` | 24/40, ID unice `id-v1:`, clasă/versiune, `profileId`, câmpurile exacte ale vehiculului și stării, matricea raportului | 5,7 ms |
| `057 configurable taxi counts accept 20, 24 and 30 while rejecting out-of-range populations` | limitele 20/24/30 taxiuri și 20/40 civili; respingerea 19/31, 41, fracțiilor, seed-ului invalid și namespace-ului prea lung | 3,5 ms |
| `057 seed creation is deterministic and independent of population order` | două creări identice, stabilitatea claselor la creșterea populației, seed diferit, `classPlan` explicit | 3,6 ms |
| `057 rejects duplicate identities and incompatible class/driver configuration` | slot duplicat, tip/clasă necunoscute, plan de clase invalid, profil incomplet | 1,1 ms |
| `057 keeps independent per-vehicle state that never depends on camera or renderer` | stare separată, tick monoton per vehicul, câmpuri exacte, imuabilitate, zero efect al „selecției” de prezentare | 2,8 ms |
| `057 binds new vehicles to the active city profile version and preserves older bindings` | vehicul nou → versiunea activă, vehicul vechi neschimbat, actualizare explicită, profil străin respins | 0,9 ms |
| `057 disposes every owned vehicle and state back to zero` | capacitatea 30 taxiuri, slot invalid, remove/add, disposal idempotent, contoare și raport zero, mutații respinse | 0,8 ms |
| `057 committed evidence report is the current fleet transcript` | `report.json` comis este exact raportul curent | 4,6 ms |
| `057 configuration keeps the common city profile reference immutable` | configurația și referința de profil sunt înghețate la runtime | 0,2 ms |

## Acoperire pe criteriile orchestratorului

| Cerință | Test |
| --- | --- |
| 24 taxiuri configurabile 20–30 + 20–40 civili | testele 1 și 2 |
| ID stabil, clasă, `driverKind`, stare independentă | testele 1, 5 |
| creare deterministă din seed | testul 3 |
| validare explicită (limite, duplicate, clasă/tip) | testele 2, 4 |
| stare independentă, fără cameră/renderer | testul 5 |
| ownership bounded și disposal la zero | testul 7 |
| raport pe clasă/`driverKind` | testele 1, 8 și `report.json` |
| profilul comun, vehicule noi pe versiunea activă | testul 6 |

## Cum eșuează implementările plauzibil greșite

- ID fără slot/tip → testul 1 (unicitate) și testul 4 (duplicat respins).
- Clasă atribuită secvențial dintr-un RNG global → testul 3 (primele 20 de taxiuri nu își schimbă clasa când populația crește).
- O singură stare partajată pentru toată flota → testul 5 (referințe distincte, al doilea vehicul neschimbat, tick independent).
- `list()` dependent de ordinea `Map` sau de sortare instabilă → testele 1 și 3 plus verificarea `sorted-identity-order` din raport.
- Câmpuri de cameră/renderer în stare → testul 1 (chei exacte) și testele `state-field-contract`/`vehicle-field-contract`.
- `dispose()` care doar marchează steagul → testul 7 (contoare, listă și raport zero).
- Versiune de profil globală citită la fiecare citire în loc de legare la creare → testul 6 (vechiul vehicul rămâne pe v1 până la actualizarea explicită).

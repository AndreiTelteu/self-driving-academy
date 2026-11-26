# Economia live 266

Status: implementare live locală (`targeted`). `src/app/live-economy-composition.ts` compune economia
209 peste închiderile reale 061/265, iar `src/economy/live-economy.ts` expune read model-ul compact.
`src/main.ts` montează portul `economy` în shell și HUD-ul `src/ui/live-economy-hud.ts`. Modulul nu
creează un al doilea ledger, review store, KPI sau model de cursă: fiecare cursă terminală este chiar
`RideRecord`-ul 061, iar tariful, review-ul și bucketurile rămân ale contractelor 209.

## Ce produce o cursă terminală

Fiecare pas autoritar trece prin shell în ordinea declarată: `rides` (061–064) apoi `economy`. Portul
economiei citește exact aceleași curse terminale și același cadru de vehicule; nu avansează nimic dacă
shell-ul este suspendat. Pentru fiecare `RideRecord` terminal, încă nesettled:

| Stare 061 | Regulă 209 | Revenue | Review |
| --- | --- | --- | --- |
| `COMPLETED` | `COMPLETED_FARE` | tariful complet, o singură dată | un review evaluabil |
| `FAILED` | `FAILED_FULL_REFUND` | 0; rambursare explicită a tarifului | review dacă pasagerul era la bord |
| `CANCELLED` fără pasager | `CANCELLED_BEFORE_PASSENGER_FULL_REFUND` | 0; rambursare completă | niciun review inventat |
| `CANCELLED` cu pasager | `CANCELLED_WITH_PASSENGER_SERVICE_FEE` | doar taxa de serviciu versionată | review cu `RIDE_CANCELLED` |

Settle-ul este cheiat după `ride-settled:<rideId>` în ledgerul 209, iar compunerea ține și un set
mărginit de `rideId`-uri deja decontate. Un tick re-livrat este `duplicate: true` și nu schimbă nimic;
un replay explicit al aceleiași curse este `DUPLICATE` în ledger și nu dublează revenue-ul, review-ul
sau KPI-ul. Civilii nu au cale în acest adaptor: el citește numai `RideRecord`-uri 061 ale taxiurilor,
iar ledgerul 209 refuză orice `vehicleKind: 'CIVILIAN'` înainte de deviz.

## Ceasul economic și expunerea

Ceasul economic este tick-ul autoritar pe care shell-ul l-a avansat efectiv, cu contractul versionat
`209-economy-clock-v1`: **1 zi = 1 200 secunde simulate**, **1 lună = 30 zile**, **60 Hz**. El nu are
ceas de perete și nu avansează când jocul este în pauză, când focusul este pierdut sau când pagina
este offline — pur și simplu nu există pas. Din același motiv, o perioadă fără pași nu poate produce
revenue, review sau expunere nouă.

Bucketul de zi și cel de lună sunt exact `FleetKpiBucket` ale 209: `revenueMinorUnits`, curse
`completed`/`failed`/`cancelled`, `reviewCount`, `ratingSum`, histograma 0–5, `exposureSeconds`,
`completeness` și marcajele de activare. Media este `ratingSum / reviewCount`, indisponibilă la zero
review-uri; totalurile adună sumele, nu media mediilor. O zi fără evenimente rămâne `null` în read
model și este afișată „fără date”, niciodată ca venit 0 sau rating perfect.

## Comfortul folosit de review

Cât timp pasagerul este la bord (`TO_DROPOFF`/`DROPOFF`), compunerea eșantionează la 10 Hz viteza,
heading-ul și modul de control autoritare ale taxiului și derivă intervalele cu aceeași funcție 139
(`deriveComfortIntervals`) pe care o citesc misiunea și tabloul. Intervalele intră într-un serviciu
139 mărginit, per cursă, iar la terminal review-ul primește exact acel snapshot — deci termenul de
confort nu este inventat și nu există un al doilea calcul. Capabilitatea laterală este a clasei reale
a vehiculului (`grip × 9,81 m/s²`), nu o constantă.

Limita acestei versiuni: ferestrele 088 de suprimare a artefactelor și secundele blocate 137 nu sunt
încă montate live în 266, deci review-ul raportează acei termeni ca 0; impacturile 028 și filtrarea
telemetriei rămân la 272/274. Review-ul este tot din vocabularul închis 209 și există cel mult o dată
per cursă evaluabilă; un al doilea eveniment este `EXISTING`/`DUPLICATE`, iar rescrierea cere explicit
`reissueReview`.

## Epoca economică și resetul

Fiecare sesiune (Academie/Haos) are propriul ledger, propriile review-uri și propriile bucketuri KPI,
ținute într-un registru de compuneri în `src/main.ts`. O sesiune nouă pornește cu istoric gol; cursele
celelalte sesiuni nu pot ajunge în ea, fiindcă economia se creează numai după resetul 265, când
lifecycle-ul este gol. La revenirea într-o sesiune existentă, istoricul ei este păstrat și se deschide
o epocă nouă.

Compunerea ține o epocă explicită `{ index, startTick, resets }`. La schimbarea sesiunii sau la
„Oraș proaspăt, păstrează stilul”, `src/main.ts` decontează întâi cursele deja terminale ale sesiunii
care iese (`flush`), lasă 265 să închidă cursele active, activează economia sesiunii cerute și, dacă
ea exista deja, apelează `beginEpoch`. `beginEpoch` **nu** golește ledgerul, review-urile sau
bucketurile: doar închide seria de raportare și pornește următoarea, astfel încât istoricul precedent
rămâne neschimbat, iar cursele epocii noi se adaugă peste el.

Resetul de scenariu al 265 închide cursele active cu `SCENARIO_RESET` înainte ca economia să le poată
vedea ca `RideRecord` terminal; aceste curse de graniță nu sunt decontate. Limitarea este explicită și
nu inventează un tarif sau un review pentru ele; istoricul deja decontat rămâne intact.

## API

```ts
import { createLiveEconomyComposition } from './app';

const economy = createLiveEconomyComposition({
  lifecycle: liveRideComposition.lifecycle.lifecycle, // 061 real
  graph, // 033 real
  namespace: 'v3:city:economy',
});

economy.step({ tick, vehicles }); // o dată per pas autoritar, după `rides`
economy.flush({ tick }); // decontează terminalele vizibile înainte de un reset
economy.beginEpoch({ tick }); // serie nouă, istoric păstrat
economy.read(); // LiveEconomySnapshot compact
economy.snapshot(tick); // FleetEconomySnapshot 209 complet, pentru diagnostic
```

`read()` cheamă doar `ledger.totals()` și `kpi.snapshot()`; nu parcurge ledgerul, review-urile sau
istoricul. `historyScans` este structural `0` în read model, în snapshotul 209 și în HUD.

## HUD-ul live

`src/ui/live-economy-format.ts` (`266-live-economy-hud-v1`) validează snapshotul și proiectează ziua
și luna simulate: venit, curse, rating, expunere, totalul sesiunii, contoarele de settle/duplicate/
respinse/review-uri și ultima cursă. `src/ui/live-economy-hud.ts` montează un singur `role="status"`
cu text, fără listeneri, citește portul la 10 Hz și scrie doar liniile schimbate. Nu este pop-up-ul
KPI al 267: nu are grafice, tabele istorice sau buton/hotkey.

## Verificare

```powershell
npm run economy:live
npm run economy:live -- --check
npm run economy:live:probe
```

Dovezile sunt în [Evidence/266-live-economy](Evidence/266-live-economy/README.md): raportul determinist
acoperă curse mixte, anulări, eșec, civili, duplicat, pauză, reload de citire și epoca economică.

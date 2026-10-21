# Selectarea vehiculelor prin hartă 076

Status: implementare și validare funcțională locală. `src/ui/map-selection-format.ts` deține
contractul, proiecția markerilor și hit-test-ul; `src/ui/map-selection.ts` este adaptorul DOM;
`src/app/map-selection.ts` compune flota reală 057 cu pozițiile citite de host și ținta camerei 068.
Modulul nu creează vehicule, poziții, rute sau cameră și nu preia controlul.

## Ce face

- proiectează taxiurile 057 și mașinile civile 058 prin aceeași transformare nord-sus 074 folosită de
  minimapă; un vehicul fără poziție cunoscută lipsește, nu primește coordonate inventate;
- desenează un `<button>` nativ per vehicul, cu simbolul `T` sau `C`, poziționat procentual peste
  canvasul hărții;
- transformă un click (sau activarea nativă Enter/Space a butonului) într-o singură intenție 068
  `WORLD`, prin portul injectat `select(vehicleId)`;
- marchează vehiculul urmărit de cameră prin `aria-pressed`, un inel dublu și un simbol `✓`, deci nu
  doar prin culoare.

Selectarea de pe hartă schimbă **doar** ținta camerei. Nu teleportează vehicule, nu scrie poziții, nu
modifică flota, nu revendică autoritatea PLAYER și nu deschide segmente. Vehiculul nou rămâne în AUTO
până la o intenție explicită 067.

## API

```ts
import { createMapSelectionOverlay, parseMapSelectionSnapshot } from './ui';
import { createMapSelectionPort, readMapSelectionSnapshot } from './app';

const overlay = createMapSelectionOverlay(mapHostElement, minimapTransform, {
  maximumHz: 10, // opțional
  select: (vehicleId) => port(vehicleId), // singurul efect al unui click
});

const snapshot = readMapSelectionSnapshot(
  { fleet, camera }, // 057 real + ținta camerei 068
  {
    tick, // tick-ul autoritar acceptat
    positions, // (vehicleId) => { x, y, z } | null, citirea reală a hostului
    // followedVehicleId: opțional; altfel camera.followedVehicleId()
  },
);
overlay.update(snapshot, nowMs); // cel mult 10 Hz, cu bypass pentru schimbări de identitate
overlay.setFollowed(vehicleId); // opțional, actualizare imediată a stării de urmărire
overlay.getStats(); // markers, created, removed, writes, skipped, updates, listeners
overlay.dispose(); // idempotent, elimină root-ul și toți listenerii
```

Funcțiile pure exportate sunt `parseMapSelectionSnapshot`, `projectMapSelection` și
`hitTestMapMarker`, plus constantele `MAP_SELECTION_VERSION` (`076-map-selection-v1`) și
`MAP_SELECTION_LIMITS`. Proiecția refolosește `projectMinimapPoint` din 074.

## Snapshot

`MapSelectionSnapshot` este înghețat și are câmpuri exacte:

| Câmp | Sursă reală | Regulă |
| --- | --- | --- |
| `schemaVersion`, `units`, `version` | contract | `1`, `SI`, `076-map-selection-v1` |
| `sessionId`, `worldEpoch` | contextul 057 | identități mărginite, întregi nenegativi |
| `tick` | tick-ul acceptat al hostului | întreg nenegativ, monoton în aceeași sesiune/epoch |
| `followedVehicleId` | ținta camerei 068 | identitate bounded sau `null` |
| `vehicles[]` | 057 TAXI + CIVIL | maximum 110, identități unice |

Fiecare vehicul are exact cheile `vehicleId`, `kind` (`TAXI`/`CIVIL`), `slot`, `label` (string bounded
sau `null`), `positionM` (`{x,y,z}` finit sau `null`), `headingRad` (finit sau `null`), `available` și
`selectable`. Parserul respinge chei lipsă, chei necunoscute, duplicate, valori nefinite, identități
peste 512 code units, etichete peste 96 code units, sloturi invalide și combinațiile contradictorii:

- `available` este exact `positionM !== null`;
- `selectable` nu poate fi `true` fără poziție;
- `headingRad` nu poate exista fără poziție.

`readMapSelectionSnapshot` citește `fleet.list()` și `fleet.context()`, cere poziția prin
`positions(vehicleId)` și omite vehiculul când citirea este `null` sau nefinită. Civilii păstrează
`vehicleId`-ul real 057, nu un index de array. `followedVehicleId` vine din frame când este dat explicit,
altfel din `camera.followedVehicleId()`.

## Proiecție și identitate

Markerii folosesc exact transformarea 074:

```text
xPx = width/2 + (xM − centerXM) · scale
yPx = height/2 − (zM − centerZM) · scale      // +Z este nord, deci urcă
```

`MapMarkerProjection` conține `markerId`, `vehicleId`, `kind`, `slot`, simbolul `T`/`C`, eticheta,
`x`, `y`, `headingRad`, `sizePx`, `hitRadiusPx`, `selected`/`followed`, `selectable` și descrierea
accesibilă. Marcajele sunt ordonate lexicografic după `markerId`.

**Identitatea markerului este `vehicleId`-ul flotei.** `markerId === vehicleId` și
`data-vehicle-id === data-marker-id`. O schimbare de poziție, tip (`TAXI`→`CIVIL`) sau etichetă
actualizează același element DOM; nu creează un marker nou. Indexul din array, mesh-ul Babylon,
handle-ul de corp și ordinea de randare nu sunt identități. `counts.removed` se calculează numai
raportat la proiecția randată anterior, deci o simplă re-proiectare nu inventează dispariții.

## Hit-test

`hitTestMapMarker(markers, pointPx, options?)` este pur și deterministic:

- ia în calcul doar markerii `selectable` cu coordonate finite;
- raza efectivă este `options.hitRadiusPx` sau `12 px`, plafonată la `64 px`; o distanță egală cu raza
  este hit;
- câștigă cel mai apropiat marker; la distanțe egale câștigă `vehicleId`-ul lexicografic mai mic,
  niciodată ordinea din array;
- un punct nefinit, un marker invalid sau un click în afara razei returnează `null`.

## Adaptorul DOM

- Root-ul `.map-selection` este absolut poziționat în host și are `aria-label` + `aria-describedby`
  către un paragraf ascuns vizual cu numărul de taxiuri/civile și regula „doar ținta camerei”.
- Hostul trebuie să fie o cutie poziționată care acoperă exact zona hărții din minimapă. Markerii
  folosesc procente din `transform.widthPx`/`heightPx`, deci urmează dimensiunea CSS fără citire de
  pixeli din canvas.
- Fiecare marker este un `button[type=button]` cu `data-vehicle-id`, `data-marker-id`, `data-kind`,
  `data-slot`, `data-label`, `data-selectable`, `aria-pressed` și `aria-label` complet. Simbolul `T`/`C`
  este text vizibil; forma (cerc/pătrat) și inelul de selecție întăresc sensul fără culoare.
- Un singur `click` listener per marker; niciun listener global de tastatură sau document. Enter/Space
  folosesc comportamentul nativ al butonului. Un marker `selectable:false` este `disabled` și nu emite
  nimic.
- `update(snapshot, nowMs)` validează întâi cadrul, verifică ceasul monoton și tick-ul necăzător,
  apoi proiectează. Un cadru identic nu scrie nimic; scrierile sunt plafonate la 10 Hz. Schimbarea
  vehiculului urmărit, a tipului sau a stării de selecție ocolește plafonul, ca feedback-ul selecției
  să fie imediat. Un cadru malformat, în urmă sau cu ceas invers nu atinge DOM-ul.
- `getStats()` raportează `markers`, `created`, `removed`, `writes`, `skipped`, `updates`, `listeners`
  și `globalListeners: 0`. `dispose()` este idempotent și elimină root-ul, butoanele și listenerii.

## Portul de selecție

`createMapSelectionPort({ bodyIdentity, selection })` mapează `vehicleId`-ul markerului la identitatea
nativă exactă și apelează `selection.enqueue(identity, 'WORLD')` (068). O identitate necunoscută
returnează `false`; nu se inventează o identitate și nu se apelează `prepare`, `settle`, fizica,
camera sau `clearInput`. Portul este singurul efect al unui click; consecințele acceptate rămân ale 068.

## Accesibilitate

Fiecare buton are o descriere completă: etichetă, `vehicleId`, simbol, poziție în metri, direcție când
există, starea „vehicul urmărit de cameră” și „selectabil/indisponibil”. `aria-pressed` exprimă
urmărirea, iar focusul de tastatură are un contur vizibil. Root-ul nu fură focusul și nu captează
tastatura, deci comenzile de condus rămân active.

## Limite

| Limită | Valoare |
| --- | ---: |
| Vehicule per snapshot | 110 |
| Elemente fixe | 2 |
| Elemente per marker | 1 |
| Listeners globali | 0 |
| Listeners per marker | 1 |
| Frecvență de scriere | 10 Hz |
| Rază implicită de hit | 12 px |
| Rază maximă de hit | 64 px |
| Code units per identitate | 512 |
| Code units per etichetă | 96 |
| Proiecții reținute | 1 |

## Verificare

`tests/ui/map-selection.test.ts` (13 teste) acoperă parserul strict, proiecția taxi/civil/distant,
identitatea stabilă la schimbarea poziției/etichetei/tipului, curățarea markerului dispărut, hit-test-ul
nearest/tie/rază/invalid, click-ul WORLD unic, `aria-pressed`, plafonul de 10 Hz cu bypass, cadrul
identic fără scrieri, cadrele respinse fără atingere DOM și ciclul de viață.

```powershell
npm run map:selection
npm run map:selection -- --check
```

Runnerul scrie [report.json](Evidence/076-map-selection/report.json) și
[report.md](Evidence/076-map-selection/report.md): 8 scenarii deterministe și 43 de verificări, cu
30 de taxiuri, 41 de civile, un civil distant, un marker dispărut, DOM serializat și statistici.
`npm test` include comparația cu transcriptul comis.

## Ce NU este

- Nu este 057/058: nu creează, nu mută și nu elimină vehicule; citește registrul real.
- Nu este 074: nu desenează harta și nu deține transformarea; o refolosește.
- Nu este 068: nu acceptă selecția, nu schimbă camera și nu preia autoritatea; emite doar intenția.
- Nu este 018: nu face picking Babylon sau raycast; hit-test-ul este 2D pe markerii proiectați.
- Nu este 017: nu mișcă absolut camera și nu teleportează vehicule.
- Nu măsoară FPS, GPU sau hardware; raportul este o probă funcțională deterministă.

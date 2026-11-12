# 1. Pornire, tastatură și cameră

## Pornirea aplicației

Ai nevoie de Node.js `24.21.x` și npm `11.19.x` (limitele reale sunt în `engines` din
[package.json](../../package.json)). Din rădăcina proiectului, în PowerShell:

```powershell
npm ci
npm run dev
```

Deschide adresa afișată de Vite (implicit `http://localhost:5173`). Pentru un port fix:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Pentru varianta de producție (build static + server local de verificare):

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

`npm run build` rulează întâi verificarea TypeScript și apoi Vite. Artefactul este servibil dintr-un
director static oarecare, cu referințe relative.

## Ce vezi la pornire

Bootstrapul montează o singură secțiune: titlul „Self Driving Academy”, o linie de stare, canvas-ul
Babylon.js, butoanele de sesiune și panoul „Diagnostic” (vezi `src/ui/rendering-view.ts` și
`src/ui/diagnostics-panel.ts`).

| Stare | Textul real al liniei de stare | Ce poți face |
| --- | --- | --- |
| Se încarcă | „Se inițializează randarea…” | aștepți |
| Pregătit | „Bootstrap pregătit · Babylon.js · WebGPU” sau „… · WebGL2” | apeși **Pornește** |
| Pornit | „Sesiune bootstrap pornită · …” | apeși **Pauză** |
| Pauză | „Sesiune în pauză” | apeși **Reia** |
| Pauză de suprasarcină | „Pauză de suprasarcină. Redu costul vizual înainte de reluare.” | reduci costul, apoi **Reia** |
| Eroare | „Randarea nu a pornit. …” | apeși **Reîncearcă** |
| Închis | „Sesiune închisă” | reîncarci pagina |

Butonul al treilea se numește **Reîncearcă** doar în eroare; altfel se numește **Reîncarcă**. Butonul
de pornire se numește **Pornește** în starea pregătit și **Reia** în pauză.

**Backendul.** Aplicația preferă WebGPU și revine la WebGL 2 verificat. Dacă niciunul nu este
disponibil, afișează mesajul explicit „Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile.
Poți reîncerca.” și butonul de reîncercare, fără canvas gol. Textul sursei este în
`src/rendering/backend-policy.ts`.

**După pierderea GPU**, scena este reconstruită din ultimul checkpoint din memorie; tick-ul rămâne
neschimbat, generația avansează, iar după două eșecuri consecutive starea devine eroare cu buton de
reîncercare. Reîncercarea revine în „pregătit” cu același checkpoint.

**Panoul „Diagnostic”** este un `details` închis implicit, cu câmpurile Backend, CPU render p95,
GPU p95, GPU status, Frame p95, Tick CPU p95, Tick, Debt, Draw calls, Meshes / nodes, Materiale /
texturi / geometrii, Bytes în așteptare, Joburi în coadă, Entități, Profil, Worker, Samples /
capacitate. O valoare indisponibilă se scrie „Indisponibil”, niciodată `0`. Panoul se actualizează la
cel mult 5 Hz și, fiind read-only, **nu** pune simularea pe pauză. În dezvoltare apare și butonul
„Inspector Babylon”; în buildul de producție nu este inclus.

## Tastatura: toate acțiunile și tastele implicite

Bindingurile sunt **stare de dispozitiv**, salvate per jucător în `RuntimeSettings.input.bindings`, și
sunt integral remapabile. Implicit sunt exact acestea (`createDefaultSettings`,
`src/settings/store.ts`):

| Acțiune | Etichetă afișată | Tastă implicită | Observație |
| --- | --- | --- | --- |
| `throttle` | Accelerație | `W` | ține apăsat pentru accelerație progresivă |
| `brake` | Frână | `S` | frânează; la viteză foarte mică cere marșarier |
| `steerLeft` | Direcție stânga | `A` | |
| `steerRight` | Direcție dreapta | `D` | |
| `handbrake` | Frână de mână | `Space` | blochează propulsia, impuls pe roțile spate |
| `manualMode` | Mod AUTO/MANUAL | `M` | comută AUTO ↔ MANUAL |
| `learningMode` | Mod LEARNING | `L` | intră/iese din LEARNING |
| `kpis` | Panou KPI | `K` | deschide pop-up-ul KPIs |
| `fleet` | Lista flotei | `Tab` | listează taxiurile |
| `signalLeft` | Semnalizare stânga | `Q` | |
| `signalRight` | Semnalizare dreapta | `E` | |
| `camera` | Cameră | `C` | comută din spate ↔ first-person |
| `profile` | Panou profil | `P` | valori, diferențe, dovezi |
| `pause` | Pauză | `Escape` | deschide pauza/meniul |
| `recover` | Recuperare | `R` | deblochează mașina controlată |

Reguli reale ale tastaturii (`src/input`, `src/ui/key-remapping*`):

- Tastele se citesc prin codul fizic (`KeyboardEvent.code`), deci poziția pe tastatură contează, nu
  litera din altă layout.
- Repetările automate ale tastei sunt ignorate; un câmp de text, un `input`/`textarea` sau un dialog
  aflat în focus nu controlează vehiculul.
- Pierderea focusului, trecerea în background și închiderea unui panou eliberează imediat tastele
  ținute, ca să nu rămână o comandă activă.
- Remaparea se face dintr-un panou dedicat: cele 15 acțiuni sunt listate mereu, o tastă folosită de
  două acțiuni apare ca **conflict** și blochează salvarea, iar `Escape` anulează captura fără să
  închidă panoul. „Salvează” rămâne dezactivat până când propunerea este validă și diferită.
- Schimbarea bindingurilor **nu** modifică stilul de condus, fizica sau profilul învățat.

## Cum se conduce

- `W` accelerează, `S` frânează. Cât timp mașina merge înainte, `S` este frână; când viteza totală a
  caroseriei coboară sub `0,2 m/s` timp de șase tick-uri consecutive la 60 Hz, `S` cere marșarier, iar
  `W` funcționează simetric în marșarier.
- `W` + `S` apăsate împreună înseamnă frânare de serviciu, nu două comenzi contradictorii.
- `Space` (frână de mână) blochează forța de propulsie și aplică impulsul real pe roțile din spate.
- `A`/`D` virează; la viteză mare direcția este atenuată controlat, ca să nu devină instabilă.
- `Q`/`E` semnalizează stânga/dreapta.

Acestea sunt asistențe de input, nu modificări de fizică: masa, puterea, aderența și pasul de timp
rămân aceleași pentru orice mașină.

## Camera: din spate și first-person

- `C` comută între camera din spate (`CHASE`) și camera first-person din poziția șoferului
  (`FIRST_PERSON`); preferința se salvează.
- Camera din spate stă la 2–15 m de mașină, cu o extensie monotonă de maximum 4 m la viteză mare.
  „Mișcarea camerei” la 0 elimină întârzierea și nu impune head-bob.
- First-person este așezată la ochiul șoferului, transformat prin poziția completă a mașinii, deci
  urmărește virajul și ruliul. Nu este o cameră pe capotă și ascunde caroseria exterioară, păstrând
  habitaclul.
- Mouse-ul poate privi în jur cu limită: yaw ±110°, pitch ±70°. Capturarea mouse-ului se cere printr-un
  click explicit pe butonul de capturare; `Escape`, pierderea focusului sau trecerea în background o
  eliberează. Recentrarea este o acțiune explicită.
- First-person **nu** înseamnă personaj controlabil sau mers pe jos. Nu există astfel de flux în V1.
- Câmpul vizual se reglează între 60° și 100°; camera nu schimbă autoritatea, regulile sau fizica.

## Pauză, focus și panouri

Regula de suspensie este a modulului de pauză și focus, nu a fiecărui panou în parte:

- **Meniul de pauză** și **pop-up-ul de reglaje** suspendă simularea în toate modurile, inclusiv AUTO.
- **Panourile** flotei, profilului, misiunilor, misiunilor zilei și KPI suspendă simularea în MANUAL și
  LEARNING; în observare AUTO rămân live, ca să poți urmări orașul.
- **Diagnosticul** read-only nu suspendă niciodată.
- **Pierderea focusului** suspendă în orice mod. La reluarea explicită, comenzile ținute sunt
  resetate, iar secvența de tick-uri rămâne contiguă: timpul oprit nu devine tick-uri.
- Ordinea cauzelor este focus > meniu > panou; schimbarea doar a cauzei nu produce o tranziție nouă.

Dacă vrei să citești despre tastele din interiorul unui panou: `Tab`/`Shift+Tab` rămân în dialog,
`Escape` îl închide și readuce focusul la butonul care l-a deschis.

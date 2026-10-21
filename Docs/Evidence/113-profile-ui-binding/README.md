# Dovezi 113 — legarea UI la profiluri reale

Contract: `113-profile-ui-binding-v1` în `src/app/profile-ui-binding.ts`. Dovezile sunt un transcript
determinist produs de `npm run profile:ui-binding`; nu conțin ceas de perete, valori aleatoare,
captură de browser sau măsurători hardware.

## Ce acoperă

| Scenariu | Verifică |
| --- | --- |
| versiune curentă | panel, istoric și ținta 110 raportează aceeași versiune 109 reală |
| delta părinte→copil | baza deltei, valorile `previous`/`next` și direcția previzualizării istoricului |
| cheie rezervată | o cheie R cu număr în record rămâne `RESERVED`/`null` și lipsește din delta |
| cheie neobservată | o cheie absentă rămâne `UNOBSERVED`/`null`, nu devine `0` |
| zero real | `0` rămâne `OBSERVED`/`0` în panel, istoric și ambele direcții ale deltei |
| motiv `NO_CHANGE` | explicația 104 fără versiune păstrează motivul închis pe rând |
| abateri injectate | versiune, valoare, rezervat, neobservat, bază de delta, motiv și țintă activă |

Fiecare scenariu citește un store 109 real, un controller 110 real și, unde este cazul, un snapshot
104 real; nu se folosește cadrul ilustrativ 077.

## Rezultat

- Scenarii: 7
- Verificări: 54/54 PASS
- Teste: `tests/app/profile-ui-binding.test.ts`, 21 de teste

Fișiere:

- `report.json` — transcriptul mașină, comparat de `--check`;
- `report.md` — tabelul lizibil pe scenarii, chei și verificări.

## Comenzi

```powershell
npm run profile:ui-binding
npm run profile:ui-binding -- --check
```

## Limitări

- Un `ProfileVersion` 109 nu păstrează dovezi sau proveniență per cheie. Rândurile observate au
  `evidenceCount: 0`, `uncertainty: 0` și `NO_EVIDENCE_RECORD`; nu se inventează sprijin.
- Explicația 104 este furnizată de host pentru ultimul rezultat 112; binding-ul o validează, nu o
  recalculează din alt job.
- Nu există captură de browser, FPS, GPU sau măsurătoare hardware; verificarea este deterministă și
  locală, nu certifică performanța jocului integrat.

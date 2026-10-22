# Doveze PBI 148 — motor audio (motor, frâne, anvelope, impact)

Implementarea motorului audio din [modulul 16](../../../../Docs/16-asseturi-vizual-si-audio.md):
sunetele legate de viteză, sarcină și contactele fizice, cu pornire după gestul jucătorului,
volume separate, mute izolat și plafon explicit de voci cu ownership.

## Conținut

| Fișier | Descriere |
| --- | --- |
| `report.json` | Raportul determinist al scenariilor și verificărilor (26 verificări, 6 scenarii). |
| `report.md` | Același raport în Markdown, pentru citire umană. |
| `measurements.json` | Costul local măsurat: memorie și cost per tick, înainte/după, pe fixture. |
| `commands.txt` | Comenzile executate și ieșirea lor reală. |

## Ce demonstrează

- **Gestul jucătorului**: contextul audio este creat doar la `startFromUserGesture`; înainte de
  gest starea este `IDLE`, impactele sunt refuzate (`AWAITING_GESTURE`) și nu soună pe fond.
- **Volume separate**: `master` + trei bus-uri independente (`engine`, `impact`, `ui`), persistate
  prin setările 009 (`RuntimeSettings.audio`).
- **Mute izolat**: mute coboară doar câștigul de ieșire; evenimentele 028, tick-urile, vocile și
  telemetria continuă.
- **Plafon de voci și ownership**: plafon pe categorie și total, voice stealing determinist,
  eliberare la `releaseVehicle` și la `dispose`, niciun buffer nelimitat.
- **Vehicul neaudibil vs audibil**: un vehicul în afara razei sau sub prag nu primește voce și nu
  generează buffer; un vehicul audibil primește exact o voce.
- **Impact din 028**: evenimentul `COLLISION` publicat de adaptorul 028 ajunge pe bus-ul de
  impact prin puntea `attachCollisionAudio`.

## Măsurători (memory + frame)

Metodă: **cost local pe fixture determinist**, în Node, în același proces: același fixture
(`148-audio-fixture-v1`, 70 de vehicule: 30 taxiuri + 40 civili, dintre care 24 în raza audibilă
de 35 m) este iterat cu și fără motorul audio, 600 de tick-uri × 5 repetări, cu mediana raportată.
Nu este un gate hardware de FPS și nu este folosit drept dovadă de performanță hardware.

| Metrică | Baseline (fără audio) | Cu audio | Cost suplimentar | Buget |
| --- | --- | --- | --- | --- |
| Cost per tick (fixture 70 vehicule) | 2,19 µs/tick | 39,86 µs/tick | **+37,67 µs/tick** | tick autoritar p95 5,5 ms → 0,7% din buget |
| Heap reținut cu motor viu | 10 282 704 B | 10 291 464 B | **+23 888 B** (zgomot GC: 24 KB–733 KB între rulări) | fără buget calibrat în manifest |
| Buffere audio deținute (auditabil) | 0 B | 44 100 B (un buffer `engine-loop`) | +44 100 B | plafon explicit 1 MiB → 4,2% |

Cifrele exacte ale ultimei rulări sunt în `measurements.json`. Între rulări, costul per tick a
variat între 30,7 µs și 37,7 µs, iar diferența de heap între 24 KB și 733 KB: **alți agenți rulează
în paralel pe aceeași mașină**, iar mediana a cinci repetări reduce zgomotul fără să îl elimine.
Concluzia folosibilă este ordinea de mărime (câteva zeci de microsecunde pe tick și sub 1 MiB de
buffere deținute), nu valoarea exactă.

Bugetele folosite sunt din [manifestul 203-initial-1](../../performance-budgets.json)
(`authoritativeTickP95Ms` 5,5 ms, `mainThreadP95Ms` 10 ms). Manifestul nu are o capacitate
calibrată pentru audio (`totalHeapBytes: null`), deci plafonul audio vine din contractul propriu
`AUDIO_LIMITS.maxBufferBytes` (1 MiB), conform `nullCapacityPolicy` din manifest.

## Limitări

- Bufferele audio sunt **placeholder-uri procedurale** generate determinist; nu sunt asseturile
  finale înregistrate ale modulului 16.
- Măsurătorile sunt un **cost local pe fixture**, nu un gate hardware de FPS; celelalte procese
  de pe aceeași mașină pot polua cronometrarea.
- Integrarea motorului în composition root-ul browserului (buton de pornire audio, legarea
  buclelor de tick) este un follow-up; contractul modulului este complet și testat.

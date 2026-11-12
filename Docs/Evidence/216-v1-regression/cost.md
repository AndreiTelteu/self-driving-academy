# 216 cost real al căii de tick

Valori machine-readable: [cost.json](cost.json). Aceasta este singura măsurătoare cu ceas de perete a
PBI 216; **nu** face parte din transcriptul determinist și **nu** este o probă de cadru sau de FPS.

Contract: 216 combined tick path: 70 vehicles, 600 ticks per sample, recorder 20 Hz sampling, autosave offered once per tick and not due

- Eșantioane: 5
- Tick-uri per eșantion: 600
- Vehicule: 70
- Eșantioane de recorder: 1000
- Capturi de autosave: 0
- Măsurat la: 2026-11-11T21:25:24.258Z

| Braț | Min (ms) | Median (ms) | Max (ms) |
| --- | --- | --- | --- |
| Doar condus, 600 tick-uri | 45.262 | 46.828 | 77.587 |
| Condus + recorder + ofertă autosave, 600 tick-uri | 103.442 | 109.953 | 110.886 |
| Cost per tick, doar condus (ms) | 0.075 | 0.078 | 0.129 |
| Cost per tick, cu sistemele atașate (ms) | 0.172 | 0.183 | 0.185 |

Procesul este Node, fără renderer, GPU sau browser: rezultatul descrie costul sincron al căii de tick,
nu timpul de cadru al jocului.

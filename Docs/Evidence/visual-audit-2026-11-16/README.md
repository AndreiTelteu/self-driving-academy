# Audit vizual, 16 noiembrie 2026

Sursa planului [Calitate vizuală V4](../../30-calitate-vizuala-v4.md).

## Metodă

- Build: `vite build` și `vite preview` pe :4173, din working tree-ul de după PBI 238.
- Browser: Playwright MCP (Chromium), fereastră de 1600×900. Jocul a fost jucat de un subagent Haiku cu taste reale (W/A/S/D, F, G, Space) și drag de mouse.
- Backend: WebGPU, renderer `rdna-2`; `renderWidth × renderHeight` = 640×360 (567×360 cu panoul Diagnostic deschis).
- `stats()`: cityMeshes 12, cityDrawCalls 12, decorMeshes 36, characterMeshes 17, characterDrawCalls 4, vehicleMeshes 12, vehicleDrawCalls 8, vehicles 2.
- Consolă: 0 erori, 32 de avertismente (neinspectate).

Capturile nu sunt deterministe (cameră controlată de jucător). Baseline-ul repetabil este cel din PBI 239.

## Capturi reprezentative

| Captură | Ce arată |
| --- | --- |
| [01-start-screen.png](01-start-screen.png) | Layout de pagină de test: titlu HTML, linie de status, butoane implicite, scenă de 640×360 |
| [03-walking-character-idle.png](03-walking-character-idle.png) | Personaj din cuburi, trotuar alb ars, copac din conuri, dungă de cer pe carosabil |
| [11-in-vehicle-idle.png](11-in-vehicle-idle.png) | Taxi bleumarin ilizibil, stopuri plate, personajul rămas vizibil lângă mașină, trecere de pietoni uriașă |
| [13-driving-speed.png](13-driving-speed.png) | Fără umbre, taxi din cutii, orizont tăiat |
| [15-driving-steering-right.png](15-driving-steering-right.png) | Taxi pe iarbă; teren plat, decor din cutii |
| [17-driving-chase-cam-straight.png](17-driving-chase-cam-straight.png) | Taxi ieșit de pe hartă, în vidul de culoarea cerului |
| [28-walking-far-east.png](28-walking-far-east.png) | Perspectivă deformată, stâlp și copac uriași în prim-plan, clădiri ca niște cutii maro |
| [36-camera-rotated-back.png](36-camera-rotated-back.png) | Marginea orașului, clădiri fără ferestre, gol în carosabil |

Celelalte capturi din acest folder sunt păstrate ca materiale brute ale sesiunii.

## Observații de control raportate de agent

- Tragerea verticală a mouse-ului nu schimbă camera (preluată în 250).
- A sau D singure nu rotesc personajul pe loc; doar W+A și W+D. S nu face nimic la mers. Comportamentul nu este vizual și nu a fost transformat în PBI; trebuie confirmat față de contractul 192/237.
- „Reîncarcă” a produs alerta „Randarea nu a pornit. Compunerea cere tick-ul următor (2), a primit 11883”, iar „Reîncearcă” a repornit corect. Este un defect de lifecycle, nu vizual; nu a fost transformat în PBI.
- HUD-ul raportează uneori `idle · 0.00 m/s` în timp ce personajul se mișcă.

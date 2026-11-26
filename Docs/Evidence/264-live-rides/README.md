# 264 — dovezi cereri și dispecerizare live

- [report.json](report.json) / [report.md](report.md): transcriptul determinist al programului real
  059 pe flota live 24 taxiuri + 32 civili, cu 39 de verificări. Generat de `npm run ride:live`;
  `npm run ride:live -- --check` îl compară byte cu byte. Nu conține ceas de perete.
- [cost.json](cost.json): proba de cost a subsistemului `live.step` în Node, pe o flotă proaspătă
  per repetare, cu warmup 30 tick-uri și 3 × 300 tick-uri măsurate. Nu este FPS, GPU sau certificat
  hardware. Generat de `npm run ride:live -- --measure`.
- [browser.json](browser.json) / [browser.md](browser.md): proba de browser pe buildul de producție,
  backend WEBGL2, cu cererile 059 vizibile în panoul `Curse`, taxiurile alocate 060 și preluarea
  explicită a unui taxi alocat (263), urmată de eliberarea `PLAYER_TAKEOVER`. Generat de
  `npm run ride:live:probe`; fără Playwright scrie explicit `NOT_RUN`.
- [screenshots](screenshots): panoul cu cereri/alocări și starea după preluarea taxiului.

Testele țintite sunt `tests/fleet/live-rides.test.ts` și `tests/ui/live-rides-panel.test.ts`.
Pickup/dropoff fizic, pasagerii și ETA rămân PBI 265.

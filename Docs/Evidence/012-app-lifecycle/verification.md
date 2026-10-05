# Verificare PBI012

Data: 2026-10-05 Europe/Bucharest. Baseline commit f80bd0ab6d2069dceadd296d43e0c899f0034b0e; implementare în working tree PBI012. Babylon9.29.0; Node24.21.0; CPU AMD Ryzen9 7950X3D, Windows (detalii exacte în JSON).

## Browser real T3

Tab propriu tab_6, http://localhost:5173/tests/browser/app-lifecycle/, 1280x800, WebGL2. Snapshot înaintea interacțiunilor. Butoane operate prin preview_click și citiri prin preview_evaluate:

- READY tick0, RAF1, listeners2, disposals0.
- Pornește: PLAYING tick10.
- Pauză: tick25, două citiri la150ms distanță au tick25; RAF1/listeners2 și UI activă.
- Reia: PLAYING tick34.
- Reîncarcă de două ori: fiecare READY tick0/RAF1/listeners2, disposals1 apoi2.
- Injectează eroare: ERROR Injected render fault, RAF0/listeners0/disposals3.
- Reîncearcă: READY tick0/RAF1/listeners2/disposals3.

Tab propriu tab_7 la http://localhost:5173/: backend real WebGPU; READY afișează Pornește/Reîncarcă. Pornește și Pauză operate prin butoane reale; UI prezintă Reia în pauză.

Capturi versionate: error.png, ready.png, bootstrap-paused.png. Fixture-ul nu simulează fizică sau gameplay. Logul fixture-ului a inclus două erori de preload Electron înaintea încărcării modulelor; Babylon/WebGL2 și verificările au continuat. Bootstrapul WebGPU nu a avut erori de aplicație.

## CPU / performanță provizorie

Comenzi: `node --import ./scripts/register-typescript.mjs scripts/benchmark-fixed-tick.mjs --baseline` înainte și după; `node --import ./scripts/register-typescript.mjs scripts/benchmark-app-lifecycle.mjs` după. Aceeași probă seeded-counter-v1 seed42 de10000 pași: mediana înainte0.2831ms, după0.1779ms (total probă, nu tick hardware). Toate rezultatele au aceeași stare finală. Valorile absolute sunt mici și zgomotoase; nu demonstrăm o îmbunătățire de produs.

Cost suplimentar lifecycle+loop cu renderer mock: 10000 frames60Hz, cinci repetări + warmup; mediana total neobservat17.76ms. Observer10000 samples plafonate; p95 frame0.0018–0.0031ms, mediană0.0026ms; tick10000 și listeners0 după dispose în fiecare repetare. Raportul păstrează totalul cu observer separat. Bugete propuse înainte203: whole-tick p955.5ms/frame18.5ms; proba compactă este sub acestea, dar nu include scenă/GPU/fizică. Preset/GPU FPS indisponibile. Nicio afirmație de gate hardware sau soak complet.

## Comenzi de proiect

7 teste lifecycle PASS; typecheck și lint PASS; architecture imports/negative probes PASS; npm test PASS; npm run build PASS (avertismentul existent chunk>500kB Babylon). Prima comandă npm run check s-a oprit la format:check pentru fișierul asset-registry.ts al implementării015 aflate în lucru; fișierele012 sunt formatate. Verificarea globală finală este coordonată de parent.

# PBI203 — verificarea uneltei și închiderea cu derogare

Proba portabilă construiește bootstrapul Babylon în producție și îl servește numai pe localhost. Scriptul PowerShell capturează hardware/OS/driver/alimentare; pagina verifică profilul și manifestul buildului, măsoară randarea cu colector oprit/pornit și exportă raportul printr-un download explicit. Hashurile identifică sursele selectate și toate artefactele emise. Rezultatul nu conține identificatori personali sau seriale.

[Identificarea desktopului](desktop-identification.json) a fost capturată local. [Smoke Chrome](desktop-smoke.json) folosește HEAD e4598f0 plus sursele203 identificate prin SHA256 în raport: WebGPU real, canvas intern/CSS1920×1080, Ryzen7950X3D/RX7900XTX. Cele două faze au câte288 cadre măsurate după încălzire scurtă; CPU p95≈0,30ms și interval p95≈7ms în ambele. Aceste valori verifică unealta, **nu sunt baseline de acceptare** (`validBaseline=false`). Timerul GPU este indisponibil în acest backend și rămâne null. Nu pretindem FPS de gameplay, memorie GPU exactă sau startup cold.

[Pierderea contextului](context-loss-check.txt) a fost provocată în Chrome prin extensia WebGL reală WEBGL_lose_context, după pornirea încălzirii. Proba a eșuat explicit, rezultatul vechi a fost eliminat, exportul dezactivat și reluarea reactivată. [Pierderea focusului](synthetic-blur-check.txt) este o injecție sintetică de eveniment blur, nu o măsurare a schimbării native de fereastră; aceeași invalidare/curățare a trecut. Nu există probe active rămase după aceste scenarii.

Review-ul independent a verificat focusul inițial/final, pierderea rendererului, identitatea pagină/manifest/hardware și clasificarea long tasks după startTime. Finalizarea cedează un task real înaintea drenării observatorului. Bufferele de cadre și long tasks au plafoane și nu trunchiază tacit rezultate valide.

Baseline-ul complet desktop a fost ulterior executat: [raport și limite](desktop-report.md). Măsurarea reală pe Lenovo Yoga7 rămâne în așteptare. Bugetele și capacitățile din [manifest inițial](../../performance-budgets.json) nu sunt aprobate. PBI203 rămâne In Progress; commitul uneltei permite rularea ei pe laptop fără a închide taskul.

Verificarea izolată a uneltei din indexul Git: [check](staged-check.txt) PASS255, [build](staged-build.txt) PASS, Validate-Board și Validate-Plan PASS. Boardul păstrează203 In Progress.

Baseline complet și sumarizator:7teste dedicate PASS; integrare izolată [check](baseline-staged-check.txt) PASS262 și [build](baseline-staged-build.txt) PASS, Board/Plan PASS. Include numai schimbările203, fără implementarea038 din lucru paralel.

## Închidere cu derogare — 5 octombrie 2026

Paragrafele anterioare păstrează starea istorică a măsurării. Utilizatorul a cerut explicit omiterea testului laptopului din 203 și continuarea. Închiderea consemnează această derogare de scope, nu un PASS hardware. Baseline-ul desktop este păstrat fără modificare; manifestul 203-initial-1 fixează metoda/workload-urile și marchează bugetele gameplay/capacitățile drept provizorii. Datele efective laptop și măsurătorile indisponibile rămân null. Gate-urile ulterioare nu sunt omise.

Verificări executate la închidere:

- `node --import ./scripts/register-typescript.mjs --test tests/harness/hardware-probe-summary.test.ts`: PASS, 7/7 teste (parser, proveniență, protocol invalid, GPU null, CLI readonly).
- `node scripts/summarize-hardware-probe.mjs Docs/Evidence/203-hardware/desktop-baseline.json`: PASS; sumarul regenerat comparat structural este identic cu desktop-summary.json, fără modificarea raportului original.
- Citirea JSON și verificarea provenienței manifestului: PASS; buildul și CPU p95 coincid cu sumarul real, approvedGate=false, laptop=null/SKIPPED_USER_WAIVER, hardwareGameplayGate=NOT_VALIDATED, bugete gameplay PROVISIONAL_UNCALIBRATED.
- `./PBI/Validate-Board.ps1 -RequireDone '203'`: PASS după mutarea fizică în Done, 235 task-uri: 206 To Do / 0 In Progress / 29 Done.203 există numai în Done.
- `./PBI/Validate-Plan.ps1`: PASS după mutare, 235 task-uri, 1013 linkuri locale verificate, 10 verificări ale dependențelor performance.

Această închidere modifică documente și manifest, fără schimbare de cod runtime; nu a fost rerulată proba hardware de 25 minute sau vreun test laptop. Rapoartele anterioare păstrează exact rezultatele și commiturile lor originale.

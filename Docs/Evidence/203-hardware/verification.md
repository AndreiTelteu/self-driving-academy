# PBI203 — verificarea uneltei, calibrare în așteptare

Proba portabilă construiește bootstrapul Babylon în producție și îl servește numai pe localhost. Scriptul PowerShell capturează hardware/OS/driver/alimentare; pagina verifică profilul și manifestul buildului, măsoară randarea cu colector oprit/pornit și exportă raportul printr-un download explicit. Hashurile identifică sursele selectate și toate artefactele emise. Rezultatul nu conține identificatori personali sau seriale.

[Identificarea desktopului](desktop-identification.json) a fost capturată local. [Smoke Chrome](desktop-smoke.json) folosește HEAD e4598f0 plus sursele203 identificate prin SHA256 în raport: WebGPU real, canvas intern/CSS1920×1080, Ryzen7950X3D/RX7900XTX. Cele două faze au câte288 cadre măsurate după încălzire scurtă; CPU p95≈0,30ms și interval p95≈7ms în ambele. Aceste valori verifică unealta, **nu sunt baseline de acceptare** (`validBaseline=false`). Timerul GPU este indisponibil în acest backend și rămâne null. Nu pretindem FPS de gameplay, memorie GPU exactă sau startup cold.

[Pierderea contextului](context-loss-check.txt) a fost provocată în Chrome prin extensia WebGL reală WEBGL_lose_context, după pornirea încălzirii. Proba a eșuat explicit, rezultatul vechi a fost eliminat, exportul dezactivat și reluarea reactivată. [Pierderea focusului](synthetic-blur-check.txt) este o injecție sintetică de eveniment blur, nu o măsurare a schimbării native de fereastră; aceeași invalidare/curățare a trecut. Nu există probe active rămase după aceste scenarii.

Review-ul independent a verificat focusul inițial/final, pierderea rendererului, identitatea pagină/manifest/hardware și clasificarea long tasks după startTime. Finalizarea cedează un task real înaintea drenării observatorului. Bufferele de cadre și long tasks au plafoane și nu trunchiază tacit rezultate valide.

Baseline-ul complet desktop a fost ulterior executat: [raport și limite](desktop-report.md). Măsurarea reală pe Lenovo Yoga7 rămâne în așteptare. Bugetele și capacitățile din [draft](../../performance-budgets.draft.json) nu sunt aprobate. PBI203 rămâne In Progress; commitul uneltei permite rularea ei pe laptop fără a închide taskul.

Verificarea izolată a uneltei din indexul Git: [check](staged-check.txt) PASS255, [build](staged-build.txt) PASS, Validate-Board și Validate-Plan PASS. Boardul păstrează203 In Progress.

Baseline complet și sumarizator:7teste dedicate PASS; integrare izolată [check](baseline-staged-check.txt) PASS262 și [build](baseline-staged-build.txt) PASS, Board/Plan PASS. Include numai schimbările203, fără implementarea038 din lucru paralel.

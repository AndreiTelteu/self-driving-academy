# WebGPU și performanță

Versiune 0.2 · 4 octombrie 2026. Parte din [planul complet](README.md). Babylon.js este engine-ul ales. Valorile de calibrare și țintele de performanță necesită verificare prin prototip.

## WebGPU și compatibilitate

WebGPU oferă randare și calcule paralele pe GPU, cu shadere WGSL. Pentru prima versiune îl folosim în primul rând pentru oraș și vehicule. Compute pentru efecte, culling sau simulare se introduce numai când măsurătorile arată un beneficiu. Învățarea statistică inițială și logica rutieră pot rula pe CPU. Acestea sunt alegeri de arhitectură. [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)

La 4 octombrie 2026, pagina de implementare documentează WebGPU în Chromium pe Windows x86/x64, macOS și ChromeOS, plus subseturi de Android și Linux; Firefox pe Windows și configurații macOS suportate; Safari 26 pe platformele Apple indicate. Detectarea la runtime și testarea pe dispozitive reale rămân necesare. [Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)

Aplicația publicată folosește HTTPS. Bootstrapul verifică suportul și inițializarea reală a engine-ului. Propunere: dacă WebGPU nu este disponibil sau inițializarea eșuează, reconstruiește scena pe WebGL 2 înainte de începerea sesiunii. Paritatea urmărită privește gameplay-ul; nivelul de efecte vizuale poate diferi.

Funcțiile de compute nu sunt acoperite automat de fallbackul rendererului. Pentru orice funcție obligatorie de gameplay bazată ulterior pe GPU, se implementează o cale CPU sau se schimbă explicit cerințele hardware. Babylon.js documentează compute shaders ca funcție exclusiv WebGPU. [Compute shaders](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/)

Pierderea dispozitivului GPU suspendă randarea, păstrează starea de simulare și încearcă reinițializarea resurselor. Dacă restaurarea nu reușește, sesiunea este salvată și se oferă reluare cu backendul disponibil. GPUDevice.lost și recrearea resurselor sunt mecanisme documentate; strategia de recuperare a sesiunii este propunerea proiectului. [GPUDevice lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)

## Bucla de simulare și performanța

Propunere inițială: fizică la 60 Hz cu pas fix; decizii de trafic la 10 Hz și reevaluare la evenimente urgente; randare cu interpolare; HUD și lista flotei la 5–10 Hz. Semaforul, comenzile și evenimentele sunt raportate în tick-uri ale simulării. Pauza oprește timpul simulat și nu lasă fizica să recupereze o pauză de browser printr-un pas foarte mare.

Indexul spațial limitează vecinii consultați de fiecare vehicul. Meshe-urile repetate folosesc instanțiere și niveluri de detaliu; coliziunile folosesc forme simplificate. Toate taxiurile rămân simulate chiar când nu sunt vizibile. Dacă se introduce ulterior simplificarea vehiculelor îndepărtate, impactul asupra indicatorilor trebuie verificat explicit.

Ținte propuse, fără rezultate măsurate: 60 FPS la 1080p pe un desktop mediu ales ca referință; cel puțin 30 FPS pe un laptop cu GPU integrat ales ca referință; 24 de taxiuri și 40 de mașini civile; analiză și publicare după o intervenție uzuală în aproximativ două secunde, fără blocarea inputului. Hardware-ul exact și durata maximă a intervenției trebuie fixate înainte de acceptarea acestor ținte.

Măsurăm separat timp CPU de fizică, decizii, UI, colectare și estimare; timp GPU și costul cadrelor; memoria; încărcarea inițială; percentilele timpului de cadru. Flotele de 20, 24 și 30 de taxiuri și densități diferite de trafic fac parte din matricea de benchmark. Nu estimăm scalarea la sute de taxiuri dintr-un test cu 24.

Experimentele automate rulează în loturi într-un worker cu anulare și progres. Un model de trafic simplificat pentru experimente rapide este etichetat separat și nu substituie măsurarea fizicii complete.

# Verificare targeted-validation-v1

Actualizare aprobată de utilizator la 8 octombrie 2026. Contractul este aplicat prospectiv la 57 de PBI-uri rămase; niciun criteriu gameplay nu este bifat și niciun PBI nu este mutat în Done. Cele patru PBI-uri deja In Progress rămân în acea coloană, cu oprirea consemnată.

## Verificări executate

- `npm run test:isolated -- --concurrency=2 tests/harness/performance.test.ts tests/harness/validation-checkpoints.test.ts`: PASS, 8/8. Include CLI-ul independent care respinge DEV ca dovadă hardware, durate/perechi incomplete, identitate schimbată, suprascrieri, goluri și hash modificat.
- `npm run typecheck`: PASS, ambele configurații.
- `node scripts/verify-architecture.mjs`: PASS, inclusiv probele negative.
- ESLint pe sursele/instrumentele/testele modificate: PASS.
- Prettier pe sursele/instrumentele/testele modificate: PASS.
- `PBI/Validate-Plan.ps1`: PASS, 235 PBI-uri, dependențe și linkuri locale valide.
- `git diff --check`: PASS.
- Vite production build pentru `tests/browser/performance-harness`, în `.pbi-validation-policy/build`: PASS, cu define `BUILD_ONLY_NOT_EVIDENCE`. Nicio pagină sau probă hardware pornită; buildul verifică numai bundlingul noului flux.

## Limite

Noile controale browser AUTO/WEBGPU/WEBGL2, preflight, lease și reluare sunt implementate și compilate, dar nu au fost executate pe GPU în această actualizare: utilizatorul a oprit probele lungi. Primul preflight real al fiecărui adaptor este obligatoriu înaintea unei măsurări hardware. Fixture-urile 026/040/052/069 din worktree-uri nu sunt migrate automat și nu sunt reconstruite aici; la reluare se refolosesc instrumentele comune prin adaptor, cu identitate nouă dacă runtime-ul măsurat se schimbă.

Rapoartele istorice, pragurile numerice și manifestul 203 nu sunt modificate. AUTO 026 păstrează dovada existentă; WEBGL2 incomplet nu devine PASS. DEV are mai puține repetări și durată mai mică, deci nu închide gate-urile full/soak. Reluarea full cere verificare independentă și revizuire hardware/termică explicită; soak-ul continuu nu folosește checkpoint-uri de perechi.

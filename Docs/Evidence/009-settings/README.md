# Verificarea PBI 009

Verificări reale executate pe 5 octombrie 2026 în workspace Windows, Node 24/npm fixate de bootstrap. Modulul pur nu necesită browser/playtest: nu implementează input live, camere sau randare.

| Comandă | Rezultat | Dovadă |
| --- | --- | --- |
| npm run check | PASS: typecheck src/teste, lint, format, architecture; 60/60 teste, dintre care 9 settings | [check.txt](check.txt) |
| npm run build | PASS: typecheck și Vite bundle | [build.txt](build.txt) |
| Validate-Board.ps1 -RequireDone '009' | PASS după mutarea fizică obligatorie | [board.txt](board.txt) |

Probe settings: UI 0–100 și FOV 60–100°, cameraMotion zero, versiuni necunoscute, chei incompatibile, unități, conflicte input, seed/populație, getter neexecutat, defensive copies/freeze, înlocuire atomică, reset independent de profil/progres, no-op, schimbare exclusiv grafică și revizie maximă. Stringul pentru controlPreferencesVersion folosește o tuplă JSON neambiguă.

Limite explicite: mappingVersion provisional-v1, defaulturi control/scenariu și resolutionScale provizorii; calibrarea203, input hardware025, UI229, aplicarea pe tick, telemetria live și persistența rămân în task-urile dedicate. Parserul de scenariu nu certifică existența unei hărți sau bugetul unei populații. Avertismentele existente npm msvs-version și Node stripTypeScriptTypes experimental sunt păstrate în loguri și nu au produs eșec.

# Self Driving Academy

Joc 3D pentru browser în care jucătorul conduce manual, iar taxiurile autonome și civilii îi adoptă stilul, inclusiv greșelile. Învățarea se face doar în LEARNING; MANUAL permite condus fără învățare. KPI-urile flotei, trei misiuni zilnice și XP urmăresc consecințele și progresul. Engine-ul ales este Babylon.js.

Proiectul se află în etapa de documentație și planificare. Implementarea jocului nu a început.

- [Planul modular](Docs/README.md): 29 de documente de produs și arhitectură.
- [Backlog Kanban](PBI/README.md): 235 task-uri cu ID-uri stabile și dependențe explicite.
- [Workflow pentru agenți](PBI/AGENTS.md): To Do → In Progress → Done, cu mutare fizică obligatorie la finalizare.
- [Catalogul parametrilor](Docs/11-catalog-parametri.md): 80 de parametri planificați; 24 pentru prima versiune.

## Verificarea boardului

Din rădăcina proiectului, în PowerShell:

```powershell
& './PBI/Validate-Board.ps1'
& './PBI/Validate-Plan.ps1'
```

Etapele planificate sunt V1 cu gameplay, flotă și învățare inițială; V2 cu întregul catalog de parametri; V3 cu mers pe jos și intrare/ieșire din mașini.

V1 include și Joacă liberă / Haos cu decor destructibil, provocări random, cameră first-person, slidere de control/stil și savefile complet cu checksum. XP nu scade prin gameplay. Cerințele și PBI-urile sunt planificate, fără implementare începută.

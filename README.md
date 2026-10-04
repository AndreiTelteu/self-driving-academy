# Self Driving Academy

Joc 3D pentru browser în care jucătorul conduce manual, iar o flotă de taxiuri autonome îi învață stilul, inclusiv greșelile. Engine-ul ales este Babylon.js.

Proiectul se află în etapa de documentație și planificare. Implementarea jocului nu a început.

- [Planul modular](Docs/README.md): 21 de documente de produs și arhitectură.
- [Backlog Kanban](PBI/README.md): 202 de task-uri, ordonate după dependențe.
- [Workflow pentru agenți](PBI/AGENTS.md): To Do → In Progress → Done, cu mutare fizică obligatorie la finalizare.
- [Catalogul parametrilor](Docs/11-catalog-parametri.md): 80 de parametri planificați; 24 pentru prima versiune.

## Verificarea boardului

Din rădăcina proiectului, în PowerShell:

```powershell
& './PBI/Validate-Board.ps1'
```

Etapele planificate sunt V1 cu gameplay, flotă și învățare inițială; V2 cu întregul catalog de parametri; V3 cu mers pe jos și intrare/ieșire din mașini.

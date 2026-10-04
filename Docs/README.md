# Documentația Self Driving Academy

Versiune 0.2 · 4 octombrie 2026. Aceste fișiere Markdown sunt planul curent al proiectului. Babylon.js este engine-ul confirmat. Gameplay-ul include condus realist, misiuni și o flotă care învață inclusiv greșelile jucătorului.

## Module

| Document | Conținut |
| --- | --- |
| [Produs și scope](01-produs-si-scope.md) | Produs și scope |
| [Arhitectură și contracte](02-arhitectura-si-contracte.md) | Arhitectură și contracte |
| [Babylon.js și integrarea engine-ului](03-babylon-engine.md) | Babylon.js și integrarea engine-ului |
| [Oraș și rețea rutieră](04-oras-si-retea-rutiera.md) | Oraș și rețea rutieră |
| [Vehicule și fizică](05-vehicule-si-fizica.md) | Vehicule și fizică |
| [Autonomie și trafic](06-autonomie-si-trafic.md) | Autonomie și trafic |
| [Flotă și curse](07-flota-si-curse.md) | Flotă și curse |
| [Interfață cameră și control](08-interfata-camera-si-control.md) | Interfață cameră și control |
| [Telemetrie și oportunități](09-telemetrie-si-oportunitati.md) | Telemetrie și oportunități |
| [Învățarea stilului](10-invatarea-stilului.md) | Învățarea stilului |
| [Catalogul parametrilor](11-catalog-parametri.md) | Catalogul parametrilor |
| [Profiluri și propagare în flotă](12-profiluri-si-propagare.md) | Profiluri și propagare în flotă |
| [Misiuni și progres](13-misiuni-si-progres.md) | Misiuni și progres |
| [Experimente și indicatori](14-experimente-si-indicatori.md) | Experimente și indicatori |
| [Salvare și import export](15-salvare-si-import-export.md) | Salvare și import export |
| [Asseturi vizual și audio](16-asseturi-vizual-si-audio.md) | Asseturi vizual și audio |
| [WebGPU și performanță](17-webgpu-si-performanta.md) | WebGPU și performanță |
| [Validare și release](18-validare-si-release.md) | Validare și release |
| [Roadmap și decizii](19-roadmap-si-decizii.md) | Roadmap și decizii |
| [Extensii și mers pe jos](20-extensii-si-mers-pe-jos.md) | Extensii și mers pe jos |
| [Acoperirea funcționalităților prin PBI](21-acoperire-functionalitati.md) | Acoperirea funcționalităților prin PBI |

## Implementare și Kanban

[Backlogul PBI](../PBI/README.md) conține 202 task-uri numerotate 001–202, în ordine de dependențe: 162 pentru V1, 28 pentru V2 și 12 pentru V3. Toate sunt inițial în To Do. [Regulile pentru agenți](../PBI/AGENTS.md) cer mutarea efectivă To Do → In Progress → Done și verificarea finală obligatorie.

[Catalogul JSON](driving-parameters.json) conține 80 de parametri propuși. [Matricea de acoperire](21-acoperire-functionalitati.md) leagă fiecare parametru de politică, estimare și gate de validare. V1 țintește 24; V2 extinde la 80; V3 adaugă mersul pe jos.

## Stare și istoric

Jocul nu este implementat în această etapă. Valorile de calibrare, hardware-ul și performanța sunt ținte de verificat. Task-urile nu sunt executate prin simpla creare a planului.

[Planul inițial v0.1](Archive/GAME_DESIGN-v0.1.md) este păstrat pentru istoric. Page-ul creat anterior este tot o referință v0.1; nu este sincronizat automat cu documentele Markdown. Modificările viitoare de plan se fac în aceste module și în PBI-urile aferente.

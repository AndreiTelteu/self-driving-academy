# Protocol de playtest timpuriu 204

Protocolul nu a fost executat. Directorul `Docs/Evidence/204-early-learning-demo/playtest/` rămâne gol până la colectarea a cinci sesiuni reale.

## Pregătire și sesiune

1. Rulați serverul local al proiectului și deschideți pagina `tests/browser/early-learning-playtest.html` într-o fereastră incognito. Fiecare participant primește un slot anonim unic între 1 și 5; nu introduceți nume sau date de contact.
2. Începeți cronometrul la apăsarea „Începe sesiunea”. Participantul folosește demo-ul timp de maximum cinci minute active și încearcă să ofere observații potrivite pentru viteză urbană, accelerație și STOP. Nu sugerați rezultatele așteptate.
3. Pagina arată numai schimbări produse de datele sesiunii, plus ce a rămas neobservat. Nu marcați un efect dacă aplicația nu a raportat unul. Înregistrați timpul primei schimbări sau `null` dacă nu apare în cinci minute.
4. La final, întrebați dacă participantul a observat schimbarea, dacă distinge MANUAL de LEARNING și ce observație a susținut delta. Participantul completează formularul fără răspunsuri preselectate.
5. Exportați JSON-ul și salvați-l ca `participant-1.json` … `participant-5.json` în directorul de evidence. Verificați consimțământul și eliminați orice text accidental identificabil. Nu înlocuiți sesiuni lipsă cu rezultate sintetice.

## Criteriu și raportare

Sunt necesare cinci înregistrări reale, fiecare cu slot, timestamp de început/sfârșit, timpul primei schimbări și răspunsurile. Raportați câți dintre cei cinci au distins modurile și dacă minimum patru au recunoscut o schimbare în două variante și au indicat o observație justificativă. Eșecul țintei se raportează ca atare. JSON-ul de export este auto-conținut și pagina nu folosește `localStorage`, astfel că sesiunile incognito nu depind de stocare comună.

Die Anwendung wurde unter Zuhilfenahme von Bolt.new und RooCline/RooCode erstellt und läuft in Kombination mit LM studio und Qwen 2.5 VL 7B. 
Sie besteht aus folgenden Hauptkomponenten:

Frontend (React + TypeScript + Vite):
App.tsx: Die Hauptkomponente mit der Benutzeroberfläche
Zwei Tabs: "Analyse & Historie" und "Bestätigte Bilder"
Ordnerauswahl für Bildanalyse
Anzeige von Bildern mit Schlagworten
Funktionen zum Bestätigen, Neu-Analysieren und Löschen von Bildern
Backend (Express.js):
server.js: REST-API Server auf Port 3004
Verwaltet Bilder in einer SQLite-Datenbank
Speichert Bilder im 'public/images' Ordner
Bietet Endpunkte für CRUD-Operationen
Erkennt Duplikate mittels Hash-Vergleich
Datenbank (SQLite):
images.db: Speichert Bildinformationen
Dateiname, Schlagworte, Status (temporär/bestätigt)
Quellordner und Zeitstempel
Hash für Duplikatserkennung
KI-Integration:
lmStudio.ts: Verbindung zu einem lokalen LM Studio Server
Analysiert Bilder mit dem qwen2-vl-7b-instruct Modell
Generiert 15 deutsche Schlagworte pro Bild
Fokus auf konkrete, sichtbare Objekte
Workflow:

Benutzer wählt einen Ordner mit Bildern
Jedes Bild wird:
In public/images gespeichert
Durch KI analysiert
In der Datenbank gespeichert
Benutzer kann:
Schlagworte überprüfen und bestätigen
Bilder neu analysieren lassen
Bilder löschen
Zwischen temporären und bestätigten Bildern wechseln

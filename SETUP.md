# GatterPLUS – Setup & Starten

## Live-Version (kein Install nötig)

**https://markheimlich.github.io/ProjektInformatikLK/**

---

## Voraussetzungen

Node.js (Version 18 oder neuer) muss installiert sein.  
Download: https://nodejs.org

Prüfen ob Node.js vorhanden ist:
```bash
node --version
npm --version
```

---

## Schritt 1 – Repository klonen

```bash
git clone https://github.com/markheimlich/ProjektInformatikLK.git
cd ProjektInformatikLK
```

---

## Schritt 2 – In den Projektordner wechseln

```bash
cd gatter-plus
```

---

## Schritt 3 – Abhängigkeiten installieren

```bash
npm install
```

> Dieser Schritt lädt alle benötigten Pakete (Angular, TypeScript usw.) herunter.  
> Dauert beim ersten Mal ca. 1–2 Minuten.

---

## Schritt 4 – Website lokal starten

```bash
npm start
```

Danach im Browser öffnen:  
**http://localhost:4200**

---

## Alle Schritte auf einmal (Copy & Paste)

```bash
git clone https://github.com/markheimlich/ProjektInformatikLK.git
cd ProjektInformatikLK/gatter-plus
npm install
npm start
```

---

## Hinweise

- `npm start` läuft dauerhaft im Terminal. Die Seite aktualisiert sich automatisch bei Code-Änderungen.
- Zum Beenden: `Strg + C` im Terminal drücken.
- Falls Port 4200 bereits belegt ist: `npm start -- --port 4201`

---

## Live-Version aktualisieren (nach Code-Änderungen)

```bash
cd gatter-plus
npm run deploy
```

Dieser Befehl baut die App neu und pusht sie automatisch auf GitHub Pages.

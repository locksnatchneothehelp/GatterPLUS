# GatterPLUS – Startanleitung & Technologien

## Lokale Ausführung

### Voraussetzungen
- Node.js (Version 18 oder höher)
- npm (wird mit Node.js installiert)

### Installation (einmalig)
```bash
cd gatter-plus
npm install
```

### Starten des Entwicklungsservers
```bash
cd gatter-plus
npm start
```

Die Anwendung ist dann unter folgender Adresse erreichbar:

```
http://localhost:4200
```

Der Server erkennt Dateiänderungen automatisch und lädt die Seite neu (Hot Reload).

---

## Verwendete Technologien & Bibliotheken

### Kernsprachen
| Technologie | Version | Verwendung |
|---|---|---|
| TypeScript | ~5.8.0 | Programmiersprache (typsicher, kompiliert zu JS) |
| HTML5 | – | Templatestruktur der Komponenten |
| SCSS | – | Styling (erweiterte CSS-Syntax) |

### Frameworks & Libraries
| Bibliothek | Version | Verwendung |
|---|---|---|
| Angular | ^21.2.0 | Frontend-Framework (Komponenten, Routing, DI) |
| @angular/cdk | ^21.x | Angular Component Dev Kit (Drag-and-Drop Utilities) |
| RxJS | ~7.8.0 | Reaktive Programmierung (von Angular verwendet) |

### Build-Tools
| Tool | Verwendung |
|---|---|
| Angular CLI (`@angular/cli`) | Projekterstellung, Komponenten-Generator, Dev-Server |
| Vite / esbuild | Schnelles Build-System (intern von `@angular/build` verwendet) |
| Node.js | Laufzeitumgebung für den Entwicklungsserver |

### Wichtige Angular-Konzepte in diesem Projekt
- **Standalone Components**: Jede Komponente ist eigenständig ohne NgModule
- **Control Flow (`@for`, `@if`)**: Neue Angular 17+ Template-Syntax
- **`@HostListener`**: Globale DOM-Event-Listener direkt in der Komponente
- **`@ViewChild`**: Direkter Zugriff auf DOM-Elemente aus TypeScript
- **HTML5 Drag-and-Drop API**: Natives Browser-API für das Ziehen der Gatter

---

## Vor- und Nachteile der gewählten Technologien

### Angular

**Vorteile:**
- Klar strukturiertes Komponentenmodell (trennt HTML, TypeScript, CSS strikt)
- TypeScript-first: Typsicherheit verhindert viele Laufzeitfehler
- Umfangreiche Built-in-Tools (CLI, Change Detection, DI)
- Gut skalierbar für große Projekte

**Nachteile:**
- Steile Lernkurve für Einsteiger (viele Konzepte: Decorators, DI, Modules)
- Für kleinere Projekte manchmal überdimensioniert
- Größeres Bundle als React oder Vue

### SCSS statt Plain CSS

**Vorteile:**
- Variablen, Nesting, Mixins (weniger Wiederholung)
- Bessere Strukturierung großer Stylesheets

**Nachteile:**
- Zusätzlicher Kompilierungsschritt (wird von Angular automatisch übernommen)
- Erfordert Kenntnis der SCSS-Syntax

### HTML5 Drag-and-Drop API (kein CDK DragDrop)

**Vorteile:**
- Kein zusätzlicher Overhead durch CDK
- Natives Browser-Verhalten (Drag-Vorschau automatisch)
- Einfacher zu verstehen für Einsteiger

**Nachteile:**
- Weniger Kontrolle über das Drag-Feedback (z.B. Ghost-Image)
- Mobile-Geräte unterstützen kein HTML5 DnD nativ
- Komplexere Szenarien (z.B. Sortierung) schwieriger umzusetzen als mit CDK

### @angular/cdk (installiert, noch nicht aktiv genutzt)

**Vorteile:**
- Vorgefertigte, barrierefreie Interaktionen
- Gute Mobile-Unterstützung
- Einfaches Drag-and-Drop innerhalb von Listen

**Nachteile:**
- Mehr Bundle-Größe
- API komplexer als natives HTML5 DnD

# GatterPLUS – Projektanalyse

- **Stand:** 2026-09-28 · Analysestand Git-Commit `fcb0ec4` (+ Phase 5, 6A, 6B, negierte Eingänge, 6C, Import-Layout, UI-Feinschliff `972aa5b`, Phase 7 Raster + manuelles Verlegen `9db8438`, weiches Einrasten `ce1baee`)
- Bei Abweichungen zwischen dieser Datei und dem Code gilt der Code; Datei danach aktualisieren.
- Pfade relativ zu `gatter-plus/src/app/`, sofern nicht anders angegeben.

## Schnellüberblick

- **Zweck:** Browser-basierter Logikschaltungs-Simulator (Lernwerkzeug, Stil LogikSim): Bauteile aus Palette ziehen, verdrahten, simulieren.
- **Stack:** Angular 21 (Standalone-Komponenten, `@Input`/`@Output`, `@if`/`@for`), TypeScript ~5.9 strict, SCSS, Vitest 4, jsdom. Kein Router, kein Store, kein Backend.
- **App-Verzeichnis:** `gatter-plus/` (Repo-Root enthält nur `README.md`, `SETUP.md`, `LICENSE`, `docs/`, `CLAUDE.md`, `.github/workflows/`).
- **Einstiege:** `gatter-plus/src/main.ts` → `app.ts` (Root, Layout + Event-Weiterleitung) → `components/whiteboard/whiteboard.ts` (**gesamter Editor-Zustand + Interaktion**).
- **Kernlogik ohne Angular:** `models/gate.model.ts` (Typen, Geometrie, Routing), `services/simulation.service.ts` (Simulation).
- **Deployment:** GitHub Pages automatisch per GitHub Actions bei Push auf `main` (`.github/workflows/main.yml`); zusätzlich Alt-Weg `npm run deploy` (s. Fallstricke).

## Wo finde ich was

| Thema | Pfad |
|---|---|
| Bauteil-/Leitungs-Typen, Pin-Geometrie, Rotation, Leitungsrouting | `models/gate.model.ts` |
| Zentraler State (gates/wires), Maus/Tastatur, Undo-Aufrufe, Copy/Paste, Taktgeber | `components/whiteboard/whiteboard.ts` + `.html` |
| Projektdatei-Format (`.gatterplus.json`, serialize/parse, ohne Laufzeit-Zustand) | `models/project-file.ts` |
| LogikSim-Import (`.sim` → Projekt; Binärformat, Netz-Rekonstruktion, negierte Eingänge → `negatedInputs`; Layout wie im Original: Schalter/LED-Drehung aus der Leitung, Pins auf LogikSim-Punkten (`UNIT_PX = GRID` → Pins auf dem Raster, so kompakt wie im Original; überlappende Schalter/Anzeigen werden quer zur Leitung auseinandergerückt, Textfelder verschoben; App zeigt danach `zoomToFit(0.9)`), Linien → `manualPoints`, weitere Ziele als Abzweig mit Verbindungspunkt) | `models/logiksim-file.ts`, Testdateien `models/fixtures/*.sim` |
| Automatische Leitungsführung (A*) – **toter Code seit Phase 7** | `models/wire-router.ts` (+spec), Cache in `Whiteboard.autoRoutes` (nicht mehr aufgerufen) |
| PNG-Export (Bounding-Box, ohne Raster; SVG-Styles werden für `html-to-image` kurz inline gesetzt) | `Whiteboard.exportPng`, `App.onExportPng` |
| Simulation (Signalberechnung, JK-FF) | `services/simulation.service.ts` |
| Undo/Redo-Stacks | `services/history.service.ts` |
| Hell/Dunkel | `services/theme.service.ts`, `gatter-plus/src/styles.scss` |
| Drag aus Palette → Whiteboard | `services/drag-state.service.ts` |
| Palette + Werkzeug Pan/Wire + Simulations-Button | `components/toolbar-top/` |
| App-Icon (Favicon + Toolbar links neben dem Namen) | `gatter-plus/public/icon.svg`; `public/favicon.ico` (16/32/48 px) daraus gerendert – bei Änderungen am SVG neu erzeugen |
| Eigene Cursor (Bernstein-Stil, 28 px SVG) | `gatter-plus/src/cursors/*.svg` (in `src/`, damit Angular sie bündelt – funktioniert mit jedem base-href); Variablen `--cursor-*` in `styles.scss`, überall `cursor: var(--cursor-…)` statt System-Namen; Zeichenfläche: `Whiteboard.hoverCursor` → Klassen `over-gate`/`over-stub`/`over-switch` |
| Menü Datei/Bearbeiten/Hilfe + Theme-Toggle | `components/menu-bar/` |
| Willkommensbildschirm beim Start (Kacheln, „Beispiel öffnen“ → `App.onWelcomeExample`, „LogikSim importieren“, erscheint bei jedem Start, erneut über Hilfe → Willkommensbildschirm; Esc/„Los geht's“; S gesperrt solange offen; Projekt-Nennung als Fußzeile) | `components/welcome-dialog/`; Beispielschaltung Flip-Flop `models/example-circuit.ts` (+spec: rechnet richtig, keine Überdeckungen) |
| Eigenschaften (Rotation, Farbe, Eingänge, Takt, Label, Löschen) | `components/properties-panel/` |
| Darstellung einzelner Bauteile | `components/gates/*`, `components/io/*` |
| Root-Layout, Verdrahtung der Komponenten | `app.ts`, `app.html` |
| `ToolMode`-Typ (Komponente selbst ungenutzt) | `components/toolbar-left/toolbar-left.ts` |
| Tests | `models/gate.model.spec.ts`, `models/project-file.spec.ts`, `models/logiksim-file.spec.ts`, `models/wire-router.spec.ts`, `services/simulation.service.spec.ts`, `services/history.service.spec.ts`, `services/theme.service.spec.ts`, `app.spec.ts` |
| Build/Test-Konfiguration | `gatter-plus/angular.json`, `package.json`, `vitest.config.ts`, `tsconfig*.json` |
| CI/Deployment (GitHub Pages) | `.github/workflows/main.yml` (Repo-Root) |

## Projektstruktur

```
gatter-plus/src/
  main.ts, index.html, styles.scss (Theme-Variablen)
  app/
    app.ts|html|scss|config.ts|spec.ts
    models/gate.model.ts (+spec)
    services/ simulation, history (+spec), theme (+spec), drag-state
    components/
      whiteboard/  menu-bar/  toolbar-top/  toolbar-left/ (nicht gerendert)  properties-panel/
      gates/ and-gate, or-gate, not-gate, xor-gate, jk-flipflop, half-adder, full-adder
      io/    input-switch, output-led, clock-gen, text-label
```

- Jede Komponente: Ordner mit `name.ts` / `name.html` / `name.scss` (Angular-21-Namensschema ohne `.component`), Klasse ohne Suffix (`AndGate`, `Whiteboard`).
- Abhängigkeiten: Angular core/common/forms/cdk (cdk installiert, **nicht genutzt**), rxjs (nicht direkt genutzt), `html-to-image` 1.11.13 (PNG-Export, exakt gepinnt).

## Datenmodell (`models/gate.model.ts`)

```ts
type GateType = 'and'|'or'|'not'|'xor'|'jk-ff'|'half-adder'|'full-adder'
              |'input'|'output'|'clock-gen'|'text-label';
type Rotation  = 0|90|180|270;                      // im Uhrzeigersinn
type GateColor = 'default'|'yellow'|'orange'|'red'|'blue'|'violet'|'green'; // green: nur Altdateien, nicht im Panel

interface GateInstance {
  id: string;            // 'gate-N'
  type: GateType;
  x: number; y: number;  // linke obere Ecke (logische px)
  rotation: Rotation;
  color: GateColor;
  inputCount: number;    // and/or/xor: 2–8; sonst 1 (ohne Bedeutung)
  inputValue?: boolean;  // input/clock-gen: Ausgangswert
  ffState?: boolean;     // jk-ff: Q
  ffPrevClock?: boolean; // jk-ff: letzter Takt (Flankenerkennung)
  label?: string;        // Beschriftung (alle Typen; text-label: Inhalt)
  clockPeriodMs?: number;// clock-gen, Default 1000
  negatedOutputs?: number[]; // invertierte Ausgangs-Pin-Indizes
  negatedInputs?: number[];  // invertierte Eingangs-Pin-Indizes (Phase 6, Kreis wie LogikSim)
}

interface WireConnection {
  id: string;            // 'wire-N'
  fromGateId: string; fromPinIndex: number;  // immer Ausgangs-Pin
  toGateId: string;   toPinIndex: number;    // immer Eingangs-Pin
  points: {x,y}[];       // Wegpunkte (werden beim Rendern NEU berechnet, s. Fallstricke)
  branchPoint?: {x,y};   // nur Darstellung: Abzweig-Start auf bestehender Leitung
  manualPoints?: {x,y}[];// eigene Knickpunkte (Phase 6B); gesetzt → Verlauf via manualWirePath statt automatisch
  fromDir?: PinDirection;// Austrittsrichtung am branchPoint
}
```

**Bauteiltypen und Pins** (Pin-Reihenfolge = Index; Größen in `GATE_BASE_SIZE`, Pins in `getGatePinOffsets()`):

| Typ | Größe w×h | Eingänge | Ausgänge | Zustand |
|---|---|---|---|---|
| `and`/`or`/`xor` | 72×(Plätze·24): n=2,3 → 72; 4,5 → 120; 8 → 216 | n = `inputCount` (2–8) | 1 | – |
| `not` | 72×48 | 1 | 1 | – |
| `jk-ff` | 96×120 | 0=S, 1=J, 2=C, 3=K, 4=R | 0=Q, 1=Q̄ | `ffState`, `ffPrevClock` |
| `half-adder` | 72×48 | A, B | S, C | – |
| `full-adder` | 96×72 | A, B, Cin | S, Cout | – |
| `input` | 72×48 | – | 1 | `inputValue` |
| `output` | 72×48 | 1 | – | – |
| `clock-gen` | 72×48 | – | 1 | `inputValue`, `clockPeriodMs` |
| `text-label` | Breite `textLabelWidth(label)` (mind. 72, wächst mit dem Text, Rastervielfaches; Mitte bleibt bei Textänderung in `updateGate`) × 24 | – | – | `label` |

- **Raster (Phase 7):** `GRID = 24`. Pins eines Bauteils liegen untereinander auf Vielfachen von `GRID` (Pin in der Mitte einer 24-px-Zeile, Breiten 72/96) → nach jeder Drehung auf dem Raster, sobald ein Pin darauf liegt. and/or/xor: `getInputSlots(n)` – bei gerader Anzahl bleibt der Mittelplatz frei, Ausgang auf der Spiegelachse. `snapGateToGrid(gate)` verschiebt minimal, sodass der erste Pin (ohne Pins: die Mitte) auf dem Raster liegt. Aufrufer: `placeGate`, Drag: `onMouseMove` → `applyGateDrag` folgt frei, beim Loslassen gleitet `snapDraggedGates` in 120 ms auf das Raster (Gruppe mit demselben Delta), dann `finishGateDrag` (Ablegeschutz, feste Punkte runden), `updateGate` (bei `rotation`/`inputCount`), LogikSim-Import (Textfelder); `pasteClipboard` versetzt um `GRID`.
- Pin-Offsets sind **manuell an das CSS-Layout** der Bauteil-Templates angeglichen (feste 24-px-Zeilen `.slot`/`.pin-row`, siehe `getGatePinOffsets`). Wer Bauteil-CSS ändert, muss die Offsets anpassen; Test `snapGateToGrid` in `gate.model.spec.ts` prüft Rasterlage und Spiegelsymmetrie.
- `createGateInstance(id, type, x, y)` liefert Defaults: rotation 0, color default, inputCount 2 (and/or/xor) sonst 1, inputValue/ffState false, clockPeriodMs 1000, label 'Label' nur bei text-label.
- Geometrie-Helfer: `getGateDimensions`, `getPinWorldPos` (mit Rotation, Vorzeichen −), `getPinDirection`, `isPointInGate` (inverse Rotation, Vorzeichen +), `computeOrthogonalWaypoints`, `PIN_HIT_RADIUS = 12`.
- `GATE_PIN_OFFSETS`: Legacy, ungenutzt.

**IDs:** `Whiteboard.gateIdCounter` / `wireIdCounter` (private, starten bei 0, nur hochgezählt: `gate-${++counter}`). Vergabe in `placeGate`, `pasteClipboard`, `handleWireClick`. Zähler werden bei Undo/Redo nicht zurückgesetzt (IDs bleiben eindeutig).

## Zentraler Zustand und Update-Pattern

- **Ort:** `Whiteboard` (`gates: GateInstance[]`, `wires: WireConnection[]`), dazu Auswahl (`selectedGateId`, `selectedGateIds: Set`, `selectedWireId`), Pan/Zoom (`panX`, `panY`, `zoom` 0.1–5), `toolMode`, `simulationMode`, `signalStates: Map`, `clockIntervals: Map`, `clipboard`.
- **Pattern:** Arrays werden immer ersetzt (`this.gates = this.gates.map(g => g.id !== id ? g : {...g, ...changes})`, `[...this.wires, w]`, `filter`). Kein Signals/RxJS-Store. **Zoneless** (kein zone.js, Angular-21-Standard): CD läuft nur nach Template-Events/`markForCheck()` – Zustandsänderungen nach `await`/Timern brauchen `cdr.markForCheck()` (s. `loadProject`).
- **Undo:** Vor jeder verändernden Aktion `this.pushHistory()` → `HistoryService.push(gates, wires)` (flache Kopien der Gates, tiefe Kopie der Wire-Punkte; leert Redo; max. 50). `undo()`/`redo()` tauschen Snapshots, heben die Auswahl auf, starten Takte neu.
- Zentrale Mutationsmethoden: `updateGate(changes)`, `deleteGate`, `deleteWire`, `placeGate`, `toggleNegation`, `pasteClipboard`, `handleWireClick`, Drag in `onMouseMove` (pushHistory einmalig nach > 4 px Bewegung).
- Nach Mutation im Simulationsmodus: `if (this.simulationMode) this.recomputeSimulation();`.
- **Ausnahme:** `SimulationService.computeSignals` **mutiert** `gate.ffState`/`gate.ffPrevClock` direkt.

## Darstellung / Rendering (`whiteboard.html`)

Ebenen (unten → oben) im `#viewport`-Div (empfängt `mousedown`/`dblclick`; `mousemove`/`mouseup`/Tasten via `@HostListener('document:…')`):
1. `grid-svg`: SVG-`<pattern>` Punktraster (24 px · zoom); Kachel um den Kreis-Versatz (2 px · zoom) verschoben, damit die Punkte genau auf Vielfachen von `GRID` liegen.
2. `gates-layer`: HTML-Divs `.placed-gate` (absolute left/top, `transform: rotate()`, Farbe per CSS-Variable `--gate-fill` aus `getGateFill`: Bauteil-SCSS nutzen `background: var(--gate-fill, <Standard>)` am Körper; Standard Gatter goldgelb `#f5b342`, I/O eigene Optik; im Strommodus Gatter grau `#f1f5f9`, HIGH-Regeln der Bauteile färben grün; Farbwerte = Farbfelder in `properties-panel.scss`) mit `@if (gate.type === …)` → Bauteil-Komponente. Transform `translate(pan) scale(zoom)`.
3. `wires-layer`: SVG-`<polyline>` pro Leitung (`getWirePointsString`), Vorschau `wire-tentative`, Verbindungsquadrate (7×7, `getWireJunctions`: an Abzweigen und dort, wo sich Fan-out-Leitungen trennen – `pathDivergence`), Negations-Kreise (r=6).
3b. `wire-stubs-layer` (z-index 2, über den Bauteilen): die Anschluss-Stummel **aller** Pins als SVG (`getGateStubs`, 12 px bzw. NOT 8 px; Farbe nach Signal/Leitung, ausgewählt blau). Die CSS-Stummel `.wire` der Bauteile sind auf dem Whiteboard ausgeblendet (`.placed-gate ::ng-deep .wire`), weil HTML und SVG je nach Anzeigeskalierung verschieden auf Pixel runden (Stummel lag sonst neben der Leitung); in der Palette bleiben sie.
4. `pins-layer` (nur `toolMode==='wire'`): Pin-Dots.
5. Zoom-Anzeige + Minimap (SVG) + Button „Alles anzeigen“ (`zoomToFit`: Schaltung füllt 60 % der Fläche, max. 200 %; Bounding-Box aus `getContentBounds`, die auch `exportPng` nutzt).

- Bauteil-Komponenten sind rein darstellend: Inputs `toolbarMode` (Palettenansicht), `signalOutput*`/`signalInput`, `inputCount`, `value`, `label`. Symbole nach DIN 40900 (`&`, `≥1`, `=1` …).
- **Theme:** `ThemeService` setzt nur `data-theme="light|dark"` an `<html>`, persistiert in `localStorage['gatterplus-theme']`, geladen in `App.ngOnInit`. Farben als CSS-Variablen in `styles.scss` (`:root` / `:root[data-theme="dark"]`). Neues Theme = neuer Block + `ThemeName` erweitern.
- Bauteil-SCSS nutzt teils feste Farben (z. B. `#f1f5f9`, `#f5b342` als Fallback). Das dunkle Design überschreibt sie zentral in `styles.scss` (Block `html:root[data-theme="dark"]` – „html“ nötig, sonst sind die gekapselten Komponenten-Stile gleich spezifisch und gewinnen): dunkle IN/OUT/Textfeld/Taktgeber, Simulationszustände, Farbkreis „Standard“. Gatter im Strommodus über `--sim-gate-fill` (`getGateFill`). Fehlermeldungen über `--error-*`.

## UI-Muster für neue Bedienelemente

Datenfluss: **Kind-Komponente `@Output` → `App` (app.html-Binding) → `this.whiteboardRef.methode()`** (`@ViewChild(Whiteboard)`). Zustand zurück per Getter in `App` (`canUndo`, `selectedGate` …) → `@Input` der Kind-Komponente.

Beispiel Menüeintrag (analog Undo):
1. `menu-bar.ts`: `@Output() xClicked = new EventEmitter<void>();` + Handler `onX(){ this.xClicked.emit(); this.closeMenu(); }`.
2. `menu-bar.html`: `<button class="dropdown-item" (click)="onX()">…</button>` im passenden `@if (openMenu === …)`-Block.
3. `app.html`: `(xClicked)="onX()"`; `app.ts`: `onX(): void { this.whiteboardRef.x(); }`.
4. Logik in `Whiteboard` (mit `pushHistory()`, falls verändernd).

- Palette: `toolbar-top.html` `.palette-item` mit `(mousedown)="onGateMouseDown($event, 'typ')"` → `DragStateService.startDrag` → `Whiteboard.onMouseUp` → `placeGate`. Bei `simulationMode` ausgegraut; Klick emittiert `placeBlocked` → App ruft `whiteboardRef.showError(…)`.
- Properties: `GatePropertyChange` (`properties-panel.ts`) → `gateChange` → `App.onGateChange` → `Whiteboard.updateGate`.
- Datei-Menü: `Öffnen`/`Speichern`/`Speichern unter` → `openClicked`/`saveClicked`/`saveAsClicked` → `App.onOpen`/`onSave`/`onSaveAs` (`App.fileHandle` = zuletzt geöffnete/exportierte Datei, „Speichern“ schreibt ohne Dialog dorthin; Datei-Dialoge per File System Access API, Fallback Download bzw. `<input type="file">`; Fehler per `alert`) → `Whiteboard.loadProject`/`getProjectData`. `Importieren (LogikSim)` → `importLogikSimClicked` → `App.onImportLogikSim`. `Neu` → `newClicked` → `App.onNew` (`confirm`, dann `loadProject` mit leerem Projekt, `fileHandle = null`, per Undo rückgängig). Hilfe „Steuerung & Tastenkürzel“ (`onHelp`, Fenster `helpOpen` in `menu-bar.html`; Esc/✕/Klick daneben schließt) – bei neuen Kürzeln dort nachtragen. „Über“ (`onAbout`) ist **Platzhalter** (`console.log`).
- **Neuer Bauteiltyp** berührt: `GateType`, `GATE_BASE_SIZE`, `getGatePinOffsets`, ggf. `createGateInstance` (model); `computeGateOutput` (+ ggf. `isSource`) (simulation); neue Komponente unter `components/gates|io/`; `imports` + `@if`-Block in `whiteboard.ts/html`; Palette in `toolbar-top.ts/html`; `getTypeName`/`getGateDescription`/`getCurrentStateDescription` (properties-panel).

## Verbindungsregeln und Simulation

**Verbindungen** (`Whiteboard.handleWireClick`, nur im Werkzeug `wire`; Klick-Klick, kein Ziehen):
- Start (Phase 6A): Ausgangs-Pin – auch belegt (**Fan-out**, `getOutputPinMaxConnections` = `Infinity`, Verbindungspunkt am Pin) – **oder** Klick auf beliebige Stelle einer Leitung → Abzweig (`branchPoint`, elektrisch gleiche Quelle); Klick auf den Ausgangs-Stummel (20 px) startet am Ausgang selbst. **Oder umgekehrt:** Start an freiem Eingang (`WireDrawingState.reverse`), Ende an Ausgang oder auf einer Leitung (Abzweig, Richtung zum Ziel). Anlegen zentral in `addWire()` (speichert den kompletten Verlauf `drawnWirePath` als `manualPoints`). **Verlegen (Phase 7, Shapez-Stil):** vom letzten festen Punkt folgt ein L-Stück der gerasterten Maus (`pendingDrawingPoints`, `lCorner`; erstes Stück in Pin-Richtung, dann quer zum vorigen); **F** = Knickreihenfolge umdrehen, **C**/Klick auf freie Fläche = Ecke + Punkt festlegen (`bends`, `bendGroups`), **Backspace**/**Strg+Z** = zurücknehmen, Escape bricht ab; Vorschau über gültigem Ziel = endgültiger Verlauf (`drawingTargetPin`); Tastenhilfe `.wire-draw-hint`. C/F werden in `onKeyboardShortcut` verteilt (**nur ein** `@HostListener('document:keydown')` pro Klasse, ein zweiter überschreibt den ersten). Feste Punkte wandern beim Verschieben nur mit, wenn beide Enden bewegt werden. **Bearbeiten (Phase 7):** ausgewählte Leitung zeigt Griffe (`getSelectedWireHandles`, `.wire-handle`): ziehen (`handleDrag`, Nachbarstücke folgen), Doppelklick = entfernen, Doppelklick auf Leitung = einfügen; `replaceWirePoints` setzt Abzweige mit. „Verlauf automatisch“ im Eigenschaften-Panel (`resetWireRoute`) entfernt die festen Punkte (→ Z-Form). Hover-Hervorhebung `hoverWireId` im Leitungs-Modus.
- Ende (normal gezogen): nur Eingangs-Pin eines **anderen** Bauteils, Eingang darf **nicht belegt** sein (max. 1 Leitung pro Eingang). Sonst Abbruch ohne Leitung. Escape bricht ab.
- Routing (Phase 6C, **seit Phase 7 toter Code** – `getWireDisplayPoints` nutzt nur `manualPoints` bzw. `computeOrthogonalWaypoints`, `branchStart` = gespeicherter `branchPoint`): `models/wire-router.ts` `routeWire` = A* über Sichtbarkeitsgitter (Bauteile + 12 px Abstand als Hindernisse, Knick- und Fremd-Überlappungs-Kosten, gleiches Signal darf teilen; **Ausweichspuren**: zusätzliche Gitterlinien im Abstand `LANE` = 10 px neben fremden Leitungen im Umkreis `LANE_MARGIN` = 200 px). Die festen Pin-Stücke (`ROUTE_EXIT` = 20 px) aller Ein-/Ausgänge gibt `autoRoutes` vorab als belegt mit (eigene Liste `pinStubs`, nicht für die Abzweig-Projektion). `Whiteboard.autoRoutes()` cacht alle Verläufe (gleiche Array-Referenzen oder Layout-Signatur), Reihenfolge: eigene Knicke → direkte → Abzweige (auf aktuellen Signal-Verlauf projiziert, `branchStart`). Während Bauteil-Drag `fastRouting` = Alt-Router `computeOrthogonalWaypoints` (Z-/U-Form), ebenso als Rückfall ohne Weg.
- Negation: Im Pan-Modus (nicht Simulation) Klick auf den Stummel zwischen Pin und Gehäuse (`findStubAt(…, inward = true)`, 12 px bzw. NOT 8 px, geprüft **vor** der Bauteil-Auswahl) → `toggleNegation(id, pin, kind)` (`negatedOutputs`/`negatedInputs`); zusätzlich Buttons „Verneinung“ im Eigenschaften-Panel (Pin-Namen, über `gateChange` → `updateGate`). Kreise (r = 6) via `getNegationDots` direkt am Gehäuse in der Stummel-Ebene (Farbe = Signal auf der Leitung am Kreis).
- Löschen eines Bauteils entfernt alle anhängenden Leitungen.
- **Nicht aufeinander ablegen:** `gatesOverlap`/`getGateBounds` (model). Ziehen: landet ein bewegtes Bauteil auf einem anderen, stellt `onMouseUp` den Zustand von vor dem Ziehen her (`historyService.pop()`), sonst werden die festen Punkte angehängter Leitungen auf den bereinigten Verlauf gesetzt (`removeBacktracks` in `manualWirePath` entfernt Rückläufer/Sporne). `placeGate` lehnt belegte Stellen ab, `pasteClipboard` sucht in Rasterschritten eine freie Stelle. Meldung: `showError` → rote `.wire-draw-error` an der Stelle der Tastenhilfe (2,5 s).
- **Neu laden/Schließen:** `App.onBeforeUnload` fragt per Browser-Standarddialog nach, sobald Bauteile auf dem Whiteboard liegen.
- **Tasten:** S = Simulation (App `onKeyDown`), Esc im Kabelmodus ohne laufende Leitung → Verschieben (Whiteboard `toolModeChange` → App `activeTool`).

**Simulation** (`SimulationService.computeSignals(gates, wires) → Map<id, {inputSignals, outputSignals}>`; Werte `true|false|null`):
1. Ausgänge initialisieren: Quellen (`input`, `clock-gen`) aus `inputValue`, JK-FF aus `ffState`, übrige aus `prevOutputs` (Rückkopplungsstart).
2. `settle`: wiederholt Leitungen propagieren + kombinatorische Gatter berechnen bis stabil (max. 200 Iterationen; Oszillatoren brechen ab).
3. JK-FF fortschreiben (`nextFlipFlopState`): S=1 → Q=1 (Vorrang), R=1 → Q=0 (asynchron, pegelaktiv); steigende Flanke an C: J/K = setzen/rücksetzen/toggeln; offene Pins = LOW.
4. Bei FF-Änderung erneut `settle`.
- `null`-Semantik: AND → false, sobald ein Eingang false; OR → true, sobald einer true; sonst null bei unverbundenem Eingang.
- Negation wird auf Ausgänge angewandt (auch bei Quellen und JK-FF); negierte Eingänge invertiert `propagate` beim Übertragen (`inputSignals` = Rechenwert, offener Eingang bleibt `null`).
- Auslöser: `Whiteboard.recomputeSimulation()` bei jeder Mutation, Schalter-Klick (`tryToggleSwitch`) und jedem Takt-Tick.
- Taktgeber: `setInterval` pro `clock-gen` im Whiteboard, toggelt `inputValue` alle `max(100, clockPeriodMs)` ms (= Halbperiode). Panel begrenzt 100–10000.
- **Strommodus sperrt die Schaltung:** kein Bauteil-Drag (Auswahl bleibt für Zustandsanzeige), Entf/Undo/Redo/Einfügen ohne Wirkung (`canUndo`/`canRedo`/`canPaste` = false → Menü deaktiviert), Werkzeug-Buttons `[disabled]`, Panel-Bearbeitung per `<fieldset [disabled]>`. Zoom, Pan und Schalter bleiben.
- Simulation aus: Intervalle stoppen, `inputValue`, `ffState`, `ffPrevClock` → false, `signalStates` + `prevOutputs` leeren. Simulation an: Werkzeug → Pan, Palette deaktiviert.

## Test-Setup und Befehle

Alle Befehle in `gatter-plus/`:

| Zweck | Befehl |
|---|---|
| Installieren | `npm install` |
| Dev-Server | `npm start` (`ng serve`, http://localhost:4200) |
| Build | `npm run build` (production, Ausgabe `dist/gatter-plus/browser`) |
| Tests | `npm test` (`ng test`, Builder `@angular/build:unit-test`, Vitest) |
| Tests ohne Angular (vermutlich) | `npx vitest run` (nutzt `vitest.config.ts`: env node, schließt `app.spec.ts` aus) |
| Deploy (Standard) | Push auf `main` → Workflow `.github/workflows/main.yml`: Node 22, `npm ci`, `npx ng build --base-href /GatterPLUS/`, `index.html` → `404.html`, `deploy-pages` (auch manuell via `workflow_dispatch`) |
| Deploy (Alt) | `npm run deploy` (angular-cli-ghpages, base-href `/ProjektInformatikLK/`) |

- Specs: reine Logik-Tests ohne TestBed (`gate.model.spec.ts`: Fan-out erlaubt, Routing, Pin-Richtung; `project-file.spec.ts`: Round-Trip + Fehlerfälle; `logiksim-file.spec.ts`: Import der Fixtures, 4-Bit-Addierer per SimulationService; `history.service.spec.ts`; `theme.service.spec.ts`). `simulation.service.spec.ts`: negierte Eingänge. Keine Komponenten-Tests.
- **Verifiziert (2026-09-25):** `npx vitest run` läuft nach `npm ci` grün (7 Spec-Dateien). `ng test` noch nicht ausgeführt.
- Formatierung: Prettier (`printWidth 100`, `singleQuote`), `.editorconfig` 2 Leerzeichen.

## Code-Stil und Konventionen

- Kommentare, UI-Texte und Commit-Messages **auf Deutsch**; Bezeichner Englisch.
- Ausführliche JSDoc-Blöcke mit Begründungen („Warum“) und Abschnittstrennern `// ─── Titel ───`.
- Ausrichtung per Leerzeichen (Zuweisungen, Imports) ist üblich.
- DI per `inject()` in Feldern (`private readonly x = inject(Service)`), Services `providedIn: 'root'`.
- Decorator-Inputs/Outputs (`@Input()`, `@Output() … = new EventEmitter`), keine Signal-Inputs.
- Template-Control-Flow `@if`/`@for`/`@let`; Template-Helper als Methoden im Whiteboard (werden jede CD-Runde aufgerufen).
- Komponenten-Selector-Präfix `app-`; teils explizit `standalone: true` (redundant in v21).

## Fallstricke und offene Punkte

- **Whiteboard ist God-Component** (1312 Zeilen): State, Eingabe, Routing-Updates, Takte, Clipboard in einer Klasse.
- **`wire.points` wird beim Rendern ignoriert:** `getWireDisplayPoints` berechnet den Verlauf über `manualPoints` bzw. ohne sie als Z-/U-Form (`manualWirePath`, rechtwinklig; Knicke rasten auf 24 px, erster/letzter Knick wird an die Pin-Achse angeglichen); `points` ist nur gespeichert/redundant.
- **`inputCount` verringern** entfernt Leitungen an weggefallenen Pins nicht (Simulation überspringt sie, Rendering fällt auf `gate.x/y` zurück).
- Leitungen sind nur über ihren 2-px-Strich anklickbar (Auswahl, Doppelklick zum Einfügen eines Punkts).
- **Mutation in `computeSignals`** (`ffState`, `ffPrevClock`) widerspricht dem Immutable-Pattern; Objekte werden nicht ersetzt.
- **`app.spec.ts`** ist das CLI-Template (erwartet `<h1>Hello, gatter-plus`) → schlägt bei `ng test` vermutlich fehl, falls `ng test` `vitest.config.ts` nicht nutzt (**unsicher, nicht verifiziert**).
- `ToolbarLeft` wird nicht gerendert; nur `ToolMode` wird daraus importiert.
- `DragStateService.gateType` ist `string`, wird im Whiteboard per Cast zu `GateType`.
- `PropertiesPanel.selectedGate` ist `any`; `App.onGateChange` castet `as any`.
- Rotations-Vorzeichen: `getPinWorldPos`/`getPinDirection` (−) und `isPointInGate` (+) müssen zusammenpassen.
- Pin-Offsets hängen am Bauteil-CSS (siehe Datenmodell).
- `Whiteboard.onMouseDown` ruft `preventDefault` (verhindert Fokuswechsel) → vorher wird `document.activeElement.blur()` aufgerufen, sonst verlieren Panel-Eingabefelder nie den Fokus und `(change)` (z. B. Beschriftung) käme nicht an.
- Multi-Delete (Entf bei Mehrfachauswahl) ist inline in `onDeleteKey` dupliziert statt `deleteGate` zu nutzen.
- `ANLEITUNG-UND-TECHNOLOGIEN.md` ist veraltet (nennt HTML5-DnD, TS ~5.8).
- Persistenz: Öffnen/Speichern unter vorhanden (`.gatterplus.json`); `loadProject` beendet Simulation, ist per Undo rückgängig, setzt ID-Zähler auf max(alt, Datei). „Speichern“ schreibt in die zuletzt geöffnete/exportierte Datei (nur Chrome/Edge, sonst Download).
- **Zwei Deploy-Wege mit unterschiedlichem base-href:** Workflow `/GatterPLUS/` vs. `npm run deploy` `/ProjektInformatikLK/` (altes Repo; auch `SETUP.md` nennt noch die alte Live-URL). Workflow führt **keine Tests** aus – jeder Push auf `main` deployt.

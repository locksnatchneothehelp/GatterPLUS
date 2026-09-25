# Phase 5 – Export/Import, Speichern, PNG, Logic-Sim-Umwandlung

- **Stand:** 2026-09-25 · Basis-Commit `fe5e6b7` · Status: **Phase 5 abgeschlossen, in `main` gemergt (nicht gepusht)** · Branch `feature/phase5-dateien`
- Arbeitsweise nach CLAUDE.md: jeder Schritt einzeln planen → OK abwarten → umsetzen → verifizieren → eigener Commit.
- Pfade relativ zu `gatter-plus/src/app/`.

## Ziele (Anforderung)

1. **Exportieren:** Projekt verlustfrei als Datei speichern.
2. **Importieren:** Exportierte Datei verlustfrei wieder laden.
3. **Speichern:** Wurde exportiert/geöffnet, schreibt „Speichern“ den aktuellen Stand in **dieselbe** Datei.
4. **PNG-Export:** Arbeitsbereich als `.png`.
5. **Umwandlung:** LogikSim-Datei (`.sim`) → GatterPLUS (Gegenrichtung entfällt).

## Ausgangslage im Code

- Datei-Menü hat bereits Platzhalter: `onNew`, `onOpen`, `onSave`, `onSaveAs`, `onImportLws`, `onConvertLws` (`components/menu-bar/menu-bar.ts`, nur `console.log`).
- Zustand liegt komplett in `Whiteboard` (`gates`, `wires`, `panX/panY/zoom`, private `gateIdCounter`/`wireIdCounter`).
- Keine Persistenz, keine Fremdbibliothek für Bild-Export vorhanden.
- UI-Muster: `menu-bar @Output` → `app.html` → `App` → `whiteboardRef.methode()` (s. PROJEKT_ANALYSE „UI-Muster“).

## Schritte (je ein Commit)

### 5.1 Dateiformat + Serialisierung (reine Logik, ohne UI)
- Neue Datei `models/project-file.ts`: `serializeProject(gates, wires, view)` → JSON-String, `parseProject(text)` → `{ gates, wires, view }` bzw. Fehler.
- Format (Endung `.gatterplus.json`): `{ format: 'gatterplus', version: 1, gates: GateInstance[], wires: WireConnection[], view: { panX, panY, zoom } }`. Alle Aufbau-Felder 1:1 (verlustfrei), inkl. `label`, `color`, `rotation`, `negatedOutputs`, `clockPeriodMs`, `branchPoint`, `fromDir`. **Ohne** Laufzeit-Zustand (`inputValue`, `ffState`, `ffPrevClock`).
- `parseProject` prüft `format`/`version` und Pflichtfelder; unbekannte Version → verständlicher Fehler.
- **Verifikation:** neue `models/project-file.spec.ts` – Round-Trip (serialize → parse → deep-equal), kaputte/fremde Datei → Fehler. `npx vitest run`.

### 5.2 Export („Speichern unter“) und Import („Öffnen“)
- `Whiteboard.loadProject(data)`: Simulation stoppen, `gates`/`wires`/View setzen, ID-Zähler auf höchste vorhandene Nummer setzen (sonst doppelte IDs), Auswahl leeren, `pushHistory()` (Laden ist rückgängig machbar).
- `Whiteboard.getProjectData()` für den Export.
- Menü: `saveAsClicked`/`openClicked` nach bestehendem Muster; Datei-Dialog über `showSaveFilePicker`/`showOpenFilePicker` (File System Access API), Fallback: Download-Link bzw. `<input type="file">`.
- **Verifikation:** Build + manuell im Browser: Schaltung bauen → exportieren → „Neu“/Reload → importieren → identisch (Screenshot).

### 5.3 „Speichern“ in dieselbe Datei
- Den `FileSystemFileHandle` aus 5.2 (Export oder Öffnen) merken; „Speichern“ schreibt dorthin. Ohne Handle verhält sich „Speichern“ wie „Speichern unter“.
- Einschränkung: Nur Chromium-Browser (Chrome/Edge) können eine bestehende Datei überschreiben; Firefox/Safari bekommen immer einen neuen Download.
- **Verifikation:** manuell in Chrome/Edge: exportieren → ändern → Speichern → Datei neu importieren → Änderung vorhanden.

### 5.4 PNG-Export
- Neuer Menüeintrag „Als PNG exportieren“. Ausschnitt = Bounding-Box aller Bauteile + Rand, unabhängig vom aktuellen Pan/Zoom.
- Umsetzung mit Bibliothek `html-to-image` (freigegeben), **ohne Punktraster** (Entscheidung Nutzer).
- **Verifikation:** Build + Export einer Beispielschaltung in Hell und Dunkel, PNG ansehen.

### 5.5 Umwandlung GatterPLUS ↔ LogikSim (`.sim`)
- **Nur Import** `.sim` → GatterPLUS. **Export nach `.sim` entfällt** (Entscheidung Nutzer 2026-09-25: Format nur teilweise bekannt, Ergebnis nicht prüfbar).
- **5.5a Import `.sim` → GatterPLUS (umgesetzt):** `parseLogikSim(bytes)` in `models/logiksim-file.ts`, Menü „Importieren (LogikSim)“ → `App.onImportLogikSim`. Menüpunkt `Konvertieren (LWS)` wurde entfernt (Entscheidung Nutzer).
- Abbildung: `TSwitchModule`→`input`, `TLedModule`→`output`, `TTextModule`→`text-label` (`Caption`), `TAnd/TOr/TXorModule`→`and/or/xor` (Eingänge = Anzahl Connectoren), `THalf/TFullAdderModule`→`half/full-adder`. Pin-Index = Reihenfolge in `Input/OutputConnectorList`. 1 Rastereinheit = 80 px, Ansicht 50 %.
- **Negierte Eingänge** (`Negatived` am Eingang) → `negatedInputs` (seit Phase 6; anfangs eingefügte NOT-Gatter). Negierte Ausgänge → `negatedOutputs`.
- **Annahmen:** Schalter an einem Bauteil-Ausgang → Anzeige (`output`, mit Hinweis). Netze: Segment-Endpunkte verbunden; Punkt auf einem Segment = T-Abzweig; reine Kreuzung im Inneren = nicht verbunden.
- Nicht Abbildbares (unbekannte Module, gedrehte Module, Netze mit mehreren Quellen) wird per Hinweis gemeldet. Nach dem Import wird die .sim nie als Speicherziel gemerkt.
- **Verifikation:** 12 Unit-Tests mit 4 echten Dateien (`models/fixtures/*.sim`), u. a. importierter 4-Bit-Addierer rechnet alle 256 Fälle korrekt (SimulationService); E2E headless Edge 7/7 + Screenshots.

#### Analyse der Beispieldatei `4.4.1 6.sim` (LogikSim Christian 0.6.4, vollständig dekodiert)
- Datei ist **zlib-komprimiert** (Header `78 DA`) → im Browser natives `DecompressionStream('deflate')`, keine Abhängigkeit nötig.
- Entpackt: `str "TRakBinaryStreamData"`, `u8 1`, `u8 0`, `str "LogikSim Christian"`, `str "0.6.4"`, danach **ein Wurzelknoten** (Name leer).
- `str` = 1 Byte Länge + Latin-1-Zeichen (Umlaute z. B. `ü`). Knoten = `str name`, `int32LE propCount`, Eigenschaften, `int32LE childCount`, Kindknoten (rekursiv).
- Eigenschaft = `u8 typ`, `str name`, `u8 0`, Wert: `0x10` = int32LE, `0x02` = bool (u8), `0x14` = str.
- Baum: Wurzel → `MainSimulationTab{ResolutionX, ResolutionY}` → `ElementBox` → `ModuleList`, `LineList`, `LineCouplingDiodeList`; Wurzel → `IcSampleList`.
- Module: `Element{PositionX, PositionY, Height, Width, [Orientation], Name}`, Name = Typ (`TSwitchModule`, `THalfAdderModule`, `TFullAdderModule`). Addierer haben `InputConnectorList`/`OutputConnectorList` mit `TConnector{Negatived, DenyNegativationChange, DenyConnection, IsInput, Orientation, PositionX, PositionY, [Caption "s"/"ü"]}`.
- Koordinaten in **Rastereinheiten** (ganzzahlig); Addierer 3×2 Einheiten, Schalter 0×0 (Punkt). Umrechnungsfaktor auf GatterPLUS-px noch festzulegen.
- **Leitungen sind nur geometrische Segmente** (`TLine{StartPointX/Y, EndPointX/Y}`), keine Verbindungsliste. Verbindungen müssen über gemeinsame Punkte (inkl. T-Abzweig auf Segmentmitte) zu Netzen zusammengefasst und Pins/Schaltern zugeordnet werden.
- Weitere Beispieldateien zeigen: `TAndModule/TOrModule/TXorModule{FSize=Eingänge}`, `TLedModule{Color}`, `TTextModule{Caption, Color, Size}`; `Negatived` v. a. an Eingängen. Alle Module hatten `Orientation 0`. `LineCouplingDiodeList` in allen Proben leer (Bedeutung unbekannt).
- Analyse-Parser war ein Wegwerf-Skript im Scratchpad, nicht im Repo.

## Entscheidungen (2026-09-25)

1. LogikSim-Beispieldateien liegen als Test-Fixtures in `gatter-plus/src/app/models/fixtures/` (mehr Beispiele hat der Nutzer nicht).
2. Dateiendung: **`.gatterplus.json`**.
3. Laufzeit-Zustand (`inputValue`, `ffState`, `ffPrevClock`) wird **nicht** gespeichert.
4. PNG: Bibliothek **`html-to-image`** erlaubt.
5. Speichern-Fallback in Firefox/Safari (neuer Download) akzeptiert.
6. Feature-Branch `feature/phase5-dateien` (Zusammenführen am Ende per `git merge`, siehe Session-Erklärung).

## Offene Fragen

Stand nach 5.5a (Nutzer kann 1–2 nicht klären, Import arbeitet mit gekennzeichneten Annahmen, s. o.):

1. Rolle von `TSwitchModule` am Ende der Summen-Leitungen (4-Bit-Datei) – Annahme: Anzeige.
2. Unbekannte LogikSim-Module (z. B. NOT, NAND/NOR, JK-FF, Taktgeber) und `LineCouplingDiodeList` – keine Beispiele vorhanden; werden gemeldet.

## Fortschritt

| Schritt | Status | Commit |
|---|---|---|
| 5.1 Format + Serialisierung | erledigt (`models/project-file.ts`, 13 Tests) | siehe `git log` |
| 5.2 Export/Import | erledigt (E2E headless Edge, 10/10) | siehe `git log` |
| 5.3 Speichern in dieselbe Datei | erledigt (E2E headless Edge, 5/5 + Regression 10/10) | siehe `git log` |
| 5.4 PNG-Export | erledigt (E2E headless Edge 6/6, PNG hell+dunkel gesichtet) | siehe `git log` |
| 5.5a LogikSim-Import | erledigt (12 Unit-Tests, E2E 7/7) | siehe `git log` |
| ~~5.5b LogikSim-Export~~ | entfällt | – |

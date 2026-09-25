# Phase 5 – Export/Import, Speichern, PNG, Logic-Sim-Umwandlung

- **Stand:** 2026-09-25 · Basis-Commit `fe5e6b7` · Status: **5.1 erledigt, 5.2 als nächstes** · Branch `feature/phase5-dateien`
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
- Umsetzung mit Bibliothek `html-to-image` (freigegeben).
- **Verifikation:** Build + Export einer Beispielschaltung in Hell und Dunkel, PNG ansehen.

### 5.5 Umwandlung GatterPLUS ↔ LogikSim (`.sim`)
- **Nur Import** `.sim` → GatterPLUS. **Export nach `.sim` entfällt** (Entscheidung Nutzer 2026-09-25: Format nur teilweise bekannt, Ergebnis nicht prüfbar).
- **5.5a Import `.sim` → GatterPLUS:** reine Funktion `parseLogikSim(bytes)` in `models/logiksim-file.ts` + Tests mit der Beispieldatei; Menüpunkt `Importieren (LWS)` anbinden (ggf. in „Importieren (LogikSim)“ umbenennen). Menüpunkt `Konvertieren (LWS)` vor 5.5a mit dem Nutzer klären (entfernen oder = Import).
- Nicht abbildbare Bauteile/Eigenschaften werden gemeldet statt still verworfen.
- **Verifikation:** Unit-Tests mit Beispieldateien; Import der Probe muss 8 Schalter/Anzeigen, 1 Halb- und 3 Volladdierer mit korrekt verbundenen Leitungen ergeben (Screenshot-Vergleich mit LogikSim).

#### Analyse der Beispieldatei `4.4.1 6.sim` (LogikSim Christian 0.6.4, vollständig dekodiert)
- Datei ist **zlib-komprimiert** (Header `78 DA`) → im Browser natives `DecompressionStream('deflate')`, keine Abhängigkeit nötig.
- Entpackt: `str "TRakBinaryStreamData"`, `u8 1`, `u8 0`, `str "LogikSim Christian"`, `str "0.6.4"`, danach **ein Wurzelknoten** (Name leer).
- `str` = 1 Byte Länge + Latin-1-Zeichen (Umlaute z. B. `ü`). Knoten = `str name`, `int32LE propCount`, Eigenschaften, `int32LE childCount`, Kindknoten (rekursiv).
- Eigenschaft = `u8 typ`, `str name`, `u8 0`, Wert: `0x10` = int32LE, `0x02` = bool (u8), `0x14` = str.
- Baum: Wurzel → `MainSimulationTab{ResolutionX, ResolutionY}` → `ElementBox` → `ModuleList`, `LineList`, `LineCouplingDiodeList`; Wurzel → `IcSampleList`.
- Module: `Element{PositionX, PositionY, Height, Width, [Orientation], Name}`, Name = Typ (`TSwitchModule`, `THalfAdderModule`, `TFullAdderModule`). Addierer haben `InputConnectorList`/`OutputConnectorList` mit `TConnector{Negatived, DenyNegativationChange, DenyConnection, IsInput, Orientation, PositionX, PositionY, [Caption "s"/"ü"]}`.
- Koordinaten in **Rastereinheiten** (ganzzahlig); Addierer 3×2 Einheiten, Schalter 0×0 (Punkt). Umrechnungsfaktor auf GatterPLUS-px noch festzulegen.
- **Leitungen sind nur geometrische Segmente** (`TLine{StartPointX/Y, EndPointX/Y}`), keine Verbindungsliste. Verbindungen müssen über gemeinsame Punkte (inkl. T-Abzweig auf Segmentmitte) zu Netzen zusammengefasst und Pins/Schaltern zugeordnet werden.
- Unklar: Nur 3 Modultypen in der Probe. `TSwitchModule` sitzt sowohl an Addierer-Eingängen (y=5, y=16) als auch am Ende der Summen-Leitungen (y=24) → Rolle (Schalter vs. Anzeige) unklar. `LineCouplingDiodeList` (hier leer) unbekannt.
- Analyse-Parser war ein Wegwerf-Skript im Scratchpad, nicht im Repo.

## Entscheidungen (2026-09-25)

1. LogikSim-Beispieldatei: `4.4.1 6.sim` im Repo-Root (noch nicht eingecheckt).
2. Dateiendung: **`.gatterplus.json`**.
3. Laufzeit-Zustand (`inputValue`, `ffState`, `ffPrevClock`) wird **nicht** gespeichert.
4. PNG: Bibliothek **`html-to-image`** erlaubt.
5. Speichern-Fallback in Firefox/Safari (neuer Download) akzeptiert.
6. Feature-Branch `feature/phase5-dateien` (Zusammenführen am Ende per `git merge`, siehe Session-Erklärung).

## Offene Fragen

Nutzer kann diese derzeit **nicht beantworten** (2026-09-25). Folge für 5.5a: nur die bekannten Modultypen importieren, unbekannte melden; Rolle von `TSwitchModule` heuristisch bestimmen (nur mit Eingängen verbunden → `input`, sonst `output`) und das im Code/Plan als Annahme kennzeichnen. Vor 5.5a erneut nachfragen.

1. LogikSim: Was sind die 4 Elemente unten (y=24), an denen die Summen enden – Schalter oder Anzeige/Lampe?
2. Weitere `.sim`-Beispiele: eine Datei mit **jedem** LogikSim-Bauteil (AND, OR, NOT, XOR, ggf. NAND/NOR, JK-FF, Lampe, Taktgeber, Text) sowie eine mit sich kreuzenden Leitungen **ohne** und **mit** Verbindungspunkt.
3. Beispieldatei als Test-Fixture verschieben (Vorschlag: `gatter-plus/src/app/models/fixtures/`)?

## Fortschritt

| Schritt | Status | Commit |
|---|---|---|
| 5.1 Format + Serialisierung | erledigt (`models/project-file.ts`, 13 Tests) | siehe `git log` |
| 5.2 Export/Import | offen | – |
| 5.3 Speichern in dieselbe Datei | offen | – |
| 5.4 PNG-Export | offen | – |
| 5.5a LogikSim-Import | offen (Format analysiert) | – |
| ~~5.5b LogikSim-Export~~ | entfällt | – |

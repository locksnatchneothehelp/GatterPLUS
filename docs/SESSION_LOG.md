# Sitzungsprotokoll GatterPLUS

> **Pflegeregel:** Diese Datei wird **nur am Ende einer Session und nur auf ausdrückliche Anweisung des Nutzers** ergänzt – nie zwischendurch, nie eigenmächtig. Neue Sessions werden **oben** angefügt (neueste zuerst). Zweck: In der nächsten Session nahtlos anschließen können.
>
> Detailwissen steht in: [PROJEKT_ANALYSE.md](PROJEKT_ANALYSE.md) (Code-Landkarte), [PHASE5_PLAN.md](PHASE5_PLAN.md) (inkl. `.sim`-Format), [PHASE6_PLAN.md](PHASE6_PLAN.md), [PHASE7_PLAN.md](PHASE7_PLAN.md).

---

## Session 2026-09-28 – Phase 7 (Raster, Leitungen verlegt der Nutzer)

### Ausgangs- und Endstand

| | |
|---|---|
| Start | `main` @ `1de0d4d` (Phase 6 + A*-Routing mit Ausweichspuren; 110 Unit-Tests) |
| Ende | `main` @ Protokoll-Commit dieser Session, **gepusht** nach `origin/main` (Freigabe des Nutzers; löst GitHub-Pages-Deployment aus, Actions-Ergebnis nicht geprüft) |
| Tests | 115 Unit-Tests (Vitest) grün, `ng build` ohne Fehler; E2E per headless Edge (Skripte nur im Scratchpad) |
| Branches | `phase7-raster` per Fast-Forward in `main` gemergt (lokal noch vorhanden, lag nie auf GitHub) |

### Anlass und Entscheidungen des Nutzers

- Der Leitungsalgorithmus (A*) wird nie perfekt → neuer Ansatz: **Raster wie LogikSim**, **Leitungen legt der Nutzer selbst wie in Shapez 2**.
- Pin-Abstand darf ans Raster angepasst werden; Bauteile dürfen sich beim Drehen leicht verschieben, solange die Pins auf dem Raster bleiben; **jedes Bauteil behält eine Spiegelachse**; Gatter mit gerader Eingangszahl werden höher (Mittelplatz frei, wie LogikSim).
- Einrasten nur für Editor und LogikSim-Import (es gibt noch keine GatterPLUS-Dateien); Textfelder rasten **symmetrisch** (mittig) ein.
- JK-FF und Volladdierer **96 px breit** (Variante a), damit die Pin-Beschriftungen Platz haben.
- Verlegen: Taste zum Umschalten der Knickreihenfolge; **C** oder Klick setzt festen Punkt; **Backspace/Strg+Z** nimmt ihn zurück; rückwärts zeichnen bleibt (nicht Eingang→Eingang/Ausgang→Ausgang); Abzweig per Klick auf eine Leitung; beim Verschieben passt sich das Kabel nur bis zum festen Punkt an; feste Punkte einer angeklickten Leitung anzeigen, verschieben, hinzufügen, entfernen.
- A*-Router **nicht löschen**, sondern als toter Code kennzeichnen.
- Schritt 2 durfte am Stück umgesetzt, committet und gemergt werden; Details hat Claude entschieden (siehe unten, änderbar).

### Von Claude entschiedene Details (Schritt 2)

- Umschalt-Taste **F**; erstes Stück läuft in Pin-Richtung, jedes weitere zuerst quer zum vorigen.
- Gespeichert wird der **komplette sichtbare Verlauf** als `manualPoints` (WYSIWYG); ohne feste Punkte Z-Form mit Knick auf der Rastermitte (`drawnWirePath`).
- Bearbeiten per Griffen: ziehen (gerade Nachbarstücke wandern mit), **Doppelklick auf Griff = entfernen**, **Doppelklick auf Leitung = einfügen**; Entfernen ist immer erlaubt (Verlauf verbindet sich rechtwinklig neu).
- Tastenhilfe oben im Whiteboard während des Verlegens.

### Commits dieser Session (Zeitstempel = Commit-Zeit, Ortszeit)

| Zeit | Commit | Inhalt |
|---|---|---|
| 17:57 | `d98248a` | Nebenbefund: Punktraster lag 2 px (× Zoom) versetzt → Punkte genau auf Vielfachen von 24 px |
| 17:57 | `6eeb672` | **7.1** Pins auf 24-px-Raster: `GRID`, `getInputSlots`, `snapGateToGrid`, neue Bauteilgrößen (Breite 72), feste 24-px-Zeilen im Bauteil-CSS; Tests für Rasterlage aller Typen/Drehungen und Spiegelsymmetrie |
| 18:10 | `c804664` | **7.1** JK-FF und Volladdierer 96 px breit (Beschriftungen stießen an) |
| 18:12 | `54b5336` | **7.2** Einrasten beim Platzieren, Ziehen (Gruppe folgt), Drehen, Eingangsanzahl; Einfügen um 24 px; Textfeld 72×24 mittig |
| 18:50 | `0d3fc67` | **7.3** LogikSim-Import: `UNIT_PX = 3 × GRID`, Textfelder rasten ein; Test: alle Fixtures auf dem Raster (keine Überlappungen) |
| 18:51 | `7bf5fb7` | Doku: `docs/PHASE7_PLAN.md` angelegt, CLAUDE.md + Projektanalyse auf Raster-Stand |
| 19:04 | `c46b27a` | **7.4** A*-Leitungsführung stillgelegt (toter Code, nicht gelöscht) |
| 19:10 | `9021b17` | **7.5** Verlegen wie in Shapez 2: L-Stück zur Maus, F, C/Klick, Backspace/Strg+Z, Vorschau = endgültiger Verlauf, rückwärts, Abzweige auf dem Raster, Tastenhilfe; `lCorner`/`drawnWirePath` + Tests |
| 19:13 | `9db8438` | **7.6** Feste Punkte bearbeiten: Griffe ziehen/entfernen/einfügen, Abzweige wandern mit, Strg+Z |
| 19:14 | `d09bde3` | Doku: Phase 7 abgeschlossen (Plan, CLAUDE.md, Projektanalyse) |
| 19:14 | `4d66c95` | Doku: keydown-Stolperstein im Plan richtig eingeordnet |
| 19:20 | `473764a` | Sitzungsprotokoll · **erster Push** der Session |
| 19:35 | `60c22c6` | Nutzer-Feedback „Kabel liegt nicht perfekt auf dem anderen“: Anschluss-Stummel aller Pins als SVG (`getGateStubs`), CSS-Stummel auf dem Whiteboard ausgeblendet (HTML/SVG runden je nach Anzeigeskalierung verschieden) |
| 19:35 | `db87c7f` | „Alles anzeigen“: Schaltung füllt 60 % der Fläche, max. 200 % (Nutzer-Screenshot ~166 %) |
| 19:59 | `0cab6d5` | Verneinung: Kreis direkt am Gehäuse (Klickfläche = Stummel, vor Bauteil-Auswahl geprüft), Buttons „Verneinung“ je Ein-/Ausgang im Eigenschaften-Panel |
| 20:02 | `93a05d4` | Sitzungsprotokoll ergänzt · **zweiter Push** |
| 20:14 | `05c486a` | Esc im Kabelmodus (ohne laufende Leitung) → Verschieben; **S** startet/stoppt Simulation; Theme-Knopf Hell/Dunkel; Auswahlrahmen ohne hellblauen Schein |
| 20:15 | `8f0a174` | Toolbar: Werkzeugnamen „Verschieben“/„Verkabeln“, handschriftlicher Hinweis „Simulation starten/stoppen“ mit Pfeil |
| 20:16 | `1b8de3f` | Palette: Anschlussstriche wieder innerhalb der Bauteile |
| 20:18 | `07636db` | Hinweis unter 1520 px Fensterbreite ausgeblendet (sonst Scrollbalken) |
| 20:18 | `ca076a9` | Hilfe-Menü: Fenster „Steuerung & Tastenkürzel“ |
| 20:22 | `e076954` | Nicht aufeinander ablegen (zurück an Startposition + rote Meldung), Einfügen an freier Stelle, Leitungs-Sporne entfernt (`removeBacktracks`) |
| 20:25 | `d9f607c` | Dunkles Design: Graphit-Schema, dunkle Bauteile, lesbare Simulationszustände |
| 20:26 | `3453c0d` | Projektanalyse nachgezogen |
| 20:34 | `cb0009f` | Sitzungsprotokoll ergänzt · **dritter Push** |
| 20:36 | `08be49a` | Eigenschaften-Panel: Mülltonne bei Bauteilen und Leitungen entfernt (Löschen per Entf), Verneinung mit ausgeschriebenen Beschriftungen „Eingang/Eingänge“, „Ausgang/Ausgänge“ über den Buttons, Beschreibungen und Zustandstexte in schlichtem Deutsch ohne englische Begriffe (1/0 statt HIGH/LOW, „Exklusiv-ODER-Gatter“, „JK-Flipflop“) |
| 20:38 | `756d0d9` | Sitzungsprotokoll ergänzt · **vierter Push** |
| 20:58 | `3850754` | Simulations-Hinweis: Pfeillinie mittig in die Spitze |
| 21:00 | `c23dd86` | Palette: alle Bauteile mittig auf einer Linie (=1/HA/VA klebten oben, &/≥1 durch altes min-height zu hoch) |
| 21:22 | `3eb0528` | Hell/Dunkel als Schiebeschalter (Sonne/Mond), Übergang als Kreis vom Schalter aus (View Transitions API) |
| – | (dieser) | Sitzungsprotokoll ergänzt · **fünfter Push** |

### Stolpersteine / Wissen für die nächste Session

- **Nur ein `@HostListener('document:keydown')` pro Klasse:** Ein zweiter überschreibt den ersten (Angular legt Host-Listener nach Ereignisnamen ab). In 7.5 kurz selbst verursacht (Strg+C/V/Z wären tot), vor dem Commit behoben – C/F laufen über `onKeyboardShortcut`.
- Dev-Server-Fehler-Overlay nach Edits in falscher Reihenfolge (Verwendung vor Import) bleibt stehen → Server neu starten (wie schon am 2026-09-25 notiert).
- Die Shell zerlegt lange Python-Heredocs mit gemischten Anführungszeichen falsch → Editier-Skripte als Datei im Scratchpad ablegen.
- E2E: wie am 2026-09-25 per headless Edge + DevTools-Protokoll; Tasten mit `Input.dispatchKeyEvent` (Strg = `modifiers: 2`), Doppelklick = zwei Klicks mit `clickCount` 1 und 2.

### Offene Punkte / Ideen

- Leitungen sind nur über den 2-px-Strich anklickbar (Auswahl, Doppelklick zum Einfügen) – breitere unsichtbare Klickfläche wäre angenehmer.
- „Verlauf automatisch“ im Eigenschaften-Panel entfernt die festen Punkte (→ einfache Z-Form); Name ggf. anpassen.
- Branch `phase7-raster` kann gelöscht werden.
- Handtest durch den Nutzer: Verlegen läuft laut Nutzer „extrem gut“; Stummel-Versatz (nur bei seiner Anzeigeskalierung sichtbar, headless nicht nachstellbar) nach dem SVG-Umbau noch vom Nutzer zu bestätigen.

---

## Session 2026-09-25 – Phase 5 (Dateien, PNG, LogikSim) und Phase 6 (Leitungen)

### Ausgangs- und Endstand

| | |
|---|---|
| Start | `main` @ `fe5e6b7` (Projektanalyse + Arbeitsregeln vorhanden; Datei-Menü nur Platzhalter; 55 Unit-Tests) |
| Ende | `main` @ `7dc3d13`, **gepusht** nach `origin/main` (löst GitHub-Pages-Deployment aus; Ergebnis des Actions-Laufs in der Session nicht geprüft – `gh` nicht installiert). Danach nur noch dieses Protokoll + CLAUDE.md-Verweis (siehe letzter Commit). |
| Tests | 105 Unit-Tests (Vitest) grün, `npm run build` ohne Warnungen |
| Branches | `feature/phase5-dateien` und `feature/phase6-leitungen` wurden per Fast-Forward in `main` gemergt und danach lokal gelöscht (vollständig in `main` enthalten; lagen nie auf GitHub) |

### Vom Nutzer getroffene Entscheidungen

- Projektdateien: Endung **`.gatterplus.json`**, Laufzeit-Zustand (Schalterstellungen, Flip-Flop-Speicher) wird **nicht** gespeichert.
- PNG-Export mit Bibliothek **`html-to-image`** (1.11.13, exakt gepinnt), **ohne Punktraster**.
- „Speichern“ überschreibt die zuletzt geöffnete/exportierte Datei; in Firefox/Safari ersatzweise neuer Download (akzeptiert).
- LogikSim: **nur Import** von `.sim` (LogikSim Christian 0.6.4), **kein Export**; Menüpunkt „Konvertieren (LWS)“ **entfernt**. Beispieldateien liegen als Test-Fixtures in `gatter-plus/src/app/models/fixtures/` (mehr gibt es nicht).
- Fehlermeldungen per `alert` (einfachste Lösung).
- **Fan-out erlaubt** (beliebig viele Leitungen pro Ausgang) – früher bewusst auf 1 begrenzt.
- Button „Verlauf automatisch“ für Leitungen mit eigenen Knickpunkten.
- Reihenfolge Phase 6: Abzweigen → Knickpunkte → negierte Eingänge → A*-Routing → Import-Layout → Merge + Push.
- Automatische Prettier-Umformatierung ganzer Dateien (vermutlich ECC-Plugin-Hook) wird **verworfen** (`git restore`), Stil bleibt wie bisher.
- Kleine, eindeutige Nebenbefunde **direkt beheben**, jeweils als eigener Commit (bei Design-/Verhaltensfragen vorher fragen).

### Commits dieser Session (chronologisch)

| Commit | Inhalt |
|---|---|
| `fcb0ec4` | Arbeitsplan Phase 5 angelegt (`docs/PHASE5_PLAN.md`), in CLAUDE.md verlinkt |
| `5d742fa` | **5.1** Dateiformat: `models/project-file.ts` (`serializeProject`/`parseProject`, Prüfung auf Format, Version, Typen, Leitungs-Referenzen, Ansicht) + 13 Tests |
| `faffe60` | **5.2** „Öffnen“/„Speichern unter“: `Whiteboard.getProjectData`/`loadProject` (beendet Simulation, Undo-fähig, ID-Zähler = max(alt, Datei)), Datei-Dialoge in `App` (File System Access API, Fallback Download/`<input type=file>`) |
| `4a5cc42` | Nebenbefund: CSS-Tippfehler im AND-Gatter (`backround`, Selektor ohne Leerzeichen) |
| `cf1c6a2` | **5.3** „Speichern“ schreibt in gemerkte Datei (`App.fileHandle`; wechselt beim Öffnen erst nach erfolgreichem Laden) |
| `26cac2f` | **5.4** PNG-Export: `Whiteboard.exportPng` (Bounding-Box, 100 %, ohne Raster/Pins/Minimap/Auswahl, Theme-Hintergrund); SVG-Styles werden für `html-to-image` kurz inline gesetzt |
| `4e64822` | Nebenbefund: „JK-FF“-Symbol wurde vom Takt-Label „C ▷“ überdeckt |
| `cf0bc45` | Fehler: geöffnete Schaltung erschien erst bei Mausbewegung → App ist **zoneless**, `loadProject` ruft `markForCheck()` |
| `c9def5f` | **5.5a** LogikSim-Import `models/logiksim-file.ts` (zlib + Knotenbaum, Netz-Rekonstruktion aus Linien-Segmenten) + Menü „Importieren (LogikSim)“ + Tests mit echten Dateien (u. a. 4-Bit-Addierer rechnet alle 256 Fälle) |
| `628d2ef` | Nebenbefund: Taktgeber blinkte ohne Mausbewegung nicht (zoneless) → `markForCheck()` im Intervall |
| `da2c503` | Menüpunkt „Konvertieren (LWS)“ entfernt · **erster Push** (Phase 5) |
| `afc7a18` | Leitungsfarbe reicht bis ans Gehäuse: eigene SVG-Ebene `wire-stubs-layer` über den Bauteilen zeichnet die Anschluss-Stummel in Leitungsfarbe |
| `9f12a1e` | Arbeitsplan Phase 6 (`docs/PHASE6_PLAN.md`) |
| `bc1de36` | **6A** Abzweigen: Fan-out (`getOutputPinMaxConnections` = `Infinity`), Klick auf Ausgangs-Stummel startet am Ausgang, **umgekehrt ziehen** (Eingang → Ausgang/Leitung), Hover-Hervorhebung; Leitungsanlage zentral in `addWire()` |
| `f821091` | Fehler: Verschieben bei Zoom ≠ 100 % (Bildschirm- statt logische Pixel), Abzweigpunkt summierte die Drag-Strecke auf, Einfügen versetzte Abzweigpunkte nicht |
| `967f9f2` | **6B** Eigene Knickpunkte: Klick auf freie Fläche beim Zeichnen (24-px-Raster), `WireConnection.manualPoints`, `manualWirePath` (rechtwinklig), Angleichen an Pin-Achse, Button „Verlauf automatisch“ (`resetWireRoute`) |
| `069f22f` | **Negierte Eingänge**: `GateInstance.negatedInputs`, Simulation invertiert in `propagate`, Klick auf Eingangs-Stummel im Pan-Modus, Kreise via `getNegationDots`; LogikSim-Import ohne eingefügte NOT-Gatter; `simulation.service.spec.ts` |
| `5cd0279` | **6C** A*-Routing `models/wire-router.ts` (Sichtbarkeitsgitter, Abstand 12 px, Knick- und Fremd-Überlappungs-Kosten), Cache `Whiteboard.autoRoutes()`, `fastRouting` während Drag, Abzweige auf Signal-Verlauf projiziert |
| `7bc65c8` | **Import-Layout wie im Original**: Schalter/LED-Drehung aus Leitung, Pins auf LogikSim-Punkten, Linien → `manualPoints`, weitere Ziele als Abzweig am T-Punkt, End-Stücke auf echte Pin-Achse geschoben |
| `7dc3d13` | CLAUDE.md: Phase 6 als abgeschlossen verlinkt · **zweiter Push** |

### Was der Nutzer jetzt in der App hat (Bedienung)

- **Datei-Menü:** Öffnen, Speichern, Speichern unter (`.gatterplus.json`), Als PNG exportieren, Importieren (LogikSim `.sim`). „Neu“ und „Beenden“ sind weiterhin Platzhalter.
- **Leitungs-Modus:**
  - Klick Ausgang → Klick Eingang (auch vom schon belegten Ausgang = Fan-out).
  - Umgekehrt: Klick freier Eingang → Klick Ausgang oder beliebige Stelle einer Leitung (Abzweig).
  - Klick auf eine Leitung → Abzweig von dort.
  - Während des Zeichnens: Klick auf freie Fläche = **Knickpunkt** (früher: Abbruch). Abbrechen mit **Escape**.
  - Leitung unter der Maus wird dicker dargestellt.
- **Pan-Modus:** Klick auf Ausgangs-Stummel = Ausgang negieren; Klick auf Eingangs-Stummel (ca. 20 px vor dem Eingang) = **Eingang negieren** (Kreis). Leitung anklicken → Eigenschaften mit „Löschen“ und ggf. „Verlauf automatisch“.
- Leitungen werden automatisch um Bauteile herum geführt; Leitungen mit eigenen Knicken behalten ihren Verlauf.

### Neue/geänderte Dateien (Überblick)

- Neu: `models/project-file.ts` (+spec), `models/logiksim-file.ts` (+spec), `models/wire-router.ts` (+spec), `services/simulation.service.spec.ts`, `models/fixtures/*.sim` (4 LogikSim-Dateien), `docs/PHASE5_PLAN.md`, `docs/PHASE6_PLAN.md`, dieses Protokoll.
- Wesentlich geändert: `components/whiteboard/whiteboard.ts/.html/.scss` (Laden/Export/PNG, Leitungslogik, Routing-Cache, Stummel-Ebene, Negation), `app.ts/.html` (Datei-Aktionen, Leitungs-Panel), `components/menu-bar/*`, `components/properties-panel/*`, `models/gate.model.ts` (`manualPoints`, `negatedInputs`, `manualWirePath`, Fan-out), `services/simulation.service.ts` (negierte Eingänge), `package.json` (`html-to-image`).

### Verifikation – wie in dieser Session geprüft wurde

- **Unit-Tests:** `cd gatter-plus && npx vitest run` (105 Tests). Typprüfung: `npx tsc -p tsconfig.app.json --noEmit`. Build: `npm run build`.
- **Browser-E2E:** Chrome ist nicht installiert, das Chrome-DevTools-MCP funktioniert daher nicht. Stattdessen **headless Edge** (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe --headless=new --remote-debugging-port=9333`) per Node-Skript über das DevTools-Protokoll (Node 24 hat `WebSocket` eingebaut), mit echten Mausklicks (`Input.dispatchMouseEvent`) und Screenshots. Datei-Dialoge und `alert` wurden per `Page.addScriptToEvaluateOnNewDocument` durch Attrappen ersetzt. Diese Skripte lagen **nur im Scratchpad** (nicht im Repo) und sind in der nächsten Session nicht mehr vorhanden – bei Bedarf nach diesem Muster neu schreiben. Zugriff auf Komponenten im Dev-Modus: `ng.getComponent(document.querySelector('app-whiteboard'))`.
- Letzter Stand der E2E-Prüfungen: 60/60 grün (Datei-Funktionen, PNG, Import, Abzweigen, Knickpunkte, negierte Eingänge, Routing-Qualität: keine Leitung durch Bauteile, keine Überlappung fremder Signale, Abzweige auf ihrer Leitung).

### Stolpersteine / Wissen für die nächste Session

- **Prettier-Hook:** Nach Edits wurden Dateien mehrfach komplett umformatiert (vermutlich ECC-Plugin). Vor jedem Commit `git diff --stat` prüfen; reine Umformatierung per Vergleich `git show HEAD:<datei> | npx prettier --stdin-filepath <datei>` erkennen und mit `git restore` verwerfen.
- **Zoneless Angular:** Zustandsänderungen nach `await` oder in Timern brauchen `cdr.markForCheck()`, sonst wird erst beim nächsten Maus-Event gerendert.
- **Dev-Server-Overlay:** Bei Edits in falscher Reihenfolge (Aufruf vor Import) bleibt ein Fehler-Overlay stehen; Server neu starten, bevor Screenshots bewertet werden. `ng serve`-Prozesse überleben `TaskStop` – Port 4200 per `Get-NetTCPConnection … | Stop-Process` freigeben.
- **E2E-Klicks unten links** landen auf der Minimap (fängt Mausklicks ab) → im Test `minimapVisible = false`.
- `python` ist nicht nutzbar (Windows-Store-Platzhalter hängt); für Skripte `node` verwenden. Heredocs mit Backticks in Bash vermeiden (Datei per Write-Werkzeug anlegen).
- Die Projektanalyse (`docs/PROJEKT_ANALYSE.md`) ist auf Stand „Phase 5, 6A–6C, Import-Layout“.

### Offene Punkte / mögliche nächste Schritte

- Handtest der **echten Datei-Dialoge** in Chrome/Edge durch den Nutzer steht noch aus (E2E nutzte Attrappen); ebenso Vergleich eines Imports direkt mit LogikSim.
- Ergebnis des GitHub-Actions-Deployments nach dem letzten Push prüfen.
- LogikSim: Bauteile ohne Beispieldatei (NOT, NAND/NOR, JK-FF, Taktgeber) werden beim Import nur gemeldet; Bedeutung von `LineCouplingDiodeList` unbekannt; Annahme „Schalter an Bauteil-Ausgang = Anzeige“ ungeklärt.
- Routing-Grenze: Stehen Bauteile enger als ihre Sicherheitszone (12 px), darf eine Leitung nah am Nachbarn vorbeilaufen.
- Weiterhin Platzhalter: „Neu“, „Beenden“, Hilfe „About“. Tooltip „Simulation starten (F5)“ ohne F5-Handler. `app.spec.ts` ist Template-Test (mit `ng test` nicht geprüft).
- Große Importe (z. B. Aufgabe 2) passen erst bei kleinem Zoom komplett ins Bild (Ansicht startet mit 50 %).

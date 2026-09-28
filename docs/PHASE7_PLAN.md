# Phase 7 – Raster und manuelles Leitungsverlegen

- **Stand:** 2026-09-28 · Basis `main` @ `1de0d4d` · Branch `phase7-raster` · Status: **Phase 7 abgeschlossen (7.1–7.6), in `main` gemergt**
- Arbeitsweise nach CLAUDE.md: je Schritt Plan → OK → umsetzen → verifizieren → eigener Commit.
- Anlass: Der automatische Leitungsverlauf (A*) wird nie perfekt. Stattdessen legen Raster + Nutzer den Verlauf fest (Vorbild: LogikSim für das Raster, Shapez 2 für das Verlegen).

## Schritt 1 – Bauteile auf dem Raster (abgeschlossen)

Nutzer-Entscheidungen: Pin-Abstand darf ans Raster angepasst werden; Bauteile dürfen sich beim Drehen leicht verschieben, solange die Pins auf dem Raster bleiben; jedes Bauteil behält eine Spiegelachse; einrasten müssen nur Editor und LogikSim-Import (es gibt noch keine GatterPLUS-Dateien).

- **7.1 Geometrie** (`gate.model.ts`, Bauteil-CSS): `GRID = 24`. Pins eines Bauteils liegen untereinander auf Vielfachen von `GRID` → nach jeder 90°-Drehung auf dem Raster, sobald *ein* Pin darauf liegt. Breite 72 px (JK-FF, VA: 96 px für die Pin-Beschriftungen). and/or/xor: eine 24-px-Zeile pro Eingang, bei gerader Anzahl bleibt der Mittelplatz frei (`getInputSlots`) → Ausgang auf der Spiegelachse. Nebenbefund: Punktraster lag 2 px versetzt (eigener Commit).
- **7.2 Einrasten im Editor** (`whiteboard.ts`): `snapGateToGrid` (erster Pin aufs Raster, ohne Pins: Mitte) beim Platzieren, Ziehen (Gruppe folgt dem gezogenen Bauteil), Drehen und Ändern der Eingangsanzahl; Einfügen versetzt um `GRID`. Textfeld: feste Box 72×24, Text mittig (läuft symmetrisch über).
- **7.3 LogikSim-Import:** `UNIT_PX = 3 × GRID`; Textfelder rasten mit der Mitte ein.
- Verifiziert: Unit-Tests (alle Typen × Drehungen × 2–8 Eingänge auf dem Raster, Spiegelsymmetrie, alle Import-Fixtures auf dem Raster), E2E in headless Edge (echtes Ziehen, Drehen, Gruppe, Einfügen, Import), keine Überlappungen in den Fixtures.

## Schritt 2 – Leitungen verlegt der Nutzer (abgeschlossen)

Anforderungen des Nutzers (2026-09-28):
- Start wie bisher per Klick auf einen Ausgang. Das Kabel folgt der waagerechten Rasterlinie ab dem Ausgang und knickt passend zum Raster ab, wenn die Maus nach oben/unten geht (L-Form wie in Shapez 2).
- **Taste zum Umschalten** der Knickreihenfolge (erst waagerecht/erst senkrecht).
- **C** setzt einen festen Punkt an der aktuellen Ecke; ab dort geht es wieder genauso weiter. Ein **Klick auf freie Fläche** setzt ebenfalls einen festen Punkt.
- **Backspace oder Strg+Z** nimmt den letzten festen Punkt beim Verlegen zurück.
- Abschluss per Klick auf einen Eingang.
- Rückwärts (Start am Eingang, Ende am Ausgang) bleibt erlaubt – nur nicht Eingang→Eingang oder Ausgang→Ausgang.
- Abzweig: Wenn gerade kein Kabel verlegt wird, Klick auf eine beliebige Stelle einer bestehenden Leitung → neues Kabel nach derselben Logik.
- Verschiebt der Nutzer ein Bauteil, passt sich das Kabel nur bis zum nächsten festen Punkt an.
- Angeklickte Leitung: feste Punkte werden angezeigt und sind **verschiebbar**; feste Punkte lassen sich **hinzufügen** und **entfernen**, sofern die Leitung danach noch Sinn ergibt.
- Der A*-Router (`wire-router.ts`, `autoRoutes`) wird **nicht gelöscht**, sondern als toter Code gekennzeichnet.

Umsetzung (Nutzer: „Schritt 2 beenden, committen, mergen“ – Details von Claude entschieden, änderbar):
- **7.4** A* stillgelegt: `getWireDisplayPoints` zeichnet nur noch über `manualPoints` (`manualWirePath`) bzw. die einfache Z-/U-Form; `autoRoutes`/`wire-router.ts` als TOTER CODE markiert.
- **7.5** Verlegen: Vom letzten festen Punkt folgt ein L-Stück der gerasterten Maus (`lCorner`); erstes Stück in Pin-Richtung, danach quer zum vorigen Stück; **F** dreht die Knickreihenfolge um. **C**/Klick setzt Ecke + Punkt fest (`bendGroups` merkt, wie viele), **Backspace**/**Strg+Z** nimmt sie zurück. Über einem gültigen Ziel zeigt die Vorschau den endgültigen Verlauf (`drawnWirePath`: ohne Punkte Z-Form mit Knick auf der Rastermitte); gespeichert wird der komplette Verlauf als `manualPoints`. Abzweig-Startpunkte rasten entlang des Stücks ein. Tastenhilfe oben im Whiteboard.
- **7.6** Bearbeiten: Ausgewählte Leitung zeigt Griffe an ihren festen Punkten; Ziehen verschiebt (gerade Nachbarstücke wandern mit), Doppelklick auf Griff entfernt, Doppelklick auf Leitung fügt ein. Abzweige desselben Signals werden auf den neuen Verlauf gesetzt. „Sinn ergibt“: Entfernen ist immer erlaubt, weil der Verlauf rechtwinklig neu verbunden wird.
- Nebenbefund behoben: Ein zweiter `@HostListener('document:keydown')` in derselben Klasse überschreibt den ersten (Strg+C/V/Z wären tot) → C/F laufen über `onKeyboardShortcut`.
- Verifiziert: Unit-Tests (`lCorner`, `drawnWirePath`), E2E in headless Edge mit echter Maus/Tastatur (Szenario Bild 2, F, C, Klick, Backspace, Strg+Z, rückwärts, Abzweig, Ausgang→Ausgang abgelehnt, Bauteil verschieben, Griffe ziehen/entfernen/einfügen, globales Strg+Z).
- Offen/Ideen: Leitungen sind nur 2 px breit anklickbar (bestehend); „Verlauf automatisch“ im Panel entfernt die festen Punkte (→ Z-Form).

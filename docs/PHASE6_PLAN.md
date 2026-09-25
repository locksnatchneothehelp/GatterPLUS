# Phase 6 – Leitungen: Abzweigen, Knickpunkte, negierte Eingänge, Routing

- **Stand:** 2026-09-25 · Basis `main` @ `afc7a18` · Branch `feature/phase6-leitungen` · Status: **A in Arbeit**
- Arbeitsweise nach CLAUDE.md: je Schritt Plan → OK → umsetzen → verifizieren → eigener Commit.
- Anlass: Nutzer-Screenshot – Leitungen liegen übereinander, Abzweigen am belegten Ausgang kaum möglich; Ziel ist ein Aufbau wie in LogikSim (senkrechte Signalleitungen, T-Abzweige zu den Gattern).

## Ursachen (Analyse)

- Ausgang max. 1 Leitung (`getOutputPinMaxConnections` = 1); Abzweig nur per Klick auf eine Leitung, in den ersten 20 px nach dem Ausgang gesperrt (`findOutputStubAt`).
- Leitungen können nur am Ausgang/auf einer Leitung starten und nur am Eingang enden.
- Routing (`computeOrthogonalWaypoints`) je Leitung isoliert → identische Verläufe liegen übereinander; kein Ausweichen um Bauteile; `wire.points` wird gespeichert, beim Rendern aber verworfen.

## Schritte (Reihenfolge vom Nutzer bestätigt)

### A – Abzweigen einfach machen
- Fan-out erlaubt: `getOutputPinMaxConnections` → `Infinity` (Nutzer-Entscheidung; Tests angepasst). Klick auf belegten Ausgang startet weitere Leitung, Verbindungspunkt am Pin.
- Im Leitungs-Modus Klick auf den Ausgangs-Stummel einer Leitung → Start direkt am Ausgang (statt gesperrt).
- Umgekehrt zeichnen: Start an freiem Eingang, Ende an Ausgang oder auf einer Leitung (Abzweig).
- Hover-Hervorhebung der Leitung unter der Maus im Leitungs-Modus.

### B – Eigene Knickpunkte
- Klick auf freie Fläche beim Zeichnen setzt Knick; gespeichert in `wire.points` (Format unverändert), gerendert statt Auto-Routing; ohne Knicke weiter automatisch. Beim Verschieben passen sich nur die Endstücke an.

### Negierte Eingänge
- `negatedInputs?: number[]` analog zu `negatedOutputs` (Simulation, Darstellung, Umschalten, Projektdatei); LogikSim-Import nutzt es statt eingefügter NOT-Gatter.

### C – Automatisches Routing (optional)
- A*-Wegsuche auf 24-px-Raster (Bauteile meiden, Überlappung/Knicke bestrafen), Ergebnis gecacht, nur bei Änderungen neu.

## Fortschritt

| Schritt | Status | Commit |
|---|---|---|
| A Abzweigen | in Arbeit | – |
| B Knickpunkte | offen | – |
| Negierte Eingänge | offen | – |
| C Routing | offen (optional) | – |

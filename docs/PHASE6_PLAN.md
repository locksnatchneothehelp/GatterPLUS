# Phase 6 – Leitungen: Abzweigen, Knickpunkte, negierte Eingänge, Routing

- **Stand:** 2026-09-25 · Basis `main` @ `afc7a18` · Branch `feature/phase6-leitungen` · Status: **A, B, negierte Eingänge, C erledigt – Import-Layout als nächstes**
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

### C – Automatisches Routing (Reihenfolge Nutzer 2026-09-25: C → Import-Layout → Merge + Push)
- Reiner Router `models/wire-router.ts`: A* über ein Sichtbarkeitsgitter (Linien an Bauteilkanten ± Abstand, Pin-Austrittspunkte), Bauteile als Hindernisse; Kosten = Länge + Knick-Aufschlag + Aufschlag für Überlappung mit Leitungen anderer Signale (gleiches Signal darf teilen).
- Whiteboard: Ergebnis gecacht (gültig, solange `gates`/`wires`-Arrays unverändert – Immutable-Pattern); während Bauteil-Drag schneller Alt-Router, beim Loslassen A*. Abzweigpunkte werden auf den aktuellen Verlauf ihres Signals projiziert. Kein Weg → Alt-Router.
- Leitungen mit eigenen Knicken bleiben unverändert, zählen aber als belegt.

### Import-Layout wie im Original (nach C)
- Schalter/LED-Drehung aus dem Leitungsverlauf, LogikSim-Linien → `manualPoints`.

## Fortschritt

| Schritt | Status | Commit |
|---|---|---|
| A Abzweigen | erledigt (E2E mit echten Mausklicks 8/8) | siehe `git log` |
| B Knickpunkte | erledigt (Zielbild per Klick nachgebaut, E2E 9/9; + Button „Verlauf automatisch“) | siehe `git log` |
| Negierte Eingänge | erledigt (Sim-Tests, Äquivalenz „Tür darf schließen“ 8/8, E2E 7/7; Import ohne NOT-Gatter) | siehe `git log` |
| C Routing | erledigt (A*; Problemschaltung ohne Überlappung/Kreuzung, 45 Leitungen in 8 ms; E2E 7/7 + Regression 52/52) | siehe `git log` |

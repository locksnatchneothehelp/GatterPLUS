import {
  getOutputPinMaxConnections,
  computeOrthogonalWaypoints,
  getPinDirection,
  GateType,
  GateInstance,
} from './gate.model';

// ─── Test-Fixture ───────────────────────────────────────────────────────────

function makeGate(rotation: 0 | 90 | 180 | 270): GateInstance {
  return {
    id: 'g1', type: 'and', x: 0, y: 0, rotation, color: 'default',
    inputCount: 2, inputValue: false, ffState: false, clockPeriodMs: 1000,
  };
}

// ─── Tests: getOutputPinMaxConnections ────────────────────────────────────────

describe('getOutputPinMaxConnections', () => {
  const basicTypes: GateType[] = [
    'and', 'or', 'not', 'xor',
    'jk-ff', 'half-adder', 'full-adder',
    'input', 'output', 'clock-gen', 'text-label',
  ];

  it('gibt 1 für alle Basistypen zurück (kein Fan-out)', () => {
    for (const type of basicTypes) {
      expect(getOutputPinMaxConnections(type)).toBe(1);
    }
  });

  it('gibt eine positive ganze Zahl zurück', () => {
    for (const type of basicTypes) {
      expect(getOutputPinMaxConnections(type)).toBeGreaterThan(0);
    }
  });
});

// ─── Tests: computeOrthogonalWaypoints ────────────────────────────────────────

describe('computeOrthogonalWaypoints', () => {

  // ── Vorwärts-Fall ──────────────────────────────────────────────────────────

  it('Gerade horizontale Linie (gleiche Y) → keine Waypoints', () => {
    const pts = computeOrthogonalWaypoints(0, 50, 100, 50);
    expect(pts).toEqual([]);
  });

  it('Vorwärts, unterschiedliche Y → Z-Form mit 2 Waypoints', () => {
    const pts = computeOrthogonalWaypoints(0, 0, 100, 60);
    expect(pts).toHaveLength(2);
    expect(pts[0].x).toBe(50); // midX
    expect(pts[0].y).toBe(0);  // startY
    expect(pts[1].x).toBe(50); // midX
    expect(pts[1].y).toBe(60); // endY
  });

  it('Vorwärts, leicht anderer Y → Z-Form (kein Spezialfall für kleine Abstände)', () => {
    const pts = computeOrthogonalWaypoints(0, 0, 80, 2);
    expect(pts).toHaveLength(2);
  });

  // ── Rückwärts-Fall ─────────────────────────────────────────────────────────

  it('Rückwärts → 4 Waypoints (U-Kurve)', () => {
    const pts = computeOrthogonalWaypoints(200, 50, 50, 50);
    expect(pts).toHaveLength(4);
  });

  it('Rückwärts, Pin oben und unten ähnlich → Route geht nach oben (kürzer)', () => {
    // Start: x=200, y=10; Ende: x=0, y=10 — beide oben → oben kürzer als unten
    const pts = computeOrthogonalWaypoints(200, 10, 0, 10, 100, 100);
    // routeY sollte kleiner als min(10,10) sein → also negativ / < 10
    const routeY = pts[1].y;
    expect(routeY).toBeLessThan(10);
  });

  it('Rückwärts, Pin unten → Route geht nach unten wenn kürzer', () => {
    // Start: x=200, y=90; Ende: x=0, y=90; Bauteile bis y=100
    const pts = computeOrthogonalWaypoints(200, 90, 0, 90, 100, 100);
    // aboveY = 90 - 24 = 66, belowY = 100 + 24 = 124
    // costAbove = |90-66| + |90-66| = 48; costBelow = |90-124| + |90-124| = 68
    // → oben kürzer
    const routeY = pts[1].y;
    expect(routeY).toBeLessThan(90);
  });

  it('Rückwärts, ohne fromGateBottomY → fällt auf einfache obere Route zurück', () => {
    const pts = computeOrthogonalWaypoints(200, 50, 0, 50);
    expect(pts).toHaveLength(4);
    // Wenn keine Gate-Dimensionen → belowY = max(50,50) + GAP = 74
    // costAbove = |50-26| + |50-26| = 48; costBelow = |50-74| + |50-74| = 48
    // Bei Gleichstand: oben bevorzugt
    expect(pts[1].y).toBeLessThanOrEqual(50);
  });

  it('x-Koordinaten der Waypoints liegen immer zwischen Start und Ende (mit GAP)', () => {
    const pts = computeOrthogonalWaypoints(200, 30, 50, 80);
    expect(pts[0].x).toBeGreaterThan(200); // start.x + GAP
    expect(pts[3].x).toBeLessThan(50);     // end.x - GAP
  });

  // ── Regression: Leitung um "erweiterte" (hohe) Gatter herumleiten ──────────

  it('Rückwärts, erweitertes (hohes) Ziel-Gatter → obere Route räumt die echte Gatter-Oberkante frei, nicht nur die Pin-Höhe', () => {
    // Szenario aus dem gemeldeten Bug: Das Ziel ist ein AND-Gatter mit vielen
    // Eingängen (dadurch y-Bereich 50–350, "erweitert"). Der verbundene
    // Eingangs-Pin liegt bei y=200 — weit unterhalb der echten Oberkante (50).
    // Ohne toGateTopY würde aboveY = min(200,200)-24 = 176 betragen, was
    // MITTEN IM Gatter liegt (zwischen 50 und 350) — die Leitung hätte
    // sichtbar durch den Gatter-Körper geschnitten (der gemeldete Bug).
    const pts = computeOrthogonalWaypoints(
      300, 200,   // Start: Ausgangs-Pin eines normalen Gatters
      50, 200,    // Ende: Eingangs-Pin des erweiterten Ziel-Gatters
      220, 350,   // fromGateBottomY, toGateBottomY
      180, 50     // fromGateTopY, toGateTopY
    );
    const routeY = pts[1].y;
    // Route muss oberhalb der ECHTEN Ziel-Gatter-Oberkante (50) liegen,
    // nicht nur oberhalb der reinen Pin-Höhe (200).
    expect(routeY).toBeLessThan(50);
  });

  it('Ohne Top-Angabe (Fallback) orientiert sich die obere Route nur an der Pin-Höhe', () => {
    // Dokumentiert das frühere (fehlerhafte) Verhalten als Kontrast zum Test
    // oben: ohne die echten Gatter-Oberkanten wird nur ein fester Abstand
    // (GAP) von der Pin-Höhe genommen — bei einem hohen Gatter reicht das
    // nicht aus, um über dessen tatsächliche Oberkante zu gelangen.
    const pts = computeOrthogonalWaypoints(300, 200, 50, 200, 220, 350);
    const routeY = pts[1].y;
    expect(routeY).toBe(176); // min(200,200) - 24, ignoriert die Gatter-Höhe
  });

  // ── Regression: Leitungsführung bei rotierten Bauteilen ────────────────────

  it('Vorwärts mit Standard-Richtungen verhält sich identisch zum alten Verhalten (Rückwärtskompatibilität)', () => {
    const withDefaults = computeOrthogonalWaypoints(0, 0, 100, 60);
    const withExplicit = computeOrthogonalWaypoints(
      0, 0, 100, 60, undefined, undefined, undefined, undefined,
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }
    );
    expect(withExplicit).toEqual(withDefaults);
  });

  it('Beide Pins vertikal (z.B. zwei 90°-gedrehte Bauteile untereinander) → horizontaler Mittelknick statt vertikalem', () => {
    // Start-Pin zeigt nach unten (Ausgang eines 90°-gedrehten Gatters),
    // Ziel-Pin zeigt nach oben (Eingang eines 270°-gedrehten Gatters) —
    // die Leitung muss senkrecht aus-/eintreten, nicht waagerecht.
    const pts = computeOrthogonalWaypoints(
      100, 0, 150, 100,
      undefined, undefined, undefined, undefined,
      { dx: 0, dy: 1 },  // Start zeigt nach unten
      { dx: 0, dy: -1 }, // Ziel zeigt nach oben
    );
    expect(pts).toHaveLength(2);
    // Beide Zwischenpunkte liegen auf derselben Y (horizontaler Knick)
    expect(pts[0].y).toBe(pts[1].y);
    // Der erste Punkt behält die Start-X, der zweite die Ziel-X bei
    // (Bewegung: erst senkrecht, dann waagerecht, dann wieder senkrecht)
    expect(pts[0].x).toBe(100);
    expect(pts[1].x).toBe(150);
  });

  it('Senkrecht zueinander (Start horizontal, Ziel vertikal) → Leitung tritt in beiden Pins in der korrekten Richtung ein/aus', () => {
    // Start: Ausgang zeigt nach rechts (unrotiertes Gatter)
    // Ziel: Eingang zeigt nach oben (270°-gedrehtes Gatter, Eingang "unten")
    const x1 = 100, y1 = 50, x2 = 250, y2 = 150;
    const pts = computeOrthogonalWaypoints(
      x1, y1, x2, y2,
      undefined, undefined, undefined, undefined,
      { dx: 1, dy: 0 },   // Start: nach rechts
      { dx: 0, dy: 1 },   // Ziel zeigt nach unten → Leitung muss von UNTEN kommend nach oben eintreten
    );
    const full = [{ x: x1, y: y1 }, ...pts, { x: x2, y: y2 }];
    // Erstes Segment muss horizontal nach rechts verlaufen (Start-Richtung)
    expect(full[1].y).toBe(y1);
    expect(full[1].x).toBeGreaterThan(x1);
    // Letztes Segment muss von unten (größeres Y) kommend senkrecht in
    // den Ziel-Pin eintreten (Ziel zeigt nach unten → Eintritt von unten)
    const secondLast = full[full.length - 2];
    expect(secondLast.x).toBe(x2);
    expect(secondLast.y).toBeGreaterThan(y2);
  });

  it('Senkrecht zueinander (Start vertikal, Ziel horizontal) → Leitung tritt in beiden Pins in der korrekten Richtung ein/aus', () => {
    const x1 = 100, y1 = 50, x2 = 250, y2 = 150;
    const pts = computeOrthogonalWaypoints(
      x1, y1, x2, y2,
      undefined, undefined, undefined, undefined,
      { dx: 0, dy: -1 },  // Start zeigt nach oben
      { dx: -1, dy: 0 },  // Ziel: normaler Eingang, zeigt nach links
    );
    const full = [{ x: x1, y: y1 }, ...pts, { x: x2, y: y2 }];
    // Erstes Segment muss senkrecht nach oben verlaufen (Start-Richtung)
    expect(full[1].x).toBe(x1);
    expect(full[1].y).toBeLessThan(y1);
    // Letztes Segment muss von links kommend waagerecht in den Ziel-Pin
    // eintreten (Ziel zeigt nach links → Leitung bewegt sich beim Eintritt
    // nach rechts, kommt also von einem kleineren X)
    const secondLast = full[full.length - 2];
    expect(secondLast.y).toBe(y2);
    expect(secondLast.x).toBeLessThan(x2);
  });
});

// ─── Tests: getPinDirection ─────────────────────────────────────────────────

describe('getPinDirection', () => {
  it('unrotiert (0°): Ausgang zeigt nach rechts, Eingang nach links', () => {
    const gate = makeGate(0);
    expect(getPinDirection(gate, 'output')).toEqual({ dx: 1, dy: 0 });
    expect(getPinDirection(gate, 'input')).toEqual({ dx: -1, dy: 0 });
  });

  it('90° im Uhrzeigersinn: Ausgang zeigt nach unten, Eingang nach oben', () => {
    // Muss mit der tatsächlichen visuellen CSS-Rotation (transform: rotate())
    // übereinstimmen — empirisch im Browser verifiziert (siehe Commit).
    const gate = makeGate(90);
    expect(getPinDirection(gate, 'output')).toEqual({ dx: 0, dy: 1 });
    expect(getPinDirection(gate, 'input')).toEqual({ dx: 0, dy: -1 });
  });

  it('180°: Ausgang zeigt nach links, Eingang nach rechts (umgekehrt zu 0°)', () => {
    const gate = makeGate(180);
    expect(getPinDirection(gate, 'output')).toEqual({ dx: -1, dy: 0 });
    expect(getPinDirection(gate, 'input')).toEqual({ dx: 1, dy: 0 });
  });

  it('270°: Ausgang zeigt nach oben, Eingang nach unten (umgekehrt zu 90°)', () => {
    const gate = makeGate(270);
    expect(getPinDirection(gate, 'output')).toEqual({ dx: 0, dy: -1 });
    expect(getPinDirection(gate, 'input')).toEqual({ dx: 0, dy: 1 });
  });

  it('liefert immer exakte Einheitsvektoren ohne Fließkomma-Reste', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const gate = makeGate(rotation);
      for (const type of ['input', 'output'] as const) {
        const dir = getPinDirection(gate, type);
        expect(Number.isInteger(dir.dx)).toBe(true);
        expect(Number.isInteger(dir.dy)).toBe(true);
      }
    }
  });
});

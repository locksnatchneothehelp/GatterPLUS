/**
 * Alle unterstützten Komponenten-Typen in GatterPLUS (Phase 2).
 *
 * Gatter:    'and' | 'or' | 'not' | 'xor'
 * Flip-Flop: 'jk-ff'
 * Kombi:     'half-adder' | 'full-adder'
 * I/O:       'input' | 'output' | 'clock-gen' | 'text-label'
 */
export type GateType =
  | 'and' | 'or' | 'not' | 'xor'
  | 'jk-ff'
  | 'half-adder' | 'full-adder'
  | 'input' | 'output'
  | 'clock-gen' | 'text-label';

/**
 * Drehwinkel einer Komponente (im Uhrzeigersinn, 0 = Standard-Ausrichtung).
 */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Gehäuse-Farbe einer Komponente.
 * 'default' = weißer Körper (Standard).
 */
export type GateColor = 'default' | 'yellow' | 'green' | 'red' | 'orange';

/**
 * Eine auf dem Whiteboard platzierte Komponenten-Instanz.
 * (x, y) sind die Canvas-Koordinaten der linken oberen Ecke NACH Rotation.
 */
export interface GateInstance {
  /** Eindeutige ID, z.B. 'gate-1' */
  id: string;
  /** Typ der Komponente */
  type: GateType;
  /** Horizontale Canvas-Position (Pixel) */
  x: number;
  /** Vertikale Canvas-Position (Pixel) */
  y: number;
  /** Drehwinkel (Uhrzeigersinn). Standard: 0. */
  rotation: Rotation;
  /** Gehäuse-Farbe. Standard: 'default' (weiß). */
  color: GateColor;
  /**
   * Anzahl der Eingangspins (nur für and/or/xor: 2–8).
   * Für alle anderen Typen: fixed (durch getGatePinOffsets bestimmt).
   */
  inputCount: number;
  /**
   * Nur für type === 'input' / 'clock-gen': aktueller Ausgangs-Zustand.
   * true = HIGH, false = LOW.
   */
  inputValue?: boolean;
  /**
   * Nur für type === 'jk-ff': gespeicherter Q-Zustand (Flip-Flop-Speicher).
   */
  ffState?: boolean;
  /**
   * Nur für type === 'jk-ff': Taktzustand des letzten Schritts.
   * Dient zur Erkennung der steigenden Taktflanke (0→1) — der JK-FF ist
   * flankengesteuert und schaltet nur bei dieser Flanke.
   */
  ffPrevClock?: boolean;
  /**
   * Nur für type === 'text-label': anzuzeigender Text.
   */
  label?: string;
  /**
   * Nur für type === 'clock-gen': Periodendauer in Millisekunden.
   */
  clockPeriodMs?: number;
  /**
   * Indizes der Ausgangs-Pins, deren Signal invertiert (verneint) wird.
   * Wird im Pan-Modus durch Klick auf den Ausgangs-Stub gesetzt/entfernt.
   */
  negatedOutputs?: number[];
}

/**
 * Eine Leitungsverbindung zwischen Ausgangs-Pin und Eingangs-Pin.
 * Enthält optional Wegpunkte für eine orthogonale (rechtwinklige) Führung.
 */
export interface WireConnection {
  /** Eindeutige Leitungs-ID */
  id: string;
  /** ID der Quell-Komponente */
  fromGateId: string;
  /** Pin-Index des Ausgangs */
  fromPinIndex: number;
  /** ID der Ziel-Komponente */
  toGateId: string;
  /** Pin-Index des Eingangs */
  toPinIndex: number;
  /**
   * Zwischenpunkte für die rechtwinklige Leitungsführung.
   * Leer = gerade Linie von Start zu Ende.
   * In der Regel 2 Punkte für einen horizontalen Knick:
   *   Start → (midX, startY) → (midX, endY) → Ende
   */
  points: { x: number; y: number }[];
  /**
   * Falls diese Leitung als Abzweigung von einer BESTEHENDEN Leitung
   * gezogen wurde (Klick auf eine beliebige Stelle der Original-Leitung,
   * nicht auf den Ausgangs-Pin selbst): der exakte Punkt auf der
   * Original-Leitung, an dem die Abzweigung visuell beginnt.
   *
   * Rein für die Darstellung (Rendering + T-Punkt-Anzeige) — elektrisch
   * bleibt weiterhin fromGateId/fromPinIndex die tatsächliche Signalquelle
   * (derselbe Ausgangs-Pin wie die Original-Leitung).
   */
  branchPoint?: { x: number; y: number };
  /**
   * Austrittsrichtung am branchPoint (nur relevant, wenn branchPoint gesetzt
   * ist). Ein freier Punkt im Raum hat keine Rotation, die sich live ändern
   * könnte — anders als bei einem echten Pin wird diese Richtung deshalb
   * einmalig beim Erstellen gespeichert statt bei jedem Rendern neu berechnet.
   */
  fromDir?: PinDirection;
}

/**
 * X/Y-Versatz eines Pins relativ zur linken oberen Ecke der NICHT-rotierten Komponente.
 */
export interface PinOffset {
  x: number;
  y: number;
}

/**
 * Erkennungs-Radius für Pin-Klicks (logische Pixel).
 */
export const PIN_HIT_RADIUS = 12;

/**
 * Feste Abmessungen aller Komponenten-Typen (nicht-rotiert, ohne variable Eingänge).
 * width  = Breite des gesamten visuellen Elements (inkl. Drähte)
 * height = Höhe des gesamten visuellen Elements
 */
export const GATE_BASE_SIZE: Record<GateType, { w: number; h: number }> = {
  and:          { w: 76, h: 52 },
  or:           { w: 76, h: 52 },
  not:          { w: 76, h: 52 },
  xor:          { w: 76, h: 52 },
  'jk-ff':      { w: 76, h: 100 },
  'half-adder': { w: 76, h: 52 },
  'full-adder': { w: 76, h: 70 },
  input:        { w: 76, h: 52 },
  output:       { w: 76, h: 52 },
  'clock-gen':  { w: 76, h: 52 },
  'text-label': { w: 80, h: 30 },
};

/**
 * Gibt die tatsächlichen Abmessungen einer Komponenten-Instanz zurück.
 * Für and/or/xor wächst die Höhe mit der Eingangsanzahl.
 */
export function getGateDimensions(gate: GateInstance): { w: number; h: number } {
  const base = GATE_BASE_SIZE[gate.type];
  if (gate.type === 'and' || gate.type === 'or' || gate.type === 'xor') {
    // Höhe wächst mit Eingangsanzahl: min. 52px, dann 16px pro Eingang
    const h = Math.max(base.h, (gate.inputCount + 1) * 16 + 8);
    return { w: base.w, h };
  }
  return { ...base };
}

/**
 * Berechnet alle Pin-Positionen für eine Komponenten-Instanz.
 * Berücksichtigt variable Eingangsanzahl (and/or/xor).
 * Positionen sind relativ zur linken oberen Ecke der NICHT-rotierten Komponente.
 */
export function getGatePinOffsets(
  gate: GateInstance
): { inputs: PinOffset[]; outputs: PinOffset[] } {
  const dim = getGateDimensions(gate);

  switch (gate.type) {
    case 'and':
    case 'or':
    case 'xor': {
      // Pin-Positionen exakt nach CSS-Logik berechnen:
      //   .pins-in { justify-content: space-around; padding: 10px 0 }
      //   .wire    { height: 2px }
      // CSS space-around: jedes Element bekommt (freier_platz / n) als Einheit,
      // davon je eine halbe Einheit vor und nach dem Element.
      const PAD = 10;     // padding oben und unten
      const T   = 2;      // Draht-Höhe in px
      const n   = gate.inputCount;
      const unit    = (dim.h - 2 * PAD - n * T) / n;
      const halfUnit = unit / 2;
      const inputs = Array.from({ length: n }, (_, i) => ({
        x: 0,
        y: Math.round(PAD + halfUnit + T / 2 + i * (unit + T)),
      }));
      return { inputs, outputs: [{ x: dim.w, y: Math.round(dim.h / 2) }] };
    }

    case 'not':
      return {
        inputs:  [{ x: 0,      y: 26 }],
        outputs: [{ x: dim.w,  y: 26 }],
      };

    case 'input':
      return {
        inputs:  [],
        outputs: [{ x: dim.w, y: 26 }],
      };

    case 'output':
      return {
        inputs:  [{ x: 0, y: 26 }],
        outputs: [],
      };

    case 'clock-gen':
      return {
        inputs:  [],
        outputs: [{ x: dim.w, y: 26 }],
      };

    case 'text-label':
      return { inputs: [], outputs: [] };

    case 'jk-ff':
      // Eingänge (oben→unten): S, J, C (Takt), K, R
      // CSS: .pins-in { padding: 8px 0; space-around; h=100px }
      //   → Y_i = 8 + (84/5)*(i+0.5)  =  16, 33, 50, 67, 84
      // Ausgänge: Q (oben), Q̄ (unten)
      // CSS: .pins-out { padding: 20px 0; space-around; h=100px }
      //   → Y_i = 20 + (60/2)*(i+0.5)  =  35, 65
      return {
        inputs: [
          { x: 0, y: 16 }, // S
          { x: 0, y: 33 }, // J
          { x: 0, y: 50 }, // C (Takt)
          { x: 0, y: 67 }, // K
          { x: 0, y: 84 }, // R
        ],
        outputs: [
          { x: dim.w, y: 35 }, // Q
          { x: dim.w, y: 65 }, // Q̄
        ],
      };

    case 'half-adder':
      // Eingänge: A, B — Ausgänge: S (Summe), C (Carry)
      return {
        inputs:  [{ x: 0, y: 18 }, { x: 0, y: 34 }],
        outputs: [{ x: dim.w, y: 18 }, { x: dim.w, y: 34 }],
      };

    case 'full-adder':
      // Eingänge: A, B, Cin — Ausgänge: S (Summe), Cout (Übertrag)
      return {
        inputs:  [{ x: 0, y: 14 }, { x: 0, y: 35 }, { x: 0, y: 56 }],
        outputs: [{ x: dim.w, y: 22 }, { x: dim.w, y: 48 }],
      };

    default:
      return { inputs: [], outputs: [] };
  }
}

/**
 * Berechnet die Weltkoordinaten eines Pins unter Berücksichtigung der Rotation.
 *
 * Algorithmus:
 * 1. Offset des Pins relativ zur linken oberen Ecke (nicht-rotiert)
 * 2. Offset relativ zum Mittelpunkt des Bauteils umrechnen
 * 3. Um den Mittelpunkt um den Drehwinkel rotieren (Uhrzeigersinn)
 * 4. Wieder in Weltkoordinaten umrechnen
 *
 * @param gate      Die Komponenten-Instanz (enthält Position, Typ, Rotation)
 * @param pinType   'input' oder 'output'
 * @param pinIndex  Index des Pins innerhalb des Typs
 */
export function getPinWorldPos(
  gate: GateInstance,
  pinType: 'input' | 'output',
  pinIndex: number
): { x: number; y: number } {
  const offsets = getGatePinOffsets(gate);
  const pin = pinType === 'input' ? offsets.inputs[pinIndex] : offsets.outputs[pinIndex];
  if (!pin) return { x: gate.x, y: gate.y };

  const dim = getGateDimensions(gate);

  // Mittelpunkt des Bauteils in Weltkoordinaten
  const cx = gate.x + dim.w / 2;
  const cy = gate.y + dim.h / 2;

  // Versatz des Pins relativ zum Mittelpunkt
  const dx = pin.x - dim.w / 2;
  const dy = pin.y - dim.h / 2;

  // Rotation im Uhrzeigersinn (Bildschirm-Koordinaten, Y wächst nach unten).
  // WICHTIG: Das CSS-Transform `rotate(Ndeg)` (siehe getGateTransform in
  // whiteboard.ts) dreht den Gatter-Körper im Uhrzeigersinn. Damit Pins exakt
  // auf den sichtbaren Drähten landen, muss die Formel dieselbe Drehrichtung
  // abbilden — das erfordert hier ein NEGATIVES Vorzeichen im Winkel
  // (empirisch verifiziert: bei 90°/270° lagen Ein-/Ausgangs-Pin sonst genau
  // vertauscht auf der falschen Seite). isPointInGate() muss als Umkehrung
  // dieser Abbildung konsequent das jeweils andere Vorzeichen verwenden.
  const angle = -(gate.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;

  return { x: Math.round(cx + rx), y: Math.round(cy + ry) };
}

/** Achsenparalleler Einheits-Richtungsvektor (immer dx/dy ∈ {-1,0,1}). */
export interface PinDirection {
  dx: number;
  dy: number;
}

/**
 * Richtung, in die ein Pin aus dem Bauteil-Körper heraus zeigt (Einheitsvektor).
 *
 * Unrotiert zeigen Eingänge nach links (-1,0) und Ausgänge nach rechts (1,0).
 * Die Rotation des Bauteils dreht diese Richtung exakt mit derselben Formel
 * wie getPinWorldPos() — nur so bleiben Position und Austrittsrichtung eines
 * Pins konsistent zueinander (wichtig für die Leitungsführung bei rotierten
 * Bauteilen, siehe computeOrthogonalWaypoints()).
 */
export function getPinDirection(gate: GateInstance, pinType: 'input' | 'output'): PinDirection {
  const baseDx = pinType === 'output' ? 1 : -1;
  const angle  = -(gate.rotation * Math.PI) / 180;
  // Runden, da bei Vielfachen von 90° minimale Fließkomma-Reste (~1e-16)
  // entstehen können, die dx/dy sonst nicht exakt auf -1/0/1 fallen ließen.
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  // "|| 0" normalisiert -0 zu 0 (z.B. bei 180°), damit Vergleiche wie
  // dx === 0 und toEqual({dx:0,...}) verlässlich funktionieren.
  return { dx: (baseDx * cos) || 0, dy: (-baseDx * sin) || 0 };
}

/**
 * Prüft ob ein Punkt (px, py) innerhalb des Bounding-Box eines Bauteils liegt.
 * Berücksichtigt die Rotation durch inverse Rotation des Testpunkts.
 */
export function isPointInGate(
  px: number,
  py: number,
  gate: GateInstance
): boolean {
  const dim = getGateDimensions(gate);
  const cx = gate.x + dim.w / 2;
  const cy = gate.y + dim.h / 2;

  // Testpunkt relativ zum Mittelpunkt
  const dx = px - cx;
  const dy = py - cy;

  // Inverse Rotation zu getPinWorldPos() — dort wird mit -rotation gearbeitet,
  // hier entsprechend mit +rotation (siehe Kommentar in getPinWorldPos()).
  const angle = (gate.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;

  // Im rotierten Referenzrahmen: ist der Punkt innerhalb des Rechtecks?
  return (
    lx >= -dim.w / 2 && lx <= dim.w / 2 &&
    ly >= -dim.h / 2 && ly <= dim.h / 2
  );
}

/**
 * Hilfsfunktion: Erstellt eine neue GateInstance mit Standardwerten.
 */
export function createGateInstance(
  id: string,
  type: GateType,
  x: number,
  y: number
): GateInstance {
  return {
    id,
    type,
    x,
    y,
    rotation: 0,
    color: 'default',
    inputCount: type === 'and' || type === 'or' || type === 'xor' ? 2 : 1,
    inputValue: false,
    ffState: false,
    clockPeriodMs: 1000,
    label: type === 'text-label' ? 'Label' : undefined,
  };
}

/**
 * Gibt an, wie viele Leitungen von einem Ausgangs-Pin abgehen dürfen.
 *
 * Standardmäßig ist Fan-out (1 Ausgang → mehrere Eingänge) für alle Bausteine
 * deaktiviert (Rückgabewert 1), da dies in einem Lern-Simulator übersichtlicher
 * ist. Um Fan-out für einen bestimmten Typ zu erlauben, kann der Wert auf
 * `Infinity` gesetzt werden.
 */
export function getOutputPinMaxConnections(_gateType: GateType): number {
  // Für alle Typen: maximal 1 Verbindung pro Ausgangs-Pin (kein Fan-out)
  return 1;
}

/**
 * Berechnet Wegpunkte entlang EINER Hauptachse (a) mit einer Nebenachse (b).
 * Wird für horizontale Leitungen mit (a=x, b=y) aufgerufen, und für vertikale
 * Leitungen (zwei Pins, die beide nach oben/unten zeigen — z.B. zwei um 90°
 * gedrehte Bauteile) mit vertauschten Achsen (a=y, b=x), siehe
 * computeOrthogonalWaypoints(). Dadurch wird dieselbe Z-Form/U-Kurven-Logik
 * für beide Achsen wiederverwendet, statt sie zu duplizieren.
 *
 * fromSign/targetSign: +1 = Pin verlässt das Bauteil in Richtung wachsender
 * a-Koordinate, -1 = in Richtung fallender a-Koordinate. targetSign ist die
 * Richtung, in die sich die Leitung bewegen muss, wenn sie den Ziel-Pin
 * erreicht (das Gegenteil der Richtung, in die der Ziel-Pin selbst zeigt).
 */
function computeAxisAlignedWaypoints(
  a1: number, b1: number,
  a2: number, b2: number,
  fromSign: number, targetSign: number,
  fromBottomB?: number, toBottomB?: number,
  fromTopB?:    number, toTopB?:    number,
): { x: number; y: number }[] {
  const GAP = 24;

  // "Vorwärts" nur möglich, wenn beide Pins auf dieselbe Gesamtrichtung
  // hinauslaufen (Standardfall: Ausgang zeigt z.B. nach rechts, Eingang
  // wird von rechts erreicht — targetSign===fromSign) UND das Ziel
  // tatsächlich in dieser Richtung liegt.
  const forward = fromSign === targetSign
    && (fromSign > 0 ? a2 >= a1 : a2 <= a1);

  if (forward) {
    if (Math.abs(b2 - b1) < 1) {
      return []; // Gerade Linie — keine Zwischenpunkte nötig
    }
    const midA = Math.round((a1 + a2) / 2);
    return [{ x: midA, y: b1 }, { x: midA, y: b2 }];
  }

  // U-Kurve: Start verlässt das Bauteil um GAP in fromSign-Richtung,
  // Ziel wird um GAP entgegen seiner eigenen Austrittsrichtung erreicht.
  const aOutFrom = a1 + fromSign   * GAP;
  const aOutTo   = a2 - targetSign * GAP;

  // Route entlang der Nebenachse: "oberhalb" (kleineres b) oder "unterhalb"
  // (größeres b) der tatsächlichen Bauteil-Kanten (falls bekannt), sonst
  // Fallback auf die reinen Pin-Koordinaten.
  const bAbove = Math.min(fromTopB ?? b1, toTopB ?? b2) - GAP;
  const bBelow = fromBottomB !== undefined && toBottomB !== undefined
    ? Math.max(fromBottomB, toBottomB) + GAP
    : Math.max(b1, b2) + GAP;

  const costAbove = Math.abs(b1 - bAbove) + Math.abs(b2 - bAbove);
  const costBelow = Math.abs(b1 - bBelow) + Math.abs(b2 - bBelow);
  const routeB = costAbove <= costBelow ? bAbove : bBelow;

  return [
    { x: aOutFrom, y: b1 },
    { x: aOutFrom, y: routeB },
    { x: aOutTo,   y: routeB },
    { x: aOutTo,   y: b2 },
  ];
}

/**
 * Berechnet die Wegpunkte für eine orthogonale (rechtwinklige) Leitung.
 *
 * Berücksichtigt die tatsächliche Austrittsrichtung beider Pins (fromDir/
 * toDir, siehe getPinDirection()) — wichtig bei rotierten Bauteilen: ein um
 * 90°/270° gedrehtes Gatter hat seine Ein-/Ausgänge oben/unten statt links/
 * rechts, die Leitung muss dort also senkrecht statt waagerecht ansetzen,
 * sonst entstehen Lücken oder unsinnige Verläufe (siehe gemeldeter Bug).
 * Ohne Angabe verhalten sich fromDir/toDir wie bisher (Ausgang rechts,
 * Eingang links) — bestehende Aufrufe bleiben dadurch unverändert korrekt.
 *
 * Fallunterscheidung:
 * - Beide Pins horizontal (0°/180°-Bauteile): Z-Form mit Mittelknick, wenn
 *   das Ziel in Austrittsrichtung liegt; sonst U-Kurve um die Bauteile herum
 *   (Route oben/unten wird anhand der kürzeren Strecke gewählt).
 * - Beide Pins vertikal (90°/270°-Bauteile): dieselbe Logik, um 90° gedreht
 *   (Z-Form mit horizontalem Mittelknick, bzw. U-Kurve links/rechts herum).
 * - Ein Pin horizontal, der andere vertikal (gemischte Rotation): Leitung
 *   verlässt den Start-Pin gerade in dessen Richtung, macht einen Bogen und
 *   erreicht den Ziel-Pin exakt entgegen dessen Austrittsrichtung — dadurch
 *   entsteht nie eine Lücke, unabhängig von der relativen Lage der Bauteile.
 *
 * fromGateTopY/toGateTopY bzw. fromGateBottomY/toGateBottomY geben die
 * tatsächlichen Bauteil-Kanten an (nicht nur die Pin-Höhe) — wichtig bei
 * "erweiterten" Gattern (z.B. AND mit vielen Eingängen, dadurch höher): ein
 * mittlerer/unterer Eingangs-Pin liegt dann weit unterhalb der echten
 * Gatter-Oberkante. Ohne diese Info würde die "obere" Route nur knapp über
 * dem Pin (statt über dem ganzen Gatter) verlaufen und mitten durch den
 * Gatter-Körper geschnitten werden.
 */
export function computeOrthogonalWaypoints(
  x1: number, y1: number,
  x2: number, y2: number,
  fromGateBottomY?: number,
  toGateBottomY?:   number,
  fromGateTopY?:    number,
  toGateTopY?:      number,
  fromDir: PinDirection = { dx: 1, dy: 0 },
  toDir:   PinDirection = { dx: -1, dy: 0 },
): { x: number; y: number }[] {
  const GAP = 24;

  // Richtung, in die sich die Leitung bewegen muss, um in den Ziel-Pin
  // hineinzulaufen (das Gegenteil der Richtung, in die der Pin herausragt).
  const targetDx = -toDir.dx;
  const targetDy = -toDir.dy;

  const fromHorizontal   = fromDir.dy === 0;
  const targetHorizontal = targetDy === 0;

  // ── Beide Pins horizontal (Standardfall bei 0°/180°-Bauteilen) ──────────
  if (fromHorizontal && targetHorizontal) {
    return computeAxisAlignedWaypoints(
      x1, y1, x2, y2, fromDir.dx, targetDx,
      fromGateBottomY, toGateBottomY, fromGateTopY, toGateTopY,
    );
  }

  // ── Beide Pins vertikal (z.B. zwei 90°/270°-gedrehte Bauteile) ──────────
  // Achsen vertauschen (a=y, b=x), dieselbe Logik wiederverwenden, Ergebnis
  // zurücktauschen. Ober-/Unterkanten-Bounds sind hier nicht bekannt (nur
  // Y-Kanten liegen vor) — Fallback auf reine Pin-Koordinaten genügt für
  // diesen selteneren Fall.
  if (!fromHorizontal && !targetHorizontal) {
    const swapped = computeAxisAlignedWaypoints(y1, x1, y2, x2, fromDir.dy, targetDy);
    return swapped.map(p => ({ x: p.y, y: p.x }));
  }

  // ── Gemischt: ein Pin horizontal, der andere vertikal ───────────────────
  // Robuster Zickzack-Pfad, der IMMER in der richtigen Richtung aus- bzw.
  // eintritt, unabhängig von der relativen Lage der beiden Bauteile.
  if (fromHorizontal) {
    const stubX = x1 + fromDir.dx * GAP;
    const stubY = y2 + toDir.dy   * GAP;
    return [
      { x: stubX, y: y1 },
      { x: stubX, y: stubY },
      { x: x2,    y: stubY },
    ];
  }
  const stubY = y1 + fromDir.dy * GAP;
  const stubX = x2 + toDir.dx   * GAP;
  return [
    { x: x1,    y: stubY },
    { x: stubX, y: stubY },
    { x: stubX, y: y2 },
  ];
}

// ─── Legacy-Kompatibilität ────────────────────────────────────────────────────
// Wird von simulation.service.ts und whiteboard.ts nicht mehr direkt genutzt,
// aber zum Übergang behalten. Alle neuen Stellen nutzen getGatePinOffsets().
export const GATE_PIN_OFFSETS: Record<GateType, { inputs: PinOffset[]; outputs: PinOffset[] }> = {
  and:          { inputs: [{ x:0, y:18 }, { x:0, y:34 }], outputs: [{ x:76, y:26 }] },
  or:           { inputs: [{ x:0, y:18 }, { x:0, y:34 }], outputs: [{ x:76, y:26 }] },
  not:          { inputs: [{ x:0, y:26 }],                outputs: [{ x:76, y:26 }] },
  xor:          { inputs: [{ x:0, y:18 }, { x:0, y:34 }], outputs: [{ x:76, y:26 }] },
  'jk-ff':      { inputs: [{ x:0,y:16 },{x:0,y:33},{x:0,y:50},{x:0,y:67},{x:0,y:84}], outputs: [{ x:76,y:35 },{ x:76,y:65 }] },
  'half-adder': { inputs: [{ x:0, y:18 }, { x:0, y:34 }], outputs: [{ x:76,y:18 }, { x:76,y:34 }] },
  'full-adder': { inputs: [{ x:0,y:14 },{x:0,y:35},{x:0,y:56}], outputs: [{ x:76,y:22 },{ x:76,y:48 }] },
  input:        { inputs: [],             outputs: [{ x:76, y:26 }] },
  output:       { inputs: [{ x:0, y:26 }], outputs: [] },
  'clock-gen':  { inputs: [],             outputs: [{ x:76, y:26 }] },
  'text-label': { inputs: [],             outputs: [] },
};

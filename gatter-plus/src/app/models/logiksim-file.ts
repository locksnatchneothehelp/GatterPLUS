import {
  GateInstance, GateType, Rotation, WireConnection,
  createGateInstance, getPinDirection, getPinWorldPos,
} from './gate.model';
import { ProjectData } from './project-file';
import { simplify } from './wire-router';

/**
 * Import von LogikSim-Dateien (`.sim`, „LogikSim Christian 0.6.4") nach
 * GatterPLUS (Phase 5.5a). Nur Import — ein Export nach `.sim` ist bewusst
 * nicht vorgesehen (Format nur aus Beispieldateien bekannt).
 *
 * Dateiformat (aus Beispieldateien rekonstruiert, siehe docs/PHASE5_PLAN.md):
 * - Datei ist zlib-komprimiert.
 * - Entpackt: Kopf (str "TRakBinaryStreamData", u8, u8, str Programm, str Version),
 *   danach EIN Wurzelknoten.
 * - str  = 1 Byte Länge + Latin-1-Zeichen.
 * - Knoten = str Name, int32LE Anzahl Eigenschaften, Eigenschaften,
 *            int32LE Anzahl Kinder, Kinder (rekursiv).
 * - Eigenschaft = u8 Typ, str Name, u8 (immer 0), Wert:
 *   0x10 = int32LE, 0x02 = bool (u8), 0x14 = str.
 *
 * Koordinaten sind Rasterpunkte; Leitungen sind nur geometrische Segmente
 * (TLine) ohne Verbindungsliste — Verbindungen werden über gemeinsame Punkte
 * rekonstruiert (siehe buildNets).
 */

/** Ein Knoten des LogikSim-Datenbaums. */
export interface LogikSimNode {
  name:     string;
  props:    Record<string, number | boolean | string>;
  children: LogikSimNode[];
}

/** Ergebnis des Imports: Projekt + Hinweise auf nicht (exakt) Übernommenes. */
export interface LogikSimImport {
  project:  ProjectData;
  warnings: string[];
}

/** Pixel pro LogikSim-Rastereinheit — groß genug, dass sich Bauteile nicht überlappen. */
const UNIT_PX = 80;

/** LogikSim-Modulnamen mit Anschlusslisten → GatterPLUS-Typ. */
const CONNECTOR_MODULES: Record<string, GateType> = {
  TAndModule:       'and',
  TOrModule:        'or',
  TXorModule:       'xor',
  THalfAdderModule: 'half-adder',
  TFullAdderModule: 'full-adder',
};

// ─── Binärformat lesen ────────────────────────────────────────────────────────

/** Entpackt die zlib-komprimierte Datei (Browser + Node: DecompressionStream). */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Liest den entpackten Datenbaum. Wirft bei unbekanntem Aufbau. */
export function readLogikSimTree(bytes: Uint8Array): LogikSimNode {
  const view   = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const latin1 = new TextDecoder('latin1');
  let p = 0;

  const need = (n: number) => {
    if (p + n > bytes.length) throw new Error('Datei ist unvollständig.');
  };
  const u8  = () => { need(1); return bytes[p++]; };
  const i32 = () => { need(4); const v = view.getInt32(p, true); p += 4; return v; };
  const count = () => {
    const n = i32();
    if (n < 0 || n > bytes.length) throw new Error('Ungültige Anzahl im Datenbaum.');
    return n;
  };
  const str = () => {
    const n = u8(); need(n);
    const s = latin1.decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };

  if (str() !== 'TRakBinaryStreamData') throw new Error('Kein LogikSim-Datenformat.');
  u8(); u8(); str(); str(); // Formatversion, Programmname, Programmversion

  const readNode = (): LogikSimNode => {
    const name  = str();
    const props: LogikSimNode['props'] = {};
    for (let i = count(); i > 0; i--) {
      const type = u8();
      const key  = str();
      u8(); // Füllbyte (bisher immer 0)
      if      (type === 0x10) props[key] = i32();
      else if (type === 0x02) props[key] = u8() !== 0;
      else if (type === 0x14) props[key] = str();
      else throw new Error(`Unbekannter Eigenschaftstyp 0x${type.toString(16)} („${key}").`);
    }
    const children: LogikSimNode[] = [];
    for (let i = count(); i > 0; i--) children.push(readNode());
    return { name, props, children };
  };
  return readNode();
}

// ─── Umwandlung nach GatterPLUS ───────────────────────────────────────────────

/** Anschluss eines Bauteils an einem LogikSim-Rasterpunkt. */
interface Pin {
  gate:    GateInstance;
  index:   number;
  kind:    'in' | 'out';
  x:       number;
  y:       number;
}

const child = (n: LogikSimNode | undefined, name: string) =>
  n?.children.find(c => c.name === name);

/**
 * Liest eine `.sim`-Datei und wandelt sie in ein GatterPLUS-Projekt um.
 * Wirft einen Error mit deutscher Meldung, wenn die Datei nicht lesbar ist.
 */
export async function parseLogikSim(data: Uint8Array): Promise<LogikSimImport> {
  let root: LogikSimNode;
  try {
    root = readLogikSimTree(await inflate(data));
  } catch (e) {
    throw new Error(`Die Datei ist keine lesbare LogikSim-Datei (${(e as Error).message})`);
  }
  const box     = child(child(root, 'MainSimulationTab'), 'ElementBox');
  const modules = child(box, 'ModuleList')?.children ?? [];
  const lines   = child(box, 'LineList')?.children ?? [];
  if (!box) throw new Error('Die LogikSim-Datei enthält keine Schaltung (ElementBox fehlt).');

  const warnings: string[] = [];
  const gates: GateInstance[] = [];
  const pins:  Pin[] = [];
  const unknown = new Map<string, number>();
  let gateNo = 0;
  const newGate = (type: GateType, ux: number, uy: number) => {
    const g = createGateInstance(`gate-${++gateNo}`, type, ux * UNIT_PX, uy * UNIT_PX);
    gates.push(g);
    return g;
  };
  const num = (v: unknown) => (typeof v === 'number' ? v : 0);

  // ── Bauteile ──────────────────────────────────────────────────────────────
  for (const m of modules) {
    const name = String(m.props['Name']);
    const ux = num(m.props['PositionX']), uy = num(m.props['PositionY']);

    if (name === 'TSwitchModule') {
      const g = newGate('input', ux, uy);
      pins.push({ gate: g, index: 0, kind: 'out', x: ux, y: uy });
      continue;
    }
    if (name === 'TLedModule') {
      const g = newGate('output', ux, uy);
      pins.push({ gate: g, index: 0, kind: 'in', x: ux, y: uy });
      continue;
    }
    if (name === 'TTextModule') {
      const g = newGate('text-label', ux, uy);
      g.label = String(m.props['Caption'] ?? '');
      continue;
    }

    const type = CONNECTOR_MODULES[name];
    if (!type) { unknown.set(name, (unknown.get(name) ?? 0) + 1); continue; }

    const ins  = child(m, 'InputConnectorList')?.children  ?? [];
    const outs = child(m, 'OutputConnectorList')?.children ?? [];
    const g = newGate(type, ux, uy);
    if (type === 'and' || type === 'or' || type === 'xor') {
      g.inputCount = Math.min(8, Math.max(2, ins.length));
    }
    if (num(m.props['Orientation']) !== 0) {
      warnings.push(`${name} bei (${ux}|${uy}) ist in LogikSim gedreht – Drehung wurde nicht übernommen.`);
    }

    ins.forEach((c, i) => {
      if (c.props['Negatived'] === true) g.negatedInputs = [...(g.negatedInputs ?? []), i];
      pins.push({ gate: g, index: i, kind: 'in', x: num(c.props['PositionX']), y: num(c.props['PositionY']) });
    });
    outs.forEach((c, i) => {
      if (c.props['Negatived'] === true) g.negatedOutputs = [...(g.negatedOutputs ?? []), i];
      pins.push({ gate: g, index: i, kind: 'out', x: num(c.props['PositionX']), y: num(c.props['PositionY']) });
    });
  }
  for (const [name, n] of unknown) {
    warnings.push(`${n}× unbekanntes Bauteil „${name}" – nicht übernommen.`);
  }

  // ── Netze + Leitungen ─────────────────────────────────────────────────────
  const nets = buildNets(lines, pins);

  // Annahme (Nutzer konnte es nicht klären): Ein Schalter, der an einem
  // Bauteil-AUSGANG hängt, dient als Anzeige → wird zur LED ('output').
  let switchesAsLed = 0;
  for (const net of nets) {
    if (!net.some(p => p.kind === 'out' && p.gate.type !== 'input')) continue;
    for (const p of net) {
      if (p.gate.type === 'input') {
        p.gate.type = 'output';
        p.kind = 'in';
        switchesAsLed++;
      }
    }
  }
  if (switchesAsLed > 0) {
    warnings.push(`${switchesAsLed} Schalter hängen an Bauteil-Ausgängen und wurden als Anzeige (LED) übernommen.`);
  }

  // ── Layout wie im Original ────────────────────────────────────────────────
  const graph = buildLineGraph(lines, pins);
  const px = (p: { x: number; y: number }) => ({ x: p.x * UNIT_PX, y: p.y * UNIT_PX });

  // Schalter/LED: Drehung aus der Leitung an ihrem Anschluss (in LogikSim sind
  // es Punkte, Leitungen gehen z. B. nach unten ab), Pin genau auf den Punkt.
  for (const p of pins) {
    if (p.gate.type !== 'input' && p.gate.type !== 'output') continue;
    const kind = p.gate.type === 'input' ? 'output' : 'input';
    const next = graph.get(key(p.x, p.y))?.[0];
    if (next) {
      const dir = { dx: Math.sign(next.x - p.x), dy: Math.sign(next.y - p.y) };
      p.gate.rotation = ([0, 90, 180, 270] as Rotation[])
        .find(r => { const d = getPinDirection({ ...p.gate, rotation: r }, kind); return d.dx === dir.dx && d.dy === dir.dy; })
        ?? p.gate.rotation;
    }
    placeByPin(p.gate, kind, 0, px(p));
  }
  // Übrige Bauteile: erster Eingang (sonst erster Ausgang) genau auf den LogikSim-Anschluss
  const placed = new Set<GateInstance>();
  for (const p of pins) {
    if (p.gate.type === 'input' || p.gate.type === 'output' || placed.has(p.gate)) continue;
    const anchor = pins.find(q => q.gate === p.gate && q.kind === 'in' && q.index === 0)
      ?? pins.find(q => q.gate === p.gate && q.kind === 'out' && q.index === 0)!;
    placeByPin(p.gate, anchor.kind === 'in' ? 'input' : 'output', 0, px(anchor));
    placed.add(p.gate);
  }

  const wires: WireConnection[] = [];
  let wireNo = 0;

  let multiSource = 0;
  for (const net of nets) {
    const sources = net.filter(p => p.kind === 'out');
    const sinks   = net.filter(p => p.kind === 'in');
    if (sinks.length === 0) continue;
    if (sources.length !== 1) { if (sources.length > 1) multiSource++; continue; }
    const src = sources[0];
    // Negierte Eingänge stehen bereits in gate.negatedInputs (s. o.)
    // Verlauf aus den Original-Linien: erstes Ziel direkt, weitere als Abzweig
    // ab dem Punkt, an dem ihr Weg den schon gezeichneten Teil verlässt.
    const drawn: { a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
    for (const sink of sinks) {
      const path = linePath(graph, src, sink);
      const wire: WireConnection = { id: `wire-${++wireNo}`, fromGateId: src.gate.id, fromPinIndex: src.index,
        toGateId: sink.gate.id, toPinIndex: sink.index, points: [] };
      if (path) {
        // Pins liegen in GatterPLUS enger als in LogikSim (16 px statt 1 Einheit):
        // erstes/letztes gerades Stück auf die Achse des echten Pins schieben.
        const pts = alignEndRuns(simplify(path.map(px)),
          getPinWorldPos(src.gate, 'output', src.index), getPinWorldPos(sink.gate, 'input', sink.index));
        // Wie weit liegt der Weg auf schon gezeichneten Stücken dieses Signals?
        // Dort, wo er sie verlässt, beginnt der Abzweig (Verbindungspunkt).
        let i = 0, split = pts[0];
        while (i < pts.length - 1) {
          const reach = coveredUntil(pts[i], pts[i + 1], drawn);
          split = reach;
          if (reach.x !== pts[i + 1].x || reach.y !== pts[i + 1].y) break;
          i++;
        }
        const tail = simplify([split, ...pts.slice(i + 1)]);
        for (let j = 1; j < tail.length; j++) drawn.push({ a: tail[j - 1], b: tail[j] });
        const isBranch = split.x !== pts[0].x || split.y !== pts[0].y;
        if (isBranch && tail.length > 1) {
          wire.branchPoint = tail[0];
          wire.fromDir = { dx: Math.sign(tail[1].x - tail[0].x), dy: Math.sign(tail[1].y - tail[0].y) };
        }
        const bends = tail.slice(1, -1);
        if (bends.length > 0) wire.manualPoints = bends;
      }
      wires.push(wire);
    }
  }
  if (multiSource > 0) {
    warnings.push(`${multiSource} Leitung(en) mit mehreren Signalquellen wurden nicht übernommen.`);
  }

  // Ansicht: halbe Größe, linke obere Ecke der Schaltung knapp im Bild
  const zoom = 0.5;
  const minX = Math.min(0, ...gates.map(g => g.x));
  const minY = Math.min(0, ...gates.map(g => g.y));
  return {
    project: { gates, wires, view: { panX: 20 - minX * zoom, panY: 20 - minY * zoom, zoom } },
    warnings,
  };
}

const key = (x: number, y: number) => `${x},${y}`;

/**
 * Bis zu welchem Punkt ist das achsparallele Stück a→b von den Strecken in
 * `drawn` lückenlos bedeckt (ab a)? a selbst unbedeckt → a.
 */
function coveredUntil(
  a: { x: number; y: number }, b: { x: number; y: number },
  drawn: { a: { x: number; y: number }; b: { x: number; y: number } }[],
): { x: number; y: number } {
  const horizontal = a.y === b.y;
  const line = horizontal ? a.y : a.x;
  const from = horizontal ? a.x : a.y, to = horizontal ? b.x : b.y, dir = Math.sign(to - from);
  // Intervalle kollinearer Strecken auf dieser Linie
  const iv = drawn
    .filter(s => horizontal ? (s.a.y === line && s.b.y === line) : (s.a.x === line && s.b.x === line))
    .map(s => horizontal ? [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)] : [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]);
  let pos = from, grown = true;
  while (grown) {
    grown = false;
    for (const [lo, hi] of iv) {
      if (pos >= lo && pos <= hi) {
        const next = dir > 0 ? Math.min(hi, to) : Math.max(lo, to);
        if (next !== pos) { pos = next; grown = true; }
      }
    }
  }
  return horizontal ? { x: pos, y: line } : { x: line, y: pos };
}

/**
 * Schiebt das erste bzw. letzte gerade Stück eines Verlaufs auf die Achse des
 * echten Start-/Ziel-Pins (waagerechtes Stück → y, senkrechtes → x) und setzt
 * Anfangs-/Endpunkt genau auf die Pins. Abzweige, die auf diesem Stück liegen,
 * gehen dadurch auf Pin-Höhe ab statt auf der LogikSim-Anschlusshöhe.
 */
function alignEndRuns(
  path: { x: number; y: number }[], from: { x: number; y: number }, to: { x: number; y: number },
): { x: number; y: number }[] {
  const p = path.map(q => ({ ...q }));
  if (p.length < 2) return [from, to];
  const alignRun = (idx: number[], target: { x: number; y: number }) => {
    const [a, b] = [p[idx[0]], p[idx[1]]];
    const horizontal = a.y === b.y;
    const v = horizontal ? a.y : a.x;
    for (const i of idx) {
      if ((horizontal ? p[i].y : p[i].x) !== v) break;
      if (horizontal) p[i].y = target.y; else p[i].x = target.x;
    }
  };
  alignRun(p.map((_, i) => i), from);
  alignRun(p.map((_, i) => p.length - 1 - i), to);
  p[0] = { ...from };
  p[p.length - 1] = { ...to };
  return simplify(p);
}

/** Verschiebt ein Bauteil so, dass der angegebene Pin genau auf target liegt. */
function placeByPin(g: GateInstance, kind: 'input' | 'output', index: number, target: { x: number; y: number }) {
  const p = getPinWorldPos({ ...g, x: 0, y: 0 }, kind, index);
  g.x = target.x - p.x;
  g.y = target.y - p.y;
}

/**
 * Graph der LogikSim-Linien (Rasterpunkte): Knoten = Segment-Endpunkte und
 * Anschlüsse; Kanten = Stücke zwischen benachbarten Knoten auf einem Segment
 * (gleiche Verbindungsregeln wie buildNets: reine Kreuzungen verbinden nicht).
 */
function buildLineGraph(lines: LogikSimNode[], pins: Pin[]): Map<string, { x: number; y: number }[]> {
  const segs = lines.map(l => ({
    x1: Number(l.props['StartPointX']), y1: Number(l.props['StartPointY']),
    x2: Number(l.props['EndPointX']),   y2: Number(l.props['EndPointY']),
  }));
  const pointMap = new Map<string, { x: number; y: number }>();
  for (const s of segs) { pointMap.set(key(s.x1, s.y1), { x: s.x1, y: s.y1 }); pointMap.set(key(s.x2, s.y2), { x: s.x2, y: s.y2 }); }
  for (const p of pins) pointMap.set(key(p.x, p.y), { x: p.x, y: p.y });
  const points = [...pointMap.values()];

  const graph = new Map<string, { x: number; y: number }[]>();
  const link = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    graph.set(key(a.x, a.y), [...(graph.get(key(a.x, a.y)) ?? []), b]);
    graph.set(key(b.x, b.y), [...(graph.get(key(b.x, b.y)) ?? []), a]);
  };
  const between = (v: number, a: number, b: number) => v >= Math.min(a, b) && v <= Math.max(a, b);
  for (const s of segs) {
    const on = points.filter(q =>
      (s.x1 === s.x2 && q.x === s.x1 && between(q.y, s.y1, s.y2)) ||
      (s.y1 === s.y2 && q.y === s.y1 && between(q.x, s.x1, s.x2)));
    if (s.x1 !== s.x2 && s.y1 !== s.y2) on.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }); // schräg: nur Enden
    on.sort((a, b) => Math.abs(a.x - s.x1) + Math.abs(a.y - s.y1) - (Math.abs(b.x - s.x1) + Math.abs(b.y - s.y1)));
    for (let i = 1; i < on.length; i++) {
      if (on[i].x !== on[i - 1].x || on[i].y !== on[i - 1].y) link(on[i - 1], on[i]);
    }
  }
  return graph;
}

/** Kürzester Weg (Anzahl Stücke) von Anschluss a nach b über die Linien, sonst null. */
function linePath(graph: Map<string, { x: number; y: number }[]>, a: Pin, b: Pin): { x: number; y: number }[] | null {
  const start = key(a.x, a.y), goal = key(b.x, b.y);
  const prev = new Map<string, { x: number; y: number } | null>([[start, null]]);
  const queue = [{ x: a.x, y: a.y }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (key(cur.x, cur.y) === goal) {
      const path = [cur];
      for (let p = prev.get(goal); p; p = prev.get(key(p.x, p.y))) path.unshift(p);
      return path;
    }
    for (const n of graph.get(key(cur.x, cur.y)) ?? []) {
      if (prev.has(key(n.x, n.y))) continue;
      prev.set(key(n.x, n.y), cur);
      queue.push(n);
    }
  }
  return null;
}

/**
 * Fasst Anschlüsse zu Netzen (elektrisch verbundenen Gruppen) zusammen.
 *
 * Regeln (Annahme, passend zu allen Beispieldateien):
 * - Die beiden Endpunkte eines Segments sind verbunden.
 * - Ein Endpunkt (oder Anschluss), der AUF einem anderen Segment liegt, ist mit
 *   diesem verbunden (T-Abzweig).
 * - Zwei Segmente, die sich nur im Inneren kreuzen, sind NICHT verbunden.
 * - Anschlüsse am selben Rasterpunkt sind verbunden.
 */
function buildNets(lines: LogikSimNode[], pins: Pin[]): Pin[][] {
  const parent = new Map<string, string>();
  const key  = (x: number, y: number) => `${x},${y}`;
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    const p = parent.get(k)!;
    if (p === k) return k;
    const r = find(p);
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  const segs = lines.map(l => ({
    x1: Number(l.props['StartPointX']), y1: Number(l.props['StartPointY']),
    x2: Number(l.props['EndPointX']),   y2: Number(l.props['EndPointY']),
  }));
  for (const s of segs) union(key(s.x1, s.y1), key(s.x2, s.y2));

  const between = (v: number, a: number, b: number) => v >= Math.min(a, b) && v <= Math.max(a, b);
  const points = [
    ...segs.flatMap(s => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]),
    ...pins.map(p => ({ x: p.x, y: p.y })),
  ];
  for (const q of points) {
    for (const s of segs) {
      const onVertical   = s.x1 === s.x2 && q.x === s.x1 && between(q.y, s.y1, s.y2);
      const onHorizontal = s.y1 === s.y2 && q.y === s.y1 && between(q.x, s.x1, s.x2);
      if (onVertical || onHorizontal) union(key(q.x, q.y), key(s.x1, s.y1));
    }
  }

  const byRoot = new Map<string, Pin[]>();
  for (const p of pins) {
    const r = find(key(p.x, p.y));
    byRoot.set(r, [...(byRoot.get(r) ?? []), p]);
  }
  return [...byRoot.values()];
}

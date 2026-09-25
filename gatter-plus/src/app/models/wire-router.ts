import { PinDirection } from './gate.model';

/**
 * Automatische Leitungsführung (Phase 6C): A*-Wegsuche über ein
 * Sichtbarkeitsgitter.
 *
 * Statt eines festen Rasters (Pins liegen nicht auf einem Raster) besteht das
 * Gitter aus senkrechten/waagerechten Linien an den Kanten aller Hindernisse
 * (Bauteile, bereits um den Mindestabstand vergrößert) und durch die
 * Austrittspunkte der beiden Pins. Knoten = Schnittpunkte außerhalb der
 * Hindernisse, Kanten = gerade Stücke zwischen benachbarten Knoten, die kein
 * Hindernis schneiden. So entstehen saubere Wege entlang der Bauteile.
 *
 * Kosten: Länge + BEND_COST je Knick + OVERLAP_COST je px, die auf einer
 * Leitung eines ANDEREN Signals liegen (sonst wären Leitungen nicht mehr
 * unterscheidbar). Leitungen desselben Signals dürfen sich Wege teilen.
 */

export interface Pt { x: number; y: number }

/** Achsparalleles Hindernis (bereits um den Mindestabstand vergrößert). */
export interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Belegtes Leitungsstück; net = Signal (Quell-Gatter + Ausgang). */
export interface Seg { a: Pt; b: Pt; net: string }

/** Mindestabstand zwischen Leitung und Bauteil-Gehäuse. */
export const ROUTE_CLEARANCE = 12;
/** Gerades Stück, mit dem eine Leitung den Pin verlässt/erreicht. */
const EXIT = 20;
const BEND_COST    = 40;
const OVERLAP_COST = 6;

const DIRS: PinDirection[] = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
const dirIndex = (d: PinDirection) => DIRS.findIndex(x => x.dx === d.dx && x.dy === d.dy);

/**
 * Sucht einen rechtwinkligen Weg von start (Austritt entlang fromDir) nach
 * end (Eintritt entgegen toDir, toDir = Richtung, in die der Ziel-Pin zeigt).
 * Liefert den vollständigen Verlauf inkl. start/end oder null (kein Weg).
 */
export function routeWire(
  start: Pt, fromDir: PinDirection,
  end: Pt, toDir: PinDirection,
  obstacles: Rect[], occupied: Seg[], net: string,
): Pt[] | null {
  const s1 = { x: start.x + fromDir.dx * EXIT, y: start.y + fromDir.dy * EXIT };
  const e1 = { x: end.x + toDir.dx * EXIT, y: end.y + toDir.dy * EXIT };
  // Liegt ein Austrittspunkt in der Sicherheitszone eines (eng benachbarten)
  // Bauteils, wird genau diese Zone für diese Leitung ignoriert — sonst gäbe
  // es gar keinen Weg und die Leitung liefe per Alt-Router quer durch alles.
  const within = (p: Pt, r: Rect) => p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;
  obstacles = obstacles.filter(r => !within(s1, r) && !within(e1, r));
  const inside = (p: Pt) => obstacles.some(r => within(p, r));

  // ── Gitterlinien ──────────────────────────────────────────────────────────
  const xs = uniqSorted([s1.x, e1.x, ...obstacles.flatMap(r => [r.x1, r.x2])]);
  const ys = uniqSorted([s1.y, e1.y, ...obstacles.flatMap(r => [r.y1, r.y2])]);
  const W = xs.length, H = ys.length;
  const node = (i: number, j: number) => j * W + i;
  const blocked = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (inside({ x: xs[i], y: ys[j] })) blocked[node(i, j)] = 1;
  }
  // Kante zwischen benachbarten Knoten frei? (schneidet kein Hindernis-Inneres)
  const hFree = (i: number, j: number) => { // (i,j) → (i+1,j)
    const y = ys[j], a = xs[i], b = xs[i + 1];
    return !obstacles.some(r => y > r.y1 && y < r.y2 && a < r.x2 && b > r.x1);
  };
  const vFree = (i: number, j: number) => { // (i,j) → (i,j+1)
    const x = xs[i], a = ys[j], b = ys[j + 1];
    return !obstacles.some(r => x > r.x1 && x < r.x2 && a < r.y2 && b > r.y1);
  };

  // ── Belegung fremder Signale, indiziert nach Linie ────────────────────────
  const hOcc = new Map<number, [number, number][]>(), vOcc = new Map<number, [number, number][]>();
  for (const s of occupied) {
    if (s.net === net) continue;
    if (s.a.y === s.b.y) push(hOcc, s.a.y, [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)]);
    else if (s.a.x === s.b.x) push(vOcc, s.a.x, [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)]);
  }
  const overlap = (map: Map<number, [number, number][]>, line: number, a: number, b: number) =>
    (map.get(line) ?? []).reduce((sum, [lo, hi]) => sum + Math.max(0, Math.min(hi, b) - Math.max(lo, a)), 0);

  // ── A* über Zustände (Knoten, Bewegungsrichtung) ──────────────────────────
  const si = xs.indexOf(s1.x), sj = ys.indexOf(s1.y);
  const ei = xs.indexOf(e1.x), ej = ys.indexOf(e1.y);
  const goalDir = dirIndex({ dx: -toDir.dx, dy: -toDir.dy }); // Bewegung in den Ziel-Pin hinein
  const N = W * H * 4;
  const g = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  const h = (i: number, j: number) => Math.abs(xs[i] - e1.x) + Math.abs(ys[j] - e1.y);

  const s0 = node(si, sj) * 4 + dirIndex(fromDir);
  g[s0] = 0;
  heap.push(s0, h(si, sj));

  let goalState = -1;
  while (heap.size > 0) {
    const st = heap.pop();
    const d = st % 4, n = (st - d) / 4, i = n % W, j = (n - i) / W;
    if (i === ei && j === ej) { goalState = st; break; }
    for (let nd = 0; nd < 4; nd++) {
      const dir = DIRS[nd];
      if (dir.dx === -DIRS[d].dx && dir.dy === -DIRS[d].dy) continue; // keine Kehrtwende
      const ni = i + dir.dx, nj = j + dir.dy;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || blocked[node(ni, nj)]) continue;
      let len: number, ov: number;
      if (dir.dy === 0) {
        const a = Math.min(i, ni);
        if (!hFree(a, j)) continue;
        len = xs[a + 1] - xs[a];
        ov  = overlap(hOcc, ys[j], xs[a], xs[a + 1]);
      } else {
        const a = Math.min(j, nj);
        if (!vFree(i, a)) continue;
        len = ys[a + 1] - ys[a];
        ov  = overlap(vOcc, xs[i], ys[a], ys[a + 1]);
      }
      let cost = g[st] + len + ov * OVERLAP_COST + (nd !== d ? BEND_COST : 0);
      if (ni === ei && nj === ej && nd !== goalDir) cost += BEND_COST; // Knick vor dem Ziel-Pin
      const ns = node(ni, nj) * 4 + nd;
      if (cost < g[ns]) {
        g[ns] = cost;
        prev[ns] = st;
        heap.push(ns, cost + h(ni, nj));
      }
    }
  }
  if (goalState < 0) return null;

  const pts: Pt[] = [end, e1];
  for (let st = goalState; st >= 0; st = prev[st]) {
    const n = (st - (st % 4)) / 4;
    pts.push({ x: xs[n % W], y: ys[(n - (n % W)) / W] });
  }
  pts.push(start);
  return simplify(pts.reverse());
}

/** Entfernt doppelte und auf einer Geraden liegende Zwischenpunkte. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = last;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  return out;
}

function uniqSorted(v: number[]): number[] {
  return [...new Set(v)].sort((a, b) => a - b);
}

function push<K, V>(map: Map<K, V[]>, k: K, v: V) {
  const list = map.get(k);
  if (list) list.push(v); else map.set(k, [v]);
}

/** Minimaler Binär-Heap (Priorität aufsteigend) für die offene Liste von A*. */
class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];
  get size() { return this.items.length; }
  push(item: number, prio: number) {
    this.items.push(item); this.prios.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!, lastPrio = this.prios.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem; this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.items.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}

import { Pt, Rect, Seg, routeWire, simplify } from './wire-router';

// ─── Hilfen ───────────────────────────────────────────────────────────────────

const RIGHT = { dx: 1, dy: 0 }, LEFT = { dx: -1, dy: 0 }, DOWN = { dx: 0, dy: 1 };

const isOrthogonal = (p: Pt[]) => p.every((q, i) => i === 0 || q.x === p[i - 1].x || q.y === p[i - 1].y);

/** Schneidet ein Wegstück das Innere eines Rechtecks? */
function crosses(p: Pt[], r: Rect): boolean {
  return p.some((b, i) => {
    if (i === 0) return false;
    const a = p[i - 1];
    if (a.y === b.y) return a.y > r.y1 && a.y < r.y2 && Math.min(a.x, b.x) < r.x2 && Math.max(a.x, b.x) > r.x1;
    return a.x > r.x1 && a.x < r.x2 && Math.min(a.y, b.y) < r.y2 && Math.max(a.y, b.y) > r.y1;
  });
}

/** Länge, die ein Weg kollinear auf den Segmenten liegt. */
function overlapLength(p: Pt[], segs: Seg[]): number {
  let sum = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i];
    for (const s of segs) {
      if (a.y === b.y && s.a.y === s.b.y && a.y === s.a.y) {
        sum += Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(s.a.x, s.b.x)) - Math.max(Math.min(a.x, b.x), Math.min(s.a.x, s.b.x)));
      }
      if (a.x === b.x && s.a.x === s.b.x && a.x === s.a.x) {
        sum += Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(s.a.y, s.b.y)) - Math.max(Math.min(a.y, b.y), Math.min(s.a.y, s.b.y)));
      }
    }
  }
  return sum;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('routeWire', () => {

  it('freie, fluchtende Pins → gerade Linie', () => {
    const p = routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 0 }, LEFT, [], [], 'n1');
    expect(p).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }]);
  });

  it('versetzte Pins ohne Hindernis → Z-Form mit 2 Knicken', () => {
    const p = routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 100 }, LEFT, [], [], 'n1')!;
    expect(isOrthogonal(p)).toBe(true);
    expect(p.length).toBe(4);
  });

  it('weicht einem Bauteil im direkten Weg aus', () => {
    const block: Rect = { x1: 100, y1: -60, x2: 200, y2: 60 };
    const p = routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 0 }, LEFT, [block], [], 'n1')!;
    expect(p).not.toBeNull();
    expect(isOrthogonal(p)).toBe(true);
    expect(crosses(p, block)).toBe(false);
  });

  it('vermeidet Überlappung mit Leitung eines anderen Signals', () => {
    const other: Seg[] = [{ a: { x: -50, y: 0 }, b: { x: 400, y: 0 }, net: 'fremd' }];
    const obstacles: Rect[] = [{ x1: 100, y1: -200, x2: 110, y2: -150 }]; // liefert Ausweich-Linien
    const p = routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 0 }, LEFT, obstacles, other, 'n1')!;
    expect(overlapLength(p, other)).toBeLessThan(overlapLength([{ x: 0, y: 0 }, { x: 300, y: 0 }], other));
  });

  it('gleiches Signal darf denselben Weg nutzen (kein Umweg)', () => {
    const same: Seg[] = [{ a: { x: -50, y: 0 }, b: { x: 400, y: 0 }, net: 'n1' }];
    const p = routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 0 }, LEFT, [], same, 'n1');
    expect(p).toEqual([{ x: 0, y: 0 }, { x: 300, y: 0 }]);
  });

  it('senkrecht startender Pin (gedrehter Schalter) verlässt den Pin senkrecht', () => {
    const p = routeWire({ x: 0, y: 0 }, DOWN, { x: 200, y: 150 }, LEFT, [], [], 'n1')!;
    expect(p[1].x).toBe(0); // erstes Stück senkrecht
    expect(isOrthogonal(p)).toBe(true);
  });

  it('Austrittspunkt in der Zone eines engen Nachbarn → Zone wird ignoriert, Weg gefunden', () => {
    const tight: Rect = { x1: 5, y1: -10, x2: 40, y2: 10 };      // enthält den Austrittspunkt (20,0)
    const other: Rect = { x1: 120, y1: -60, x2: 180, y2: 60 };   // echtes Hindernis bleibt
    const p = routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 0 }, LEFT, [tight, other], [], 'n1')!;
    expect(p).not.toBeNull();
    expect(crosses(p, other)).toBe(false);
  });

  it('eingeschlossenes Ziel → null (Aufrufer nutzt Alt-Router)', () => {
    const box: Rect[] = [
      { x1: 200, y1: -100, x2: 400, y2: -40 }, { x1: 200, y1: 40, x2: 400, y2: 100 },
      { x1: 200, y1: -100, x2: 240, y2: 100 }, { x1: 360, y1: -100, x2: 400, y2: 100 },
    ];
    expect(routeWire({ x: 0, y: 0 }, RIGHT, { x: 300, y: 0 }, LEFT, box, [], 'n1')).toBeNull();
  });
});

describe('simplify', () => {
  it('entfernt Doppelte und Zwischenpunkte auf einer Geraden', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }]))
      .toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }]);
  });
});

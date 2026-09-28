import { gatesOverlap, getPinDirection, getPinWorldPos, manualWirePath } from './gate.model';
import { flipFlopExample } from './example-circuit';
import { SimulationService } from '../services/simulation.service';

describe('Beispielschaltung Flip-Flop', () => {
  it('setzt, speichert und setzt zurück', () => {
    const { gates, wires } = flipFlopExample();
    const sim = new SimulationService();
    sim.clearState();
    // [oberer Schalter, unterer Schalter] → [obere Anzeige, untere Anzeige]
    const steps: [boolean, boolean, boolean, boolean][] = [
      [true,  false, true,  false], // setzen
      [false, false, true,  false], // speichern
      [false, true,  false, true ], // zurücksetzen
      [false, false, false, true ], // speichern
    ];
    for (const [s, r, q, qn] of steps) {
      const gs = gates.map(g => g.id === 'gate-2' ? { ...g, inputValue: s } : g.id === 'gate-3' ? { ...g, inputValue: r } : g);
      const sig = sim.computeSignals(gs, wires);
      const out = (id: string) => sig.get(id)!.inputSignals[0];
      expect([out('gate-8'), out('gate-9')], `S=${+s} R=${+r}`).toEqual([q, qn]);
    }
  });

  it('Leitungen verschiedener Signale liegen nicht aufeinander', () => {
    const { gates, wires } = flipFlopExample();
    const G = new Map(gates.map(g => [g.id, g]));
    const segs = wires.flatMap(w => {
      const from = G.get(w.fromGateId)!;
      const pts = manualWirePath(w.branchPoint ?? getPinWorldPos(from, 'output', 0), w.fromDir ?? getPinDirection(from, 'output'),
        w.manualPoints ?? [], getPinWorldPos(G.get(w.toGateId)!, 'input', w.toPinIndex), getPinDirection(G.get(w.toGateId)!, 'input'));
      return pts.slice(1).map((p, i) => ({ net: w.fromGateId, a: pts[i], b: p }));
    });
    const overlap = (s: typeof segs[0], t: typeof segs[0]) => {
      const vert = s.a.x === s.b.x && t.a.x === t.b.x && s.a.x === t.a.x;
      const hor  = s.a.y === s.b.y && t.a.y === t.b.y && s.a.y === t.a.y;
      if (!vert && !hor) return false;
      const k = vert ? 'y' : 'x';
      const [s1, s2] = [Math.min(s.a[k], s.b[k]), Math.max(s.a[k], s.b[k])], [t1, t2] = [Math.min(t.a[k], t.b[k]), Math.max(t.a[k], t.b[k])];
      return Math.min(s2, t2) - Math.max(s1, t1) > 0;
    };
    const clash = segs.some((s, i) => segs.slice(i + 1).some(t => s.net !== t.net && overlap(s, t)));
    expect(clash).toBe(false);
  });

  it('keine Bauteile übereinander', () => {
    const { gates } = flipFlopExample();
    expect(gates.some((g, i) => gates.slice(i + 1).some(h => gatesOverlap(g, h)))).toBe(false);
  });
});

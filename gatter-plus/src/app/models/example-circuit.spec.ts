import { gatesOverlap, getPinDirection, getPinWorldPos, manualWirePath } from './gate.model';
import { halfAdderExample } from './example-circuit';
import { SimulationService } from '../services/simulation.service';

describe('Beispielschaltung Halbaddierer', () => {
  it('rechnet Summe und Übertrag richtig (alle 4 Fälle)', () => {
    const { gates, wires } = halfAdderExample();
    const sim = new SimulationService();
    for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const gs = gates.map(g => g.label === 'A' ? { ...g, inputValue: a === 1 } : g.label === 'B' ? { ...g, inputValue: b === 1 } : g);
      sim.clearState();
      const s = sim.computeSignals(gs, wires);
      const out = (label: string) => s.get(gs.find(g => g.label === label)!.id)!.inputSignals[0];
      expect([out('Summe'), out('Übertrag')], `${a}+${b}`).toEqual([(a ^ b) === 1, (a & b) === 1]);
    }
  });

  it('Leitungen verschiedener Signale liegen nicht aufeinander', () => {
    const { gates, wires } = halfAdderExample();
    const G = new Map(gates.map(g => [g.id, g]));
    const segs = wires.flatMap(w => {
      const pts = manualWirePath(getPinWorldPos(G.get(w.fromGateId)!, 'output', 0), getPinDirection(G.get(w.fromGateId)!, 'output'),
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
    const { gates } = halfAdderExample();
    expect(gates.some((g, i) => gates.slice(i + 1).some(h => gatesOverlap(g, h)))).toBe(false);
  });
});

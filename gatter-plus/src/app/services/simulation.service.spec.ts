import { SimulationService } from './simulation.service';
import { GateInstance, WireConnection, createGateInstance } from '../models/gate.model';

// ─── Test-Fixtures ────────────────────────────────────────────────────────────

/** Zwei Schalter A, B → AND → LED; optional mit negierten AND-Eingängen. */
function circuit(a: boolean, b: boolean, negatedInputs?: number[]) {
  const sa  = { ...createGateInstance('A', 'input', 0, 0), inputValue: a };
  const sb  = { ...createGateInstance('B', 'input', 0, 100), inputValue: b };
  const and: GateInstance = { ...createGateInstance('AND', 'and', 200, 50), negatedInputs };
  const led = createGateInstance('LED', 'output', 400, 50);
  const w = (id: string, from: string, to: string, pin: number): WireConnection =>
    ({ id, fromGateId: from, fromPinIndex: 0, toGateId: to, toPinIndex: pin, points: [] });
  return { gates: [sa, sb, and, led], wires: [w('w1', 'A', 'AND', 0), w('w2', 'B', 'AND', 1), w('w3', 'AND', 'LED', 0)] };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SimulationService – negierte Eingänge', () => {
  const bools = [false, true];

  it('ohne Negation: LED = A ∧ B', () => {
    for (const a of bools) for (const b of bools) {
      const { gates, wires } = circuit(a, b);
      const s = new SimulationService().computeSignals(gates, wires);
      expect(s.get('LED')!.inputSignals[0]).toBe(a && b);
    }
  });

  it('negierter Eingang 0: LED = ¬A ∧ B', () => {
    for (const a of bools) for (const b of bools) {
      const { gates, wires } = circuit(a, b, [0]);
      const s = new SimulationService().computeSignals(gates, wires);
      expect(s.get('LED')!.inputSignals[0], `A=${a} B=${b}`).toBe(!a && b);
    }
  });

  it('beide Eingänge negiert: LED = ¬A ∧ ¬B', () => {
    for (const a of bools) for (const b of bools) {
      const { gates, wires } = circuit(a, b, [0, 1]);
      const s = new SimulationService().computeSignals(gates, wires);
      expect(s.get('LED')!.inputSignals[0]).toBe(!a && !b);
    }
  });

  it('inputSignals enthält den invertierten Wert (Rechenwert des Bauteils)', () => {
    const { gates, wires } = circuit(true, true, [0]);
    const s = new SimulationService().computeSignals(gates, wires);
    expect(s.get('AND')!.inputSignals).toEqual([false, true]);
  });

  it('offener negierter Eingang bleibt unbekannt (null)', () => {
    const { gates, wires } = circuit(true, true, [0]);
    const s = new SimulationService().computeSignals(gates, wires.filter(w => w.id !== 'w1'));
    expect(s.get('AND')!.inputSignals[0]).toBeNull();
  });
});

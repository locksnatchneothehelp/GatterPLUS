import {
  GateInstance, GateType, WireConnection,
  createGateInstance, drawnWirePath, getPinDirection, getPinWorldPos, snapGateToGrid,
} from './gate.model';
import { ProjectData } from './project-file';

/**
 * Beispielschaltung für den Willkommensbildschirm: Halbaddierer aus Gattern.
 * Schalter A und B → XOR (Summe) und UND (Übertrag) → zwei Anzeigen.
 */
export function halfAdderExample(): ProjectData {
  const gate = (n: number, type: GateType, x: number, y: number, label?: string): GateInstance =>
    snapGateToGrid({ ...createGateInstance(`gate-${n}`, type, x, y), ...(label ? { label } : {}) });
  const a    = gate(1, 'input',  96, 120, 'A');
  const b    = gate(2, 'input',  96, 312, 'B');
  const xor  = gate(3, 'xor',   360,  96);
  const and  = gate(4, 'and',   360, 288);
  const sum  = gate(5, 'output', 600, 120, 'Summe');
  const cout = gate(6, 'output', 600, 312, 'Übertrag');

  let n = 0;
  // Leitung wie vom Nutzer verlegt: kompletter Verlauf als feste Punkte. midX legt
  // die senkrechte Strecke fest – A und B bekommen eigene, sonst lägen ihre
  // Leitungen übereinander und sähen verbunden aus.
  const wire = (from: GateInstance, to: GateInstance, toPin: number, midX?: number): WireConnection => {
    const start = getPinWorldPos(from, 'output', 0), end = getPinWorldPos(to, 'input', toPin);
    const bends = midX === undefined ? [] : [{ x: midX, y: start.y }, { x: midX, y: end.y }];
    const inner = drawnWirePath(start, getPinDirection(from, 'output'), bends, end, getPinDirection(to, 'input')).slice(1, -1);
    return {
      id: `wire-${++n}`, fromGateId: from.id, fromPinIndex: 0, toGateId: to.id, toPinIndex: toPin,
      points: [], ...(inner.length ? { manualPoints: inner } : {}),
    };
  };
  const midA = 264, midB = 312; // Vielfache von 24 zwischen Schaltern und Gattern
  return {
    gates: [a, b, xor, and, sum, cout],
    wires: [wire(a, xor, 0, midA), wire(b, xor, 1, midB), wire(a, and, 0, midA), wire(b, and, 1, midB),
            wire(xor, sum, 0), wire(and, cout, 0)],
    view: { panX: 0, panY: 0, zoom: 1 },
  };
}

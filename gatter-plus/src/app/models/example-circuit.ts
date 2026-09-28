import {
  GateInstance, GateType, WireConnection,
  createGateInstance, getPinWorldPos, snapGateToGrid, textLabelWidth,
} from './gate.model';
import { ProjectData } from './project-file';

/**
 * Beispielschaltung für den Willkommensbildschirm: Flip-Flop aus zwei über Kreuz
 * rückgekoppelten NOR-Gattern (ODER mit verneintem Ausgang), dahinter je ein NICHT.
 * Oberer Schalter setzt die obere Anzeige, unterer Schalter setzt sie zurück.
 */
export function flipFlopExample(): ProjectData {
  const gate = (n: number, type: GateType, x: number, y: number, extra: Partial<GateInstance> = {}): GateInstance =>
    snapGateToGrid({ ...createGateInstance(`gate-${n}`, type, x, y), ...extra });
  const name  = 'Flip-Flop Schaltung';
  const title = gate(1, 'text-label', 432 - textLabelWidth(name) / 2, 12, { label: name }); // Mitte x = 432
  const s     = gate(2, 'input',   48,  72);
  const r     = gate(3, 'input',   48, 312);
  const nor1  = gate(4, 'or',     312,  84, { negatedOutputs: [0] });
  const nor2  = gate(5, 'or',     312, 276, { negatedOutputs: [0] });
  const not1  = gate(6, 'not',    528,  96);
  const not2  = gate(7, 'not',    528, 288);
  const q     = gate(8, 'output', 744,  96);
  const qn    = gate(9, 'output', 744, 288);

  let n = 0;
  const wire = (from: GateInstance, to: GateInstance, toPin: number, extra: Partial<WireConnection> = {}): WireConnection =>
    ({ id: `wire-${++n}`, fromGateId: from.id, fromPinIndex: 0, toGateId: to.id, toPinIndex: toPin, points: [], ...extra });

  // Rückkopplung: Abzweig auf der Ausgangsleitung, links um das Gatter herum
  // in den Eingang des anderen NOR (eigene Zeile y, damit sich nichts überdeckt)
  const feedback = (from: GateInstance, to: GateInstance, toPin: number, branchX: number, y: number): WireConnection => {
    const out = getPinWorldPos(from, 'output', 0), end = getPinWorldPos(to, 'input', toPin);
    const x = end.x - 24;
    return wire(from, to, toPin, {
      branchPoint: { x: branchX, y: out.y }, fromDir: { dx: 0, dy: Math.sign(y - out.y) },
      manualPoints: [{ x: branchX, y }, { x, y }, { x, y: end.y }],
    });
  };
  return {
    gates: [title, s, r, nor1, nor2, not1, not2, q, qn],
    wires: [wire(s, nor1, 0), wire(r, nor2, 1),
            wire(nor1, not1, 0), wire(nor2, not2, 0), wire(not1, q, 0), wire(not2, qn, 0),
            feedback(nor2, nor1, 1, 456, 192), feedback(nor1, nor2, 0, 504, 240)],
    view: { panX: 0, panY: 0, zoom: 1 },
  };
}

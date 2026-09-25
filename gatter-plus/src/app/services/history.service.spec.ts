import { HistoryService } from './history.service';
import { GateInstance, WireConnection } from '../models/gate.model';

// ─── Test-Fixtures ────────────────────────────────────────────────────────────

function makeGate(id: string, x = 0, y = 0): GateInstance {
  return {
    id, type: 'and', x, y, rotation: 0, color: 'default',
    inputCount: 2, inputValue: false, ffState: false, clockPeriodMs: 1000,
  };
}

function makeWire(id: string, from: string, to: string): WireConnection {
  return {
    id, fromGateId: from, fromPinIndex: 0,
    toGateId: to, toPinIndex: 0,
    points: [{ x: 10, y: 20 }],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    service = new HistoryService();
  });

  // ── Grundzustand ─────────────────────────────────────────────────────────

  it('canUndo() ist false bei leerem Stack', () => {
    expect(service.canUndo()).toBe(false);
  });

  it('size ist 0 bei leerem Stack', () => {
    expect(service.size).toBe(0);
  });

  it('pop() gibt null zurück wenn Stack leer', () => {
    expect(service.pop()).toBeNull();
  });

  // ── push / pop ────────────────────────────────────────────────────────────

  it('canUndo() ist true nach push()', () => {
    service.push([makeGate('g1')], []);
    expect(service.canUndo()).toBe(true);
  });

  it('pop() gibt letzten Schnappschuss zurück', () => {
    service.push([makeGate('g1')], []);
    const snap = service.pop();
    expect(snap).not.toBeNull();
    expect(snap!.gates[0].id).toBe('g1');
  });

  it('Stack ist nach pop() leer', () => {
    service.push([makeGate('g1')], []);
    service.pop();
    expect(service.canUndo()).toBe(false);
    expect(service.size).toBe(0);
  });

  it('Mehrere push/pop arbeiten in LIFO-Reihenfolge', () => {
    service.push([makeGate('g1')], []);
    service.push([makeGate('g2')], []);
    service.push([makeGate('g3')], []);

    expect(service.pop()!.gates[0].id).toBe('g3');
    expect(service.pop()!.gates[0].id).toBe('g2');
    expect(service.pop()!.gates[0].id).toBe('g1');
    expect(service.pop()).toBeNull();
  });

  it('size entspricht der Anzahl der Schnappschüsse', () => {
    expect(service.size).toBe(0);
    service.push([], []);
    service.push([], []);
    expect(service.size).toBe(2);
    service.pop();
    expect(service.size).toBe(1);
  });

  // ── Snapshot-Isolation ───────────────────────────────────────────────────

  it('Snapshot ist eine Kopie – Änderungen am Original verändern ihn nicht', () => {
    const gates = [makeGate('g1', 10, 20)];
    service.push(gates, []);

    gates[0].x = 999; // Original nachträglich verändern

    const snap = service.pop();
    expect(snap!.gates[0].x).toBe(10); // Snapshot muss 10 behalten haben
  });

  it('Leitungs-Wegpunkte werden tief kopiert', () => {
    const wires = [makeWire('w1', 'g1', 'g2')];
    service.push([], wires);

    wires[0].points[0].x = 999; // Original nachträglich verändern

    const snap = service.pop();
    expect(snap!.wires[0].points[0].x).toBe(10); // Snapshot muss 10 behalten haben
  });

  it('Mehrere Snapshots sind voneinander isoliert', () => {
    const gates = [makeGate('g1', 5, 5)];
    service.push(gates, []);
    gates[0].x = 50;
    service.push(gates, []);

    const snap2 = service.pop();
    const snap1 = service.pop();
    expect(snap2!.gates[0].x).toBe(50);
    expect(snap1!.gates[0].x).toBe(5); // Erster Snapshot unverändert
  });

  // ── Stack-Limit ───────────────────────────────────────────────────────────

  it(`Stack-Tiefe überschreitet MAX_SIZE (${HistoryService.MAX_SIZE}) nicht`, () => {
    for (let i = 0; i < HistoryService.MAX_SIZE + 10; i++) {
      service.push([makeGate(`g${i}`)], []);
    }
    expect(service.size).toBe(HistoryService.MAX_SIZE);
  });

  it('Ältester Eintrag wird bei Overflow verworfen', () => {
    // Ersten Eintrag mit bekanntem Inhalt einstellen
    service.push([makeGate('OLDEST')], []);
    // Stack bis zum Limit auffüllen
    for (let i = 1; i < HistoryService.MAX_SIZE; i++) {
      service.push([makeGate(`g${i}`)], []);
    }
    // Ein weiterer Eintrag verdrängt OLDEST
    service.push([makeGate('NEWEST')], []);

    // Stack komplett leeren und prüfen ob OLDEST weg ist
    const all: string[] = [];
    let snap;
    while ((snap = service.pop()) !== null) {
      all.push(snap.gates[0].id);
    }
    expect(all).not.toContain('OLDEST');
    expect(all[0]).toBe('NEWEST');
  });

  // ── clear() ───────────────────────────────────────────────────────────────

  it('clear() leert den Stack vollständig', () => {
    service.push([makeGate('g1')], []);
    service.push([makeGate('g2')], []);
    service.clear();

    expect(service.canUndo()).toBe(false);
    expect(service.size).toBe(0);
    expect(service.pop()).toBeNull();
  });

  // ── Leere Snapshots ───────────────────────────────────────────────────────

  it('push() und pop() mit leeren Arrays funktionieren', () => {
    service.push([], []);
    const snap = service.pop();
    expect(snap).not.toBeNull();
    expect(snap!.gates).toEqual([]);
    expect(snap!.wires).toEqual([]);
  });

  // ── Wires im Snapshot ─────────────────────────────────────────────────────

  it('Leitungen werden korrekt gespeichert und zurückgegeben', () => {
    const gates = [makeGate('g1'), makeGate('g2')];
    const wires = [makeWire('w1', 'g1', 'g2')];
    service.push(gates, wires);
    const snap = service.pop();
    expect(snap!.wires.length).toBe(1);
    expect(snap!.wires[0].fromGateId).toBe('g1');
    expect(snap!.wires[0].toGateId).toBe('g2');
  });

  // ── Redo-Stack ────────────────────────────────────────────────────────────

  it('canRedo() ist false wenn Redo-Stack leer', () => {
    expect(service.canRedo()).toBe(false);
  });

  it('canRedo() ist true nach pushRedo()', () => {
    service.pushRedo([makeGate('g1')], []);
    expect(service.canRedo()).toBe(true);
  });

  it('popRedo() gibt null zurück wenn Stack leer', () => {
    expect(service.popRedo()).toBeNull();
  });

  it('popRedo() gibt letzten Redo-Schnappschuss zurück', () => {
    service.pushRedo([makeGate('gR')], []);
    const snap = service.popRedo();
    expect(snap!.gates[0].id).toBe('gR');
    expect(service.canRedo()).toBe(false);
  });

  it('push() leert den Redo-Stack', () => {
    service.pushRedo([makeGate('gR')], []);
    expect(service.canRedo()).toBe(true);
    service.push([makeGate('g1')], []); // neue Aktion → Redo ungültig
    expect(service.canRedo()).toBe(false);
  });

  it('pushUndo() leert den Redo-Stack NICHT', () => {
    service.pushRedo([makeGate('gR')], []);
    service.pushUndo([makeGate('g1')], []);
    expect(service.canRedo()).toBe(true); // Redo bleibt erhalten
    expect(service.canUndo()).toBe(true); // Undo auch
  });

  it('clear() leert auch den Redo-Stack', () => {
    service.pushRedo([makeGate('gR')], []);
    service.clear();
    expect(service.canRedo()).toBe(false);
    expect(service.redoSize).toBe(0);
  });

  it('Redo-Snapshots sind isolierte Kopien', () => {
    const gates = [makeGate('gR', 10, 10)];
    service.pushRedo(gates, []);
    gates[0].x = 999;
    expect(service.popRedo()!.gates[0].x).toBe(10);
  });
});

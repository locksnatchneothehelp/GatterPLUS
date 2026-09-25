import { GateInstance, WireConnection } from './gate.model';
import { ProjectData, parseProject, serializeProject } from './project-file';

// ─── Test-Fixtures ────────────────────────────────────────────────────────────

/** Kleine Schaltung, die alle optionalen Aufbau-Felder einmal benutzt. */
function makeProject(): ProjectData {
  const gates: GateInstance[] = [
    { id: 'gate-1', type: 'input', x: 0, y: 0, rotation: 0, color: 'default', inputCount: 1,
      clockPeriodMs: 1000, label: 'A' },
    { id: 'gate-2', type: 'and', x: 120, y: 48, rotation: 90, color: 'green', inputCount: 3,
      clockPeriodMs: 1000, negatedOutputs: [0] },
    { id: 'gate-3', type: 'clock-gen', x: 0, y: 96, rotation: 180, color: 'red', inputCount: 1,
      clockPeriodMs: 250 },
    { id: 'gate-4', type: 'text-label', x: 300, y: 10, rotation: 0, color: 'default',
      inputCount: 1, clockPeriodMs: 1000, label: 'Hallo Ü' },
  ];
  const wires: WireConnection[] = [
    { id: 'wire-1', fromGateId: 'gate-1', fromPinIndex: 0, toGateId: 'gate-2', toPinIndex: 0,
      points: [{ x: 90, y: 26 }, { x: 90, y: 70 }] },
    { id: 'wire-2', fromGateId: 'gate-1', fromPinIndex: 0, toGateId: 'gate-2', toPinIndex: 1,
      points: [], branchPoint: { x: 90, y: 40 }, fromDir: { dx: 0, dy: 1 } },
  ];
  return { gates, wires, view: { panX: -40, panY: 12.5, zoom: 1.5 } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Projektdatei', () => {

  // ── Round-Trip ───────────────────────────────────────────────────────────

  it('serialize → parse liefert denselben Aufbau (verlustfrei)', () => {
    const project = makeProject();
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it('Laufzeit-Zustand (inputValue, ffState, ffPrevClock) wird nicht gespeichert', () => {
    const project = makeProject();
    project.gates[0] = { ...project.gates[0], inputValue: true };
    project.gates.push({ id: 'gate-5', type: 'jk-ff', x: 0, y: 200, rotation: 0,
      color: 'default', inputCount: 1, ffState: true, ffPrevClock: true });

    const loaded = parseProject(serializeProject(project));
    for (const g of loaded.gates) {
      expect(g).not.toHaveProperty('inputValue');
      expect(g).not.toHaveProperty('ffState');
      expect(g).not.toHaveProperty('ffPrevClock');
    }
  });

  it('serialize verändert die übergebenen Bauteile nicht', () => {
    const project = makeProject();
    project.gates[0] = { ...project.gates[0], inputValue: true };
    serializeProject(project);
    expect(project.gates[0].inputValue).toBe(true);
  });

  it('Dateikopf enthält Format-Kennung und Version', () => {
    const raw = JSON.parse(serializeProject(makeProject()));
    expect(raw.format).toBe('gatterplus');
    expect(raw.version).toBe(1);
  });

  it('Leeres Projekt ist gültig', () => {
    const empty: ProjectData = { gates: [], wires: [], view: { panX: 0, panY: 0, zoom: 1 } };
    expect(parseProject(serializeProject(empty))).toEqual(empty);
  });

  // ── Fehlerhafte Dateien ──────────────────────────────────────────────────

  /** Hilfsfunktion: gültige Datei laden, verändern, wieder als Text liefern. */
  function mutated(change: (raw: any) => void): string {
    const raw = JSON.parse(serializeProject(makeProject()));
    change(raw);
    return JSON.stringify(raw);
  }

  it('Kein JSON → Fehler', () => {
    expect(() => parseProject('kein json')).toThrow('keine gültige JSON-Datei');
  });

  it('Fremde JSON-Datei → Fehler', () => {
    expect(() => parseProject('{"foo": 1}')).toThrow('keine GatterPLUS-Projektdatei');
    expect(() => parseProject('null')).toThrow('keine GatterPLUS-Projektdatei');
  });

  it('Unbekannte Version → Fehler', () => {
    expect(() => parseProject(mutated(r => r.version = 99))).toThrow('Dateiversion: 99');
  });

  it('Fehlende Bauteil- oder Leitungsliste → Fehler', () => {
    expect(() => parseProject(mutated(r => delete r.gates))).toThrow('unvollständig');
    expect(() => parseProject(mutated(r => r.wires = {}))).toThrow('unvollständig');
  });

  it('Unbekannter Bauteiltyp → Fehler', () => {
    expect(() => parseProject(mutated(r => r.gates[0].type = 'nand'))).toThrow('Ungültiges Bauteil');
  });

  it('Bauteil ohne Position → Fehler', () => {
    expect(() => parseProject(mutated(r => delete r.gates[0].x))).toThrow('Ungültiges Bauteil');
  });

  it('Leitung auf nicht vorhandenes Bauteil → Fehler', () => {
    expect(() => parseProject(mutated(r => r.wires[0].toGateId = 'gate-99')))
      .toThrow('Ungültige Leitung');
  });

  it('Fehlende Ansicht → Fehler', () => {
    expect(() => parseProject(mutated(r => delete r.view))).toThrow('keine gültige Ansicht');
  });
});

import { GateInstance } from './gate.model';
import { LogikSimImport, parseLogikSim } from './logiksim-file';
import { SimulationService } from '../services/simulation.service';

// ─── Test-Fixtures ────────────────────────────────────────────────────────────
// Echte LogikSim-Dateien (LogikSim Christian 0.6.4) aus fixtures/.

async function load(name: string): Promise<LogikSimImport> {
  // node:fs nur im Test (Umgebung node, siehe vitest.config.ts); ohne @types/node → as string
  const { readFileSync } = await import('node:fs' as string);
  return parseLogikSim(new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url))));
}

function countTypes(gates: GateInstance[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const g of gates) t[g.type] = (t[g.type] ?? 0) + 1;
  return t;
}

const FIXTURES = [
  'logiksim-addierer-4bit.sim',
  'logiksim-halbaddierer-or.sim',
  'logiksim-aufgabe2-negiert.sim',
  'logiksim-aufgabe3-text.sim',
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LogikSim-Import', () => {

  // ── Bauteile ─────────────────────────────────────────────────────────────

  it('4-Bit-Addierer: Bauteile werden übernommen', async () => {
    const { project } = await load('logiksim-addierer-4bit.sim');
    expect(countTypes(project.gates))
      .toEqual({ input: 8, output: 4, 'half-adder': 1, 'full-adder': 3 });
  });

  it('Schalter an Bauteil-Ausgängen werden als Anzeige übernommen (mit Hinweis)', async () => {
    const { warnings } = await load('logiksim-addierer-4bit.sim');
    expect(warnings).toEqual([
      '4 Schalter hängen an Bauteil-Ausgängen und wurden als Anzeige (LED) übernommen.',
    ]);
  });

  it('AND/OR/XOR, LED und negierte Eingänge (→ NOT-Gatter)', async () => {
    const { project, warnings } = await load('logiksim-aufgabe2-negiert.sim');
    expect(countTypes(project.gates))
      .toEqual({ and: 12, or: 4, xor: 2, input: 3, output: 3, not: 12 });
    expect(warnings).toEqual([]);
  });

  it('Eingangsanzahl aus LogikSim wird übernommen (2 und 3 Eingänge)', async () => {
    const { project } = await load('logiksim-aufgabe2-negiert.sim');
    const counts = new Set(project.gates.filter(g => g.type === 'and').map(g => g.inputCount));
    expect(counts).toEqual(new Set([2, 3]));
  });

  it('Textfelder werden als Text-Label mit Inhalt übernommen', async () => {
    const { project } = await load('logiksim-aufgabe3-text.sim');
    const labels = project.gates.filter(g => g.type === 'text-label').map(g => g.label);
    expect(labels.length).toBe(4);
    expect(labels[0]).toBe('S');
  });

  // ── Leitungen ────────────────────────────────────────────────────────────

  it.each(FIXTURES)('%s: jeder Eingang hat genau eine Leitung', async name => {
    const { project } = await load(name);
    const inputs = new Map<string, number>();
    for (const w of project.wires) {
      const k = `${w.toGateId}:${w.toPinIndex}`;
      inputs.set(k, (inputs.get(k) ?? 0) + 1);
    }
    expect([...inputs.values()].every(n => n === 1)).toBe(true);
    // alle Eingänge der importierten Bauteile sind belegt
    const perType: Record<string, number> = { not: 1, output: 1, 'half-adder': 2, 'full-adder': 3 };
    const expected = project.gates.reduce((sum, g) =>
      sum + (['and', 'or', 'xor'].includes(g.type) ? g.inputCount : perType[g.type] ?? 0), 0);
    expect(inputs.size).toBe(expected);
  });

  it('Kreuzende Leitungen ohne Verbindungspunkt werden nicht verbunden', async () => {
    // Die 4-Bit-Datei hat mehrere solche Kreuzungen; würden sie verbunden,
    // entstünden Netze mit mehreren Quellen (→ Hinweis) und weniger Leitungen.
    const { project, warnings } = await load('logiksim-addierer-4bit.sim');
    expect(warnings.some(w => w.includes('mehreren Signalquellen'))).toBe(false);
    expect(project.wires.length).toBe(15);
  });

  // ── Funktion (Simulation) ────────────────────────────────────────────────

  it('4-Bit-Addierer rechnet nach dem Import korrekt (alle 256 Fälle)', async () => {
    const { project } = await load('logiksim-addierer-4bit.sim');
    const sim = new SimulationService();
    const U = 80; // Pixel pro LogikSim-Rastereinheit
    // Bit 0 liegt rechts: Schalter x=7…4 (Zeilen y=5 und y=16), Anzeigen x=16…13 (y=24)
    const at = (ux: number, uy: number) =>
      project.gates.find(g => g.x === ux * U && g.y === uy * U)!;
    const aBits = [7, 6, 5, 4].map(x => at(x, 5));
    const bBits = [7, 6, 5, 4].map(x => at(x, 16));
    const sBits = [16, 15, 14, 13].map(x => at(x, 24));

    for (let a = 0; a < 16; a++) {
      for (let b = 0; b < 16; b++) {
        const gates = project.gates.map(g => {
          const ia = aBits.indexOf(g), ib = bBits.indexOf(g);
          if (ia >= 0) return { ...g, inputValue: ((a >> ia) & 1) === 1 };
          if (ib >= 0) return { ...g, inputValue: ((b >> ib) & 1) === 1 };
          return g;
        });
        sim.clearState();
        const signals = sim.computeSignals(gates, project.wires);
        const sum = sBits.reduce((s, g, i) => s + (signals.get(g.id)!.inputSignals[0] ? 1 << i : 0), 0);
        expect(sum, `${a} + ${b}`).toBe((a + b) % 16); // Übertrag des letzten VA ist nicht angeschlossen
      }
    }
  });

  // ── Fehlerfälle ──────────────────────────────────────────────────────────

  it('Keine LogikSim-Datei → verständlicher Fehler', async () => {
    await expect(parseLogikSim(new TextEncoder().encode('kein zlib')))
      .rejects.toThrow('keine lesbare LogikSim-Datei');
  });
});

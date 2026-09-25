import { Injectable } from '@angular/core';
import { GateInstance, WireConnection, getGatePinOffsets } from '../models/gate.model';

/**
 * Signalzustand einer einzelnen Komponente im Simulations-Modus.
 *
 * null  = unbekannt (Eingang nicht verbunden / Zustand noch nicht eingependelt)
 * false = logisch 0 (LOW)
 * true  = logisch 1 (HIGH)
 */
export interface ComponentSignalState {
  /** Eingangs-Signale pro Pin (Index = Pin-Index der Komponente) */
  inputSignals: (boolean | null)[];
  /** Ausgangs-Signale pro Pin */
  outputSignals: (boolean | null)[];
}

/**
 * Service für die Logik-Simulation der Schaltung.
 *
 * ── Algorithmus: Fixpunkt-Iteration (wie LogiSim & Co.) ───────────────────────
 *
 * Eine reine BFS-/Topologie-Sortierung kann RÜCKKOPPLUNGEN nicht auflösen:
 * Ein RS-/JK-Latch aus diskreten NOR/NAND-Gattern enthält eine Schleife
 * (Ausgang A → Eingang B → Ausgang B → Eingang A). In so einem Graphen gibt
 * es keine topologische Reihenfolge, und ein Gatter müsste berechnet werden,
 * bevor seine Eingänge feststehen.
 *
 * Stattdessen werten wir die GESAMTE Schaltung wiederholt aus, bis sich kein
 * Signal mehr ändert (= eingependelter Fixpunkt):
 *
 *   1. Ausgänge initialisieren  (Quellen aus inputValue, FFs aus ffState,
 *                                übrige aus dem letzten Schritt → Schleifen-Start)
 *   2. WIEDERHOLEN bis stabil:
 *        a) alle Leitungen propagieren  (Eingang = Ausgang der Quelle)
 *        b) alle kombinatorischen Gatter neu berechnen
 *   3. Flip-Flop-Zustände aus den eingependelten Eingängen fortschreiben
 *   4. erneut einpendeln, damit die neuen FF-Ausgänge sichtbar werden
 *
 * Konvergiert die Schaltung nicht (echter Oszillator, z.B. Ring aus 3 NOTs
 * oder JK mit J=K=1 bei dauerhaftem Takt), bricht die Iteration nach
 * MAX_ITERATIONS ab und behält den letzten Zustand — bei wiederholten
 * Simulationsschritten ergibt das das erwartete Flackern.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  /** Sicherheitsgrenze gegen Endlosschleifen bei oszillierenden Schaltungen. */
  private static readonly MAX_ITERATIONS = 200;

  /**
   * Ausgangssignale des letzten Simulations-Schritts.
   * Dienen als Startwert für Rückkopplungs-Schleifen, damit speichernde
   * Schaltungen (RS-Latch usw.) ihren Zustand über Schritte hinweg behalten.
   */
  private prevOutputs = new Map<string, (boolean | null)[]>();

  /** Setzt den internen Zustand zurück (beim Ausschalten der Simulation). */
  clearState(): void {
    this.prevOutputs.clear();
  }

  /**
   * Berechnet alle Signalzustände der gesamten Schaltung für einen Schritt.
   *
   * @param gates  Alle platzierten Komponenten-Instanzen
   * @param wires  Alle Leitungsverbindungen
   * @returns      Map: GateInstance.id → ComponentSignalState
   */
  computeSignals(
    gates: GateInstance[],
    wires: WireConnection[]
  ): Map<string, ComponentSignalState> {
    const result = new Map<string, ComponentSignalState>();

    // ── 1. Zustände anlegen & Ausgänge initialisieren ────────────────────────
    for (const gate of gates) {
      const offsets = getGatePinOffsets(gate);
      const inputSignals = new Array(offsets.inputs.length).fill(null);
      let outputSignals: (boolean | null)[];

      if (this.isSource(gate)) {
        // Eingangs-Schalter / Taktgeber: Ausgang direkt aus gespeichertem Wert
        const raw = gate.inputValue ?? false;
        outputSignals = [gate.negatedOutputs?.includes(0) ? !raw : raw];
      } else if (gate.type === 'jk-ff') {
        // Flip-Flop: Ausgang aus aktuellem Speicherzustand (wird gehalten)
        const q = gate.ffState ?? false;
        outputSignals = [
          gate.negatedOutputs?.includes(0) ? !q : q,
          gate.negatedOutputs?.includes(1) ? q  : !q,
        ];
      } else {
        // Übrige Gatter: letzten bekannten Ausgang als Schleifen-Startwert
        const prev = this.prevOutputs.get(gate.id);
        outputSignals = prev
          ? [...prev]
          : new Array(offsets.outputs.length).fill(null);
      }

      result.set(gate.id, { inputSignals, outputSignals });
    }

    // ── 2. Kombinatorik einpendeln (Quellen & FFs bleiben fest) ──────────────
    this.settle(gates, wires, result);

    // ── 3. Flip-Flop-Zustände aus eingependelten Eingängen fortschreiben ─────
    let ffChanged = false;
    for (const gate of gates) {
      if (gate.type !== 'jk-ff') continue;
      const state = result.get(gate.id)!;
      const newQ = this.nextFlipFlopState(gate, state.inputSignals);
      if (newQ !== (gate.ffState ?? false)) ffChanged = true;
      gate.ffState = newQ;
      // Taktzustand für die Flankenerkennung im nächsten Schritt merken
      gate.ffPrevClock = state.inputSignals[2] === true;
      state.outputSignals = [
        gate.negatedOutputs?.includes(0) ? !newQ : newQ,
        gate.negatedOutputs?.includes(1) ? newQ  : !newQ,
      ];
    }

    // ── 4. Bei Zustandswechsel erneut einpendeln, damit nachgelagerte ────────
    //     Bauteile die neuen FF-Ausgänge im selben Schritt sehen.
    if (ffChanged) {
      this.settle(gates, wires, result);
    }

    // Ergebnisse für den nächsten Schritt (Rückkopplungs-Startwert) sichern
    for (const [id, state] of result) {
      this.prevOutputs.set(id, [...state.outputSignals]);
    }

    return result;
  }

  /**
   * Pendelt die kombinatorische Logik ein: propagiert Leitungen und berechnet
   * alle Gatter-Ausgänge wiederholt, bis sich nichts mehr ändert.
   *
   * Quellen (input/clock-gen) und Flip-Flops behalten ihren Ausgang fest –
   * sie sind die "Treiber" der Schaltung in diesem Schritt.
   */
  private settle(
    gates: GateInstance[],
    wires: WireConnection[],
    result: Map<string, ComponentSignalState>
  ): void {
    for (let iter = 0; iter < SimulationService.MAX_ITERATIONS; iter++) {
      // a) Leitungen propagieren: jeder Eingang erhält den Ausgang seiner Quelle
      this.propagate(wires, result);

      // b) kombinatorische Gatter neu berechnen
      let changed = false;
      for (const gate of gates) {
        if (this.isSource(gate) || gate.type === 'jk-ff') continue;
        const state = result.get(gate.id)!;
        const newOut = this.computeGateOutput(gate, state.inputSignals);
        if (!this.sameSignals(newOut, state.outputSignals)) {
          state.outputSignals = newOut;
          changed = true;
        }
      }

      if (!changed) break;
    }

    // Abschluss-Propagation, damit Eingangs-Anzeigen (LEDs, FF-Eingänge)
    // den finalen Ausgangszustand widerspiegeln.
    this.propagate(wires, result);
  }

  /** Überträgt jeden Gatter-Ausgang über die Leitungen auf die Ziel-Eingänge. */
  private propagate(
    wires: WireConnection[],
    result: Map<string, ComponentSignalState>
  ): void {
    // Alle Eingänge zurücksetzen (nicht verbundene Pins bleiben null)
    for (const state of result.values()) {
      state.inputSignals.fill(null);
    }
    for (const wire of wires) {
      const src = result.get(wire.fromGateId);
      const dst = result.get(wire.toGateId);
      if (!src || !dst) continue;
      if (wire.toPinIndex >= dst.inputSignals.length) continue;
      dst.inputSignals[wire.toPinIndex] =
        src.outputSignals[wire.fromPinIndex] ?? null;
    }
  }

  /** True für Signalquellen, deren Ausgang nicht berechnet, sondern gesetzt wird. */
  private isSource(gate: GateInstance): boolean {
    return gate.type === 'input' || gate.type === 'clock-gen';
  }

  /** Vergleicht zwei Signal-Arrays elementweise (für die Konvergenz-Prüfung). */
  private sameSignals(a: (boolean | null)[], b: (boolean | null)[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  /**
   * Berechnet die Ausgangs-Signale eines KOMBINATORISCHEN Bauteils rein
   * funktional (keine Seiteneffekte). Flip-Flop-Zustand wird separat in
   * nextFlipFlopState() fortgeschrieben.
   *
   * @param gate    Bauteil-Instanz (Typ, inputCount, ffState)
   * @param inputs  Aktuelle Eingangs-Signale
   */
  private computeGateOutput(
    gate: GateInstance,
    inputs: (boolean | null)[]
  ): (boolean | null)[] {
    let out: (boolean | null)[];
    switch (gate.type) {
      // ── AND: HIGH nur wenn ALLE Eingänge HIGH ─────────────────────────────
      case 'and': {
        if (inputs.some(v => v === false)) { out = [false]; break; }
        if (inputs.some(v => v === null))  { out = [null];  break; }
        out = [true]; break;
      }

      // ── OR: HIGH wenn MINDESTENS EIN Eingang HIGH ─────────────────────────
      case 'or': {
        if (inputs.some(v => v === true))  { out = [true];  break; }
        if (inputs.some(v => v === null))  { out = [null];  break; }
        out = [false]; break;
      }

      // ── NOT: Umkehrung des einzigen Eingangs ──────────────────────────────
      case 'not': {
        if (inputs[0] === null) { out = [null]; break; }
        out = [!inputs[0]]; break;
      }

      // ── XOR: HIGH wenn UNGERADE ANZAHL von Eingängen HIGH ─────────────────
      case 'xor': {
        if (inputs.some(v => v === null)) { out = [null]; break; }
        const highCount = inputs.filter(v => v === true).length;
        out = [highCount % 2 === 1]; break;
      }

      // ── Halbaddierer: S = A XOR B,  C = A AND B ───────────────────────────
      case 'half-adder': {
        const [a, b] = inputs;
        if (a === null || b === null) { out = [null, null]; break; }
        out = [a !== b, a && b]; break;
      }

      // ── Volladdierer: S = A XOR B XOR Cin, Cout = Majorität ──────────────
      case 'full-adder': {
        const [a, b, cin] = inputs;
        if (a === null || b === null || cin === null) { out = [null, null]; break; }
        const sum  = (a ? 1 : 0) + (b ? 1 : 0) + (cin ? 1 : 0);
        out = [(sum % 2) === 1, sum >= 2]; break;
      }

      // ── JK-Flip-Flop: Ausgang wird gehalten (Zustand → nextFlipFlopState) ─
      case 'jk-ff': {
        const q = gate.ffState ?? false;
        out = [
          gate.negatedOutputs?.includes(0) ? !q : q,
          gate.negatedOutputs?.includes(1) ? q  : !q,
        ];
        return out; // Negation bereits angewandt, kein zweiter Durchlauf
      }

      // ── Bauteile ohne berechenbaren Ausgang ───────────────────────────────
      case 'output':
      case 'text-label':
      case 'input':
      case 'clock-gen':
      default:
        return [];
    }

    // Output-Verneinung anwenden (falls konfiguriert)
    if (gate.negatedOutputs?.length) {
      out = out.map((v, i) =>
        gate.negatedOutputs!.includes(i) && v !== null ? !v : v
      );
    }
    return out;
  }

  /**
   * Ermittelt den NÄCHSTEN Speicherzustand Q eines JK-Flip-Flops aus den
   * eingependelten Eingängen. FLANKENGESTEUERT: die J/K-Logik wirkt nur bei
   * der steigenden Taktflanke (C: 0→1), nicht solange C dauerhaft auf 1 liegt.
   *
   * Eingänge (nach Index): 0=S, 1=J, 2=C(Takt), 3=K, 4=R
   *
   * - S=1                       → Q=1   (asynchrones Setzen, Vorrang, pegelaktiv)
   * - R=1                       → Q=0   (asynchrones Rücksetzen, pegelaktiv)
   * - steigende Flanke & J=1 K=0 → Q=1   (Setzen)
   * - steigende Flanke & J=0 K=1 → Q=0   (Rücksetzen)
   * - steigende Flanke & J=1 K=1 → Q=¬Q  (Togglen)
   * - sonst                      → Q     (Halten)
   */
  private nextFlipFlopState(
    gate: GateInstance,
    inputs: (boolean | null)[]
  ): boolean {
    const [s, j, c, k, r] = inputs;
    let q = gate.ffState ?? false;

    // Nicht verbundene Pins gelten als LOW (Hardware-Standard: floating → 0)
    const sEff = s === true;
    const jEff = j === true;
    const cEff = c === true;
    const kEff = k === true;
    const rEff = r === true;

    // Asynchrone Eingänge haben Vorrang und wirken pegelgesteuert
    if (sEff) return true;
    if (rEff) return false;

    // Steigende Taktflanke: C war zuvor LOW und ist jetzt HIGH
    const risingEdge = cEff && gate.ffPrevClock !== true;
    if (risingEdge) {
      if (jEff && !kEff)       q = true;   // Setzen
      else if (!jEff && kEff)  q = false;  // Rücksetzen
      else if (jEff && kEff)   q = !q;     // Togglen
      // J=0, K=0 → Halten
    }

    return q;
  }
}

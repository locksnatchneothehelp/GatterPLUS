import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentSignalState } from '../../services/simulation.service';
import { getGatePinOffsets } from '../../models/gate.model';

export interface GatePropertyChange {
  id: string;
  rotation?: 0 | 90 | 180 | 270;
  color?: string;
  inputCount?: number;
  label?: string;
  clockPeriodMs?: number;
  negatedInputs?: number[];
  negatedOutputs?: number[];
}

/**
 * Eigenschaften-Panel (rechte Seitenleiste).
 *
 * Wird angezeigt, wenn ein Element auf dem Whiteboard ausgewählt ist.
 * Ermöglicht das Ändern von Ausrichtung, Farbe, Eingangszahl usw.
 */
@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './properties-panel.html',
  styleUrl: './properties-panel.scss',
})
export class PropertiesPanel {
  /** Aktuell ausgewähltes Element (GateInstance vom Whiteboard) */
  @Input() selectedGate: any | null = null;

  /**
   * ID der aktuell ausgewählten Leitung (falls kein Bauteil, sondern eine
   * Leitung ausgewählt ist). Zeigt einen eigenen kleinen Block mit
   * Löschen-Button, damit Leitungen unabhängig von den angeschlossenen
   * Bauteilen gelöscht werden können — bisher ging das nur per Del-Taste
   * ohne sichtbaren Hinweis darauf.
   */
  @Input() selectedWireId: string | null = null;

  /** Wird ausgelöst, wenn eine Eigenschaft geändert wird */
  @Output() gateChange = new EventEmitter<GatePropertyChange>();

  /** Wird ausgelöst, wenn das Element gelöscht werden soll (gibt die ID zurück) */
  @Output() gateDelete = new EventEmitter<string>();

  /** Wird ausgelöst, wenn die ausgewählte Leitung gelöscht werden soll */
  @Output() wireDelete = new EventEmitter<string>();

  /** Ob die ausgewählte Leitung eigene Knickpunkte hat (zeigt „Verlauf automatisch") */
  @Input() wireHasManualRoute = false;

  /** Wird ausgelöst, wenn die eigenen Knickpunkte der Leitung entfernt werden sollen */
  @Output() wireResetRoute = new EventEmitter<string>();

  /** Simulationsmodus aktiv? (für Zustands-Anzeige im Info-Block) */
  @Input() simulationMode = false;

  /** Aktueller Signalzustand des ausgewählten Gatters */
  @Input() signalState: ComponentSignalState | null = null;

  deleteWire(): void {
    if (!this.selectedWireId) return;
    this.wireDelete.emit(this.selectedWireId);
  }

  resetWireRoute(): void {
    if (!this.selectedWireId) return;
    this.wireResetRoute.emit(this.selectedWireId);
  }

  get hasVariableInputs(): boolean {
    return ['and', 'or', 'xor'].includes(this.selectedGate?.type);
  }

  get isClockGen(): boolean {
    return this.selectedGate?.type === 'clock-gen';
  }

  get isTextLabel(): boolean {
    return this.selectedGate?.type === 'text-label';
  }

  setRotation(rotation: 0 | 90 | 180 | 270): void {
    if (!this.selectedGate) return;
    this.gateChange.emit({ id: this.selectedGate.id, rotation });
  }

  setColor(color: string): void {
    if (!this.selectedGate) return;
    this.gateChange.emit({ id: this.selectedGate.id, color });
  }

  setInputCount(count: number): void {
    if (!this.selectedGate) return;
    const clamped = Math.max(2, Math.min(8, count));
    this.gateChange.emit({ id: this.selectedGate.id, inputCount: clamped });
  }

  setLabel(label: string): void {
    if (!this.selectedGate) return;
    this.gateChange.emit({ id: this.selectedGate.id, label });
  }

  setClockPeriod(ms: number): void {
    if (!this.selectedGate) return;
    const clamped = Math.max(100, Math.min(10000, ms));
    this.gateChange.emit({ id: this.selectedGate.id, clockPeriodMs: clamped });
  }

  /** Pin-Namen für die Verneinungs-Buttons (Eingänge / Ausgänge). */
  get negationPins(): { inputs: string[]; outputs: string[] } {
    if (!this.selectedGate || this.selectedGate.type === 'text-label') return { inputs: [], outputs: [] };
    const named: Record<string, { inputs: string[]; outputs: string[] }> = {
      'jk-ff':      { inputs: ['S', 'J', 'C', 'K', 'R'], outputs: ['Q', 'Q̅'] },
      'half-adder': { inputs: ['A', 'B'], outputs: ['S', 'C'] },
      'full-adder': { inputs: ['A', 'B', 'Cin'], outputs: ['S', 'Cout'] },
    };
    if (named[this.selectedGate.type]) return named[this.selectedGate.type];
    const off = getGatePinOffsets(this.selectedGate);
    return {
      inputs:  off.inputs.map((_, i) => (off.inputs.length > 1 ? `E${i + 1}` : 'E')),
      // NICHT-Gatter: Kreis am Ausgang ist Teil des Symbols → keine zweite Verneinung
      outputs: this.selectedGate.type === 'not' ? [] : off.outputs.map(() => 'A'),
    };
  }

  isNegated(kind: 'input' | 'output', index: number): boolean {
    const list: number[] = (kind === 'input' ? this.selectedGate?.negatedInputs : this.selectedGate?.negatedOutputs) ?? [];
    return list.includes(index);
  }

  /** Verneinung eines Ein- bzw. Ausgangs umschalten (Kreis am Bauteil). */
  toggleNegation(kind: 'input' | 'output', index: number): void {
    if (!this.selectedGate) return;
    const key = kind === 'input' ? 'negatedInputs' : 'negatedOutputs';
    const cur: number[] = this.selectedGate[key] ?? [];
    const next = cur.includes(index) ? cur.filter(i => i !== index) : [...cur, index];
    this.gateChange.emit({ id: this.selectedGate.id, [key]: next });
  }

  deleteGate(): void {
    if (!this.selectedGate) return;
    this.gateDelete.emit(this.selectedGate.id);
  }

  getTypeName(): string {
    const names: Record<string, string> = {
      'and': 'UND-Gatter',
      'or': 'ODER-Gatter',
      'not': 'NICHT-Gatter',
      'xor': 'Exklusiv-ODER-Gatter',
      'input': 'Eingang',
      'output': 'Ausgang',
      'jk-ff': 'JK-Flipflop',
      'half-adder': 'Halbaddierer',
      'full-adder': 'Volladdierer',
      'text-label': 'Beschriftung',
      'clock-gen': 'Taktgeber',
    };
    return names[this.selectedGate?.type] ?? this.selectedGate?.type ?? '';
  }

  getGateDescription(): string {
    const d: Record<string, string> = {
      'and':
        'Der Ausgang ist 1, wenn alle Eingänge 1 sind. Sonst ist er 0.\n\n' +
        'Wahrheitstabelle (2 Eingänge):\n' +
        '0 ∧ 0 = 0\n0 ∧ 1 = 0\n1 ∧ 0 = 0\n1 ∧ 1 = 1',
      'or':
        'Der Ausgang ist 1, wenn mindestens ein Eingang 1 ist. Sonst ist er 0.\n\n' +
        'Wahrheitstabelle (2 Eingänge):\n' +
        '0 ∨ 0 = 0\n0 ∨ 1 = 1\n1 ∨ 0 = 1\n1 ∨ 1 = 1',
      'not':
        'Kehrt das Signal um: Aus 0 wird 1, aus 1 wird 0.',
      'xor':
        'Der Ausgang ist 1, wenn eine ungerade Anzahl von Eingängen 1 ist. ' +
        'Bei zwei Eingängen also genau dann, wenn sie verschieden sind.\n\n' +
        'Wahrheitstabelle (2 Eingänge):\n' +
        '0 ⊕ 0 = 0\n0 ⊕ 1 = 1\n1 ⊕ 0 = 1\n1 ⊕ 1 = 0',
      'jk-ff':
        'Speichert ein Bit. Es schaltet nur, wenn der Takt C von 0 auf 1 wechselt:\n' +
        'J = 0, K = 0: Q bleibt\n' +
        'J = 1, K = 0: Q wird 1\n' +
        'J = 0, K = 1: Q wird 0\n' +
        'J = 1, K = 1: Q wechselt\n\n' +
        'S = 1 setzt Q sofort auf 1, R = 1 setzt Q sofort auf 0, unabhängig vom Takt.',
      'half-adder':
        'Addiert zwei einstellige Binärzahlen A und B.\n' +
        'Summe S = A ⊕ B\n' +
        'Übertrag C = A ∧ B',
      'full-adder':
        'Addiert A, B und den Übertrag Cin der vorherigen Stelle.\n' +
        'Summe S = A ⊕ B ⊕ Cin\n' +
        'Übertrag Cout = 1, wenn mindestens zwei Eingänge 1 sind',
      'input':
        'Schalter als Signalquelle. In der Simulation wird er per Klick zwischen 0 und 1 umgeschaltet.',
      'output':
        'Zeigt das ankommende Signal an: grün bei 1, grau bei 0.',
      'clock-gen':
        'Wechselt in der Simulation regelmäßig zwischen 0 und 1. ' +
        'Die eingestellte Zeit in Millisekunden gibt an, wie lange jeder Zustand dauert.',
      'text-label':
        'Freier Text zum Beschriften der Schaltung. Er hat keine Funktion in der Simulation.',
    };
    return d[this.selectedGate?.type] ?? '';
  }

  getCurrentStateDescription(): string {
    if (!this.simulationMode || !this.signalState || !this.selectedGate) return '';
    const { inputSignals, outputSignals } = this.signalState;
    const sig = (v: boolean | null) => (v === true ? '1' : v === false ? '0' : 'offen');
    const lines: string[] = [];

    switch (this.selectedGate.type) {
      case 'and':
      case 'or':
      case 'xor':
        inputSignals.forEach((v, i) => lines.push(`Eingang ${i + 1}: ${sig(v)}`));
        lines.push(`Ausgang: ${sig(outputSignals[0])}`);
        break;
      case 'not':
        lines.push(`Eingang: ${sig(inputSignals[0])}`);
        lines.push(`Ausgang: ${sig(outputSignals[0])}`);
        break;
      case 'jk-ff': {
        const labels = ['S', 'J', 'C (Takt)', 'K', 'R'];
        inputSignals.forEach((v, i) => lines.push(`${labels[i] ?? `Eingang ${i + 1}`}: ${sig(v)}`));
        lines.push(`Q: ${sig(outputSignals[0])}`);
        lines.push(`Q̅: ${sig(outputSignals[1])}`);
        break;
      }
      case 'half-adder':
        lines.push(`A: ${sig(inputSignals[0])}`);
        lines.push(`B: ${sig(inputSignals[1])}`);
        lines.push(`Summe S: ${sig(outputSignals[0])}`);
        lines.push(`Übertrag C: ${sig(outputSignals[1])}`);
        break;
      case 'full-adder':
        lines.push(`A: ${sig(inputSignals[0])}`);
        lines.push(`B: ${sig(inputSignals[1])}`);
        lines.push(`Cin: ${sig(inputSignals[2])}`);
        lines.push(`Summe S: ${sig(outputSignals[0])}`);
        lines.push(`Übertrag Cout: ${sig(outputSignals[1])}`);
        break;
      case 'input':
      case 'clock-gen':
        lines.push(`Ausgang: ${sig(outputSignals[0])}`);
        break;
      case 'output':
        lines.push(`Eingang: ${sig(inputSignals[0])}`);
        break;
    }
    return lines.join('\n');
  }
}

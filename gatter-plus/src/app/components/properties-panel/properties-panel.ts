import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentSignalState } from '../../services/simulation.service';

export interface GatePropertyChange {
  id: string;
  rotation?: 0 | 90 | 180 | 270;
  color?: string;
  inputCount?: number;
  label?: string;
  clockPeriodMs?: number;
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

  /** Simulationsmodus aktiv? (für Zustands-Anzeige im Info-Block) */
  @Input() simulationMode = false;

  /** Aktueller Signalzustand des ausgewählten Gatters */
  @Input() signalState: ComponentSignalState | null = null;

  deleteWire(): void {
    if (!this.selectedWireId) return;
    this.wireDelete.emit(this.selectedWireId);
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

  deleteGate(): void {
    if (!this.selectedGate) return;
    this.gateDelete.emit(this.selectedGate.id);
  }

  getTypeName(): string {
    const names: Record<string, string> = {
      'and': 'UND-Gatter',
      'or': 'ODER-Gatter',
      'not': 'NICHT-Gatter',
      'xor': 'XOR-Gatter',
      'input': 'Eingang',
      'output': 'Ausgang',
      'jk-ff': 'JK-Flip-Flop',
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
        'UND-Gatter: Gibt HIGH (1) aus, wenn ALLE Eingänge HIGH sind. Sonst LOW (0).\n' +
        'Wahrheitstabelle (2 Eingänge):\n' +
        '  0 ∧ 0 = 0\n  0 ∧ 1 = 0\n  1 ∧ 0 = 0\n  1 ∧ 1 = 1',
      'or':
        'ODER-Gatter: Gibt HIGH (1) aus, wenn MINDESTENS EIN Eingang HIGH ist.\n' +
        'Wahrheitstabelle (2 Eingänge):\n' +
        '  0 ∨ 0 = 0\n  0 ∨ 1 = 1\n  1 ∨ 0 = 1\n  1 ∨ 1 = 1',
      'not':
        'NICHT-Gatter (Inverter): Invertiert den einzigen Eingang.\n' +
        '  NOT 0 = 1\n  NOT 1 = 0',
      'xor':
        'XOR-Gatter (Exklusiv-ODER): Gibt HIGH aus, wenn eine UNGERADE ANZAHL von Eingängen HIGH ist.\n' +
        'Wahrheitstabelle (2 Eingänge):\n' +
        '  0 ⊕ 0 = 0\n  0 ⊕ 1 = 1\n  1 ⊕ 0 = 1\n  1 ⊕ 1 = 0',
      'jk-ff':
        'JK-Flip-Flop: Speichert einen Bit-Zustand (flankengesteuert).\n' +
        '  J=0, K=0 → Halten (Q bleibt)\n' +
        '  J=1, K=0 → Setzen (Q=1)\n' +
        '  J=0, K=1 → Rücksetzen (Q=0)\n' +
        '  J=1, K=1 → Togglen (Q wechselt)\n' +
        '  S=1 → Asynchrones Setzen\n' +
        '  R=1 → Asynchrones Rücksetzen',
      'half-adder':
        'Halbaddierer: Addiert zwei 1-Bit-Zahlen A und B (ohne Übertragseingang).\n' +
        '  S (Summe)    = A XOR B\n' +
        '  C (Übertrag) = A AND B',
      'full-adder':
        'Volladdierer: Addiert drei Bits A, B und Cin (Eingangsübertrag).\n' +
        '  S    = A XOR B XOR Cin\n' +
        '  Cout = Majorität (mind. 2 Eingänge HIGH)',
      'input':
        'Eingangsschalter: Manuelle Signalquelle.\n' +
        'Im Simulationsmodus durch Klick umschaltbar (HIGH / LOW).',
      'output':
        'Ausgangs-LED: Zeigt den empfangenen Signalzustand an.\n' +
        'Grün = HIGH, Grau = LOW, kein Signal = unverbunden.',
      'clock-gen':
        'Taktgeber: Erzeugt automatisch ein periodisches Rechtecksignal.\n' +
        'Die Halbperiode entspricht der eingestellten Zeit in ms.',
      'text-label':
        'Beschriftung: Passives Textelement ohne Logik.\n' +
        'Dient zur Kommentierung und Beschriftung der Schaltung.',
    };
    return d[this.selectedGate?.type] ?? '';
  }

  getCurrentStateDescription(): string {
    if (!this.simulationMode || !this.signalState || !this.selectedGate) return '';
    const { inputSignals, outputSignals } = this.signalState;
    const sig = (v: boolean | null) =>
      v === true ? 'HIGH (1)' : v === false ? 'LOW (0)' : 'unbekannt';
    const lines: string[] = [];

    switch (this.selectedGate.type) {
      case 'and':
      case 'or':
      case 'xor':
        inputSignals.forEach((v, i) => lines.push(`Eingang ${i + 1}: ${sig(v)}`));
        lines.push(`→ Ausgang: ${sig(outputSignals[0])}`);
        break;
      case 'not':
        lines.push(`Eingang: ${sig(inputSignals[0])}`);
        lines.push(`→ Ausgang: ${sig(outputSignals[0])}`);
        break;
      case 'jk-ff': {
        const labels = ['S', 'J', 'C (Takt)', 'K', 'R'];
        inputSignals.forEach((v, i) => lines.push(`${labels[i] ?? `In${i}`}: ${sig(v)}`));
        lines.push(`→ Q:  ${sig(outputSignals[0])}`);
        lines.push(`→ Q̄: ${sig(outputSignals[1])}`);
        break;
      }
      case 'half-adder':
        lines.push(`A: ${sig(inputSignals[0])}`);
        lines.push(`B: ${sig(inputSignals[1])}`);
        lines.push(`→ S (Summe):    ${sig(outputSignals[0])}`);
        lines.push(`→ C (Übertrag): ${sig(outputSignals[1])}`);
        break;
      case 'full-adder':
        lines.push(`A:   ${sig(inputSignals[0])}`);
        lines.push(`B:   ${sig(inputSignals[1])}`);
        lines.push(`Cin: ${sig(inputSignals[2])}`);
        lines.push(`→ S:    ${sig(outputSignals[0])}`);
        lines.push(`→ Cout: ${sig(outputSignals[1])}`);
        break;
      case 'input':
      case 'clock-gen':
        lines.push(`→ Ausgang: ${sig(outputSignals[0])}`);
        break;
      case 'output':
        lines.push(`Eingang: ${sig(inputSignals[0])}`);
        break;
    }
    return lines.join('\n');
  }
}

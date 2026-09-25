import { Component, Input } from '@angular/core';

/**
 * Visuelles XOR-Gatter (Exklusiv-ODER) nach DIN 40900.
 * Symbol: "=1"
 *
 * Wahrheitstabelle (2 Eingänge):
 *   A=0, B=0 → Q=0
 *   A=0, B=1 → Q=1
 *   A=1, B=0 → Q=1
 *   A=1, B=1 → Q=0
 */
@Component({
  selector: 'app-xor-gate',
  imports: [],
  templateUrl: './xor-gate.html',
  styleUrl: './xor-gate.scss',
})
export class XorGate {
  /** Kompakter Toolbar-Modus (kleiner) */
  @Input() toolbarMode = false;

  /**
   * Aktueller Ausgangs-Signal-Zustand (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutput: boolean | null = null;

  /**
   * Anzahl der Eingänge (2–8).
   */
  @Input() inputCount = 2;

  /**
   * Berechnet die Gatter-Höhe abhängig von inputCount.
   * Minimum 52px, wächst mit mehr Eingängen.
   */
  get gateHeight(): number {
    return Math.max(52, (this.inputCount + 1) * 16 + 8);
  }

  /**
   * Liefert ein Array der Länge inputCount (im Toolbar-Modus immer 2)
   * für das @for-Template.
   */
  get wireArray(): number[] {
    const count = this.toolbarMode ? 2 : this.inputCount;
    return Array.from({ length: count }, (_, i) => i);
  }
}

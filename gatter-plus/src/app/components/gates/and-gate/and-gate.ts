import { Component, Input } from '@angular/core';

/**
 * Visuelles UND-Gatter (AND) nach DIN 40900.
 * Symbol: "&"
 *
 * Wahrheitstabelle:
 *   A=0, B=0 → Q=0
 *   A=0, B=1 → Q=0
 *   A=1, B=0 → Q=0
 *   A=1, B=1 → Q=1
 */
@Component({
  selector: 'app-and-gate',
  imports: [],
  templateUrl: './and-gate.html',
  styleUrl: './and-gate.scss',
})
export class AndGate {
  /** Kompakter Toolbar-Modus (kleiner) */
  @Input() toolbarMode = false;
  /** Variable Eingangsanzahl (2–8, Standard: 2) */
  @Input() inputCount = 2;
  @Input() signalOutput: boolean | null = null;

  get gateHeight(): number {
    return this.toolbarMode ? 44 : Math.max(52, (this.inputCount + 1) * 16 + 8);
  }
  get wireArray(): number[] {
    return Array.from({ length: this.toolbarMode ? 2 : this.inputCount }, (_, i) => i);
  }
}

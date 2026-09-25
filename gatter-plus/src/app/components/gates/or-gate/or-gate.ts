import { Component, Input } from '@angular/core';

/**
 * Visuelles ODER-Gatter (OR) nach DIN 40900.
 * Symbol: "≥1" (mindestens 1 Eingang muss HIGH sein)
 *
 * Wahrheitstabelle:
 *   A=0, B=0 → Q=0
 *   A=0, B=1 → Q=1
 *   A=1, B=0 → Q=1
 *   A=1, B=1 → Q=1
 */
@Component({
  selector: 'app-or-gate',
  imports: [],
  templateUrl: './or-gate.html',
  styleUrl: './or-gate.scss',
})
export class OrGate {
  @Input() toolbarMode = false;
  @Input() inputCount = 2;
  @Input() signalOutput: boolean | null = null;

  get gateHeight(): number {
    return this.toolbarMode ? 44 : Math.max(52, (this.inputCount + 1) * 16 + 8);
  }
  get wireArray(): number[] {
    return Array.from({ length: this.toolbarMode ? 2 : this.inputCount }, (_, i) => i);
  }
}

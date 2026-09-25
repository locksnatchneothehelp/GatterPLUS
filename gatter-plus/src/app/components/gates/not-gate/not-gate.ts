import { Component, Input } from '@angular/core';

/**
 * Visuelles NICHT-Gatter (NOT / Inverter) nach DIN 40900.
 * Symbol: "1" mit Invertierkreis am Ausgang.
 *
 * Wahrheitstabelle:
 *   A=0 → Q=1
 *   A=1 → Q=0
 */
@Component({
  selector: 'app-not-gate',
  imports: [],
  templateUrl: './not-gate.html',
  styleUrl: './not-gate.scss',
})
export class NotGate {
  @Input() toolbarMode = false;
  @Input() signalOutput: boolean | null = null;
}

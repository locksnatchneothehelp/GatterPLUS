import { Component, Input } from '@angular/core';
import { getInputSlots, GRID } from '../../../models/gate.model';

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

  /** Höhe: eine Raster-Zeile (GRID px) pro Eingangs-Platz, siehe getInputSlots. */
  get gateHeight(): number {
    const s = getInputSlots(this.inputCount);
    return this.toolbarMode ? 44 : (s[s.length - 1] + 1) * GRID;
  }

  /** Raster-Zeilen der Eingangsseite: true = Draht, false = freier Mittelplatz. */
  get slots(): boolean[] {
    if (this.toolbarMode) return [true, true]; // Palette: zwei gleichmäßig verteilte Eingänge
    const s = getInputSlots(this.inputCount);
    return Array.from({ length: s[s.length - 1] + 1 }, (_, i) => s.includes(i));
  }
}

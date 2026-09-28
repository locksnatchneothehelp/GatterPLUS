import { Component, Input } from '@angular/core';
import { getInputSlots, GRID } from '../../../models/gate.model';

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

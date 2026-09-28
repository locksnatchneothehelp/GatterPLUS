import { Component, Input } from '@angular/core';
import { getInputSlots, GRID } from '../../../models/gate.model';

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

  /** Höhe: eine Raster-Zeile (GRID px) pro Eingangs-Platz, siehe getInputSlots. */
  get gateHeight(): number {
    const s = getInputSlots(this.inputCount);
    return this.toolbarMode ? 44 : (s[s.length - 1] + 1) * GRID;
  }

  /** Raster-Zeilen der Eingangsseite: true = Draht, false = freier Mittelplatz. */
  get slots(): boolean[] {
    const s = getInputSlots(this.toolbarMode ? 2 : this.inputCount);
    return Array.from({ length: s[s.length - 1] + 1 }, (_, i) => s.includes(i));
  }
}

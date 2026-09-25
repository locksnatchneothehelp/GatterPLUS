import { Component, Input } from '@angular/core';

/**
 * Visueller Volladdierer (Full Adder / Volladder).
 * Eingänge (links):  A (oben), B (Mitte), Cin (unten)
 * Ausgänge (rechts): S – Summe (oben), Cout – Carry-out (unten)
 */
@Component({
  selector: 'app-full-adder',
  imports: [],
  templateUrl: './full-adder.html',
  styleUrl: './full-adder.scss',
})
export class FullAdder {
  /** Kompakter Toolbar-Modus (kleiner) */
  @Input() toolbarMode = false;

  /**
   * Summen-Ausgang S (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutputS: boolean | null = null;

  /**
   * Carry-out-Ausgang Cout (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutputCout: boolean | null = null;
}

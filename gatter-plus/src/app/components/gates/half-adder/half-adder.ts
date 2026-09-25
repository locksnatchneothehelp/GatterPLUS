import { Component, Input } from '@angular/core';

/**
 * Visueller Halbaddierer (Half Adder).
 * Eingänge (links):  A (oben), B (unten)
 * Ausgänge (rechts): S – Summe (oben), C – Carry (unten)
 */
@Component({
  selector: 'app-half-adder',
  imports: [],
  templateUrl: './half-adder.html',
  styleUrl: './half-adder.scss',
})
export class HalfAdder {
  /** Kompakter Toolbar-Modus (kleiner) */
  @Input() toolbarMode = false;

  /**
   * Summen-Ausgang S (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutputS: boolean | null = null;

  /**
   * Carry-Ausgang C (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutputC: boolean | null = null;
}

import { Component, Input } from '@angular/core';

/**
 * Visuelles JK-Flipflop nach DIN 40900.
 * Eingänge (links, oben→unten): S, J, C (Clock), K, R
 * Ausgänge (rechts, oben→unten): Q, Q̄
 */
@Component({
  selector: 'app-jk-flipflop',
  imports: [],
  templateUrl: './jk-flipflop.html',
  styleUrl: './jk-flipflop.scss',
})
export class JkFlipflop {
  /** Kompakter Toolbar-Modus (kleiner) */
  @Input() toolbarMode = false;

  /**
   * Q-Ausgang-Zustand (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutputQ: boolean | null = null;

  /**
   * Q̄-Ausgang-Zustand (für Simulations-Visualisierung).
   * null = unbekannt, false = LOW, true = HIGH
   */
  @Input() signalOutputQBar: boolean | null = null;
}

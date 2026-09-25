import { Component, Input } from '@angular/core';

/**
 * Eingangs-Schalter (Signalquelle).
 *
 * Gibt ein festes logisches Signal (0 oder 1) aus.
 * In der Simulation kann der Benutzer den Schalter durch Klick umschalten.
 * Das Umschalten wird im Whiteboard-Component verwaltet (nicht hier),
 * da dieser Component nur die Darstellung übernimmt.
 */
@Component({
  selector: 'app-input-switch',
  imports: [],
  templateUrl: './input-switch.html',
  styleUrl: './input-switch.scss',
})
export class InputSwitch {
  /** Aktueller Schalter-Zustand: false = 0 (LOW), true = 1 (HIGH) */
  @Input() value = false;

  /** Kompakter Toolbar-Modus */
  @Input() toolbarMode = false;

  /** Simulationsmodus aktiv (dann ist der Schalter klickbar, visuell angezeigt) */
  @Input() simulationMode = false;
}

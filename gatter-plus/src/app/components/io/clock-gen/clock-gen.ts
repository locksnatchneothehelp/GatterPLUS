import { Component, Input } from '@angular/core';

/**
 * Taktgeber (Clock Generator).
 *
 * Erzeugt ein periodisches Rechteck-Signal (0/1 im Wechsel).
 * Kein Eingangs-Pin, 1 Ausgangs-Pin rechts.
 * Die eigentliche Takt-Logik wird im Whiteboard-Component verwaltet.
 */
@Component({
  selector: 'app-clock-gen',
  standalone: true,
  imports: [],
  templateUrl: './clock-gen.html',
  styleUrl: './clock-gen.scss',
})
export class ClockGen {
  /** Kompakter Toolbar-Modus */
  @Input() toolbarMode = false;

  /** Aktueller Takt-Zustand: false = LOW, true = HIGH */
  @Input() value = false;

  /** Taktperiode in Millisekunden */
  @Input() periodMs = 1000;
}

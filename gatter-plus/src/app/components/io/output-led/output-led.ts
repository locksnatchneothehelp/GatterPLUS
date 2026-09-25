import { Component, Input } from '@angular/core';

/**
 * Ausgangs-LED (Signalsenke).
 *
 * Zeigt den empfangenen Signalzustand visuell an:
 * - null / kein Signal: grau (unbekannt)
 * - false (0 / LOW): dunkel
 * - true (1 / HIGH): hellgrün leuchtend
 */
@Component({
  selector: 'app-output-led',
  imports: [],
  templateUrl: './output-led.html',
  styleUrl: './output-led.scss',
})
export class OutputLed {
  /** Eingehender Signalzustand: null = unbekannt, false = 0, true = 1 */
  @Input() signalInput: boolean | null = null;

  @Input() toolbarMode = false;
}

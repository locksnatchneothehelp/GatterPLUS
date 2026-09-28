import { Component, Input } from '@angular/core';

/**
 * Text-Beschriftung (passives Element).
 *
 * Zeigt einen frei definierbaren Text auf dem Whiteboard an.
 * Hat weder Eingangs- noch Ausgangs-Pins.
 */
@Component({
  selector: 'app-text-label',
  standalone: true,
  imports: [],
  templateUrl: './text-label.html',
  styleUrl: './text-label.scss',
})
export class TextLabel {
  /** Anzuzeigender Beschriftungstext */
  @Input() label = 'Label';

  /** Breite aus dem Modell (textLabelWidth), damit Box, Auswahl und Klickfläche übereinstimmen */
  @Input() width = 72;

  /** Kompakter Toolbar-Modus */
  @Input() toolbarMode = false;
}

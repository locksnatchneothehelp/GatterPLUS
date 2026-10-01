import { Component } from '@angular/core';

/**
 * Eine Taste der Tastatur-Abbildung. Belegung je Gruppe (Farbe):
 * any = immer, wire = beim Verkabeln, ctrl = zusammen mit Strg.
 */
interface HelpKey {
  label: string;
  any?: string;
  wire?: string;
  ctrl?: string;
  /** Tooltip mit der ausführlichen Beschreibung */
  title?: string;
  /** breitere Taste (Esc, Rück, Entf, Strg) */
  wide?: boolean;
  /** Strg selbst (Umschalttaste, ohne eigene Aktion) */
  mod?: boolean;
}

const plain = (chars: string): HelpKey[] => [...chars].map(label => ({ label }));

/** Vereinfachte QWERTZ-Tastatur (Zeile = Tastenreihe). */
const HELP_KEYBOARD: HelpKey[][] = [
  [
    { label: 'Esc', any: 'Abbrechen', wide: true,
      title: 'Verkabeln abbrechen; danach zurück zu „Verschieben“; Auswahl aufheben' },
    { label: 'Entf', any: 'Löschen', wide: true, title: 'Ausgewähltes löschen' },
    { label: 'Rück', any: 'Löschen', wire: 'Zurück', wide: true,
      title: 'Ausgewähltes löschen – beim Verkabeln: letzten Punkt zurücknehmen' },
  ],
  [
    ...plain('QWERT'),
    { label: 'Z', ctrl: 'Rückgängig', title: 'Strg+Z: Rückgängig – beim Verkabeln: letzten Punkt zurücknehmen' },
    ...plain('UIOPÜ'),
  ],
  [
    ...plain('A'),
    { label: 'S', any: 'Simulation', title: 'Simulation starten / stoppen' },
    ...plain('D'),
    { label: 'F', wire: 'Knick', title: 'Beim Verkabeln: Knick umschalten (erst waagerecht / erst senkrecht)' },
    ...plain('GHJKLÖÄ'),
  ],
  [
    { label: 'Y', ctrl: 'Wiederh.', title: 'Strg+Y: Wiederherstellen' },
    ...plain('X'),
    { label: 'C', wire: 'Punkt', ctrl: 'Kopieren',
      title: 'Beim Verkabeln: festen Punkt setzen (auch per Klick) – Strg+C: Kopieren' },
    { label: 'V', any: 'Verkabeln', ctrl: 'Einfügen',
      title: 'Werkzeug „Verkabeln“ ein/aus – Strg+V: Einfügen (an freier Stelle)' },
    ...plain('BNM'),
  ],
  [
    { label: 'Strg', mod: true, wide: true, title: 'Zusammen mit Z, Y, C, V' },
  ],
];

/**
 * Tastatur-Abbildung mit Legende: zeigt, welche Taste was macht.
 * Genutzt im Hilfe-Fenster (Menüleiste) und im Tastenkürzel-Bildschirm nach dem Start.
 */
@Component({
  selector: 'app-keyboard-map',
  imports: [],
  templateUrl: './keyboard-map.html',
  styleUrl: './keyboard-map.scss',
})
export class KeyboardMap {
  readonly rows = HELP_KEYBOARD;
}

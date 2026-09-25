import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Verfügbare Werkzeug-Modi im Editor */
export type ToolMode = 'pan' | 'wire';

/**
 * Linke vertikale Toolbar mit Werkzeug-Buttons.
 *
 * Werkzeuge:
 * - Pan (Verschieben): Klicken + Ziehen verschiebt das Whiteboard
 * - Leitung (Wire): Klick auf Ausgangs-Pin → Klick auf Eingangs-Pin = Verbindung
 */
@Component({
  selector: 'app-toolbar-left',
  imports: [],
  templateUrl: './toolbar-left.html',
  styleUrl: './toolbar-left.scss',
})
export class ToolbarLeft {
  /** Welches Werkzeug gerade aktiv ist (kommt vom Whiteboard) */
  @Input() activeTool: ToolMode = 'pan';

  /** Wird emittiert, wenn der Benutzer ein Werkzeug auswählt */
  @Output() toolSelected = new EventEmitter<ToolMode>();

  /** Wechselt das aktive Werkzeug */
  selectTool(tool: ToolMode): void {
    this.toolSelected.emit(tool);
  }
}

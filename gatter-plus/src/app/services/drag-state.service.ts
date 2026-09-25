import { Injectable, signal } from '@angular/core';

/**
 * Service für den globalen Drag-Zustand beim Ziehen von Gattern aus der Toolbar.
 *
 * Warum kein HTML5 Drag-and-Drop?
 * HTML5 DnD funktioniert nicht zuverlässig in Browser-Vorschauen (iFrames, VS Code
 * Simple Browser, CodeSpaces). Deshalb wird hier ein eigenes System mit Maus-Events
 * (mousedown → mousemove → mouseup) verwendet.
 *
 * Ablauf:
 * 1. Toolbar: mousedown → startDrag('and')
 * 2. Benutzer bewegt Maus über das Whiteboard
 * 3. Whiteboard: mouseup → nimmt gateType, berechnet Position, platziert Gatter
 * 4. Toolbar oder Whiteboard: endDrag()
 */
@Injectable({ providedIn: 'root' })
export class DragStateService {
  /**
   * Gibt an, ob gerade ein Gatter gezogen wird.
   * Wird vom Whiteboard geprüft, um einen Drop zu erkennen.
   */
  readonly isDragging = signal<boolean>(false);

  /**
   * Der Typ des Gatters, das gerade gezogen wird (z.B. 'and').
   * null wenn kein Drag aktiv.
   */
  readonly gateType = signal<string | null>(null);

  /**
   * Startet den Drag-Vorgang mit dem angegebenen Gatter-Typ.
   * Wird von der Toolbar beim mousedown aufgerufen.
   *
   * @param type  Typ des Gatters, das gezogen wird (z.B. 'and')
   */
  startDrag(type: string): void {
    this.isDragging.set(true);
    this.gateType.set(type);
  }

  /**
   * Beendet den Drag-Vorgang und setzt den Zustand zurück.
   * Wird aufgerufen wenn: Drop auf Whiteboard, Drop außerhalb, oder mouseup anywhere.
   */
  endDrag(): void {
    this.isDragging.set(false);
    this.gateType.set(null);
  }
}

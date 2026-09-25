import { Injectable } from '@angular/core';
import { GateInstance, WireConnection } from '../models/gate.model';

/** Ein einziger Schnappschuss des Schaltkreis-Zustands für Undo/Redo. */
export interface BoardSnapshot {
  gates: GateInstance[];
  wires: WireConnection[];
}

/**
 * Verwaltet Undo- und Redo-Historie als zwei LIFO-Stacks.
 *
 * Ablauf:
 *   push()      – vor einer neuen Benutzeraktion: Zustand auf Undo-Stack,
 *                 Redo-Stack wird dabei geleert (neue Aktion macht Redo ungültig).
 *   undo():     Whiteboard ruft pop() + pushRedo(aktueller Zustand).
 *   redo():     Whiteboard ruft popRedo() + pushUndo(aktueller Zustand).
 *               pushUndo() leert den Redo-Stack NICHT (im Gegensatz zu push()).
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  /** Maximale Stack-Tiefe je Stack (schützt vor unbegrenztem Speicherwachstum). */
  static readonly MAX_SIZE = 50;

  private undoStack: BoardSnapshot[] = [];
  private redoStack: BoardSnapshot[] = [];

  // ── Snapshot-Hilfsmethode ────────────────────────────────────────────────

  private snapshot(gates: GateInstance[], wires: WireConnection[]): BoardSnapshot {
    return {
      gates: gates.map(g => ({ ...g })),
      wires: wires.map(w => ({ ...w, points: w.points.map(p => ({ ...p })) })),
    };
  }

  private trimStack(stack: BoardSnapshot[]): void {
    if (stack.length > HistoryService.MAX_SIZE) stack.shift();
  }

  // ── Undo-Stack ───────────────────────────────────────────────────────────

  /**
   * Neue Benutzeraktion: Zustand auf Undo-Stack sichern und Redo-Stack leeren.
   * Muss vor JEDER destruktiven Aktion aufgerufen werden.
   */
  push(gates: GateInstance[], wires: WireConnection[]): void {
    this.undoStack.push(this.snapshot(gates, wires));
    this.trimStack(this.undoStack);
    this.redoStack = [];
  }

  /**
   * Legt einen Zustand auf den Undo-Stack ohne den Redo-Stack zu leeren.
   * Nur intern beim Redo-Ablauf verwenden.
   */
  pushUndo(gates: GateInstance[], wires: WireConnection[]): void {
    this.undoStack.push(this.snapshot(gates, wires));
    this.trimStack(this.undoStack);
  }

  /** Entfernt den letzten Undo-Schnappschuss und gibt ihn zurück (null = leer). */
  pop(): BoardSnapshot | null {
    return this.undoStack.pop() ?? null;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }

  // ── Redo-Stack ───────────────────────────────────────────────────────────

  /** Legt einen Zustand auf den Redo-Stack (nur beim Undo-Ablauf aufrufen). */
  pushRedo(gates: GateInstance[], wires: WireConnection[]): void {
    this.redoStack.push(this.snapshot(gates, wires));
    this.trimStack(this.redoStack);
  }

  /** Entfernt den letzten Redo-Schnappschuss und gibt ihn zurück (null = leer). */
  popRedo(): BoardSnapshot | null {
    return this.redoStack.pop() ?? null;
  }

  canRedo(): boolean { return this.redoStack.length > 0; }

  // ── Allgemein ────────────────────────────────────────────────────────────

  /** Leert beide Stacks (z.B. beim Zurücksetzen der Simulation). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Tiefe des Undo-Stacks (für Tests und Debugging). */
  get size(): number { return this.undoStack.length; }

  /** Tiefe des Redo-Stacks (für Tests und Debugging). */
  get redoSize(): number { return this.redoStack.length; }
}

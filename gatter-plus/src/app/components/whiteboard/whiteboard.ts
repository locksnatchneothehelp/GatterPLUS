import {
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AndGate }     from '../gates/and-gate/and-gate';
import { OrGate }      from '../gates/or-gate/or-gate';
import { NotGate }     from '../gates/not-gate/not-gate';
import { XorGate }     from '../gates/xor-gate/xor-gate';
import { JkFlipflop }  from '../gates/jk-flipflop/jk-flipflop';
import { HalfAdder }   from '../gates/half-adder/half-adder';
import { FullAdder }   from '../gates/full-adder/full-adder';
import { InputSwitch } from '../io/input-switch/input-switch';
import { OutputLed }   from '../io/output-led/output-led';
import { ClockGen }    from '../io/clock-gen/clock-gen';
import { TextLabel }   from '../io/text-label/text-label';
import {
  GateInstance, GateType, WireConnection,
  Rotation, GateColor, PinDirection,
  getGatePinOffsets, getGateDimensions,
  getPinWorldPos, isPointInGate,
  PIN_HIT_RADIUS, createGateInstance, computeOrthogonalWaypoints,
  getOutputPinMaxConnections, getPinDirection,
} from '../../models/gate.model';
import { DragStateService }    from '../../services/drag-state.service';
import { SimulationService, ComponentSignalState } from '../../services/simulation.service';
import { HistoryService }      from '../../services/history.service';
import { ToolMode }            from '../toolbar-left/toolbar-left';

/** Zustand während des Leitungs-Zeichnens */
interface WireDrawingState {
  fromGateId:   string;
  fromPinIndex: number;
  x1: number;
  y1: number;
  /** Austrittsrichtung am Startpunkt (Pin-Richtung oder Abzweig-Richtung). */
  fromDir: PinDirection;
  /**
   * Gesetzt, wenn diese Leitung als Abzweigung von einer bestehenden Leitung
   * gestartet wurde (Klick auf eine beliebige Stelle der Original-Leitung).
   * (x1,y1) ist in diesem Fall bereits der Abzweigpunkt, nicht der Pin.
   */
  branchPoint?: { x: number; y: number };
}

/** Zustand während des Verschiebens eines oder mehrerer Bauteile */
interface GateDragState {
  gateId:      string;
  /** Logische Ausgangsposition des primären Bauteils beim Drag-Start */
  originX:     number;
  originY:     number;
  /** Mausposition beim Drag-Start (Bildschirm) */
  startMouseX: number;
  startMouseY: number;
  /**
   * Ursprungspositionen aller weiteren selektierten Bauteile (außer dem primären).
   * Beim Multi-Drag werden alle um dasselbe Delta verschoben.
   */
  otherOrigins: Map<string, { ox: number; oy: number }>;
}

/** Zustand eines aufgezogenen Auswahlrechtecks (Ctrl+Drag auf leerer Fläche) */
interface SelectionRectState {
  startLx: number;
  startLy: number;
}

/**
 * Das unendliche, gerasterte Whiteboard.
 *
 * Verantwortlich für:
 * - SVG-Raster (scrollt mit dem Pan-Versatz)
 * - Pan (Maus ziehen, Leinwand verschieben)
 * - Gatter-Drop (Toolbar → mousedown → mouseup auf Whiteboard)
 * - Gatter verschieben / Multi-Select verschieben
 * - Gatter auswählen (Einzel- und Mehrfachauswahl per Ctrl)
 * - Auswahlrahmen (Ctrl+Drag auf leerer Fläche)
 * - Leitungen zeichnen (Wire-Modus, rechtwinklige Führung)
 * - Simulation: Fixpunkt-Iteration + Taktgeber-Intervalle
 * - Eingangs-Schalter umschalten (Klick im Simulations-Modus)
 * - Undo (Ctrl+Z), Kopieren (Ctrl+C), Einfügen (Ctrl+V)
 * - Bauteile umbenennen (Doppelklick → Inline-Eingabe)
 */
@Component({
  selector: 'app-whiteboard',
  imports: [
    FormsModule,
    AndGate, OrGate, NotGate, XorGate,
    JkFlipflop, HalfAdder, FullAdder,
    InputSwitch, OutputLed, ClockGen, TextLabel,
  ],
  templateUrl: './whiteboard.html',
  styleUrl:    './whiteboard.scss',
})
export class Whiteboard implements OnDestroy {
  // ─── Services ──────────────────────────────────────────────────────────────
  private readonly dragState         = inject(DragStateService);
  private readonly simulationService = inject(SimulationService);
  private readonly historyService    = inject(HistoryService);

  // ─── DOM-Referenz ───────────────────────────────────────────────────────────
  @ViewChild('viewport') viewportRef!: ElementRef<HTMLDivElement>;

  // ─── Pan-Zustand ───────────────────────────────────────────────────────────
  panX = 0;
  panY = 0;
  protected isPanning    = false;
  private panStartMouseX  = 0;
  private panStartMouseY  = 0;
  private panStartOffsetX = 0;
  private panStartOffsetY = 0;

  // ─── Zoom-Zustand ──────────────────────────────────────────────────────────
  zoom = 1.0;
  minimapVisible = true;

  // ─── Werkzeug-Modus ────────────────────────────────────────────────────────
  toolMode: ToolMode = 'pan';

  // ─── Leitungs-Zeichnen ─────────────────────────────────────────────────────
  wireDrawing: WireDrawingState | null = null;
  tentativeX = 0;
  tentativeY = 0;

  // ─── Gatter verschieben ────────────────────────────────────────────────────
  private gateDragState:   GateDragState | null = null;
  private gateDragStarted = false;

  // ─── Schaltungs-Daten ──────────────────────────────────────────────────────
  gates: GateInstance[] = [];
  wires: WireConnection[] = [];
  private gateIdCounter = 0;
  private wireIdCounter = 0;

  // ─── Auswahl ───────────────────────────────────────────────────────────────
  /**
   * ID des zuletzt angeklickten Bauteils – wird vom Properties Panel genutzt,
   * das immer nur ein Element anzeigen kann.
   */
  selectedGateId: string | null = null;
  /** Alle aktuell selektierten Bauteile (Einzel- und Mehrfachauswahl). */
  selectedGateIds = new Set<string>();
  /** ID der aktuell ausgewählten Leitung (null = keine ausgewählt). */
  selectedWireId: string | null = null;

  /**
   * Das ausgewählte Bauteil für das Properties Panel.
   * Nur bei Einzel-Auswahl gesetzt; bei Mehrfachauswahl null
   * (das Panel würde sonst unklare Daten mehrerer Bauteile mischen).
   */
  get selectedGate(): GateInstance | null {
    if (this.selectedGateIds.size !== 1) return null;
    return this.selectedGateId
      ? (this.gates.find(g => g.id === this.selectedGateId) ?? null)
      : null;
  }

  // ─── Auswahlrahmen (Ctrl+Drag auf leere Fläche) ───────────────────────────
  private selectionRectState:   SelectionRectState | null = null;
  /** Anzeigedaten für den animierten Auswahlrahmen im Template */
  selectionRectDisplay: { left: number; top: number; width: number; height: number } | null = null;

  // ─── Zwischenablage ────────────────────────────────────────────────────────
  private clipboard: { gates: GateInstance[]; wires: WireConnection[] } | null = null;

  // ─── Inline Label-Bearbeitung ─────────────────────────────────────────────
  editingLabelGateId: string | null = null;
  editingLabelValue  = '';

  // ─── Simulations-Modus ─────────────────────────────────────────────────────
  simulationMode = false;
  private signalStates  = new Map<string, ComponentSignalState>();
  private clockIntervals = new Map<string, ReturnType<typeof setInterval>>();

  // ─── Undo ──────────────────────────────────────────────────────────────────

  /** Sichert den aktuellen Zustand bevor eine verändernde Aktion ausgeführt wird. */
  private pushHistory(): void {
    this.historyService.push(this.gates, this.wires);
  }

  /**
   * Stellt den letzten gespeicherten Zustand wieder her.
   * Aufruf über Ctrl+Z oder den Toolbar-Button.
   */
  undo(): void {
    const snap = this.historyService.pop();
    if (!snap) return;
    // Aktuellen Zustand auf Redo-Stack sichern, damit Redo wieder zurückspringen kann
    this.historyService.pushRedo(this.gates, this.wires);
    this.stopClockIntervals();
    this.gates              = snap.gates;
    this.wires              = snap.wires;
    this.selectedGateId     = null;
    this.selectedGateIds.clear();
    this.selectedWireId     = null;
    this.editingLabelGateId = null;
    if (this.simulationMode) {
      this.startClockIntervals();
      this.recomputeSimulation();
    }
  }

  /**
   * Stellt den zuletzt rückgängig gemachten Zustand wieder her.
   * Aufruf über Ctrl+Y / Ctrl+Shift+Z oder den Toolbar-Button.
   */
  redo(): void {
    const snap = this.historyService.popRedo();
    if (!snap) return;
    // Aktuellen Zustand auf Undo-Stack legen (kein push(), um Redo-Stack nicht zu leeren)
    this.historyService.pushUndo(this.gates, this.wires);
    this.stopClockIntervals();
    this.gates              = snap.gates;
    this.wires              = snap.wires;
    this.selectedGateId     = null;
    this.selectedGateIds.clear();
    this.selectedWireId     = null;
    this.editingLabelGateId = null;
    if (this.simulationMode) {
      this.startClockIntervals();
      this.recomputeSimulation();
    }
  }

  get canUndo():  boolean { return this.historyService.canUndo(); }
  get canRedo():  boolean { return this.historyService.canRedo(); }
  get canPaste(): boolean { return this.clipboard !== null; }

  // ─── Kopieren / Einfügen ───────────────────────────────────────────────────

  /**
   * Kopiert alle selektierten Bauteile und die Leitungen zwischen ihnen.
   * Verbindungen zu NICHT-selektierten Bauteilen werden bewusst weggelassen,
   * da deren Ziel-Pins in der Kopie nicht existieren würden.
   */
  copySelected(): void {
    const ids = this.selectedGateIds.size > 0
      ? this.selectedGateIds
      : this.selectedGateId ? new Set([this.selectedGateId]) : new Set<string>();
    if (ids.size === 0) return;

    this.clipboard = {
      gates: this.gates.filter(g => ids.has(g.id)).map(g => ({ ...g })),
      // Nur interne Leitungen (beide Endpunkte in der Auswahl)
      wires: this.wires
        .filter(w => ids.has(w.fromGateId) && ids.has(w.toGateId))
        .map(w => ({ ...w, points: w.points.map(p => ({ ...p })) })),
    };
  }

  /**
   * Fügt die Zwischenablage ein.
   * Jedes Bauteil erhält eine neue ID; Positionen werden um +20px versetzt.
   * Kopierte Leitungen werden auf die neuen IDs umgeschrieben.
   */
  pasteClipboard(): void {
    if (!this.clipboard) return;
    const OFFSET = 20;
    const idMap  = new Map<string, string>();

    const newGates = this.clipboard.gates.map(g => {
      const newId = `gate-${++this.gateIdCounter}`;
      idMap.set(g.id, newId);
      return { ...g, id: newId, x: g.x + OFFSET, y: g.y + OFFSET };
    });

    // Leitungen auf neue IDs umschreiben (nur wenn beide Endpunkte gemappt wurden)
    const newWires = this.clipboard.wires
      .filter(w => idMap.has(w.fromGateId) && idMap.has(w.toGateId))
      .map(w => ({
        ...w,
        id:         `wire-${++this.wireIdCounter}`,
        fromGateId: idMap.get(w.fromGateId)!,
        toGateId:   idMap.get(w.toGateId)!,
        points:     w.points.map(p => ({ ...p })),
      }));

    this.pushHistory();
    this.gates = [...this.gates, ...newGates];
    this.wires = [...this.wires, ...newWires];

    // Eingefügte Bauteile direkt selektieren (für sofortiges Weiterbearbeiten)
    this.selectedGateIds = new Set(newGates.map(g => g.id));
    this.selectedGateId  = newGates.length === 1 ? newGates[0].id : null;

    if (this.simulationMode) this.recomputeSimulation();
  }

  // ─── Inline Label-Bearbeitung ─────────────────────────────────────────────

  /**
   * Öffnet das Inline-Eingabefeld für das Label des angeklickten Bauteils.
   * Deaktiviert im Simulations-Modus (Klick schaltet dort Eingänge um).
   */
  startEditLabel(gate: GateInstance, event: MouseEvent): void {
    if (this.simulationMode || this.toolMode === 'wire') return;
    event.stopPropagation();
    event.preventDefault();
    this.editingLabelGateId = gate.id;
    this.editingLabelValue  = gate.label ?? '';
    // Eingabefeld im nächsten Render-Zyklus fokussieren
    setTimeout(() => {
      const input = this.viewportRef?.nativeElement
        .querySelector<HTMLInputElement>('.label-edit-input');
      input?.focus();
      input?.select();
    }, 0);
  }

  /** Speichert das Label und schließt das Inline-Eingabefeld. */
  commitLabel(): void {
    if (!this.editingLabelGateId) return;
    // pushHistory() wird in updateGate() aufgerufen — kein doppeltes Sichern nötig
    this.updateGate({ id: this.editingLabelGateId, label: this.editingLabelValue });
    this.editingLabelGateId = null;
  }

  /** Schließt das Inline-Eingabefeld ohne zu speichern. */
  cancelEditLabel(): void {
    this.editingLabelGateId = null;
  }

  // ─── Werkzeug-Wechsel ──────────────────────────────────────────────────────

  setToolMode(mode: ToolMode): void {
    this.toolMode   = mode;
    this.wireDrawing = null;
  }

  /** Schaltet den Simulations-Modus um */
  toggleSimulation(): void {
    this.simulationMode = !this.simulationMode;
    if (this.simulationMode) {
      // Automatisch in den Pan-Modus wechseln, damit Klicks auf Schalter
      // und nicht versehentliche Leitungs-Aktionen ausgeführt werden.
      this.setToolMode('pan');
      this.editingLabelGateId = null;   // Inline-Edit beim Start der Simulation schließen
      this.startClockIntervals();
      this.recomputeSimulation();
    } else {
      this.stopClockIntervals();
      this.gates = this.gates.map(g => {
        if (g.type === 'input' || g.type === 'clock-gen') return { ...g, inputValue: false };
        if (g.type === 'jk-ff') return { ...g, ffState: false, ffPrevClock: false };
        return g;
      });
      this.signalStates.clear();
      this.simulationService.clearState();
    }
  }

  // ─── Taktgeber-Intervalle ──────────────────────────────────────────────────

  private startClockIntervals(): void {
    for (const gate of this.gates) {
      if (gate.type === 'clock-gen') this.startClockInterval(gate);
    }
  }

  private startClockInterval(gate: GateInstance): void {
    if (this.clockIntervals.has(gate.id)) return;
    const period = Math.max(100, gate.clockPeriodMs ?? 1000);
    const handle = setInterval(() => {
      this.gates = this.gates.map(g =>
        g.id === gate.id ? { ...g, inputValue: !g.inputValue } : g
      );
      this.recomputeSimulation();
    }, period);
    this.clockIntervals.set(gate.id, handle);
  }

  private stopClockIntervals(): void {
    for (const handle of this.clockIntervals.values()) clearInterval(handle);
    this.clockIntervals.clear();
  }

  restartClockInterval(gate: GateInstance): void {
    const handle = this.clockIntervals.get(gate.id);
    if (handle !== undefined) clearInterval(handle);
    this.clockIntervals.delete(gate.id);
    if (this.simulationMode) this.startClockInterval(gate);
  }

  ngOnDestroy(): void {
    this.stopClockIntervals();
  }

  // ─── Gatter-Eigenschaften aktualisieren ────────────────────────────────────

  /**
   * Wendet Eigenschafts-Änderungen auf ein Bauteil an.
   * Speichert den aktuellen Zustand vor der Änderung im Undo-Stack,
   * damit Rotation, Farbe, Label, Eingangsanzahl und Taktperiode
   * alle mit Ctrl+Z rückgängig gemacht werden können.
   */
  updateGate(changes: Partial<GateInstance> & { id: string }): void {
    this.pushHistory(); // Zustand vor jeder Eigenschafts-Änderung sichern
    const periodChanged = changes.clockPeriodMs !== undefined;
    this.gates = this.gates.map(g =>
      g.id !== changes.id ? g : { ...g, ...changes }
    );
    if (periodChanged) {
      const gate = this.gates.find(g => g.id === changes.id);
      if (gate) this.restartClockInterval(gate);
    }
    if (this.simulationMode) this.recomputeSimulation();
  }

  /** Löscht ein Bauteil und alle zugehörigen Leitungen. */
  deleteGate(gateId: string): void {
    this.pushHistory(); // Zustand vor dem Löschen sichern
    const handle = this.clockIntervals.get(gateId);
    if (handle !== undefined) clearInterval(handle);
    this.clockIntervals.delete(gateId);

    this.gates = this.gates.filter(g => g.id !== gateId);
    this.wires = this.wires.filter(w => w.fromGateId !== gateId && w.toGateId !== gateId);

    if (this.selectedGateId === gateId) this.selectedGateId = null;
    this.selectedGateIds.delete(gateId);
    if (this.simulationMode) this.recomputeSimulation();
  }

  /** Löscht eine einzelne Leitung. */
  deleteWire(wireId: string): void {
    this.pushHistory(); // Zustand vor dem Löschen sichern
    this.wires = this.wires.filter(w => w.id !== wireId);
    if (this.selectedWireId === wireId) this.selectedWireId = null;
    if (this.simulationMode) this.recomputeSimulation();
  }

  // ─── Tastatur-Shortcuts ────────────────────────────────────────────────────

  /**
   * Escape → laufende Leitung abbrechen ODER Mehrfachauswahl aufheben.
   * Verhindert, dass der Nutzer nach einem versehentlichen Klick im Wire-Modus
   * feststeckt oder eine unübersichtliche Auswahl schwer löschen kann.
   */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.wireDrawing) {
      this.wireDrawing = null; // Leitungs-Zeichnen abbrechen
      return;
    }
    if (this.editingLabelGateId) {
      this.cancelEditLabel();
      return;
    }
    // Mehrfachauswahl oder Einzel-Auswahl aufheben
    this.selectedGateIds.clear();
    this.selectedGateId  = null;
    this.selectedWireId  = null;
  }

  /** Del/Backspace → ausgewähltes Bauteil oder Leitung löschen */
  @HostListener('document:keydown.delete', ['$event'])
  @HostListener('document:keydown.backspace', ['$event'])
  onDeleteKey(event: Event): void {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;

    if (this.selectedGateId) {
      event.preventDefault();
      if (this.selectedGateIds.size > 1) {
        // Mehrfachauswahl: alle selektierten Bauteile auf einmal löschen
        this.pushHistory();
        const toDelete = new Set([...this.selectedGateIds]);
        for (const id of toDelete) {
          const handle = this.clockIntervals.get(id);
          if (handle !== undefined) clearInterval(handle);
          this.clockIntervals.delete(id);
        }
        this.gates = this.gates.filter(g => !toDelete.has(g.id));
        this.wires = this.wires.filter(w => !toDelete.has(w.fromGateId) && !toDelete.has(w.toGateId));
        this.selectedGateIds.clear();
        this.selectedGateId = null;
        if (this.simulationMode) this.recomputeSimulation();
      } else {
        this.deleteGate(this.selectedGateId);
      }
    } else if (this.selectedWireId) {
      event.preventDefault();
      this.deleteWire(this.selectedWireId);
    }
  }

  /**
   * Ctrl+Z → Undo  |  Ctrl+Y / Ctrl+Shift+Z → Redo
   * Ctrl+C → Kopieren  |  Ctrl+V → Einfügen
   * Kein Auslösen wenn ein Eingabefeld fokussiert ist.
   */
  @HostListener('document:keydown', ['$event'])
  onKeyboardShortcut(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    const active  = document.activeElement;
    const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    switch (event.key.toLowerCase()) {
      case 'z':
        if (!isInput) {
          event.preventDefault();
          if (event.shiftKey) this.redo(); else this.undo();
        }
        break;
      case 'y':
        if (!isInput) { event.preventDefault(); this.redo(); }
        break;
      case 'c':
        if (!isInput) { event.preventDefault(); this.copySelected(); }
        break;
      case 'v':
        if (!isInput) { event.preventDefault(); this.pasteClipboard(); }
        break;
    }
  }

  // ─── Maus-Events ───────────────────────────────────────────────────────────

  /**
   * Haupt-Maus-Handler auf dem Viewport-Div.
   *
   * Verzweigt nach Zustand:
   *  1. Toolbar-Drag läuft → warten
   *  2. Wire-Modus → Pin-Klick auswerten
   *  3. Simulations-Modus → Eingangs-Schalter / Taktgeber togglen
   *  4. Gatter getroffen → Auswahl + Drag vorbereiten
   *  5. Leere Fläche + Ctrl → Auswahlrahmen starten
   *  6. Leere Fläche → Panning starten, Auswahl aufheben
   */
  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();

    if (this.dragState.isDragging()) return;

    const { lx, ly } = this.toLogical(event);

    if (this.toolMode === 'wire') {
      this.handleWireClick(lx, ly);
      return;
    }

    if (this.simulationMode) {
      if (this.tryToggleSwitch(lx, ly)) return;
    }

    const hitGate = this.findGateAt(lx, ly);
    if (hitGate) {
      // Offenes Inline-Edit eines anderen Bauteils erst abschließen
      if (this.editingLabelGateId && this.editingLabelGateId !== hitGate.id) {
        this.commitLabel();
      }

      if (event.ctrlKey || event.shiftKey) {
        // Ctrl/Shift+Klick: Bauteil zur Mehrfachauswahl hinzufügen oder entfernen
        if (this.selectedGateIds.has(hitGate.id)) {
          this.selectedGateIds.delete(hitGate.id);
          // selectedGateId auf ein anderes Element setzen (oder null)
          const remaining = [...this.selectedGateIds];
          this.selectedGateId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        } else {
          this.selectedGateIds.add(hitGate.id);
          this.selectedGateId = hitGate.id;
        }
      } else {
        // Normaler Klick: Einzel-Auswahl (außer das Bauteil ist bereits Teil einer Gruppe)
        if (!this.selectedGateIds.has(hitGate.id)) {
          this.selectedGateIds = new Set([hitGate.id]);
        }
        this.selectedGateId = hitGate.id;
      }
      this.selectedWireId = null;

      // Drag-Vorbereitung: Ursprungspositionen aller selektierten Bauteile merken
      const otherOrigins = new Map<string, { ox: number; oy: number }>();
      for (const id of this.selectedGateIds) {
        if (id === hitGate.id) continue;
        const g = this.gates.find(g => g.id === id);
        if (g) otherOrigins.set(id, { ox: g.x, oy: g.y });
      }
      this.gateDragState = {
        gateId:      hitGate.id,
        originX:     hitGate.x,
        originY:     hitGate.y,
        startMouseX: event.clientX,
        startMouseY: event.clientY,
        otherOrigins,
      };
      this.gateDragStarted = false;
      return;
    }

    // Klick auf leere Fläche — offenes Inline-Edit abschließen
    if (this.editingLabelGateId) this.commitLabel();
    this.selectedWireId = null;

    // Ausgangs-Stub-Klick: Verneinung ein-/ausschalten (nur im Pan-Modus, nicht in Simulation)
    if (!this.simulationMode && !event.ctrlKey && !event.shiftKey) {
      const stubHit = this.findOutputStubAt(lx, ly);
      if (stubHit) {
        this.toggleNegation(stubHit.gate.id, stubHit.pinIndex);
        return;
      }
    }

    if (event.ctrlKey || event.shiftKey) {
      // Ctrl+Drag: Auswahlrahmen aufziehen (additiv zur bestehenden Auswahl)
      this.selectionRectState   = { startLx: lx, startLy: ly };
      this.selectionRectDisplay = { left: lx, top: ly, width: 0, height: 0 };
    } else {
      // Normaler Klick: Auswahl aufheben + Panning starten
      this.selectedGateIds.clear();
      this.selectedGateId   = null;
      this.isPanning         = true;
      this.panStartMouseX    = event.clientX;
      this.panStartMouseY    = event.clientY;
      this.panStartOffsetX   = this.panX;
      this.panStartOffsetY   = this.panY;
    }
  }

  /** Doppelklick auf das Whiteboard → Inline-Label-Bearbeitung starten */
  onDblClick(event: MouseEvent): void {
    if (this.simulationMode || this.toolMode === 'wire') return;
    const { lx, ly } = this.toLogical(event);
    const hitGate = this.findGateAt(lx, ly);
    if (hitGate) this.startEditLabel(hitGate, event);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    // Panning
    if (this.isPanning) {
      this.panX = this.panStartOffsetX + (event.clientX - this.panStartMouseX);
      this.panY = this.panStartOffsetY + (event.clientY - this.panStartMouseY);
    }

    // Auswahlrahmen aktualisieren
    if (this.selectionRectState) {
      const { lx, ly } = this.toLogical(event);
      const { startLx, startLy } = this.selectionRectState;
      this.selectionRectDisplay = {
        left:   Math.min(startLx, lx),
        top:    Math.min(startLy, ly),
        width:  Math.abs(lx - startLx),
        height: Math.abs(ly - startLy),
      };
    }

    // Gatter verschieben (Einzel oder Mehrfach)
    if (this.gateDragState) {
      const dx = event.clientX - this.gateDragState.startMouseX;
      const dy = event.clientY - this.gateDragState.startMouseY;
      if (!this.gateDragStarted && Math.hypot(dx, dy) > 4) {
        // Zustand EINMALIG vor dem ersten tatsächlichen Verschiebevorgang sichern,
        // damit Undo das Bauteil an die ursprüngliche Position zurückbewegt.
        this.pushHistory();
        this.gateDragStarted = true;
      }
      if (this.gateDragStarted) {
        const movedId = this.gateDragState.gateId;
        const newX    = this.gateDragState.originX + dx;
        const newY    = this.gateDragState.originY + dy;

        // Alle selektierten Bauteile um dasselbe Delta verschieben
        const updatedGates = this.gates.map(g => {
          if (g.id === movedId) return { ...g, x: newX, y: newY };
          const origin = this.gateDragState!.otherOrigins.get(g.id);
          if (origin) return { ...g, x: origin.ox + dx, y: origin.oy + dy };
          return g;
        });
        this.gates = updatedGates;

        // Waypoints aller angeschlossenen Leitungen neu berechnen
        const movedIds = new Set([movedId, ...this.gateDragState.otherOrigins.keys()]);
        const updatedWires = this.wires.map(wire => {
          const fromMoved = movedIds.has(wire.fromGateId);
          const toMoved   = movedIds.has(wire.toGateId);
          if (!fromMoved && !toMoved) return wire;
          const from = updatedGates.find(g => g.id === wire.fromGateId);
          const to   = updatedGates.find(g => g.id === wire.toGateId);
          if (!from || !to) return wire;
          const start      = getPinWorldPos(from, 'output', wire.fromPinIndex);
          const end        = getPinWorldPos(to,   'input',  wire.toPinIndex);
          const fromBottom = from.y + getGateDimensions(from).h;
          const toBottom   = to.y   + getGateDimensions(to).h;
          const fromDir    = getPinDirection(from, 'output');
          const toDir      = getPinDirection(to,   'input');
          // Abzweigpunkt mitverschieben, wenn die Quell-Gatter bewegt wurde
          let newBranchPoint = wire.branchPoint;
          if (wire.branchPoint && fromMoved) {
            newBranchPoint = { x: wire.branchPoint.x + dx, y: wire.branchPoint.y + dy };
          }
          return {
            ...wire,
            branchPoint: newBranchPoint,
            points: computeOrthogonalWaypoints(
              start.x, start.y, end.x, end.y, fromBottom, toBottom, from.y, to.y, fromDir, toDir
            ),
          };
        });

        // Zweiter Durchlauf: Abzweigpunkte, deren Haupt-Leitung sich geändert hat
        // (Ziel-Gatter der Haupt-Leitung verschoben, Quell-Gatter nicht)
        this.wires = updatedWires.map(wire => {
          if (!wire.branchPoint || movedIds.has(wire.fromGateId)) return wire;
          const mainWire = updatedWires.find(
            w => !w.branchPoint
              && w.fromGateId   === wire.fromGateId
              && w.fromPinIndex === wire.fromPinIndex
              && movedIds.has(w.toGateId)
          );
          if (!mainWire) return wire;
          const from = updatedGates.find(g => g.id === mainWire.fromGateId);
          const to   = updatedGates.find(g => g.id === mainWire.toGateId);
          if (!from || !to) return wire;
          const start = getPinWorldPos(from, 'output', mainWire.fromPinIndex);
          const end   = getPinWorldPos(to,   'input',  mainWire.toPinIndex);
          const wps   = computeOrthogonalWaypoints(
            start.x, start.y, end.x, end.y,
            from.y + getGateDimensions(from).h, to.y + getGateDimensions(to).h,
            from.y, to.y,
            getPinDirection(from, 'output'), getPinDirection(to, 'input')
          );
          const path = [start, ...wps, end];
          let bestDist = Infinity;
          let bestPt   = wire.branchPoint!;
          for (let i = 0; i < path.length - 1; i++) {
            const { dist, point } = this.closestPointOnSegment(
              wire.branchPoint!.x, wire.branchPoint!.y,
              path[i].x, path[i].y, path[i+1].x, path[i+1].y
            );
            if (dist < bestDist) { bestDist = dist; bestPt = point; }
          }
          return { ...wire, branchPoint: bestPt };
        });
        if (this.simulationMode) this.recomputeSimulation();
      }
    }

    // Leitungs-Vorschau aktualisieren
    if (this.wireDrawing) {
      const { lx, ly } = this.toLogical(event);
      this.tentativeX = lx;
      this.tentativeY = ly;
    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      return;
    }

    // Auswahlrahmen abschließen: alle Bauteile mit Mittelpunkt im Rechteck selektieren
    if (this.selectionRectState && this.selectionRectDisplay) {
      const rect = this.selectionRectDisplay;
      if (rect.width > 4 || rect.height > 4) {
        for (const gate of this.gates) {
          const dim = getGateDimensions(gate);
          const cx  = gate.x + dim.w / 2;
          const cy  = gate.y + dim.h / 2;
          if (cx >= rect.left && cx <= rect.left + rect.width &&
              cy >= rect.top  && cy <= rect.top  + rect.height) {
            this.selectedGateIds.add(gate.id);
          }
        }
        if (this.selectedGateIds.size > 0 && !this.selectedGateId) {
          this.selectedGateId = [...this.selectedGateIds][0];
        }
      }
      this.selectionRectState   = null;
      this.selectionRectDisplay = null;
      return;
    }

    if (this.gateDragState) {
      this.gateDragState   = null;
      this.gateDragStarted = false;
      return;
    }

    // Gatter-Drop aus Toolbar
    if (!this.dragState.isDragging()) return;

    const viewport = this.viewportRef?.nativeElement;
    if (!viewport) { this.dragState.endDrag(); return; }

    const rect    = viewport.getBoundingClientRect();
    const onBoard =
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top  && event.clientY <= rect.bottom;

    if (onBoard) {
      const type = this.dragState.gateType() as GateType;
      if (type) {
        this.placeGate(type,
          (event.clientX - rect.left - this.panX) / this.zoom,
          (event.clientY - rect.top  - this.panY) / this.zoom,
        );
      }
    }
    this.dragState.endDrag();
  }

  onWireClick(wire: WireConnection, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedWireId  = wire.id;
    this.selectedGateId  = null;
    this.selectedGateIds.clear();
  }

  // ─── Leitungs-Logik ────────────────────────────────────────────────────────

  private handleWireClick(lx: number, ly: number): void {
    const near = this.findNearestPin(lx, ly);

    if (!this.wireDrawing) {
      // 1. Priorität: freier Ausgangs-Pin (noch unter dem Verbindungs-Limit)
      if (near?.pinType === 'output' && this.canStartWireFromOutput(near.gate.id, near.pinIndex)) {
        const pos = getPinWorldPos(near.gate, 'output', near.pinIndex);
        this.wireDrawing = {
          fromGateId:   near.gate.id,
          fromPinIndex: near.pinIndex,
          x1: pos.x, y1: pos.y,
          fromDir: getPinDirection(near.gate, 'output'),
        };
        this.tentativeX = pos.x;
        this.tentativeY = pos.y;
        return;
      }

      // 2. Priorität: Klick auf eine BELIEBIGE Stelle einer bestehenden
      //    Leitung → Abzweigung (Fan-out) genau an diesem Punkt starten,
      //    nicht nur am Ausgangs-Pin. Elektrisch bleibt die Quelle weiterhin
      //    derselbe Ausgangs-Pin (fromGateId/fromPinIndex der Original-
      //    Leitung) — branchPoint ist rein für die Darstellung.
      //    AUSNAHME: Stubs direkt am Ausgangs-Pin sind gesperrt (dort wird
      //    stattdessen die Verneinung gesetzt, kein Abzweig erlaubt).
      const hit = this.findWireHitAt(lx, ly);
      if (hit && !this.findOutputStubAt(hit.point.x, hit.point.y)) {
        this.wireDrawing = {
          fromGateId:   hit.wire.fromGateId,
          fromPinIndex: hit.wire.fromPinIndex,
          x1: hit.point.x, y1: hit.point.y,
          fromDir: hit.dir,
          branchPoint: hit.point,
        };
        this.tentativeX = hit.point.x;
        this.tentativeY = hit.point.y;
      }
    } else {
      if (near?.pinType === 'input' && near.gate.id !== this.wireDrawing.fromGateId) {
        const alreadyUsed = this.wires.some(
          w => w.toGateId === near.gate.id && w.toPinIndex === near.pinIndex
        );
        if (!alreadyUsed) {
          const endPos   = getPinWorldPos(near.gate, 'input', near.pinIndex);
          const fromGate = this.gates.find(g => g.id === this.wireDrawing!.fromGateId);
          // Bei einer Abzweigung (branchPoint gesetzt) liegt der Startpunkt
          // frei im Raum, nicht an einer Gatter-Kante — die Ober-/Unterkante
          // des ursprünglichen Quell-Gatters ist dafür irrelevant und wird
          // bewusst weggelassen (sonst könnte die Route unnötig ausweichen).
          const isBranch   = !!this.wireDrawing.branchPoint;
          const fromBottom = !isBranch && fromGate ? fromGate.y + getGateDimensions(fromGate).h : undefined;
          const fromTop    = !isBranch ? fromGate?.y : undefined;
          const toBottom   = near.gate.y + getGateDimensions(near.gate).h;
          const toDir      = getPinDirection(near.gate, 'input');
          const newWire: WireConnection = {
            id:           `wire-${++this.wireIdCounter}`,
            fromGateId:   this.wireDrawing.fromGateId,
            fromPinIndex: this.wireDrawing.fromPinIndex,
            toGateId:     near.gate.id,
            toPinIndex:   near.pinIndex,
            points: computeOrthogonalWaypoints(
              this.wireDrawing.x1, this.wireDrawing.y1, endPos.x, endPos.y,
              fromBottom, toBottom, fromTop, near.gate.y,
              this.wireDrawing.fromDir, toDir
            ),
            branchPoint: this.wireDrawing.branchPoint,
            fromDir: this.wireDrawing.branchPoint ? this.wireDrawing.fromDir : undefined,
          };
          this.pushHistory(); // Zustand vor dem Hinzufügen der Leitung sichern
          this.wires = [...this.wires, newWire];
          if (this.simulationMode) this.recomputeSimulation();
        }
      }
      this.wireDrawing = null;
    }
  }

  // ─── Simulations-Hilfsmethoden ─────────────────────────────────────────────

  private recomputeSimulation(): void {
    this.signalStates = this.simulationService.computeSignals(this.gates, this.wires);
  }

  private tryToggleSwitch(lx: number, ly: number): boolean {
    for (const gate of this.gates) {
      if (gate.type !== 'input') continue;
      if (isPointInGate(lx, ly, gate)) {
        this.gates = this.gates.map(g =>
          g.id === gate.id ? { ...g, inputValue: !g.inputValue } : g
        );
        this.recomputeSimulation();
        return true;
      }
    }
    return false;
  }

  // ─── Negation (Ausgangs-Verneinung per Klick auf Ausgangs-Stub) ──────────────

  /**
   * Gibt zurück, ob sich der Punkt (lx,ly) im Ausgangs-Stub-Bereich
   * (erste ~20 px nach dem Ausgangs-Pin) eines Gatters befindet.
   * Nur im Pan-Modus sinnvoll (Verneinung setzen/entfernen).
   */
  private findOutputStubAt(
    lx: number, ly: number
  ): { gate: GateInstance; pinIndex: number } | null {
    const STUB_LEN = 20;
    const HIT_R    = 8;
    for (const gate of this.gates) {
      if (gate.type === 'text-label' || gate.type === 'output') continue;
      const offsets = getGatePinOffsets(gate);
      for (let i = 0; i < offsets.outputs.length; i++) {
        const pos = getPinWorldPos(gate, 'output', i);
        const dir = getPinDirection(gate, 'output');
        const { dist } = this.closestPointOnSegment(
          lx, ly,
          pos.x, pos.y,
          pos.x + dir.dx * STUB_LEN, pos.y + dir.dy * STUB_LEN
        );
        if (dist <= HIT_R) return { gate, pinIndex: i };
      }
    }
    return null;
  }

  /** Setzt/entfernt die Verneinung für einen Ausgangs-Pin. */
  toggleNegation(gateId: string, pinIndex: number): void {
    this.pushHistory();
    this.gates = this.gates.map(g => {
      if (g.id !== gateId) return g;
      const cur  = g.negatedOutputs ?? [];
      const next = cur.includes(pinIndex)
        ? cur.filter(i => i !== pinIndex)
        : [...cur, pinIndex];
      return { ...g, negatedOutputs: next };
    });
    if (this.simulationMode) this.recomputeSimulation();
  }

  /** Alle Verneinungs-Punkte für die SVG-Darstellung. */
  getNegationDots(): { x: number; y: number; gateId: string; pinIndex: number }[] {
    const res: { x: number; y: number; gateId: string; pinIndex: number }[] = [];
    for (const gate of this.gates) {
      if (!gate.negatedOutputs?.length) continue;
      for (const pi of gate.negatedOutputs) {
        const pos = getPinWorldPos(gate, 'output', pi);
        const dir = getPinDirection(gate, 'output');
        res.push({ x: pos.x + dir.dx * 10, y: pos.y + dir.dy * 10, gateId: gate.id, pinIndex: pi });
      }
    }
    return res;
  }

  // ─── Minimap ───────────────────────────────────────────────────────────────

  /** Berechnet alle für die Minimap benötigten Größen. */
  get minimapData(): {
    viewBox:      string;
    gateRects:    { x: number; y: number; w: number; h: number }[];
    viewportRect: { x: number; y: number; w: number; h: number };
  } {
    const PAD = 40;
    let minX = 0, minY = 0, maxX = 400, maxY = 300;

    if (this.gates.length > 0) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const g of this.gates) {
        const dim = getGateDimensions(g);
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + dim.w);
        maxY = Math.max(maxY, g.y + dim.h);
      }
      minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
    }

    const gateRects = this.gates.map(g => {
      const dim = getGateDimensions(g);
      return { x: g.x - minX, y: g.y - minY, w: dim.w, h: dim.h };
    });

    const vpEl = this.viewportRef?.nativeElement;
    const vpW  = vpEl ? vpEl.clientWidth  : 800;
    const vpH  = vpEl ? vpEl.clientHeight : 600;
    const vpLX = -this.panX / this.zoom - minX;
    const vpLY = -this.panY / this.zoom - minY;

    return {
      viewBox:      `0 0 ${maxX - minX} ${maxY - minY}`,
      gateRects,
      viewportRect: { x: vpLX, y: vpLY, w: vpW / this.zoom, h: vpH / this.zoom },
    };
  }

  // ─── Simulations-Signal-Zustand (für Properties Panel) ───────────────────

  getGateSignalState(gateId: string): import('../../services/simulation.service').ComponentSignalState | null {
    return this.signalStates.get(gateId) ?? null;
  }

  // ─── Bauteil platzieren ────────────────────────────────────────────────────

  private placeGate(type: GateType, lx: number, ly: number): void {
    this.pushHistory(); // Zustand vor dem Platzieren sichern
    const gate = createGateInstance(`gate-${++this.gateIdCounter}`, type, 0, 0);
    const dim  = getGateDimensions(gate);
    gate.x = Math.round(lx - dim.w / 2);
    gate.y = Math.round(ly - dim.h / 2);
    this.gates = [...this.gates, gate];
    if (type === 'clock-gen' && this.simulationMode) this.startClockInterval(gate);
    if (this.simulationMode) this.recomputeSimulation();
  }

  // ─── Pin-Erkennung ─────────────────────────────────────────────────────────

  private findNearestPin(
    lx: number, ly: number
  ): { gate: GateInstance; pinType: 'input' | 'output'; pinIndex: number } | null {
    for (const gate of this.gates) {
      const offsets = getGatePinOffsets(gate);
      for (let i = 0; i < offsets.outputs.length; i++) {
        const pos = getPinWorldPos(gate, 'output', i);
        if (this.dist(lx, ly, pos.x, pos.y) <= PIN_HIT_RADIUS)
          return { gate, pinType: 'output', pinIndex: i };
      }
      for (let i = 0; i < offsets.inputs.length; i++) {
        const pos = getPinWorldPos(gate, 'input', i);
        if (this.dist(lx, ly, pos.x, pos.y) <= PIN_HIT_RADIUS)
          return { gate, pinType: 'input', pinIndex: i };
      }
    }
    return null;
  }

  private findGateAt(lx: number, ly: number): GateInstance | null {
    for (let i = this.gates.length - 1; i >= 0; i--) {
      if (isPointInGate(lx, ly, this.gates[i])) return this.gates[i];
    }
    return null;
  }

  // ─── Template-Hilfsmethoden ────────────────────────────────────────────────

  getGatesLayerTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  getGateTransform(gate: GateInstance): string {
    return gate.rotation !== 0 ? `rotate(${gate.rotation}deg)` : '';
  }

  getGateColorFilter(gate: GateInstance): string {
    if (this.simulationMode) {
      const isHigh = gate.type === 'output'
        ? this.getSignalInput(gate.id) === true
        : this.getSignalOutput(gate.id, 0) === true;
      if (isHigh) return '';
    }
    const map: Record<GateColor, string> = {
      default: '',
      yellow:  'sepia(1) saturate(8) hue-rotate(15deg)',
      green:   'sepia(1) saturate(8) hue-rotate(100deg) brightness(0.9)',
      red:     'sepia(1) saturate(8) hue-rotate(300deg) brightness(0.9)',
      orange:  'sepia(1) saturate(10) hue-rotate(25deg) brightness(1.1)',
    };
    return map[gate.color] ?? '';
  }

  /**
   * Berechnet alle Bildschirm-Punkte einer Leitung als Array.
   * Wird von getWirePointsString (Rendering) und findWireHitAt (Treffertest)
   * gemeinsam genutzt, damit beide immer denselben Verlauf verwenden.
   *
   * Abzweigungen (wire.branchPoint gesetzt) starten an einem freien Punkt im
   * Raum statt an einem echten Ausgangs-Pin: Ober-/Unterkante des Quell-
   * Gatters entfallen dabei (kein Bauteil dort, das umgangen werden müsste),
   * und die Austrittsrichtung kommt aus dem beim Erstellen gespeicherten
   * wire.fromDir statt live aus der Gatter-Rotation berechnet zu werden.
   */
  private getWireDisplayPoints(wire: WireConnection): { x: number; y: number }[] | null {
    const from = this.gates.find(g => g.id === wire.fromGateId);
    const to   = this.gates.find(g => g.id === wire.toGateId);
    if (!from || !to) return null;

    const start = wire.branchPoint ?? getPinWorldPos(from, 'output', wire.fromPinIndex);
    const end   = getPinWorldPos(to, 'input', wire.toPinIndex);

    const fromBottom = wire.branchPoint ? undefined : from.y + getGateDimensions(from).h;
    const fromTop     = wire.branchPoint ? undefined : from.y;
    const toBottom    = to.y + getGateDimensions(to).h;
    const fromDir     = wire.branchPoint ? (wire.fromDir ?? { dx: 1, dy: 0 }) : getPinDirection(from, 'output');
    const toDir       = getPinDirection(to, 'input');

    const waypoints = computeOrthogonalWaypoints(
      start.x, start.y, end.x, end.y, fromBottom, toBottom, fromTop, to.y, fromDir, toDir
    );
    return [start, ...waypoints, end];
  }

  /** Gibt den SVG-Punktstring für eine Leitung zurück (nutzt getWireDisplayPoints). */
  getWirePointsString(wire: WireConnection): string | null {
    const pts = this.getWireDisplayPoints(wire);
    return pts ? pts.map(p => `${p.x},${p.y}`).join(' ') : null;
  }

  /**
   * Sucht die erste Leitung, deren Strecke weniger als WIRE_HIT_RADIUS Pixel
   * vom Klickpunkt entfernt liegt. Gibt zusätzlich den exakten Punkt AUF der
   * Leitung (auf das Segment projiziert) sowie die Ausrichtung dieses
   * Segments zurück — wird genutzt, um Abzweigungen an beliebigen Stellen
   * einer bestehenden Leitung zu setzen (nicht nur an Ein-/Ausgängen).
   */
  private readonly WIRE_HIT_RADIUS = 8;

  private findWireHitAt(
    lx: number, ly: number
  ): { wire: WireConnection; point: { x: number; y: number }; dir: PinDirection } | null {
    for (const wire of this.wires) {
      const pts = this.getWireDisplayPoints(wire);
      if (!pts || pts.length < 2) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const { dist, point } = this.closestPointOnSegment(lx, ly, a.x, a.y, b.x, b.y);
        if (dist <= this.WIRE_HIT_RADIUS) {
          // Segment-Ausrichtung: horizontal oder vertikal (Leitungen sind
          // immer achsenparallel). Für die Abzweig-Richtung wird bewusst
          // NICHT die Fortsetzung derselben Achse gewählt, sondern die
          // Senkrechte dazu — das ergibt einen klar erkennbaren T-Abzweig
          // statt einer optisch verwirrenden Verlängerung derselben Linie.
          const horizontal = Math.abs(b.y - a.y) < Math.abs(b.x - a.x);
          const dir: PinDirection = horizontal ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 };
          return { wire, point, dir };
        }
      }
    }
    return null;
  }

  /** Nächster Punkt auf einem Liniensegment (a→b) zu (px,py) inkl. Abstand. */
  private closestPointOnSegment(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number
  ): { dist: number; point: { x: number; y: number } } {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { dist: Math.hypot(px - ax, py - ay), point: { x: ax, y: ay } };
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const point = { x: Math.round(ax + t * dx), y: Math.round(ay + t * dy) };
    return { dist: Math.hypot(px - point.x, py - point.y), point };
  }

  /**
   * Vorschau-Linie beim Ziehen einer neuen Leitung. Berücksichtigt die
   * Austrittsrichtung des Start-Pins (z.B. nach oben bei einem 90°-gedrehten
   * Bauteil), damit die Vorschau schon während des Zeichnens zur späteren
   * tatsächlichen Leitungsführung passt.
   */
  getTentativePointsString(): string {
    if (!this.wireDrawing) return '';
    const x1 = this.wireDrawing.x1;
    const y1 = this.wireDrawing.y1;
    const fromGate = this.gates.find(g => g.id === this.wireDrawing!.fromGateId);
    const dir = fromGate ? getPinDirection(fromGate, 'output') : { dx: 1, dy: 0 };

    if (dir.dy === 0) {
      const midX = Math.round((x1 + this.tentativeX) / 2);
      return `${x1},${y1} ${midX},${y1} ${midX},${this.tentativeY} ${this.tentativeX},${this.tentativeY}`;
    }
    const midY = Math.round((y1 + this.tentativeY) / 2);
    return `${x1},${y1} ${x1},${midY} ${this.tentativeX},${midY} ${this.tentativeX},${this.tentativeY}`;
  }

  isWireHigh(wire: WireConnection): boolean {
    return this.signalStates.get(wire.fromGateId)
      ?.outputSignals[wire.fromPinIndex] === true;
  }

  getSignalOutput(gateId: string, pinIndex = 0): boolean | null {
    return this.signalStates.get(gateId)?.outputSignals[pinIndex] ?? null;
  }

  getSignalInput(gateId: string, pinIndex = 0): boolean | null {
    return this.signalStates.get(gateId)?.inputSignals[pinIndex] ?? null;
  }

  getPinWorldPosForTemplate(
    gate: GateInstance, pinType: 'input' | 'output', pinIndex: number
  ): { x: number; y: number } {
    return getPinWorldPos(gate, pinType, pinIndex);
  }

  getPinOffsets(gate: GateInstance) {
    return getGatePinOffsets(gate);
  }

  isOutputPinConnected(gateId: string, pinIndex: number): boolean {
    return this.wires.some(w => w.fromGateId === gateId && w.fromPinIndex === pinIndex);
  }

  isInputPinConnected(gateId: string, pinIndex: number): boolean {
    return this.wires.some(w => w.toGateId === gateId && w.toPinIndex === pinIndex);
  }

  /**
   * Gibt an, ob von diesem Ausgangs-Pin aus noch eine weitere Leitung gestartet
   * werden darf. Vergleicht die aktuelle Verbindungsanzahl mit dem erlaubten Maximum
   * des jeweiligen Bauteiltyps (siehe getOutputPinMaxConnections in gate.model.ts).
   * Wird im Template für die Dot-Sichtbarkeit und in handleWireClick für die
   * Verbindungslogik genutzt.
   */
  canStartWireFromOutput(gateId: string, pinIndex: number): boolean {
    const gate = this.gates.find(g => g.id === gateId);
    if (!gate) return false;
    const max     = getOutputPinMaxConnections(gate.type);
    const current = this.wires.filter(
      w => w.fromGateId === gateId && w.fromPinIndex === pinIndex
    ).length;
    return current < max;
  }

  /**
   * Punkte, an denen eine T-Verbindung sichtbar gemacht werden soll:
   * - Abzweigungen (wire.branchPoint gesetzt) IMMER an ihrem Abzweigpunkt —
   *   dort trifft die neue Leitung tatsächlich auf die Original-Leitung,
   *   nicht am weit entfernten Ausgangs-Pin.
   * - Mehrere Leitungen, die DIREKT vom selben Ausgangs-Pin starten (ohne
   *   Abzweigung, z.B. bei einem Bauteil mit erlaubtem Fan-out), zusätzlich
   *   am Pin selbst.
   */
  getWireJunctions(): { x: number; y: number; gateId: string; pinIndex: number }[] {
    const result: { x: number; y: number; gateId: string; pinIndex: number }[] = [];

    // Abzweigpunkte: ein Punkt pro Abzweig-Leitung
    for (const wire of this.wires) {
      if (wire.branchPoint) {
        result.push({ ...wire.branchPoint, gateId: wire.fromGateId, pinIndex: wire.fromPinIndex });
      }
    }

    // Direkte Mehrfachstarts vom selben Pin (ohne Abzweigung)
    const directSourceCount = new Map<string, number>();
    for (const wire of this.wires) {
      if (wire.branchPoint) continue;
      const key = `${wire.fromGateId}:${wire.fromPinIndex}`;
      directSourceCount.set(key, (directSourceCount.get(key) ?? 0) + 1);
    }
    for (const [key, count] of directSourceCount.entries()) {
      if (count < 2) continue;
      const [gateId, idxStr] = key.split(':');
      const gate = this.gates.find(g => g.id === gateId);
      if (gate) {
        const pos = getPinWorldPos(gate, 'output', +idxStr);
        result.push({ ...pos, gateId, pinIndex: +idxStr });
      }
    }
    return result;
  }

  get isDraggingGate(): boolean { return this.dragState.isDragging(); }
  get isDrawingWire():  boolean { return this.wireDrawing !== null; }

  private toLogical(event: MouseEvent): { lx: number; ly: number } {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return {
      lx: (event.clientX - rect.left - this.panX) / this.zoom,
      ly: (event.clientY - rect.top  - this.panY) / this.zoom,
    };
  }

  /** Mausrad → Zoom zentriert auf die aktuelle Mausposition. */
  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (!this.viewportRef) return;
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const factor  = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.max(0.1, Math.min(5, this.zoom * factor));
    // Pan anpassen, damit der Punkt unter der Maus fixiert bleibt
    this.panX = mx + (this.panX - mx) * (newZoom / this.zoom);
    this.panY = my + (this.panY - my) * (newZoom / this.zoom);
    this.zoom  = newZoom;
  }

  private dist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x1 - x2, y1 - y2);
  }
}

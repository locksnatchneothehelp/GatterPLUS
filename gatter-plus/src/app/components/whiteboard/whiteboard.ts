import {
  ChangeDetectorRef,
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
  getOutputPinMaxConnections, getPinDirection, manualWirePath,
  snapGateToGrid, GRID, lCorner, drawnWirePath,
} from '../../models/gate.model';
import { DragStateService }    from '../../services/drag-state.service';
import { SimulationService, ComponentSignalState } from '../../services/simulation.service';
import { HistoryService }      from '../../services/history.service';
import { ToolMode }            from '../toolbar-left/toolbar-left';
import { ProjectData }         from '../../models/project-file';
import { ROUTE_CLEARANCE, ROUTE_EXIT, Rect, Seg, routeWire } from '../../models/wire-router';
import { toBlob }              from 'html-to-image';

/** Ein-/Ausgabe-Bauteile (eigene Optik, im Strommodus nicht grau) */
const IO_TYPES = new Set<GateType>(['input', 'output', 'clock-gen', 'text-label']);

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
  /**
   * Gesetzt, wenn die Leitung umgekehrt gezogen wird: Start an einem freien
   * EINGANG (gateId/pinIndex), Ende an einem Ausgang oder auf einer Leitung.
   * (x1,y1)/fromDir beschreiben dann den Eingangs-Pin (nur für die Vorschau);
   * fromGateId/fromPinIndex sind bis zum Abschluss leer ('' / -1).
   */
  reverse?: { gateId: string; pinIndex: number };
  /** Bisher gesetzte feste Punkte (C / Klick auf freie Fläche), in Zeichenreihenfolge. */
  bends: { x: number; y: number }[];
  /** Phase 7: wie viele Punkte jedes C gesetzt hat (Ecke + Punkt) – für Rückgängig. */
  bendGroups: number[];
  /** Phase 7: Knickreihenfolge des aktuellen Stücks umgedreht (Taste F). */
  flip: boolean;
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
  /** Bereits angewandte logische Verschiebung (für schrittweise Updates, z. B. Abzweigpunkte) */
  appliedDx: number;
  appliedDy: number;
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
  private readonly cdr               = inject(ChangeDetectorRef);

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
  /** Leitung unter der Maus im Leitungs-Modus (Hervorhebung), sonst null. */
  hoverWireId: string | null = null;

  // ─── Feste Punkte einer Leitung verschieben (Phase 7) ──────────────────────
  private handleDrag: { wireId: string; index: number; started: boolean; orig: { x: number; y: number }[] } | null = null;

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
    if (this.simulationMode) return; // Strommodus: Schaltung gesperrt
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
    if (this.simulationMode) return;
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

  // Im Strommodus gesperrt → Menüeinträge erscheinen deaktiviert
  get canUndo():  boolean { return !this.simulationMode && this.historyService.canUndo(); }
  get canRedo():  boolean { return !this.simulationMode && this.historyService.canRedo(); }
  get canPaste(): boolean { return !this.simulationMode && this.clipboard !== null; }

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
   * Jedes Bauteil erhält eine neue ID; Positionen werden um eine Rasterweite versetzt.
   * Kopierte Leitungen werden auf die neuen IDs umgeschrieben.
   */
  pasteClipboard(): void {
    if (!this.clipboard || this.simulationMode) return;
    const OFFSET = GRID; // bleibt auf dem Raster
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
        // Abzweigpunkt mit den Bauteilen versetzen (sonst startet der Abzweig an der alten Stelle)
        branchPoint: w.branchPoint && { x: w.branchPoint.x + OFFSET, y: w.branchPoint.y + OFFSET },
        manualPoints: w.manualPoints?.map(p => ({ x: p.x + OFFSET, y: p.y + OFFSET })),
      }));

    this.pushHistory();
    this.gates = [...this.gates, ...newGates];
    this.wires = [...this.wires, ...newWires];

    // Eingefügte Bauteile direkt selektieren (für sofortiges Weiterbearbeiten)
    this.selectedGateIds = new Set(newGates.map(g => g.id));
    this.selectedGateId  = newGates.length === 1 ? newGates[0].id : null;

    if (this.simulationMode) this.recomputeSimulation();
  }

  // ─── Projekt exportieren / importieren ─────────────────────────────────────

  /** Aktueller Aufbau + Ansicht für den Export (siehe models/project-file.ts). */
  getProjectData(): ProjectData {
    return {
      gates: this.gates,
      wires: this.wires,
      view:  { panX: this.panX, panY: this.panY, zoom: this.zoom },
    };
  }

  /**
   * Rendert die gesamte Schaltung als PNG (null = Whiteboard leer).
   *
   * Ausschnitt = Bounding-Box aller Bauteile und Leitungen + Rand, unabhängig
   * von der aktuellen Ansicht. Dazu werden Pan/Zoom und Auswahl kurz auf den
   * Ausschnitt bei 100 % gesetzt, aufgenommen und danach wiederhergestellt.
   * Raster, Pin-Punkte und Zoom-Leiste/Minimap werden ausgefiltert.
   */
  /** Bounding-Box (logische px): gedrehte Bauteile (Drehung um den Mittelpunkt) + Leitungen. */
  private getContentBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x: number, y: number) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    };
    for (const g of this.gates) {
      const dim  = getGateDimensions(g);
      const side = g.rotation === 90 || g.rotation === 270;
      const hw = (side ? dim.h : dim.w) / 2, hh = (side ? dim.w : dim.h) / 2;
      const cx = g.x + dim.w / 2, cy = g.y + dim.h / 2;
      add(cx - hw, cy - hh);
      add(cx + hw, cy + hh);
    }
    for (const w of this.wires) {
      for (const p of this.getWireDisplayPoints(w) ?? []) add(p.x, p.y);
    }
    return { minX, minY, maxX, maxY };
  }

  async exportPng(): Promise<Blob | null> {
    if (this.gates.length === 0) return null;
    const MARGIN = 40; // Platz für Label-Overlays unter/über Bauteilen
    const { minX, minY, maxX, maxY } = this.getContentBounds();

    const saved = {
      panX: this.panX, panY: this.panY, zoom: this.zoom,
      ids: new Set(this.selectedGateIds), gateId: this.selectedGateId, wireId: this.selectedWireId,
    };
    this.panX = MARGIN - minX;
    this.panY = MARGIN - minY;
    this.zoom = 1;
    this.selectedGateIds = new Set();
    this.selectedGateId  = null;
    this.selectedWireId  = null;
    this.cdr.detectChanges();

    // html-to-image übernimmt CSS-Klassen-Styles von SVG-Kindern nicht (Leitungen
    // würden schwarz gefüllt) → für die Aufnahme kurz inline setzen, danach zurück.
    const node = this.viewportRef.nativeElement;
    const svgEls = [...node.querySelectorAll<SVGElement>('.wires-layer *')]; // inkl. Stummel-Ebene
    const oldStyles = svgEls.map(el => el.getAttribute('style'));
    for (const el of svgEls) {
      const cs = getComputedStyle(el);
      el.style.fill        = cs.fill;
      el.style.stroke      = cs.stroke;
      el.style.strokeWidth = cs.strokeWidth;
    }

    try {
      const hidden = ['grid-svg', 'pins-layer', 'zoom-bar'];
      return await toBlob(node, {
        width:           Math.ceil(maxX - minX + 2 * MARGIN),
        height:          Math.ceil(maxY - minY + 2 * MARGIN),
        backgroundColor: getComputedStyle(node).backgroundColor, // Theme-Hintergrund
        filter: n => !(n instanceof Element && hidden.some(c => n.classList.contains(c))),
      });
    } finally {
      svgEls.forEach((el, i) => {
        const s = oldStyles[i];
        if (s === null) el.removeAttribute('style'); else el.setAttribute('style', s);
      });
      this.panX = saved.panX;
      this.panY = saved.panY;
      this.zoom = saved.zoom;
      this.selectedGateIds = saved.ids;
      this.selectedGateId  = saved.gateId;
      this.selectedWireId  = saved.wireId;
      this.cdr.detectChanges();
    }
  }

  /**
   * Ersetzt die Schaltung durch ein geladenes Projekt.
   * Eine laufende Simulation wird vorher beendet (Takte stoppen, Zustände
   * zurücksetzen). Das Laden ist per Undo rückgängig machbar.
   */
  loadProject(data: ProjectData): void {
    if (this.simulationMode) this.toggleSimulation();
    this.pushHistory();
    this.gates = data.gates;
    this.wires = data.wires;
    this.panX  = data.view.panX;
    this.panY  = data.view.panY;
    this.zoom  = data.view.zoom;

    // Zähler nie zurücksetzen: nach Undo können alte IDs wieder auftauchen.
    // Daher Maximum aus bisherigem Zähler und höchster Nummer in der Datei.
    const maxNum = (ids: string[], prefix: string) =>
      Math.max(0, ...ids.map(id => id.startsWith(prefix) ? Number(id.slice(prefix.length)) || 0 : 0));
    this.gateIdCounter = Math.max(this.gateIdCounter, maxNum(data.gates.map(g => g.id), 'gate-'));
    this.wireIdCounter = Math.max(this.wireIdCounter, maxNum(data.wires.map(w => w.id), 'wire-'));

    this.selectedGateId     = null;
    this.selectedGateIds.clear();
    this.selectedWireId     = null;
    this.editingLabelGateId = null;
    this.wireDrawing        = null;
    // Zoneless-App: Aufruf kommt nach einem await (Datei-Dialog) → Rendering anstoßen
    this.cdr.markForCheck();
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
    this.hoverWireId = null;
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
      this.cdr.markForCheck(); // Zoneless: Timer lösen kein Rendering aus
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
    // Drehung/Eingangsanzahl verschieben die Pins → wieder aufs Raster (Phase 7)
    const resnap = changes.rotation !== undefined || changes.inputCount !== undefined;
    this.gates = this.gates.map(g =>
      g.id !== changes.id ? g : resnap ? snapGateToGrid({ ...g, ...changes }) : { ...g, ...changes }
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

  /** Ob eine Leitung eigene Knickpunkte hat (Eigenschaften-Panel: „Verlauf automatisch"). */
  hasManualRoute(wireId: string): boolean {
    return !!this.wires.find(w => w.id === wireId)?.manualPoints?.length;
  }

  /** Entfernt die eigenen Knickpunkte einer Leitung → wieder automatische Führung. */
  resetWireRoute(wireId: string): void {
    this.pushHistory();
    this.wires = this.wires.map(w => {
      if (w.id !== wireId) return w;
      const { manualPoints, ...rest } = w;
      return rest;
    });
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
    if (this.simulationMode) return; // Strommodus: nichts löschen
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    // Beim Verlegen: letzten festen Punkt zurücknehmen statt zu löschen
    if (this.wireDrawing) {
      event.preventDefault();
      this.undoDrawingPoint();
      return;
    }

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
    if (!event.ctrlKey && !event.metaKey) { this.onWireDrawingKey(event); return; }
    const active  = document.activeElement;
    const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    switch (event.key.toLowerCase()) {
      case 'z':
        if (!isInput) {
          event.preventDefault();
          // Beim Verlegen: Strg+Z nimmt den letzten festen Punkt zurück
          if (this.wireDrawing && !event.shiftKey) this.undoDrawingPoint();
          else if (event.shiftKey) this.redo(); else this.undo();
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
    // preventDefault verhindert auch den Fokuswechsel: ein offenes Eingabefeld
    // (z. B. Beschriftung im Eigenschaften-Panel) würde nie verlassen, sein
    // (change) nie ausgelöst und der Text ginge verloren → explizit verlassen.
    (document.activeElement as HTMLElement | null)?.blur();
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

      // Strommodus: nur auswählen (Panel zeigt den Zustand), nicht verschieben
      if (this.simulationMode) return;

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
        appliedDx: 0,
        appliedDy: 0,
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
      // Eingangs-Stub: negierter Eingang (Kreis wie in LogikSim)
      const inStubHit = this.findStubAt(lx, ly, 'input');
      if (inStubHit) {
        this.toggleNegation(inStubHit.gate.id, inStubHit.pinIndex, 'input');
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
    if (this.handleDrag) { this.moveWireHandle(event); return; }

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
      const screenDx = event.clientX - this.gateDragState.startMouseX;
      const screenDy = event.clientY - this.gateDragState.startMouseY;
      // Bildschirm-Pixel → logische Koordinaten (sonst läuft das Bauteil bei Zoom ≠ 100 % davon)
      let dx = screenDx / this.zoom;
      let dy = screenDy / this.zoom;
      // Rasterschritte: das gezogene Bauteil rastet ein, alle anderen folgen mit demselben Delta
      const dragged = this.gates.find(g => g.id === this.gateDragState!.gateId);
      if (dragged) {
        const snapped = snapGateToGrid({ ...dragged, x: this.gateDragState.originX + dx, y: this.gateDragState.originY + dy });
        dx = snapped.x - this.gateDragState.originX;
        dy = snapped.y - this.gateDragState.originY;
      }
      // Nur der Zuwachs seit dem letzten mousemove — für Werte, die am aktuellen
      // (schon verschobenen) Zustand hängen, z. B. Abzweigpunkte
      const stepX = dx - this.gateDragState.appliedDx;
      const stepY = dy - this.gateDragState.appliedDy;
      if (!this.gateDragStarted && Math.hypot(screenDx, screenDy) > 4) {
        // Zustand EINMALIG vor dem ersten tatsächlichen Verschiebevorgang sichern,
        // damit Undo das Bauteil an die ursprüngliche Position zurückbewegt.
        this.pushHistory();
        this.gateDragStarted = true;
        this.fastRouting     = true; // A* erst beim Loslassen (s. onMouseUp)
      }
      if (this.gateDragStarted) {
        this.gateDragState.appliedDx = dx;
        this.gateDragState.appliedDy = dy;
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
            newBranchPoint = { x: wire.branchPoint.x + stepX, y: wire.branchPoint.y + stepY };
          }
          // Eigene Knicke wandern nur mit, wenn beide Enden bewegt werden; sonst
          // bleiben sie liegen und nur die Endstücke passen sich an.
          const manualPoints = wire.manualPoints && fromMoved && toMoved
            ? wire.manualPoints.map(p => ({ x: p.x + stepX, y: p.y + stepY }))
            : wire.manualPoints;
          return {
            ...wire,
            branchPoint: newBranchPoint,
            manualPoints,
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
          // Tatsächlicher Verlauf der Haupt-Leitung (auch mit eigenen Knicken)
          const path = this.getWireDisplayPoints(mainWire);
          if (!path) return wire;
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

    // Leitungs-Modus: Leitung unter der Maus hervorheben (zeigt, wovon abgezweigt wird)
    if (this.toolMode === 'wire') {
      const { lx, ly } = this.toLogical(event);
      this.hoverWireId = this.findNearestPin(lx, ly) ? null : (this.findWireHitAt(lx, ly)?.wire.id ?? null);
    }
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (this.handleDrag) { this.handleDrag = null; return; }
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
      this.fastRouting     = false; // jetzt einmal sauber mit A* führen
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

  // ─── Feste Punkte einer ausgewählten Leitung bearbeiten (Phase 7) ──────────

  /** Feste Punkte der ausgewählten Leitung (Griffe zum Verschieben/Entfernen). */
  getSelectedWireHandles(): { x: number; y: number }[] {
    if (this.simulationMode || !this.selectedWireId) return [];
    return this.wires.find(w => w.id === this.selectedWireId)?.manualPoints ?? [];
  }

  /** Griff anfassen → Verschieben startet (Undo-Sicherung erst bei echter Bewegung). */
  onHandleMouseDown(index: number, event: MouseEvent): void {
    const orig = this.wires.find(w => w.id === this.selectedWireId)?.manualPoints;
    if (event.button !== 0 || !this.selectedWireId || !orig) return;
    event.stopPropagation();
    event.preventDefault();
    this.handleDrag = { wireId: this.selectedWireId, index, started: false, orig };
  }

  /** Doppelklick auf einen Griff → festen Punkt entfernen (Verlauf bleibt rechtwinklig). */
  onHandleDblClick(index: number, event: MouseEvent): void {
    event.stopPropagation();
    const wire = this.wires.find(w => w.id === this.selectedWireId);
    if (!wire?.manualPoints || this.simulationMode) return;
    const rest = wire.manualPoints.filter((_, i) => i !== index);
    this.pushHistory();
    this.replaceWirePoints(wire, rest.length > 0 ? rest : undefined);
  }

  /** Doppelklick auf eine Leitung → an dieser Stelle einen festen Punkt einfügen. */
  onWireDblClick(wire: WireConnection, event: MouseEvent): void {
    event.stopPropagation();
    if (this.simulationMode) return;
    const pts = this.getWireDisplayPoints(wire);
    if (!pts || pts.length < 2) return;
    const { lx, ly } = this.toLogical(event);
    let best = { dist: Infinity, index: 0, point: pts[0] };
    for (let i = 0; i < pts.length - 1; i++) {
      const { dist, point } = this.closestPointOnSegment(lx, ly, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (dist < best.dist) best = { dist, index: i, point };
    }
    const a = pts[best.index], b = pts[best.index + 1];
    const point = this.snapOnWire(best.point, a.y === b.y ? { dx: 0, dy: 1 } : { dx: 1, dy: 0 });
    // Aktuellen Verlauf als feste Punkte übernehmen und den neuen dazwischen einfügen
    const inner = pts.slice(1, -1);
    inner.splice(best.index, 0, point);
    this.pushHistory();
    this.replaceWirePoints(wire, inner);
    this.selectedWireId = wire.id;
    this.selectedGateId = null;
    this.selectedGateIds.clear();
  }

  /**
   * Griff folgt der Maus (auf dem Raster). Gerade Nachbarstücke wandern mit:
   * ein direkter Nachbar auf derselben Waagerechten/Senkrechten übernimmt die
   * neue y- bzw. x-Koordinate – so bleibt die Leitung rechtwinklig ohne Zickzack.
   */
  private moveWireHandle(event: MouseEvent): void {
    const drag = this.handleDrag!;
    const wire = this.wires.find(w => w.id === drag.wireId);
    const old  = drag.orig[drag.index];
    if (!wire || !old) return;
    const { lx, ly } = this.toLogical(event);
    const p = this.snapToGrid({ x: lx, y: ly });
    const cur = wire.manualPoints?.[drag.index];
    if (cur && p.x === cur.x && p.y === cur.y) return;
    if (!drag.started) { this.pushHistory(); drag.started = true; }
    const pts = drag.orig.map(q => ({ ...q }));
    for (const n of [drag.index - 1, drag.index + 1]) {
      const q = pts[n];
      if (!q || (q.x === old.x && q.y === old.y)) continue;
      if (q.y === old.y) q.y = p.y;
      else if (q.x === old.x) q.x = p.x;
    }
    pts[drag.index] = p;
    this.replaceWirePoints(wire, pts);
  }

  /**
   * Ersetzt die festen Punkte einer Leitung. Abzweige desselben Signals, die
   * auf dem alten Verlauf saßen, werden auf den neuen Verlauf gesetzt.
   */
  private replaceWirePoints(wire: WireConnection, manualPoints: { x: number; y: number }[] | undefined): void {
    const oldPath = this.getWireDisplayPoints(wire) ?? [];
    const updated: WireConnection = { ...wire, manualPoints };
    const newPath = this.getWireDisplayPoints(updated) ?? [];
    const nearest = (p: { x: number; y: number }, path: { x: number; y: number }[]) => {
      let best = { dist: Infinity, point: p };
      for (let i = 0; i < path.length - 1; i++) {
        const r = this.closestPointOnSegment(p.x, p.y, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y);
        if (r.dist < best.dist) best = r;
      }
      return best;
    };
    this.wires = this.wires.map(w => {
      if (w.id === wire.id) return updated;
      if (!w.branchPoint || w.fromGateId !== wire.fromGateId || w.fromPinIndex !== wire.fromPinIndex) return w;
      if (nearest(w.branchPoint, oldPath).dist > 0.5) return w;
      return { ...w, branchPoint: nearest(w.branchPoint, newPath).point };
    });
  }

  // ─── Leitungs-Logik ────────────────────────────────────────────────────────

  private handleWireClick(lx: number, ly: number): void {
    const near = this.findNearestPin(lx, ly);

    if (!this.wireDrawing) {
      // 1. Priorität: Ausgangs-Pin — auch wenn schon belegt (Fan-out, s.
      //    getOutputPinMaxConnections); der Verbindungspunkt am Pin zeigt es an.
      if (near?.pinType === 'output' && this.canStartWireFromOutput(near.gate.id, near.pinIndex)) {
        this.startWireAtOutput(near.gate, near.pinIndex);
        return;
      }

      // 2. Priorität: freier Eingangs-Pin → Leitung UMGEKEHRT ziehen (wie in
      //    LogikSim vom Gatter-Eingang zur Signalleitung); Ende an einem
      //    Ausgang oder auf einer Leitung.
      if (near?.pinType === 'input' && !this.isInputPinConnected(near.gate.id, near.pinIndex)) {
        const pos = getPinWorldPos(near.gate, 'input', near.pinIndex);
        this.wireDrawing = {
          fromGateId: '', fromPinIndex: -1,
          x1: pos.x, y1: pos.y,
          fromDir: getPinDirection(near.gate, 'input'),
          reverse: { gateId: near.gate.id, pinIndex: near.pinIndex },
          bends: [], bendGroups: [], flip: false,
        };
        this.tentativeX = pos.x;
        this.tentativeY = pos.y;
        return;
      }

      // 3. Priorität: Klick auf eine BELIEBIGE Stelle einer bestehenden
      //    Leitung → Abzweigung (Fan-out) genau an diesem Punkt starten.
      //    Elektrisch bleibt die Quelle derselbe Ausgangs-Pin — branchPoint
      //    ist rein für die Darstellung. Auf dem Stummel direkt am Ausgang
      //    (im Pan-Modus: Verneinung) startet die Leitung am Ausgang selbst.
      const hit = this.findWireHitAt(lx, ly);
      if (hit) {
        const stub = this.findOutputStubAt(hit.point.x, hit.point.y);
        if (stub) {
          this.startWireAtOutput(stub.gate, stub.pinIndex);
          return;
        }
        const point = this.snapOnWire(hit.point, hit.dir);
        this.wireDrawing = {
          fromGateId:   hit.wire.fromGateId,
          fromPinIndex: hit.wire.fromPinIndex,
          x1: point.x, y1: point.y,
          fromDir: hit.dir,
          branchPoint: point,
          bends: [], bendGroups: [], flip: false,
        };
        this.tentativeX = point.x;
        this.tentativeY = point.y;
      }
      return;
    }

    const drawing = this.wireDrawing;

    // Festen Punkt setzen (wie Taste C): Klick neben jeden Pin — normal gezogen
    // auch auf eine Leitung (dort kann eine normal gezogene Leitung nicht enden),
    // umgekehrt gezogen nur auf freie Fläche (Leitung = Abzweig-Ziel).
    if (!near && (!drawing.reverse || !this.findWireHitAt(lx, ly))) {
      this.commitDrawingPoint({ x: lx, y: ly });
      return;
    }
    this.wireDrawing = null;

    // ── Umgekehrt gezogen: Ziel-Eingang steht fest, Quelle wird jetzt gewählt
    if (drawing.reverse) {
      const target = this.gates.find(g => g.id === drawing.reverse!.gateId);
      if (!target || this.isInputPinConnected(target.id, drawing.reverse.pinIndex)) return;
      const toPin = drawing.reverse.pinIndex;
      const bends = [...drawing.bends].reverse(); // vom Eingang aus gesetzt → Richtung Quelle→Ziel

      if (near?.pinType === 'output' && near.gate.id !== target.id) {
        this.addWire(near.gate.id, near.pinIndex, getPinWorldPos(near.gate, 'output', near.pinIndex),
          getPinDirection(near.gate, 'output'), undefined, target, toPin, bends);
        return;
      }
      const hit = near ? null : this.findWireHitAt(lx, ly);
      if (!hit || hit.wire.fromGateId === target.id) return;
      const stub = this.findOutputStubAt(hit.point.x, hit.point.y);
      if (stub) {
        this.addWire(stub.gate.id, stub.pinIndex, getPinWorldPos(stub.gate, 'output', stub.pinIndex),
          getPinDirection(stub.gate, 'output'), undefined, target, toPin, bends);
        return;
      }
      // Abzweig-Richtung: senkrecht zum getroffenen Segment, zum Ziel hin
      const inPos = getPinWorldPos(target, 'input', toPin);
      const point = this.snapOnWire(hit.point, hit.dir);
      const dir: PinDirection = hit.dir.dx !== 0
        ? { dx: Math.sign(inPos.x - point.x) || 1, dy: 0 }
        : { dx: 0, dy: Math.sign(inPos.y - point.y) || 1 };
      this.addWire(hit.wire.fromGateId, hit.wire.fromPinIndex, point, dir, point, target, toPin, bends);
      return;
    }

    // ── Normal gezogen: Ende an einem freien Eingang eines anderen Bauteils
    if (near?.pinType === 'input' && near.gate.id !== drawing.fromGateId
        && !this.isInputPinConnected(near.gate.id, near.pinIndex)) {
      this.addWire(drawing.fromGateId, drawing.fromPinIndex, { x: drawing.x1, y: drawing.y1 },
        drawing.fromDir, drawing.branchPoint, near.gate, near.pinIndex, drawing.bends);
    }
  }

  /** Beginnt eine neue Leitung direkt an einem Ausgangs-Pin. */
  private startWireAtOutput(gate: GateInstance, pinIndex: number): void {
    const pos = getPinWorldPos(gate, 'output', pinIndex);
    this.wireDrawing = {
      fromGateId:   gate.id,
      fromPinIndex: pinIndex,
      x1: pos.x, y1: pos.y,
      fromDir: getPinDirection(gate, 'output'),
      bends: [], bendGroups: [], flip: false,
    };
    this.tentativeX = pos.x;
    this.tentativeY = pos.y;
  }

  // ─── Verlegen wie in Shapez 2 (Phase 7) ─────────────────────────────────────

  /** Punkt auf das Raster legen. */
  private snapToGrid(p: { x: number; y: number }): { x: number; y: number } {
    return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
  }

  /** Punkt auf einer Leitung nur entlang des Stücks aufs Raster legen (bleibt auf der Leitung). */
  private snapOnWire(p: { x: number; y: number }, perpendicular: PinDirection): { x: number; y: number } {
    // perpendicular = Abzweig-Richtung, also quer zum getroffenen Stück
    return perpendicular.dx === 0
      ? { x: Math.round(p.x / GRID) * GRID, y: p.y }
      : { x: p.x, y: Math.round(p.y / GRID) * GRID };
  }

  /** Letzter fester Punkt der laufenden Leitung (sonst ihr Startpunkt). */
  private drawingAnchor(d: WireDrawingState): { x: number; y: number } {
    return d.bends[d.bends.length - 1] ?? { x: d.x1, y: d.y1 };
  }

  /**
   * Knickreihenfolge des aktuellen Stücks: das erste Stück läuft in
   * Pin-Richtung, jedes weitere zuerst quer zum vorigen Stück; F dreht um.
   */
  private drawingHorizontalFirst(d: WireDrawingState): boolean {
    const pts = [{ x: d.x1, y: d.y1 }, ...d.bends];
    const horizontal = pts.length < 2
      ? d.fromDir.dx !== 0
      : pts[pts.length - 2].y !== pts[pts.length - 1].y; // voriges Stück senkrecht → jetzt waagerecht
    return horizontal !== d.flip;
  }

  /** Noch nicht festgelegtes L-Stück vom letzten festen Punkt zur (gerasterten) Maus. */
  private pendingDrawingPoints(d: WireDrawingState, cursor: { x: number; y: number }): { x: number; y: number }[] {
    const a = this.drawingAnchor(d), c = this.snapToGrid(cursor);
    const corner = lCorner(a, c, this.drawingHorizontalFirst(d));
    return [...(corner ? [corner] : []), c].filter(p => p.x !== a.x || p.y !== a.y);
  }

  /** Taste C / Klick auf freie Fläche: L-Stück bis zum Punkt festlegen. */
  private commitDrawingPoint(cursor: { x: number; y: number }): void {
    const d = this.wireDrawing;
    if (!d) return;
    const pts = this.pendingDrawingPoints(d, cursor);
    if (pts.length === 0) return;
    this.wireDrawing = { ...d, bends: [...d.bends, ...pts], bendGroups: [...d.bendGroups, pts.length], flip: false };
  }

  /** Backspace / Strg+Z beim Verlegen: letzten festen Punkt zurücknehmen. */
  private undoDrawingPoint(): void {
    const d = this.wireDrawing;
    if (!d || d.bendGroups.length === 0) return;
    const n = d.bendGroups[d.bendGroups.length - 1];
    this.wireDrawing = { ...d, bends: d.bends.slice(0, -n), bendGroups: d.bendGroups.slice(0, -1), flip: false };
  }

  /**
   * Tasten beim Verlegen: C = festen Punkt setzen, F = Knickreihenfolge umschalten.
   * Aufruf aus onKeyboardShortcut – ein zweiter @HostListener('document:keydown')
   * in derselben Klasse würde den ersten überschreiben.
   */
  private onWireDrawingKey(event: KeyboardEvent): void {
    if (!this.wireDrawing || event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    if (key === 'c') {
      event.preventDefault();
      this.commitDrawingPoint({ x: this.tentativeX, y: this.tentativeY });
    } else if (key === 'f') {
      event.preventDefault();
      this.wireDrawing = { ...this.wireDrawing, flip: !this.wireDrawing.flip };
    }
  }

  /**
   * Gültiges Ziel unter der Maus (für die Vorschau): normal gezogen ein freier
   * Eingang eines anderen Bauteils, umgekehrt gezogen ein Ausgang.
   */
  private drawingTargetPin(d: WireDrawingState): { gate: GateInstance; pinType: 'input' | 'output'; pinIndex: number } | null {
    const near = this.findNearestPin(this.tentativeX, this.tentativeY);
    if (!near) return null;
    if (d.reverse) return near.pinType === 'output' && near.gate.id !== d.reverse.gateId ? near : null;
    return near.pinType === 'input' && near.gate.id !== d.fromGateId
      && !this.isInputPinConnected(near.gate.id, near.pinIndex) ? near : null;
  }

  /**
   * Legt eine Leitung an (mit Undo-Sicherung).
   * start/fromDir: Ausgangs-Pin bzw. Abzweigpunkt (branchPoint) und Austrittsrichtung.
   */
  private addWire(
    fromGateId: string, fromPinIndex: number,
    start: { x: number; y: number }, fromDir: PinDirection,
    branchPoint: { x: number; y: number } | undefined,
    to: GateInstance, toPinIndex: number,
    bends: { x: number; y: number }[] = [],
  ): void {
    const endPos   = getPinWorldPos(to, 'input', toPinIndex);
    const fromGate = this.gates.find(g => g.id === fromGateId);
    // Bei einer Abzweigung (branchPoint gesetzt) liegt der Startpunkt
    // frei im Raum, nicht an einer Gatter-Kante — die Ober-/Unterkante
    // des ursprünglichen Quell-Gatters ist dafür irrelevant und wird
    // bewusst weggelassen (sonst könnte die Route unnötig ausweichen).
    const isBranch   = !!branchPoint;
    const fromBottom = !isBranch && fromGate ? fromGate.y + getGateDimensions(fromGate).h : undefined;
    const fromTop    = !isBranch ? fromGate?.y : undefined;
    const toBottom   = to.y + getGateDimensions(to).h;
    const toDir      = getPinDirection(to, 'input');

    // Rasterversatz ausgleichen: Liegt der erste/letzte Knick weniger als eine
    // Rasterweite neben der Pin-Achse, auf die Achse ziehen — sonst entsteht
    // durch das Einrasten ein kleiner Haken bzw. Überstand am Pin.
    if (bends.length > 0) {
      const GRID = 24;
      bends = bends.map(p => ({ ...p }));
      const first = bends[0], last = bends[bends.length - 1];
      if (fromDir.dx === 0 && Math.abs(first.x - start.x) < GRID) first.x = start.x;
      if (fromDir.dy === 0 && Math.abs(first.y - start.y) < GRID) first.y = start.y;
      if (toDir.dx === 0 && Math.abs(last.x - endPos.x) < GRID) last.x = endPos.x;
      if (toDir.dy === 0 && Math.abs(last.y - endPos.y) < GRID) last.y = endPos.y;
    }

    const newWire: WireConnection = {
      id:           `wire-${++this.wireIdCounter}`,
      fromGateId,
      fromPinIndex,
      toGateId:     to.id,
      toPinIndex,
      points: computeOrthogonalWaypoints(
        start.x, start.y, endPos.x, endPos.y,
        fromBottom, toBottom, fromTop, to.y,
        fromDir, toDir
      ),
      branchPoint,
      fromDir: branchPoint ? fromDir : undefined,
      // Phase 7: kompletter sichtbarer Verlauf als feste Punkte – bleibt so, wie
      // der Nutzer ihn verlegt hat; beim Verschieben passen sich nur die Enden an
      manualPoints: (() => {
        const inner = drawnWirePath(start, fromDir, bends, endPos, toDir).slice(1, -1);
        return inner.length > 0 ? inner : undefined;
      })(),
    };
    this.pushHistory(); // Zustand vor dem Hinzufügen der Leitung sichern
    this.wires = [...this.wires, newWire];
    if (this.simulationMode) this.recomputeSimulation();
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

  // ─── Negation (Verneinung per Klick auf Ausgangs-/Eingangs-Stub) ─────────────

  /**
   * Gibt zurück, ob sich der Punkt (lx,ly) im Stub-Bereich (erste ~20 px
   * außerhalb des Pins) eines Ausgangs bzw. Eingangs befindet.
   * Im Pan-Modus: Verneinung setzen/entfernen; im Leitungs-Modus: Start am Ausgang.
   */
  private findStubAt(
    lx: number, ly: number, kind: 'input' | 'output'
  ): { gate: GateInstance; pinIndex: number } | null {
    const STUB_LEN = 20;
    const HIT_R    = 8;
    for (const gate of this.gates) {
      if (gate.type === 'text-label') continue;
      const offsets = getGatePinOffsets(gate);
      const pins = kind === 'output' ? offsets.outputs : offsets.inputs;
      for (let i = 0; i < pins.length; i++) {
        const pos = getPinWorldPos(gate, kind, i);
        const dir = getPinDirection(gate, kind);
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

  private findOutputStubAt(lx: number, ly: number): { gate: GateInstance; pinIndex: number } | null {
    return this.findStubAt(lx, ly, 'output');
  }

  /** Setzt/entfernt die Verneinung für einen Ausgangs- bzw. Eingangs-Pin. */
  toggleNegation(gateId: string, pinIndex: number, kind: 'input' | 'output' = 'output'): void {
    this.pushHistory();
    const key = kind === 'output' ? 'negatedOutputs' : 'negatedInputs';
    this.gates = this.gates.map(g => {
      if (g.id !== gateId) return g;
      const cur  = g[key] ?? [];
      const next = cur.includes(pinIndex)
        ? cur.filter(i => i !== pinIndex)
        : [...cur, pinIndex];
      return { ...g, [key]: next };
    });
    if (this.simulationMode) this.recomputeSimulation();
  }

  /**
   * Alle Verneinungs-Punkte für die SVG-Darstellung (Ausgänge und Eingänge).
   * high = Signal auf der LEITUNG am Kreis (Ausgang: nach der Verneinung;
   * Eingang: vor der Verneinung, also der Wert der ankommenden Leitung).
   */
  getNegationDots(): { x: number; y: number; high: boolean | null }[] {
    const res: { x: number; y: number; high: boolean | null }[] = [];
    for (const gate of this.gates) {
      for (const pi of gate.negatedOutputs ?? []) {
        const pos = getPinWorldPos(gate, 'output', pi);
        const dir = getPinDirection(gate, 'output');
        res.push({ x: pos.x + dir.dx * 10, y: pos.y + dir.dy * 10, high: this.getSignalOutput(gate.id, pi) });
      }
      for (const pi of gate.negatedInputs ?? []) {
        const pos = getPinWorldPos(gate, 'input', pi);
        const dir = getPinDirection(gate, 'input');
        const v   = this.getSignalInput(gate.id, pi);
        res.push({ x: pos.x + dir.dx * 10, y: pos.y + dir.dy * 10, high: v === null ? null : !v });
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
    this.gates = [...this.gates, snapGateToGrid(gate)];
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

  /**
   * Körperfarbe als CSS-Variable `--gate-fill` (die Bauteil-SCSS nutzen sie als
   * Hintergrund des Körpers). Werte = Farbfelder im Eigenschaften-Panel.
   * Im Simulationsmodus keine eigene Farbe: Bauteile zeigen grau/grün (LOW/HIGH).
   */
  getGateFill(gate: GateInstance): string | null {
    // Strommodus: Gatter grau (LOW-Farbe; HIGH-Regel der Bauteile färbt grün),
    // Ein-/Ausgabe-Bauteile behalten ihre Standardoptik.
    if (this.simulationMode) return IO_TYPES.has(gate.type) ? null : '#f1f5f9';
    const map: Record<GateColor, string | null> = {
      default: null,
      yellow:  '#fde047',
      orange:  '#fdba74',
      red:     '#fca5a5',
      blue:    '#93c5fd',
      violet:  '#c4b5fd',
      green:   '#86efac',
    };
    return map[gate.color] ?? null;
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
    // Phase 7: Der Nutzer legt den Verlauf fest (feste Punkte = manualPoints);
    // die automatische A*-Führung (autoRoutes) wird nicht mehr aufgerufen.
    return this.legacyWirePoints(wire, from, to);
  }

  /** Bisherige (schnelle) Führung: Z-/U-Form je Leitung bzw. über eigene Knicke. */
  private legacyWirePoints(
    wire: WireConnection, from: GateInstance, to: GateInstance,
  ): { x: number; y: number }[] {
    const start = wire.branchPoint ?? getPinWorldPos(from, 'output', wire.fromPinIndex);
    const end   = getPinWorldPos(to, 'input', wire.toPinIndex);

    const fromBottom = wire.branchPoint ? undefined : from.y + getGateDimensions(from).h;
    const fromTop     = wire.branchPoint ? undefined : from.y;
    const toBottom    = to.y + getGateDimensions(to).h;
    const fromDir     = wire.branchPoint ? (wire.fromDir ?? { dx: 1, dy: 0 }) : getPinDirection(from, 'output');
    const toDir       = getPinDirection(to, 'input');

    // Eigene Knickpunkte (Phase 6B): Verlauf über die Knicke statt automatisch
    if (wire.manualPoints?.length) {
      return manualWirePath(start, fromDir, wire.manualPoints, end, toDir);
    }

    const waypoints = computeOrthogonalWaypoints(
      start.x, start.y, end.x, end.y, fromBottom, toBottom, fromTop, to.y, fromDir, toDir
    );
    return [start, ...waypoints, end];
  }

  // ─── Automatische Leitungsführung (A*, Phase 6C) ───────────────────────────
  // TOTER CODE seit Phase 7: Leitungen verlegt der Nutzer selbst, autoRoutes()
  // wird nirgends mehr aufgerufen. Bewusst behalten (Nutzer-Entscheidung), nicht löschen.

  /** Während eines Bauteil-Drags: schneller Alt-Router statt A* (flüssiges Ziehen). */
  private fastRouting = false;

  /** Berechnete Verläufe + projizierte Abzweig-Startpunkte, gültig für einen Layout-Stand. */
  private routeCache: {
    gates: GateInstance[]; wires: WireConnection[]; signature: string;
    paths: Map<string, { x: number; y: number }[]>;
    branchStarts: Map<string, { x: number; y: number }>;
  } | null = null;

  /**
   * Liefert die A*-Verläufe aller Leitungen (gecacht).
   *
   * Gültig, solange sich das Layout nicht ändert: gleiche Array-Referenzen
   * (Immutable-Pattern) oder gleiche Layout-Signatur (z. B. nach einem Takt,
   * der nur inputValue ändert). Reihenfolge: Leitungen mit eigenen Knicken
   * (fest), dann direkte Leitungen, dann Abzweige — Abzweige starten am
   * nächstgelegenen Punkt des aktuellen Verlaufs ihres Signals.
   */
  private autoRoutes(): NonNullable<Whiteboard['routeCache']> {
    const c = this.routeCache;
    if (c && c.gates === this.gates && c.wires === this.wires) return c;
    const signature = JSON.stringify([
      this.gates.map(g => [g.id, g.type, g.x, g.y, g.rotation, g.inputCount]),
      this.wires.map(w => [w.id, w.fromGateId, w.fromPinIndex, w.toGateId, w.toPinIndex, w.branchPoint, w.manualPoints]),
    ]);
    if (c && c.signature === signature) {
      c.gates = this.gates; c.wires = this.wires;
      return c;
    }

    const obstacles: Rect[] = this.gates.filter(g => g.type !== 'text-label').map(g => {
      const dim  = getGateDimensions(g);
      const side = g.rotation === 90 || g.rotation === 270;
      const hw = (side ? dim.h : dim.w) / 2 + ROUTE_CLEARANCE, hh = (side ? dim.w : dim.h) / 2 + ROUTE_CLEARANCE;
      const cx = g.x + dim.w / 2, cy = g.y + dim.h / 2;
      return { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh };
    });
    const occupied: Seg[] = [];
    const paths = new Map<string, { x: number; y: number }[]>();
    const branchStarts = new Map<string, { x: number; y: number }>();
    const netOf = (w: WireConnection) => `${w.fromGateId}:${w.fromPinIndex}`;
    const order = [
      ...this.wires.filter(w => w.manualPoints?.length && !w.branchPoint),
      ...this.wires.filter(w => !w.manualPoints?.length && !w.branchPoint),
      ...this.wires.filter(w => w.branchPoint),
    ];

    // Feste Ein-/Austrittsstücke an den Pins vorab als belegt markieren: sonst
    // legt sich eine früher verlegte Leitung darauf, und die spätere kann ihrem
    // Stück am Pin nicht mehr ausweichen (Überlappung direkt vor dem Bauteil).
    // Eigene Liste: nur der Router sieht sie, nicht die Abzweig-Projektion unten.
    const pinStubs: Seg[] = [];
    const stub = (p: { x: number; y: number }, d: { dx: number; dy: number }) =>
      ({ x: p.x + d.dx * ROUTE_EXIT, y: p.y + d.dy * ROUTE_EXIT });
    for (const w of this.wires) {
      const from = this.gates.find(g => g.id === w.fromGateId);
      const to   = this.gates.find(g => g.id === w.toGateId);
      if (!from || !to) continue;
      const end = getPinWorldPos(to, 'input', w.toPinIndex);
      pinStubs.push({ a: end, b: stub(end, getPinDirection(to, 'input')), net: netOf(w) });
      if (!w.branchPoint) {
        const start = getPinWorldPos(from, 'output', w.fromPinIndex);
        pinStubs.push({ a: start, b: stub(start, getPinDirection(from, 'output')), net: netOf(w) });
      }
    }

    for (const w of order) {
      const from = this.gates.find(g => g.id === w.fromGateId);
      const to   = this.gates.find(g => g.id === w.toGateId);
      if (!from || !to) continue;
      const net   = netOf(w);
      const end   = getPinWorldPos(to, 'input', w.toPinIndex);
      const toDir = getPinDirection(to, 'input');
      let start   = getPinWorldPos(from, 'output', w.fromPinIndex);
      let fromDir = getPinDirection(from, 'output');

      if (w.branchPoint) {
        // Abzweig auf den aktuellen Verlauf seines Signals setzen (Umleitungen
        // würden ihn sonst frei in der Luft hängen lassen); Richtung senkrecht
        // zum getroffenen Stück, zum Ziel hin.
        let best: { point: { x: number; y: number }; horizontal: boolean } | null = null, bestDist = Infinity;
        for (const s of occupied) {
          if (s.net !== net) continue;
          const { dist, point } = this.closestPointOnSegment(w.branchPoint.x, w.branchPoint.y, s.a.x, s.a.y, s.b.x, s.b.y);
          if (dist < bestDist) { bestDist = dist; best = { point, horizontal: s.a.y === s.b.y }; }
        }
        start = best?.point ?? w.branchPoint;
        fromDir = best
          ? (best.horizontal ? { dx: 0, dy: Math.sign(end.y - start.y) || 1 } : { dx: Math.sign(end.x - start.x) || 1, dy: 0 })
          : (w.fromDir ?? { dx: 1, dy: 0 });
        branchStarts.set(w.id, start);
      }

      const pts = w.manualPoints?.length
        ? manualWirePath(start, fromDir, w.manualPoints, end, toDir)
        : routeWire(start, fromDir, end, toDir, obstacles, [...pinStubs, ...occupied], net)
          ?? this.legacyWirePoints({ ...w, branchPoint: w.branchPoint && start, fromDir }, from, to);
      paths.set(w.id, pts);
      for (let i = 1; i < pts.length; i++) occupied.push({ a: pts[i - 1], b: pts[i], net });
    }

    this.routeCache = { gates: this.gates, wires: this.wires, signature, paths, branchStarts };
    return this.routeCache;
  }

  /** Startpunkt einer Abzweig-Leitung (Phase 7: gespeicherter Punkt, keine A*-Projektion mehr). */
  private branchStart(wire: WireConnection): { x: number; y: number } | undefined {
    return wire.branchPoint;
  }

  /** Gibt den SVG-Punktstring für eine Leitung zurück (nutzt getWireDisplayPoints). */
  getWirePointsString(wire: WireConnection): string | null {
    const pts = this.getWireDisplayPoints(wire);
    return pts ? pts.map(p => `${p.x},${p.y}`).join(' ') : null;
  }

  /**
   * Punktstrings der Anschluss-Stummel einer Leitung (Pin → Bauteil-Körper).
   *
   * Die Stummel gehören zur Bauteil-Grafik (CSS `.wire` in der Komponente) und
   * liegen über der Leitungs-Ebene; ohne Überzeichnung bliebe dort ein dunkles
   * Stück, obwohl die Leitung z. B. HIGH (grün) ist. Die eigene Stummel-Ebene
   * über den Bauteilen zeichnet deshalb nur diese Stücke in Leitungsfarbe.
   * Abzweige (branchPoint) haben am Start keinen eigenen Stummel.
   */
  getWireStubPointStrings(wire: WireConnection): string[] {
    const from = this.gates.find(g => g.id === wire.fromGateId);
    const to   = this.gates.find(g => g.id === wire.toGateId);
    if (!from || !to) return [];
    // Stummel-Länge laut Komponenten-CSS: NOT 8 px (Ausgang hinter dem Invertierkreis), sonst 12 px
    const len = (g: GateInstance) => (g.type === 'not' ? 8 : 12);
    const stub = (g: GateInstance, kind: 'input' | 'output', pin: number) => {
      const p = getPinWorldPos(g, kind, pin), d = getPinDirection(g, kind);
      return `${p.x},${p.y} ${p.x - d.dx * len(g)},${p.y - d.dy * len(g)}`;
    };
    const stubs = [stub(to, 'input', wire.toPinIndex)];
    if (!wire.branchPoint) stubs.push(stub(from, 'output', wire.fromPinIndex));
    return stubs;
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
    const d = this.wireDrawing;
    if (!d) return '';
    const start = { x: d.x1, y: d.y1 };
    const str = (pts: { x: number; y: number }[]) => pts.map(p => `${p.x},${p.y}`).join(' ');

    // Über einem gültigen Ziel-Pin: genau der Verlauf, der beim Klick entsteht
    const target = this.drawingTargetPin(d);
    if (target) {
      const pin = getPinWorldPos(target.gate, target.pinType, target.pinIndex);
      const pinDir = getPinDirection(target.gate, target.pinType);
      return d.reverse
        ? str(drawnWirePath(pin, pinDir, [...d.bends].reverse(), start, d.fromDir))
        : str(drawnWirePath(start, d.fromDir, d.bends, pin, pinDir));
    }
    // Sonst: feste Punkte + L-Stück zur Maus (Shapez-Stil)
    return str([start, ...d.bends, ...this.pendingDrawingPoints(d, { x: this.tentativeX, y: this.tentativeY })]);
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
   * - Mehrere Leitungen, die DIREKT vom selben Ausgangs-Pin starten (Fan-out):
   *   dort, wo sich ihre gezeichneten Verläufe trennen. Der Router lässt
   *   gleiche Signale ein Stück gemeinsam laufen, die Aufteilung liegt daher
   *   oft nicht am Pin – so sind Aufteilungen von Kreuzungen unterscheidbar.
   */
  getWireJunctions(): { x: number; y: number; gateId: string; pinIndex: number }[] {
    const result: { x: number; y: number; gateId: string; pinIndex: number }[] = [];

    // Abzweigpunkte: ein Punkt pro Abzweig-Leitung
    for (const wire of this.wires) {
      if (wire.branchPoint) {
        result.push({ ...this.branchStart(wire)!, gateId: wire.fromGateId, pinIndex: wire.fromPinIndex });
      }
    }

    // Direkte Mehrfachstarts vom selben Pin (ohne Abzweigung): Trennstellen
    const groups = new Map<string, WireConnection[]>();
    for (const wire of this.wires) {
      if (wire.branchPoint) continue;
      const key = `${wire.fromGateId}:${wire.fromPinIndex}`;
      groups.set(key, [...(groups.get(key) ?? []), wire]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const paths = group
        .map(w => this.getWireDisplayPoints(w))
        .filter((p): p is { x: number; y: number }[] => !!p && p.length > 1);
      const seen = new Set<string>();
      for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
          const p   = this.pathDivergence(paths[i], paths[j]);
          const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({ ...p, gateId: group[0].fromGateId, pinIndex: group[0].fromPinIndex });
        }
      }
    }
    return result;
  }

  /**
   * Punkt, an dem sich zwei Leitungsverläufe mit gleichem Startpunkt trennen:
   * beide gleichzeitig ablaufen, bis ihre Richtungen verschieden sind.
   */
  private pathDivergence(
    a: { x: number; y: number }[],
    b: { x: number; y: number }[],
  ): { x: number; y: number } {
    const EPS = 0.5;
    const dir = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      ({ dx: Math.sign(Math.round(q.x - p.x)), dy: Math.sign(Math.round(q.y - p.y)) });
    let i = 0, j = 0;
    let pa = { ...a[0] }, pb = { ...b[0] };
    while (i < a.length - 1 && j < b.length - 1) {
      const la = Math.hypot(a[i + 1].x - pa.x, a[i + 1].y - pa.y);
      const lb = Math.hypot(b[j + 1].x - pb.x, b[j + 1].y - pb.y);
      if (la < EPS) { i++; pa = { ...a[i] }; continue; }
      if (lb < EPS) { j++; pb = { ...b[j] }; continue; }
      const da = dir(pa, a[i + 1]), db = dir(pb, b[j + 1]);
      if (da.dx !== db.dx || da.dy !== db.dy) break;
      const step = Math.min(la, lb);
      pa = { x: pa.x + (a[i + 1].x - pa.x) * step / la, y: pa.y + (a[i + 1].y - pa.y) * step / la };
      pb = { x: pb.x + (b[j + 1].x - pb.x) * step / lb, y: pb.y + (b[j + 1].y - pb.y) * step / lb };
    }
    return pa;
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

  /**
   * „Alles anzeigen“: Zoom und Pan so setzen, dass alle Bauteile und Leitungen
   * mit etwas Rand ins Whiteboard passen und dort zentriert sind.
   * Zoom-Grenzen wie beim Mausrad (0.1–5).
   */
  zoomToFit(): void {
    if (this.gates.length === 0 || !this.viewportRef) return;
    const MARGIN = 40; // Bildschirm-px Rand, Platz für Label-Overlays
    const { minX, minY, maxX, maxY } = this.getContentBounds();
    const vp = this.viewportRef.nativeElement;
    const w  = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const zoom = Math.max(0.1, Math.min(5,
      Math.min((vp.clientWidth - 2 * MARGIN) / w, (vp.clientHeight - 2 * MARGIN) / h)));
    this.zoom = zoom;
    this.panX = vp.clientWidth  / 2 - (minX + w / 2) * zoom;
    this.panY = vp.clientHeight / 2 - (minY + h / 2) * zoom;
  }

  private dist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x1 - x2, y1 - y2);
  }
}

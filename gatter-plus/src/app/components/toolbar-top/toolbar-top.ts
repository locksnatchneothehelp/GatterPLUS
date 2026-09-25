import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { AndGate }    from '../gates/and-gate/and-gate';
import { OrGate }     from '../gates/or-gate/or-gate';
import { NotGate }    from '../gates/not-gate/not-gate';
import { XorGate }    from '../gates/xor-gate/xor-gate';
import { JkFlipflop } from '../gates/jk-flipflop/jk-flipflop';
import { HalfAdder }  from '../gates/half-adder/half-adder';
import { FullAdder }  from '../gates/full-adder/full-adder';
import { InputSwitch } from '../io/input-switch/input-switch';
import { OutputLed }   from '../io/output-led/output-led';
import { ClockGen }    from '../io/clock-gen/clock-gen';
import { TextLabel }   from '../io/text-label/text-label';
import { DragStateService } from '../../services/drag-state.service';
import { GateType } from '../../models/gate.model';
import { ToolMode }  from '../toolbar-left/toolbar-left';

/**
 * Obere horizontale Toolbar.
 *
 * Paletten:
 * - Gatter:      AND, OR, NOT, XOR
 * - Kombinatorik: Halbaddierer (HA), Volladdierer (VA)
 * - Flip-Flops:  JK-FF
 * - Ein/Ausgang: Eingangs-Schalter, Ausgangs-LED, Taktgeber, Text-Label
 * - Werkzeug:    Pan (Verschieben), Leitung (Wire) — SVG-Icon-Buttons an der
 *                Stelle, an der zuvor die Bearbeiten-Buttons standen
 *                (Undo/Redo/Copy/Paste sind in die Menüleiste umgezogen).
 */
@Component({
  selector: 'app-toolbar-top',
  imports: [
    AndGate, OrGate, NotGate, XorGate,
    JkFlipflop, HalfAdder, FullAdder,
    InputSwitch, OutputLed, ClockGen, TextLabel,
  ],
  templateUrl: './toolbar-top.html',
  styleUrl: './toolbar-top.scss',
})
export class ToolbarTop {
  private readonly dragState = inject(DragStateService);

  @Input() simulationMode = false;

  /** Welches Werkzeug (Pan/Wire) gerade aktiv ist (kommt vom Whiteboard über App). */
  @Input() activeTool: ToolMode = 'pan';

  @Output() simulationToggle = new EventEmitter<void>();

  /** Wird emittiert, wenn der Benutzer Pan oder Leitung auswählt. */
  @Output() toolSelected = new EventEmitter<ToolMode>();

  /**
   * Startet einen Drag-Vorgang aus der Palette.
   * Kein document:mouseup hier – das Whiteboard übernimmt das Cleanup.
   *
   * Während der Simulation läuft das Platzieren neuer Bauteile nicht mehr
   * sinnvoll (die Buttons sind dann auch visuell grau/deaktiviert) — der
   * Guard hier stellt sicher, dass kein Drag startet, selbst wenn der Klick
   * trotz pointer-events:none irgendwie durchkommt.
   */
  onGateMouseDown(event: MouseEvent, gateType: GateType): void {
    if (this.simulationMode) return;
    event.preventDefault();
    this.dragState.startDrag(gateType);
  }

  /** Wechselt das aktive Werkzeug (Pan/Leitung). */
  selectTool(tool: ToolMode): void {
    this.toolSelected.emit(tool);
  }
}

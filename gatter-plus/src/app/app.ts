import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { MenuBar }       from './components/menu-bar/menu-bar';
import { ToolbarTop }    from './components/toolbar-top/toolbar-top';
import { Whiteboard }    from './components/whiteboard/whiteboard';
import { PropertiesPanel, GatePropertyChange } from './components/properties-panel/properties-panel';
import { ToolMode }      from './components/toolbar-left/toolbar-left';
import { GateInstance }  from './models/gate.model';
import { ThemeService }  from './services/theme.service';
import { ComponentSignalState } from './services/simulation.service';

/**
 * Root-Komponente von GatterPLUS.
 *
 * Layout (oben → unten):
 *   Menu-Bar (Datei/Bearbeiten/Hilfe) | Toolbar-Top (Paletten + Pan/Leitung)
 *   | (Whiteboard | Properties-Panel)
 *
 * Hinweis: Die Pan/Leitung-Werkzeuge saßen früher in einer eigenen linken
 * Toolbar (ToolbarLeft-Komponente). Sie sind jetzt Teil der oberen Toolbar,
 * an der Stelle, an der zuvor die Bearbeiten-Buttons (Undo/Redo/Copy/Paste)
 * standen — diese sind in die Menüleiste umgezogen. Der ToolMode-Typ wird
 * weiterhin aus toolbar-left.ts importiert, die Komponente selbst wird aber
 * nicht mehr gerendert (ihre Logik bleibt für spätere Wiederverwendung erhalten).
 */
@Component({
  selector: 'app-root',
  imports: [MenuBar, ToolbarTop, Whiteboard, PropertiesPanel],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  @ViewChild(Whiteboard) whiteboardRef!: Whiteboard;

  private readonly themeService = inject(ThemeService);

  activeTool:    ToolMode = 'pan';
  simulationMode = false;

  /** Beim Start das gespeicherte Theme laden und anwenden. */
  ngOnInit(): void {
    this.themeService.loadTheme();
  }

  onToolSelected(tool: ToolMode): void {
    this.activeTool = tool;
    this.whiteboardRef.setToolMode(tool);
  }

  onSimulationToggle(): void {
    this.whiteboardRef.toggleSimulation();
    this.simulationMode = this.whiteboardRef.simulationMode;
    // Toolbar-Anzeige mit dem Modus des Whiteboards synchronisieren:
    // toggleSimulation() schaltet intern auf Pan um, daher muss activeTool
    // hier nachgezogen werden, damit der Toolbar-Button korrekt hervorgehoben ist.
    this.activeTool = this.whiteboardRef.toolMode;
  }

  /** Ausgewähltes Bauteil (für Properties Panel) */
  get selectedGate(): GateInstance | null {
    return this.whiteboardRef?.selectedGate ?? null;
  }

  /** Ausgewählte Leitung (für Properties Panel — zeigt einen Löschen-Button) */
  get selectedWireId(): string | null {
    return this.whiteboardRef?.selectedWireId ?? null;
  }

  /** Aktueller Signalzustand des ausgewählten Gatters (für Properties Panel) */
  get selectedGateSignalState(): ComponentSignalState | null {
    const gate = this.selectedGate;
    if (!gate || !this.whiteboardRef) return null;
    return this.whiteboardRef.getGateSignalState(gate.id);
  }

  /** Eigenschafts-Änderungen vom Properties Panel ans Whiteboard weiterleiten */
  onGateChange(changes: GatePropertyChange): void {
    // color kommt als string aus dem Panel, cast zum engeren Typ ist hier sicher
    this.whiteboardRef.updateGate(changes as any);
  }

  /** Lösch-Anfragen vom Properties Panel ans Whiteboard weiterleiten */
  onGateDelete(gateId: string): void {
    this.whiteboardRef.deleteGate(gateId);
  }

  /** Lösch-Anfrage für eine Leitung ans Whiteboard weiterleiten */
  onWireDelete(wireId: string): void {
    this.whiteboardRef.deleteWire(wireId);
  }

  onUndo():  void { this.whiteboardRef.undo(); }
  onRedo():  void { this.whiteboardRef.redo(); }
  onCopy():  void { this.whiteboardRef.copySelected(); }
  onPaste(): void { this.whiteboardRef.pasteClipboard(); }

  get canUndo():  boolean { return this.whiteboardRef?.canUndo  ?? false; }
  get canRedo():  boolean { return this.whiteboardRef?.canRedo  ?? false; }
  get canPaste(): boolean { return this.whiteboardRef?.canPaste ?? false; }
}

import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { MenuBar }       from './components/menu-bar/menu-bar';
import { ToolbarTop }    from './components/toolbar-top/toolbar-top';
import { Whiteboard }    from './components/whiteboard/whiteboard';
import { PropertiesPanel, GatePropertyChange } from './components/properties-panel/properties-panel';
import { ToolMode }      from './components/toolbar-left/toolbar-left';
import { GateInstance }  from './models/gate.model';
import { ThemeService }  from './services/theme.service';
import { ComponentSignalState } from './services/simulation.service';
import { PROJECT_FILE_EXTENSION, parseProject, serializeProject } from './models/project-file';
import { parseLogikSim } from './models/logiksim-file';

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

  // ─── Datei: Öffnen / Speichern unter ───────────────────────────────────────
  // Chrome/Edge: echte Datei-Dialoge (File System Access API, nicht in lib.dom
  // typisiert → Zugriff über `window as any`). Andere Browser: Fallback über
  // <input type="file"> bzw. Download-Link.

  /** Dateityp-Filter für die Dialoge ('.json', da Chrome Mehrfach-Endungen ablehnt). */
  private readonly pickerTypes = [
    { description: 'GatterPLUS-Projekt', accept: { 'application/json': ['.json'] } },
  ];

  /**
   * Zuletzt exportierte oder geöffnete Datei (FileSystemFileHandle, nur
   * Chrome/Edge). „Speichern" schreibt direkt hierhin; null = unbekannt.
   */
  private fileHandle: any = null;

  /** Aktuelles Projekt in die zuletzt benutzte Datei speichern (sonst wie „Speichern unter"). */
  async onSave(): Promise<void> {
    if (!this.fileHandle) return this.onSaveAs();
    await this.writeProject(this.fileHandle);
  }

  /** Schreibt das aktuelle Projekt in die Datei hinter dem Handle. */
  private async writeProject(handle: any): Promise<void> {
    const writable = await handle.createWritable();
    await writable.write(serializeProject(this.whiteboardRef.getProjectData()));
    await writable.close();
  }

  /** Projektdatei auswählen, prüfen und ins Whiteboard laden. */
  async onOpen(): Promise<void> {
    const picked = await this.pickFile(this.pickerTypes, '.json');
    if (picked === null) return;

    try {
      this.whiteboardRef.loadProject(parseProject(await picked.file.text()));
    } catch (e) {
      alert(`Die Datei konnte nicht geöffnet werden.\n\n${(e as Error).message}`);
      return;
    }
    // Erst nach erfolgreichem Laden: „Speichern" schreibt ab jetzt in diese Datei
    this.fileHandle = picked.handle;
    // loadProject() beendet ggf. die Simulation → Toolbar-Anzeige nachziehen
    this.simulationMode = this.whiteboardRef.simulationMode;
    this.activeTool     = this.whiteboardRef.toolMode;
  }

  /** Aktuelles Projekt als Datei speichern (Export). */
  async onSaveAs(): Promise<void> {
    const text = serializeProject(this.whiteboardRef.getProjectData());
    const name = `schaltung${PROJECT_FILE_EXTENSION}`;
    const w = window as any;

    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({ suggestedName: name, types: this.pickerTypes });
        await this.writeProject(handle);
        this.fileHandle = handle;
      } catch (e) {
        if ((e as DOMException)?.name !== 'AbortError') throw e;
      }
      return;
    }

    this.downloadBlob(new Blob([text], { type: 'application/json' }), name);
  }

  /** Gesamte Schaltung als PNG-Bild speichern (ohne Punktraster). */
  async onExportPng(): Promise<void> {
    const blob = await this.whiteboardRef.exportPng();
    if (!blob) {
      alert('Die Schaltung ist leer – es gibt nichts zu exportieren.');
      return;
    }
    const name = 'schaltung.png';
    const w = window as any;

    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'PNG-Bild', accept: { 'image/png': ['.png'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (e) {
        if ((e as DOMException)?.name !== 'AbortError') throw e;
      }
      return;
    }

    this.downloadBlob(blob, name);
  }

  /** Fallback ohne File System Access API: Datei per Download-Link speichern. */
  private downloadBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * LogikSim-Datei (.sim) importieren. Nicht exakt Übernommenes wird gemeldet.
   * Die .sim-Datei wird NICHT als Speicherziel gemerkt — „Speichern" fragt
   * danach nach einer neuen GatterPLUS-Datei (die .sim bleibt unverändert).
   */
  async onImportLogikSim(): Promise<void> {
    const types = [{ description: 'LogikSim-Schaltung', accept: { 'application/octet-stream': ['.sim'] } }];
    const picked = await this.pickFile(types, '.sim');
    if (picked === null) return;

    let result;
    try {
      result = await parseLogikSim(new Uint8Array(await picked.file.arrayBuffer()));
      this.whiteboardRef.loadProject(result.project);
    } catch (e) {
      alert(`Die Datei konnte nicht importiert werden.\n\n${(e as Error).message}`);
      return;
    }
    this.fileHandle     = null;
    this.simulationMode = this.whiteboardRef.simulationMode;
    this.activeTool     = this.whiteboardRef.toolMode;
    if (result.warnings.length > 0) {
      alert(`Import abgeschlossen, mit Hinweisen:\n\n• ${result.warnings.join('\n• ')}`);
    }
  }

  /**
   * Öffnet einen Datei-Dialog und liefert Datei + Handle (null = abgebrochen).
   * Im Fallback gibt es keinen Handle (null) → „Speichern" lädt dann neu herunter.
   */
  private async pickFile(types: object[], accept: string): Promise<{ file: File; handle: any } | null> {
    const w = window as any;
    if (w.showOpenFilePicker) {
      try {
        const [handle] = await w.showOpenFilePicker({ types });
        return { file: await handle.getFile(), handle };
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return null; // Dialog abgebrochen
        throw e;
      }
    }

    // Fallback: verstecktes <input type="file">
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => {
        const file = input.files?.[0];
        resolve(file ? { file, handle: null } : null);
      };
      input.click();
    });
  }
}

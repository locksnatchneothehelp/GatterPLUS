import { Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core';
import { ThemeService } from '../../services/theme.service';

/** Name eines Menüs in der Leiste. */
export type MenuName = 'datei' | 'bearbeiten' | 'hilfe';

/**
 * Klassische Desktop-Menüleiste (wie LogikSim 0.6.4).
 *
 * Enthält die Menüs „Datei", „Bearbeiten" und „Hilfe" mit Klick-Dropdowns
 * sowie rechts einen Umschalter für Light/Dark Mode.
 *
 * Verhalten:
 * - Klick auf einen Menütitel öffnet das zugehörige Dropdown.
 * - Erneuter Klick auf denselben Titel schließt es wieder.
 * - Es ist immer nur ein Dropdown gleichzeitig geöffnet.
 * - Ein Klick irgendwo außerhalb der Menüleiste schließt das offene Dropdown.
 *
 * „Öffnen", „Speichern" und „Speichern unter" werden als Outputs nach außen gemeldet
 * (Logik in app.ts). Die übrigen Datei-Aktionen sind noch Platzhalter (console.log).
 * Die Bearbeiten-Aktionen (Undo/Redo/Copy/Paste) nutzen die bereits im
 * Whiteboard vorhandene echte Logik — sie kommen als Outputs von außen
 * (siehe app.ts: onUndo/onRedo/onCopy/onPaste).
 */
@Component({
  selector: 'app-menu-bar',
  standalone: true,
  imports: [],
  templateUrl: './menu-bar.html',
  styleUrl: './menu-bar.scss',
})
export class MenuBar {
  private readonly themeService = inject(ThemeService);

  /**
   * Name des aktuell geöffneten Menüs oder null, wenn kein Dropdown offen ist.
   */
  openMenu: MenuName | null = null;

  /** Ob Undo/Redo/Paste im Bearbeiten-Menü aktuell möglich sind (steuert Deaktivierung). */
  @Input() canUndo  = false;
  @Input() canRedo  = false;
  @Input() canPaste = false;

  /** Wird ausgelöst, wenn der Benutzer den jeweiligen Bearbeiten-Eintrag anklickt. */
  @Output() undoClicked  = new EventEmitter<void>();
  @Output() redoClicked  = new EventEmitter<void>();
  @Output() copyClicked  = new EventEmitter<void>();
  @Output() pasteClicked = new EventEmitter<void>();

  /** Datei-Aktionen „Öffnen" (Import), „Speichern" und „Speichern unter" (Export). */
  @Output() openClicked   = new EventEmitter<void>();
  @Output() saveClicked   = new EventEmitter<void>();
  @Output() saveAsClicked = new EventEmitter<void>();
  /** Datei-Aktion „Als PNG exportieren". */
  @Output() exportPngClicked = new EventEmitter<void>();
  /** Datei-Aktion „Importieren (LogikSim)" (.sim-Datei). */
  @Output() importLogikSimClicked = new EventEmitter<void>();

  /** True, wenn gerade Dark Mode aktiv ist (für das Umschalt-Icon). */
  get isDark(): boolean {
    return this.themeService.isDark;
  }

  /**
   * Öffnet oder schließt ein Menü.
   * Klick auf den bereits offenen Titel schließt ihn (Toggle-Verhalten).
   */
  toggleMenu(menu: MenuName, event: MouseEvent): void {
    event.stopPropagation(); // verhindert sofortiges Schließen durch document-Listener
    this.openMenu = this.openMenu === menu ? null : menu;
  }

  /** Schließt jedes offene Dropdown. */
  closeMenu(): void {
    this.openMenu = null;
  }

  /**
   * Schließt das Menü bei einem Klick irgendwo im Dokument.
   * (Klicks auf Menütitel stoppen die Propagation und lösen dies nicht aus.)
   */
  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeMenu();
  }

  /** Escape schließt ebenfalls das offene Menü. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  /** Wechselt zwischen Light und Dark Mode. */
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  // ─── Bearbeiten-Aktionen ────────────────────────────────────────────────────
  // Rufen die bereits vorhandene echte Undo/Redo/Copy/Paste-Logik im Whiteboard
  // auf (weitergeleitet über die Outputs). Bei deaktivierten Einträgen (z.B.
  // kein Undo möglich) wird nichts ausgelöst.

  onUndo(): void {
    if (!this.canUndo) return;
    this.undoClicked.emit();
    this.closeMenu();
  }

  onRedo(): void {
    if (!this.canRedo) return;
    this.redoClicked.emit();
    this.closeMenu();
  }

  onCopy(): void {
    this.copyClicked.emit();
    this.closeMenu();
  }

  onPaste(): void {
    if (!this.canPaste) return;
    this.pasteClicked.emit();
    this.closeMenu();
  }

  // ─── Datei-Aktionen ────────────────────────────────────────────────────────
  // Öffnen/Speichern/Speichern unter → Outputs; die übrigen sind noch Platzhalter.

  onNew():        void { console.log('[Menü] Neu');                this.closeMenu(); }
  onOpen():       void { this.openClicked.emit();                  this.closeMenu(); }
  onSave():       void { this.saveClicked.emit();                  this.closeMenu(); }
  onSaveAs():     void { this.saveAsClicked.emit();                this.closeMenu(); }
  onExportPng():  void { this.exportPngClicked.emit();             this.closeMenu(); }
  onImportLws():  void { this.importLogikSimClicked.emit();        this.closeMenu(); }
  onConvertLws(): void { console.log('[Menü] Konvertieren (LWS)'); this.closeMenu(); }
  onExit():       void { console.log('[Menü] Beenden');            this.closeMenu(); }

  // ─── Hilfe-Aktionen (Platzhalter) ──────────────────────────────────────────

  onAbout(): void { console.log('[Menü] About'); this.closeMenu(); }
}

import { ChangeDetectorRef, Component, EventEmitter, HostListener, inject, Input, Output } from '@angular/core';
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
  private readonly cdr          = inject(ChangeDetectorRef);

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

  /** Datei-Aktion „Neu" (leeres Whiteboard, Rückfrage in App). */
  @Output() newClicked    = new EventEmitter<void>();
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

  /** Escape schließt ebenfalls das offene Menü (und das Hilfe-Fenster). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
    this.helpOpen = false;
  }

  private themeSwitchToken = 0;

  /**
   * Wechselt zwischen hellem und dunklem Design. Übergang: das neue Design
   * breitet sich als Kreis vom Schalter aus (View Transitions API, Chrome/Edge);
   * ohne Unterstützung oder bei „Bewegung reduzieren“ sofortiger Wechsel.
   */
  toggleTheme(event?: MouseEvent): void {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
    };
    const root = document.documentElement;
    // Eigene CSS-Übergänge (Hintergrundfarben von Menü, Toolbar, Minimap …) während
    // des Umschaltens aus: sonst stehen sie im neuen Bild noch auf der alten Farbe
    // und springen erst danach um (Flackern).
    root.classList.add('theme-switching');
    const token = ++this.themeSwitchToken; // nur der zuletzt gestartete Wechsel räumt auf
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!doc.startViewTransition || reduce || !event) {
      this.themeService.toggleTheme();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (token === this.themeSwitchToken) root.classList.remove('theme-switching');
      }));
      return;
    }
    // Kreismitte (Schalter) und Radius für die CSS-Animation @keyframes theme-reveal
    // (styles.scss). Bewusst CSS statt Web Animations in transition.ready: so ist das
    // neue Bild schon im ersten Frame beschnitten – sonst blitzte es kurz ganz auf.
    const btn = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = btn.left + btn.width / 2, y = btn.top + btn.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-r', `${Math.ceil(r)}px`);
    const transition = doc.startViewTransition(() => {
      this.themeService.toggleTheme();
      this.cdr.detectChanges(); // Schalter schon im neuen Bild in der neuen Stellung
    });
    // Schnelles Doppelklicken bricht den ersten Übergang ab – dessen Ende darf die
    // Klasse nicht entfernen, solange der zweite noch läuft
    transition.finished.finally(() => {
      if (token === this.themeSwitchToken) root.classList.remove('theme-switching');
    });
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
  // Alle Datei-Aktionen werden über Outputs an die App weitergereicht.

  onNew():        void { this.newClicked.emit();                   this.closeMenu(); }
  onOpen():       void { this.openClicked.emit();                  this.closeMenu(); }
  onSave():       void { this.saveClicked.emit();                  this.closeMenu(); }
  onSaveAs():     void { this.saveAsClicked.emit();                this.closeMenu(); }
  onExportPng():  void { this.exportPngClicked.emit();             this.closeMenu(); }
  onImportLws():  void { this.importLogikSimClicked.emit();        this.closeMenu(); }

  // ─── Hilfe-Aktionen (Platzhalter) ──────────────────────────────────────────

  onAbout(): void { console.log('[Menü] About'); this.closeMenu(); }

  /** Hilfe-Fenster „Steuerung & Tastenkürzel“ sichtbar? */
  helpOpen = false;

  onHelp(): void { this.helpOpen = true; this.closeMenu(); }
}

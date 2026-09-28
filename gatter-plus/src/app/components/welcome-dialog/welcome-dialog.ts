import { Component, EventEmitter, HostListener, Output } from '@angular/core';

/** localStorage-Schlüssel: Willkommensbildschirm beim Start nicht mehr zeigen. */
const HIDDEN_KEY = 'gatterplus-welcome-hidden';

/** Soll der Willkommensbildschirm beim Start erscheinen? (Browser merkt sich die Wahl) */
export function showWelcomeOnStart(): boolean {
  try { return localStorage.getItem(HIDDEN_KEY) !== '1'; } catch { return true; }
}

/**
 * Willkommensbildschirm beim Start der Software (auch über Hilfe →
 * Willkommensbildschirm). Schließt per Esc oder „Los geht's“; „Beispiel
 * öffnen“ und „LogikSim importieren“ melden sich per Output bei der App.
 */
@Component({
  selector: 'app-welcome-dialog',
  imports: [],
  templateUrl: './welcome-dialog.html',
  styleUrl: './welcome-dialog.scss',
})
export class WelcomeDialog {
  /** Nutzer hat den Willkommensbildschirm geschlossen. */
  @Output() close = new EventEmitter<void>();
  /** Beispielschaltung laden. */
  @Output() example = new EventEmitter<void>();
  /** LogikSim-Datei importieren. */
  @Output() importLogikSim = new EventEmitter<void>();

  /** Häkchen „Beim Start nicht mehr anzeigen“. */
  hideOnStart = !showWelcomeOnStart();

  setHideOnStart(hide: boolean): void {
    this.hideOnStart = hide;
    try {
      if (hide) localStorage.setItem(HIDDEN_KEY, '1'); else localStorage.removeItem(HIDDEN_KEY);
    } catch { /* ohne localStorage: Wahl gilt nur für diese Sitzung */ }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

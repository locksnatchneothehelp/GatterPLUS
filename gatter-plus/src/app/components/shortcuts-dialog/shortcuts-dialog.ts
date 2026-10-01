import { Component, EventEmitter, HostListener, Output } from '@angular/core';
import { KeyboardMap } from '../keyboard-map/keyboard-map';

/** localStorage-Schlüssel: Tastenkürzel-Bildschirm beim Start nicht mehr zeigen. */
const HIDDEN_KEY = 'gatterplus-shortcuts-hidden';

/** Soll der Tastenkürzel-Bildschirm beim Start erscheinen? (Browser merkt sich die Wahl) */
export function showShortcutsOnStart(): boolean {
  try { return localStorage.getItem(HIDDEN_KEY) !== '1'; } catch { return true; }
}

/**
 * Tastenkürzel-Bildschirm: erscheint beim Start nach dem Willkommensbildschirm
 * (egal welcher Knopf) und zeigt die Tastatur-Abbildung aus der Hilfe.
 * Schließt per Esc oder „Verstanden“.
 */
@Component({
  selector: 'app-shortcuts-dialog',
  imports: [KeyboardMap],
  templateUrl: './shortcuts-dialog.html',
  styleUrl: './shortcuts-dialog.scss',
})
export class ShortcutsDialog {
  /** Nutzer hat den Bildschirm geschlossen. */
  @Output() close = new EventEmitter<void>();

  /** Häkchen „Beim Start nicht mehr anzeigen“. */
  hideOnStart = !showShortcutsOnStart();

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

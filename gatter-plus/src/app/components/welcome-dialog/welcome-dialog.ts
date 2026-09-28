import { Component, EventEmitter, HostListener, Output } from '@angular/core';

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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

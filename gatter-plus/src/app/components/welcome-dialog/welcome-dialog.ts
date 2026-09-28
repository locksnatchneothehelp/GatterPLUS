import { Component, EventEmitter, HostListener, Output } from '@angular/core';

/**
 * Willkommensbildschirm beim Start der Software.
 *
 * Wird von der App beim Start eingeblendet und schließt per ✕, Esc oder den
 * Knopf „Los geht's“ (Output `close`). Der Inhalt ist vorerst ein Platzhalter.
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}

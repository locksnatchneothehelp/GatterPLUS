import { Injectable } from '@angular/core';

/**
 * Verfügbare Theme-Namen.
 *
 * Als String-Union gehalten, damit später weitere Themes (z.B. 'high-contrast',
 * 'sepia') einfach ergänzt werden können — ohne die Service-Logik zu ändern.
 * Es muss dann nur ein passender `:root[data-theme="…"]`-Block in styles.scss
 * hinzugefügt werden.
 */
export type ThemeName = 'light' | 'dark';

/**
 * Zentrale Theme-Verwaltung für GatterPLUS.
 *
 * Prinzip:
 *   Der Service setzt ausschließlich das Attribut `data-theme` am <html>-Element.
 *   Alle Farben liegen als CSS Custom Properties in styles.scss und reagieren
 *   auf dieses Attribut. Dadurch muss hier keine einzelne Farbe angefasst werden
 *   und der Wechsel ist ohne Neuladen sofort wirksam.
 *
 * Persistenz:
 *   Die Auswahl wird im localStorage gespeichert und beim Start wieder geladen.
 *   Zugriffe auf localStorage/document sind abgesichert (try/catch bzw.
 *   typeof-Prüfung), damit der Service auch in Test-/SSR-Umgebungen ohne
 *   Browser-Globals nicht abstürzt.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** localStorage-Schlüssel unter dem das gewählte Theme abgelegt wird. */
  static readonly STORAGE_KEY = 'gatterplus-theme';

  /** Standard-Theme falls nichts gespeichert ist. */
  static readonly DEFAULT_THEME: ThemeName = 'light';

  /** Aktuell aktives Theme. */
  private current: ThemeName = ThemeService.DEFAULT_THEME;

  /** Aktuell aktives Theme (nur lesend). */
  get theme(): ThemeName {
    return this.current;
  }

  /** Praktischer Getter für Templates: ist gerade Dark Mode aktiv? */
  get isDark(): boolean {
    return this.current === 'dark';
  }

  /**
   * Lädt das gespeicherte Theme (oder das Standard-Theme) und wendet es an.
   * Sollte einmalig beim Anwendungsstart aufgerufen werden.
   * @returns das tatsächlich angewendete Theme
   */
  loadTheme(): ThemeName {
    let saved: ThemeName | null = null;
    try {
      const value = localStorage.getItem(ThemeService.STORAGE_KEY);
      if (value === 'light' || value === 'dark') {
        saved = value;
      }
    } catch {
      // localStorage kann im privaten Modus / in Tests fehlen — dann Standard nutzen
    }
    this.setTheme(saved ?? ThemeService.DEFAULT_THEME);
    return this.current;
  }

  /**
   * Setzt ein bestimmtes Theme, wendet es sofort an und speichert die Auswahl.
   */
  setTheme(theme: ThemeName): void {
    this.current = theme;
    // Attribut am <html>-Element steuert zentral alle CSS Custom Properties
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    this.saveTheme();
  }

  /**
   * Wechselt zwischen Light und Dark Mode.
   * @returns das nun aktive Theme
   */
  toggleTheme(): ThemeName {
    this.setTheme(this.current === 'light' ? 'dark' : 'light');
    return this.current;
  }

  /**
   * Speichert das aktuelle Theme dauerhaft im localStorage.
   */
  saveTheme(): void {
    try {
      localStorage.setItem(ThemeService.STORAGE_KEY, this.current);
    } catch {
      // Speichern fehlgeschlagen (z.B. deaktivierter Storage) — nicht kritisch
    }
  }
}

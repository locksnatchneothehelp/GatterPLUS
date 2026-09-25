import { ThemeService } from './theme.service';

// ─── Browser-Globals nachbilden ───────────────────────────────────────────────
// Vitest läuft in einer Node-Umgebung ohne document/localStorage. Wir bauen
// minimale Fakes, damit der Service getestet werden kann.

/** Einfaches localStorage-Fake auf Map-Basis. */
function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem:    (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem:    (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear:      () => map.clear(),
    _map: map, // für Assertions im Test
  };
}

/** document-Fake, das nur documentElement.setAttribute unterstützt. */
function makeFakeDocument() {
  const attrs: Record<string, string> = {};
  return {
    documentElement: {
      setAttribute: (name: string, value: string) => { attrs[name] = value; },
      getAttribute: (name: string) => attrs[name] ?? null,
      _attrs: attrs, // für Assertions im Test
    },
  };
}

describe('ThemeService', () => {
  let service: ThemeService;
  let storage: ReturnType<typeof makeFakeStorage>;
  let doc: ReturnType<typeof makeFakeDocument>;

  beforeEach(() => {
    storage = makeFakeStorage();
    doc = makeFakeDocument();
    // Globals injizieren
    (globalThis as any).localStorage = storage;
    (globalThis as any).document = doc;
    service = new ThemeService();
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).document;
  });

  // ── Grundzustand ─────────────────────────────────────────────────────────

  it('startet standardmäßig im Light Mode', () => {
    expect(service.theme).toBe('light');
    expect(service.isDark).toBe(false);
  });

  // ── setTheme ─────────────────────────────────────────────────────────────

  it('setTheme() setzt das Theme und das data-theme-Attribut', () => {
    service.setTheme('dark');
    expect(service.theme).toBe('dark');
    expect(service.isDark).toBe(true);
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('setTheme() speichert die Auswahl im localStorage', () => {
    service.setTheme('dark');
    expect(storage.getItem(ThemeService.STORAGE_KEY)).toBe('dark');
  });

  // ── toggleTheme ──────────────────────────────────────────────────────────

  it('toggleTheme() wechselt zwischen Light und Dark', () => {
    expect(service.theme).toBe('light');
    expect(service.toggleTheme()).toBe('dark');
    expect(service.toggleTheme()).toBe('light');
  });

  it('toggleTheme() aktualisiert das data-theme-Attribut', () => {
    service.toggleTheme();
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    service.toggleTheme();
    expect(doc.documentElement.getAttribute('data-theme')).toBe('light');
  });

  // ── loadTheme ────────────────────────────────────────────────────────────

  it('loadTheme() lädt ein gespeichertes Theme', () => {
    storage.setItem(ThemeService.STORAGE_KEY, 'dark');
    expect(service.loadTheme()).toBe('dark');
    expect(service.theme).toBe('dark');
  });

  it('loadTheme() fällt bei fehlendem Wert auf das Standard-Theme zurück', () => {
    expect(service.loadTheme()).toBe('light');
  });

  it('loadTheme() ignoriert ungültige gespeicherte Werte', () => {
    storage.setItem(ThemeService.STORAGE_KEY, 'banana');
    expect(service.loadTheme()).toBe('light');
  });

  // ── saveTheme ────────────────────────────────────────────────────────────

  it('saveTheme() schreibt das aktuelle Theme in den Storage', () => {
    service.setTheme('dark');
    storage.clear();
    service.saveTheme();
    expect(storage.getItem(ThemeService.STORAGE_KEY)).toBe('dark');
  });

  // ── Robustheit ohne Browser-Globals ───────────────────────────────────────

  it('stürzt nicht ab, wenn localStorage nicht verfügbar ist', () => {
    delete (globalThis as any).localStorage;
    expect(() => service.setTheme('dark')).not.toThrow();
    expect(service.theme).toBe('dark');
  });
});

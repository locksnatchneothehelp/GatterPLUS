import { GATE_BASE_SIZE, GateInstance, WireConnection } from './gate.model';

/**
 * Projektdatei-Format von GatterPLUS (Export/Import, Phase 5).
 *
 * Gespeichert wird der AUFBAU der Schaltung (Bauteile, Leitungen, Ansicht),
 * bewusst NICHT der Laufzeit-Zustand der Simulation (Schalterstellungen,
 * Flip-Flop-Speicher) — nach dem Laden startet eine Schaltung immer im
 * Grundzustand. Die Simulation behandelt fehlende Werte als LOW (`?? false`).
 */

/** Kennung im Dateikopf — schützt davor, fremde JSON-Dateien zu laden. */
export const PROJECT_FILE_FORMAT    = 'gatterplus';
/** Formatversion — bei inkompatiblen Änderungen hochzählen. */
export const PROJECT_FILE_VERSION   = 1;
/** Dateiendung für Export/Import. */
export const PROJECT_FILE_EXTENSION = '.gatterplus.json';

/** Ansichtszustand des Whiteboards (Verschiebung + Zoom). */
export interface ProjectView {
  panX: number;
  panY: number;
  zoom: number;
}

/** Inhalt einer Projektdatei (ohne Kopf-Kennung). */
export interface ProjectData {
  gates: GateInstance[];
  wires: WireConnection[];
  view:  ProjectView;
}

/**
 * Wandelt ein Projekt in den Dateiinhalt (formatiertes JSON) um.
 * Laufzeit-Felder (inputValue, ffState, ffPrevClock) werden entfernt.
 */
export function serializeProject(data: ProjectData): string {
  const gates = data.gates.map(({ inputValue, ffState, ffPrevClock, ...rest }) => rest);
  return JSON.stringify(
    {
      format:  PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      gates,
      wires:   data.wires,
      view:    data.view,
    },
    null,
    2,
  );
}

/**
 * Liest einen Dateiinhalt ein und prüft die Grundstruktur.
 * Wirft einen Error mit verständlicher (deutscher) Meldung, wenn die Datei
 * keine gültige GatterPLUS-Projektdatei ist.
 */
export function parseProject(text: string): ProjectData {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.');
  }

  if (!raw || raw.format !== PROJECT_FILE_FORMAT) {
    throw new Error('Die Datei ist keine GatterPLUS-Projektdatei.');
  }
  if (raw.version !== PROJECT_FILE_VERSION) {
    throw new Error(`Nicht unterstützte Dateiversion: ${raw.version}.`);
  }
  if (!Array.isArray(raw.gates) || !Array.isArray(raw.wires)) {
    throw new Error('Die Projektdatei ist unvollständig (Bauteile oder Leitungen fehlen).');
  }

  // Unbekannte Typen würden beim Rendern abstürzen (GATE_BASE_SIZE[type]).
  const gateIds = new Set<string>();
  for (const g of raw.gates) {
    if (typeof g?.id !== 'string' || !(g.type in GATE_BASE_SIZE)
        || typeof g.x !== 'number' || typeof g.y !== 'number') {
      throw new Error(`Ungültiges Bauteil in der Projektdatei: ${JSON.stringify(g)}`);
    }
    gateIds.add(g.id);
  }
  // Leitungen müssen auf vorhandene Bauteile zeigen.
  for (const w of raw.wires) {
    if (typeof w?.id !== 'string' || !gateIds.has(w.fromGateId) || !gateIds.has(w.toGateId)) {
      throw new Error(`Ungültige Leitung in der Projektdatei: ${JSON.stringify(w)}`);
    }
  }

  const v = raw.view;
  if (typeof v?.panX !== 'number' || typeof v.panY !== 'number' || typeof v.zoom !== 'number') {
    throw new Error('Die Projektdatei enthält keine gültige Ansicht (panX, panY, zoom).');
  }

  return {
    gates: raw.gates,
    wires: raw.wires,
    view:  { panX: v.panX, panY: v.panY, zoom: v.zoom },
  };
}

// River Watch configuration. Nothing secret lives here: the Anthropic key is pasted by the user
// into the settings box and kept only in their browser (see brain.js).

export const SHEET_ID = "17rEoTPrySBwY3lQngmYzxDQPWpAAM0UuSqYL8bN5xMo";
export const SHEET_GID = "0";
// Plain CSV export: no type guessing (Google's gviz endpoint can blank a text value typed into a
// mostly-empty column, e.g. "orange" in warning_override).
export const sheetCsvUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}&t=${Date.now()}`;
export const sheetViewUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${SHEET_GID}`;

export const SHEET_COLUMNS = ["town", "county", "river", "crew_based_here", "barrier_sets", "pumps", "sandbags",
  "staff_on_call", "flow_override_m3s", "warning_override", "notes"];

export const FLOOD_API = "https://flood-api.open-meteo.com/v1/flood";
export const TIMEZONE = "Europe/Dublin";

// Flood Plan Rule 6: the three crews and the towns each may work in.
export const CREWS = {
  Clonmel: ["Clonmel", "Fermoy", "Enniscorthy"],
  Mallow: ["Mallow", "Fermoy", "Bandon"],
  Athlone: ["Athlone", "Carrick-on-Shannon", "Ennis"],
};
export const TOWNS_PER_CREW = 2;

export const ANTHROPIC_VERSION = "2026-10-21";
export const MAX_TOKENS = 4000;
export const EFFORT = "medium";

export const DISCLAIMER = "AI can make mistakes; a person makes the final decision.";

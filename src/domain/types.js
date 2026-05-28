/** Shared enum-like constants used by server, planner, UI payloads and tests. */
export const COMMAND_PROVENANCE = Object.freeze({
  ORIGINAL: 'original',
  INFERRED: 'inferred',
  SKILL_REUSE: 'skill_reuse',
  USER_EDITED: 'user_edited'
});

export const ITEM_TYPE = Object.freeze({
  PRECONDITION: 'precondition',
  STEP: 'step'
});

export const TARGET = Object.freeze({
  LOCAL: 'local',
  HOST: 'host',
  DEVICE: 'device'
});

export function nowIso() {
  return new Date().toISOString();
}

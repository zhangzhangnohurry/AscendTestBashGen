/**
 * Normalizes a saved skill intent for de-duplicating user-confirmed skills.
 * This is not used to interpret raw test-case source; model-based matching is
 * still responsible for deciding whether a skill applies to a new item.
 */
export function normalizeIntent(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

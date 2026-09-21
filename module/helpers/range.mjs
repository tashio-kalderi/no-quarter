/**
 * A range typed as a bare number, such as "60", becomes "60 ft.". Anything else
 * is left as typed.
 * @param {string} range
 * @returns {string}
 */
export function formatRange(range) {
  const trimmed = String(range ?? '').trim();
  return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed} ft.` : range;
}

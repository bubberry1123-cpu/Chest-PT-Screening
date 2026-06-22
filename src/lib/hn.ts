// ── HN (Hospital Number) formatting ────────────────────────────────────────────
// Canonical display format is XX-XX-XXXXXX (2 + 2 + 6 = 10 digits), e.g. 01-26-006768.
// The database stores HN as digits only (no dashes); dashes are added at display time,
// so legacy records like "0126006768" render correctly without a data migration.

/** Strip dashes/spaces and lowercase — used for storage and dash-insensitive matching. */
export function normalizeHn(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\s-]/g, '').toLowerCase()
}

/** Keep digits only, capped at 10 — used while typing in the HN input. */
export function digitsOnlyHn(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, 10)
}

/**
 * Format an HN for display as XX-XX-XXXXXX.
 * - Accepts already-dashed or digit-only input.
 * - Groups the first 2 and next 2 digits, with everything else in the final group,
 *   so partial / legacy lengths still render sensibly.
 * - Non-numeric HNs (e.g. alphanumeric) are returned trimmed and unchanged.
 */
export function formatHn(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const compact = s.replace(/[\s-]/g, '')
  if (!/^\d+$/.test(compact)) return s // leave non-numeric HNs as-is
  const d = compact.slice(0, 10)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`
}

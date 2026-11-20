/** Shared guards for untrusted browser storage, backups, and API responses. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidRecordId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback
}

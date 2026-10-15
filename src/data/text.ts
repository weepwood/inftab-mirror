export function truncateCodePoints(value: string, maxCodePoints: number): string {
  return Array.from(value).slice(0, Math.max(0, Math.floor(maxCodePoints))).join('')
}

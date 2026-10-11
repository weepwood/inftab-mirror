import type { CountdownItem } from '../types'

const dayInMilliseconds = 24 * 60 * 60 * 1000

export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined || year < 1900 || year > 9999) return false
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toDayNumber(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / dayInMilliseconds)
}

export function daysUntilCountdown(item: CountdownItem, now = new Date()): number {
  const [year, month, day] = item.date.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined || !isValidCalendarDate(item.date)) return 0

  const today = toDayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate())
  let target = toDayNumber(year, month, day)
  if (item.recurrence === 'yearly') {
    let targetYear = Math.max(year, now.getFullYear())
    let targetDay = Math.min(day, daysInMonth(targetYear, month))
    target = toDayNumber(targetYear, month, targetDay)
    if (target < today) {
      targetYear += 1
      targetDay = Math.min(day, daysInMonth(targetYear, month))
      target = toDayNumber(targetYear, month, targetDay)
    }
  }
  return target - today
}

export function formatCountdown(item: CountdownItem, now = new Date()): string {
  const days = daysUntilCountdown(item, now)
  if (days === 0) return '今天'
  if (days > 0) return `还有 ${days} 天`
  return `已过去 ${Math.abs(days)} 天`
}

export interface CalendarDay {
  date: Date
  dateKey: string
  day: number
  inCurrentMonth: boolean
}

function localDate(year: number, month: number, day: number) {
  const date = new Date(0)
  date.setFullYear(year, month, day)
  date.setHours(0, 0, 0, 0)
  return date
}

export function toLocalDateKey(date: Date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCalendarDays(year: number, month: number): CalendarDay[] {
  const firstDay = localDate(year, month, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = localDate(firstDay.getFullYear(), firstDay.getMonth(), 1 - mondayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = localDate(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    return {
      date,
      dateKey: toLocalDateKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === firstDay.getMonth(),
    }
  })
}

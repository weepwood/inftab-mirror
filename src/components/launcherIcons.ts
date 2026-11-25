import type { Component } from 'vue'
import { Bookmark, CalendarDays, CalendarCheck, Calculator, CloudSun, History, Image, ListTodo, PartyPopper, Settings, StickyNote, Timer } from '@lucide/vue'

// Shared by the launcher grid and Dock so built-in tools keep a consistent identity.
export const launcherIcons: Record<string, Component> = {
  bookmarks: Bookmark,
  history: History,
  calendar: CalendarDays,
  calculator: Calculator,
  weather: CloudSun,
  countdowns: PartyPopper,
  habits: ListTodo,
  todos: ListTodo,
  'focus-timer': Timer,
  notes: StickyNote,
  settings: Settings,
  wallpaper: Image,
}

export const desktopHabitIcon = CalendarCheck

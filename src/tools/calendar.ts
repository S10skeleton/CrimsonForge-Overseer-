/**
 * Google Calendar tool
 * Fetches today's events and upcoming meetings
 */

import { google } from 'googleapis'
import { createOAuthClient, isGoogleConfigured } from '../lib/google-auth.js'
import type { ToolResult, AgentTool } from '../types/index.js'

// ─── Types ────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  description?: string
  attendees: string[]
  isAllDay: boolean
  htmlLink?: string
}

export interface CalendarData {
  todayEvents: CalendarEvent[]
  upcomingEvents: CalendarEvent[]   // next 7 days, excluding today
  timezone: string
  checkedAt: string
}

// ─── Runner ───────────────────────────────────────────────────────────────

export async function runCalendarCheck(): Promise<ToolResult<CalendarData>> {
  const timestamp = new Date().toISOString()
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'
  const tz = process.env.TIMEZONE || 'America/Denver'

  if (!isGoogleConfigured()) {
    return {
      tool: 'calendar',
      success: false,
      timestamp,
      data: { todayEvents: [], upcomingEvents: [], timezone: tz, checkedAt: timestamp },
      error: 'Google OAuth not configured.',
    }
  }

  try {
    const auth = createOAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    // Build time range: start of today → 8 days from now
    const now = new Date()
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)

    const eightDaysOut = new Date(now)
    eightDaysOut.setDate(eightDaysOut.getDate() + 8)
    eightDaysOut.setHours(23, 59, 59, 999)

    const eventsRes = await calendar.events.list({
      calendarId,
      timeMin: startOfToday.toISOString(),
      timeMax: eightDaysOut.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })

    const items = eventsRes.data.items || []
    const allEvents: CalendarEvent[] = items.map((item) => {
      const isAllDay = !item.start?.dateTime
      const start = item.start?.dateTime || item.start?.date || ''
      const end = item.end?.dateTime || item.end?.date || ''

      return {
        id: item.id || '',
        title: item.summary || '(no title)',
        start,
        end,
        location: item.location || undefined,
        description: item.description
          ? item.description.replace(/<[^>]*>/g, '').slice(0, 200)
          : undefined,
        attendees: (item.attendees || [])
          .map((a) => a.email || a.displayName || '')
          .filter(Boolean),
        isAllDay,
        htmlLink: item.htmlLink || undefined,
      }
    })

    // Split into today vs upcoming
    const endOfTodayStr = endOfToday.toISOString()
    const todayEvents = allEvents.filter((e) => e.start <= endOfTodayStr)
    const upcomingEvents = allEvents.filter((e) => e.start > endOfTodayStr)

    return {
      tool: 'calendar',
      success: true,
      timestamp,
      data: {
        todayEvents,
        upcomingEvents: upcomingEvents.slice(0, 15),
        timezone: tz,
        checkedAt: timestamp,
      },
    }
  } catch (err) {
    return {
      tool: 'calendar',
      success: false,
      timestamp,
      data: { todayEvents: [], upcomingEvents: [], timezone: tz, checkedAt: timestamp },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AI Tool Definition ────────────────────────────────────────────────────

export const calendarTool: AgentTool = {
  name: 'check_calendar',
  description:
    "Fetches today's events and upcoming meetings from Google Calendar for the next 7 days.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  execute: async () => runCalendarCheck(),
}

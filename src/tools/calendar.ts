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

// ─── Create Event ──────────────────────────────────────────────────────────

async function createCalendarEvent(params: {
  summary: string
  description?: string
  start: string
  end: string
  attendees?: string[]
  location?: string
}): Promise<{ id: string; htmlLink: string; summary: string }> {
  const auth = createOAuthClient()
  const calendar = google.calendar({ version: 'v3', auth })
  const tz = process.env.TIMEZONE || 'America/Denver'

  const res = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: { dateTime: params.start, timeZone: tz },
      end: { dateTime: params.end, timeZone: tz },
      attendees: params.attendees?.map((email) => ({ email })),
    },
    sendUpdates: params.attendees?.length ? 'all' : 'none',
  })

  return {
    id: res.data.id!,
    htmlLink: res.data.htmlLink!,
    summary: res.data.summary!,
  }
}

export const createCalendarEventTool: AgentTool = {
  name: 'create_calendar_event',
  description:
    'Create a new Google Calendar event. Use for scheduling meetings, deadlines, or reminders. Always confirm event details with the user before creating unless all details were explicitly provided.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Event title' },
      description: { type: 'string', description: 'Optional event description or notes' },
      start: {
        type: 'string',
        description: 'Start time in ISO 8601 format with timezone offset, e.g. "2026-03-11T09:00:00-07:00"',
      },
      end: {
        type: 'string',
        description: 'End time in ISO 8601 format with timezone offset',
      },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional attendee email addresses — invites will be sent automatically',
      },
      location: { type: 'string', description: 'Optional location or video call link' },
    },
    required: ['summary', 'start', 'end'],
  },
  execute: async (input) => {
    try {
      const result = await createCalendarEvent(input as {
        summary: string
        description?: string
        start: string
        end: string
        attendees?: string[]
        location?: string
      })
      return {
        tool: 'create_calendar_event',
        success: true,
        timestamp: new Date().toISOString(),
        data: result,
      }
    } catch (err) {
      return {
        tool: 'create_calendar_event',
        success: false,
        timestamp: new Date().toISOString(),
        data: {},
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

// ─── Update Event ──────────────────────────────────────────────────────────

async function updateCalendarEvent(params: {
  eventId: string
  summary?: string
  description?: string
  start?: string
  end?: string
  location?: string
}): Promise<{ id: string; htmlLink: string; summary: string }> {
  const auth = createOAuthClient()
  const calendar = google.calendar({ version: 'v3', auth })
  const tz = process.env.TIMEZONE || 'America/Denver'
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary'

  const existing = await calendar.events.get({ calendarId, eventId: params.eventId })

  const updated = {
    ...existing.data,
    ...(params.summary && { summary: params.summary }),
    ...(params.description && { description: params.description }),
    ...(params.location && { location: params.location }),
    ...(params.start && { start: { dateTime: params.start, timeZone: tz } }),
    ...(params.end && { end: { dateTime: params.end, timeZone: tz } }),
  }

  const res = await calendar.events.update({
    calendarId,
    eventId: params.eventId,
    requestBody: updated,
  })

  return {
    id: res.data.id!,
    htmlLink: res.data.htmlLink!,
    summary: res.data.summary!,
  }
}

export const updateCalendarEventTool: AgentTool = {
  name: 'update_calendar_event',
  description:
    'Update an existing Google Calendar event by event ID. Get the event ID from check_calendar first.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Google Calendar event ID' },
      summary: { type: 'string', description: 'New event title' },
      description: { type: 'string', description: 'New event description' },
      start: { type: 'string', description: 'New start time in ISO 8601 format' },
      end: { type: 'string', description: 'New end time in ISO 8601 format' },
      location: { type: 'string', description: 'New location or video call link' },
    },
    required: ['eventId'],
  },
  execute: async (input) => {
    try {
      const result = await updateCalendarEvent(input as {
        eventId: string
        summary?: string
        description?: string
        start?: string
        end?: string
        location?: string
      })
      return {
        tool: 'update_calendar_event',
        success: true,
        timestamp: new Date().toISOString(),
        data: result,
      }
    } catch (err) {
      return {
        tool: 'update_calendar_event',
        success: false,
        timestamp: new Date().toISOString(),
        data: {},
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

// ─── Delete Event ──────────────────────────────────────────────────────────

async function deleteCalendarEvent(params: {
  eventId: string
}): Promise<{ deleted: boolean; eventId: string }> {
  const auth = createOAuthClient()
  const calendar = google.calendar({ version: 'v3', auth })

  await calendar.events.delete({
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    eventId: params.eventId,
  })

  return { deleted: true, eventId: params.eventId }
}

export const deleteCalendarEventTool: AgentTool = {
  name: 'delete_calendar_event',
  description:
    'Delete a Google Calendar event by event ID. Always confirm with the user before deleting.',
  input_schema: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Google Calendar event ID' },
    },
    required: ['eventId'],
  },
  execute: async (input) => {
    try {
      const result = await deleteCalendarEvent(input as { eventId: string })
      return {
        tool: 'delete_calendar_event',
        success: true,
        timestamp: new Date().toISOString(),
        data: result,
      }
    } catch (err) {
      return {
        tool: 'delete_calendar_event',
        success: false,
        timestamp: new Date().toISOString(),
        data: {},
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

/**
 * Google Contacts tool
 * Searches contacts by name to resolve email addresses
 */

import { google } from 'googleapis'
import { createOAuthClient, isGoogleConfigured } from '../lib/google-auth.js'
import type { AgentTool } from '../types/index.js'

export interface Contact {
  name: string
  email: string
  company?: string
}

export async function searchContacts(query: string): Promise<Contact[]> {
  if (!isGoogleConfigured()) return []

  try {
    const auth = createOAuthClient()
    const people = google.people({ version: 'v1', auth })

    const res = await people.people.searchContacts({
      query,
      readMask: 'names,emailAddresses,organizations',
      pageSize: 5,
    })

    const results = res.data.results || []
    const contacts: Contact[] = []

    for (const r of results) {
      const person = r.person
      if (!person) continue

      const name = person.names?.[0]?.displayName
      const email = person.emailAddresses?.[0]?.value
      const company = person.organizations?.[0]?.name ?? undefined

      if (name && email) {
        contacts.push({ name, email, company })
      }
    }

    return contacts
  } catch (err) {
    console.error('[contacts] Search failed:', err)
    return []
  }
}

// ─── List All Contacts ────────────────────────────────────────────────────

async function listAllContacts(maxResults = 50): Promise<Array<{ name: string; email: string; phone: string; organization: string }>> {
  const auth = createOAuthClient()
  const people = google.people({ version: 'v1', auth })

  const res = await people.people.connections.list({
    resourceName: 'people/me',
    pageSize: Math.min(maxResults, 200),
    personFields: 'names,emailAddresses,phoneNumbers,organizations',
    sortOrder: 'FIRST_NAME_ASCENDING',
  })

  return (res.data.connections || []).map((person) => ({
    name: person.names?.[0]?.displayName || '(no name)',
    email: person.emailAddresses?.[0]?.value || '',
    phone: person.phoneNumbers?.[0]?.value || '',
    organization: person.organizations?.[0]?.name || '',
  }))
}

export const listContactsTool: AgentTool = {
  name: 'list_contacts',
  description: 'List all Google contacts. Use when the user wants to browse contacts or isn\'t sure of the exact name.',
  input_schema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: 'Maximum contacts to return (default 50, max 200)',
      },
    },
    required: [],
  },
  execute: async (input) => {
    const { maxResults } = input as { maxResults?: number }
    try {
      const contacts = await listAllContacts(maxResults || 50)
      return {
        tool: 'list_contacts',
        success: true,
        timestamp: new Date().toISOString(),
        data: { contacts, total: contacts.length },
      }
    } catch (err) {
      return {
        tool: 'list_contacts',
        success: false,
        timestamp: new Date().toISOString(),
        data: { contacts: [], total: 0 },
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

export const contactsSearchTool: AgentTool = {
  name: 'search_contacts',
  description: 'Search Google Contacts by name to find someone\'s email address. Use this before sending email if you don\'t already know their email.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Name to search for, e.g. "Steve Fisher" or just "Steve"',
      },
    },
    required: ['query'],
  },
  execute: async (input) => {
    const contacts = await searchContacts(input.query as string)
    return {
      tool: 'search_contacts',
      success: true,
      timestamp: new Date().toISOString(),
      data: contacts,
    }
  },
}

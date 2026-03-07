/**
 * Brave web search tool
 * Searches the web for current information: competitors, industry news,
 * investor research, or any factual question requiring live data.
 */

import type { ToolResult, AgentTool } from '../types/index.js'

// ─── Types ────────────────────────────────────────────────────────────────

interface BraveResult {
  title: string
  url: string
  description: string
  age?: string
}

interface SearchData {
  query: string
  results: BraveResult[]
  totalResults: number
}

// ─── Core logic ────────────────────────────────────────────────────────────

async function runWebSearch(query: string, count = 5): Promise<ToolResult<SearchData>> {
  const timestamp = new Date().toISOString()

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    return {
      tool: 'web_search',
      success: false,
      timestamp,
      data: { query, results: [], totalResults: 0 },
      error: 'BRAVE_SEARCH_API_KEY not configured.',
    }
  }

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', query)
    url.searchParams.set('count', String(Math.min(count, 10)))
    url.searchParams.set('safesearch', 'moderate')
    url.searchParams.set('freshness', 'pm') // past month by default

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) throw new Error(`Brave API error: ${res.status}`)

    const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description?: string; age?: string }>; totalEstimatedMatches?: number } }
    const results: BraveResult[] = (data.web?.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description || '',
      age: r.age,
    }))

    return {
      tool: 'web_search',
      success: true,
      timestamp,
      data: {
        query,
        results,
        totalResults: data.web?.totalEstimatedMatches || results.length,
      },
    }
  } catch (err) {
    return {
      tool: 'web_search',
      success: false,
      timestamp,
      data: { query, results: [], totalResults: 0 },
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─── AgentTool definition ─────────────────────────────────────────────────

export const webSearchTool: AgentTool = {
  name: 'web_search',
  description: `Search the web for current information. Use for:
    - Competitor news (Tekmetric, Shopmonkey, Mitchell, etc.)
    - Automotive industry news and trends
    - Investor research (VCs, funds, people)
    - Any factual question requiring current data
    - CFP-related news or mentions
    Returns top results with titles, URLs, and descriptions.`,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query. Be specific for better results.' },
      count: { type: 'number', description: 'Number of results to return (1-10, default 5)' },
    },
    required: ['query'],
  },
  execute: async (input) => {
    const { query, count } = input as { query: string; count?: number }
    return runWebSearch(query, count)
  },
}

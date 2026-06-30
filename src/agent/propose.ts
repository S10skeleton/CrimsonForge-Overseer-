/**
 * Propose-mode (Ask-Elara safety model). Risky tools — anything that sends,
 * leaves the building, or is destructive — must NOT execute inside the agent
 * loop when invoked from the panel chat bubble. Instead they return a structured
 * PROPOSAL; the bubble shows an Approve/Edit/Cancel card; only the separate,
 * audited /api/elara/action endpoint performs the real write (running the same
 * tool with propose-mode OFF).
 *
 * Implemented with AsyncLocalStorage so concurrent chat requests don't share a
 * flag. Slack/other callers run outside the store → risky tools execute as today.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ToolResult, AgentTool } from '../types/index.js'

export interface Proposal {
  kind: string                      // = the underlying tool name (executeAction re-runs it)
  summary: string                   // human-readable "here's what I'll do"
  payload: Record<string, unknown>  // the tool input (editable before approval)
  editable?: string[]               // which payload fields the bubble may edit
}

interface Ctx { propose: boolean; proposals: Proposal[] }
const store = new AsyncLocalStorage<Ctx>()

export function inProposeMode(): boolean {
  return store.getStore()?.propose === true
}

/** Run `fn` with propose-mode on; collect any proposals the tools staged. */
export async function runWithPropose<T>(fn: () => Promise<T>): Promise<{ result: T; proposals: Proposal[] }> {
  const ctx: Ctx = { propose: true, proposals: [] }
  const result = await store.run(ctx, fn)
  return { result, proposals: ctx.proposals }
}

/** Stage a proposal (no mutation) and return it as the tool result. */
export function proposeAction(p: Proposal): ToolResult {
  store.getStore()?.proposals.push(p)
  return {
    tool: p.kind,
    success: true,
    timestamp: new Date().toISOString(),
    data: { proposal: true, kind: p.kind, summary: p.summary, payload: p.payload, editable: p.editable ?? [] },
  }
}

/**
 * Wrap a risky AgentTool so it proposes (instead of executing) while in
 * propose-mode, and runs normally otherwise. `summarize` builds the card text.
 */
export function proposable(tool: AgentTool, summarize: (input: Record<string, unknown>) => string, editable?: string[]): AgentTool {
  return {
    ...tool,
    execute: async (input: Record<string, unknown>) => {
      if (inProposeMode()) return proposeAction({ kind: tool.name, summary: summarize(input), payload: input, editable })
      return tool.execute(input)
    },
  }
}

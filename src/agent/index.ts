/**
 * AI Agent Entry Point
 * Scaffold for future Anthropic API integration
 */

import type { AgentContext, MorningBriefing } from '../types/index.js'
import { allAgentTools } from '../tools/index.js'

// ─── Agent Execution ──────────────────────────────────────────────────────

/**
 * Called when a Slack message comes in directed at the agent
 * Returns a string response to post back to Slack
 */
export async function runAgent(
  userMessage: string,
  _recentBriefing?: MorningBriefing
): Promise<string> {
  // TODO: Wire up Anthropic API here
  //
  // Steps when implementing:
  // 1. npm install @anthropic-ai/sdk
  // 2. const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  // 3. Build context from _recentBriefing + userMessage using buildContext()
  // 4. Pass allAgentTools as tools parameter
  // 5. Handle tool_use responses by calling tool.execute()
  // 6. Loop until stop_reason === 'end_turn'
  //
  // See src/agent/README.md for full implementation guide

  return (
    `[Agent not yet active] Message received: "${userMessage}". ` +
    `Add ANTHROPIC_API_KEY to enable AI responses.`
  )
}

// ─── Context Building ─────────────────────────────────────────────────────

/**
 * Builds the context object for the AI agent
 */
export function buildContext(_briefing?: MorningBriefing): AgentContext {
  return {
    systemPrompt: `You are the ops agent for Crimson Forge, an AI-powered 
automotive shop management platform. You monitor infrastructure health, 
shop activity, and surface problems to the founder.

You have access to tools that check uptime, query the database, 
read error logs, and inspect the codebase. Use them to give accurate, 
specific answers. Never guess — always check the tools first.

Current infrastructure:
- Frontend: Netlify (crimsonforge.pro)
- Backend: Railway
- Database: Supabase
- Error tracking: Sentry
- AI: Anthropic Claude API

When responding:
- Be concise and direct
- Always provide specific numbers and dates when available
- Suggest actions to fix problems
- If something is unclear, ask for clarification or use tools to investigate`,
    availableTools: allAgentTools,
    recentBriefing: _briefing,
  }
}

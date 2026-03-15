/**
 * Shared type definitions for Crimson Forge Ops system
 */

// ─── Health Monitoring ─────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

/**
 * Result every tool must return
 */
export interface ToolResult<T = unknown> {
  tool: string           // tool name, e.g. "uptime"
  success: boolean       // did the tool itself execute without error
  timestamp: string      // ISO string
  data: T                // tool-specific payload
  error?: string         // if success is false, why
}

// ─── Uptime Tool ──────────────────────────────────────────────────────────

export interface UptimeData {
  url: string
  status: HealthStatus
  responseMs: number | null
  statusCode: number | null
}

// ─── Supabase Tool ────────────────────────────────────────────────────────

export interface SupabaseData {
  connectionStatus: HealthStatus
  totalShops: number
  activeShopsLast24h: number
  ticketsCreatedLast24h: number
  aiSessionsLast24h: number
  silentShops: SilentShop[]  // shops with no activity in N days
  shopStatuses: ShopStatus[]
}

export interface SilentShop {
  shopId: string
  shopName: string
  lastActivityAt: string | null
  daysSilent: number
}

export interface ShopStatus {
  shopId: string
  shopName: string
  createdAt: string
  daysSinceSignup: number
  ticketsLast24h: number
  lastTicketAt: string | null
  daysSinceActive: number
  isNewShop: boolean        // true if signed up within last 7 days
}

// ─── Sentry Tool ──────────────────────────────────────────────────────────

export interface SentryData {
  newIssueCount: number
  unresolvedCount: number
  recentIssues: SentryIssue[]
}

export interface SentryIssue {
  id: string
  title: string
  level: 'fatal' | 'error' | 'warning'
  count: number
  firstSeen: string
  lastSeen: string
  url: string
}

// ─── Railway Tool ─────────────────────────────────────────────────────────

export interface RailwayData {
  status: HealthStatus
  latestDeploymentStatus: string | null
  latestDeploymentAt: string | null
}

// ─── Email Tool ───────────────────────────────────────────────────────────

export interface EmailData {
  status: HealthStatus
  unreadCount: number
  lastCheckAt: string
}

// ─── Stripe Tool ──────────────────────────────────────────────────────────

export interface StripeWebhookHealth {
  url: string
  status: 'healthy' | 'degraded' | 'unknown'
  enabledEvents: number
}

export interface StripePaymentFailure {
  customerId: string
  customerEmail: string
  amount: number
  currency: string
  failureMessage: string
  failedAt: string
}

export interface StripeData {
  activeSubscriptions: number
  mrr: number
  newThisMonth: number
  cancelledThisMonth: number
  webhookHealth: StripeWebhookHealth | null
  paymentFailures: StripePaymentFailure[]
  hasWebhookIssues: boolean
  hasPaymentFailures: boolean
}

// ─── GitHub Tool ──────────────────────────────────────────────────────────

export interface GitHubData {
  status: HealthStatus
}

// ─── Morning Briefing ──────────────────────────────────────────────────────

export interface MorningBriefing {
  timestamp: string
  overallStatus: HealthStatus
  uptime: ToolResult<UptimeData[]>
  supabase: ToolResult<SupabaseData>
  sentry: ToolResult<SentryData>
  railway: ToolResult<RailwayData>
  email: ToolResult<EmailData>
  stripe?: ToolResult<StripeData>
  alerts: Alert[]
}

export interface Alert {
  severity: 'critical' | 'warning' | 'info'
  tool: string
  message: string
  details?: string
  actionUrl?: string
}

// ─── AI Agent Types ────────────────────────────────────────────────────────

/**
 * Tool definition format compatible with Anthropic's tool_use API
 */
export interface AgentTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
  // The actual function to call when the agent invokes this tool
  execute: (input: Record<string, unknown>) => Promise<ToolResult>
}

/**
 * Agent context passed with every Anthropic API call
 */
export interface AgentContext {
  systemPrompt: string
  availableTools: AgentTool[]
  recentBriefing?: MorningBriefing
}

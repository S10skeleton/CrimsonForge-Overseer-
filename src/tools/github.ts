/**
 * GitHub tool — expanded
 * Read-only. Commit watching, doc debt detection, branch awareness.
 */

import type { ToolResult, AgentTool } from '../types/index.js'

const GITHUB_TOKEN = () => process.env.GITHUB_TOKEN
const GITHUB_OWNER = () => process.env.GITHUB_OWNER || 'S10skeleton'
const GITHUB_REPOS = () => [process.env.GITHUB_REPO || 'CrimsonForgePro']

function githubHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN()}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CrimsonForge-Overseer',
  }
}

export interface CommitInfo {
  sha: string
  message: string
  author: string
  date: string
  url: string
  filesChanged: string[]
}

export interface RepoStatus {
  repo: string
  defaultBranch: string
  stagingAheadBy: number | null
  latestCommit: CommitInfo | null
  openPRs: number
}

// Maps file path patterns to docs that go stale
const DOC_DEBT_MAP: Record<string, string[]> = {
  'obd':        ['AI_Architecture.pdf', 'Product_Overview.pdf', 'OBD_Scanner_Strategy.pdf'],
  'agent':      ['AI_Architecture.pdf', 'Product_Overview.pdf'],
  'onboard':    ['Onboarding_Checklist.pdf'],
  'auth':       ['Security_Brief.pdf', 'Onboarding_Checklist.pdf'],
  'pricing':    ['Investment_Summary.pdf', 'Competitive_Landscape.pdf'],
  'supabase':   ['Security_Brief.pdf', 'Data_Strategy.pdf'],
  'vault':      ['AutoVault_Companion_Plan.pdf', 'Investment_Summary.pdf'],
  'mobile':     ['Product_Overview.pdf', '30Day_Roadmap.pdf'],
  'scan':       ['Product_Overview.pdf', 'OBD_Scanner_Strategy.pdf'],
  'inspection': ['Product_Overview.pdf', 'Onboarding_Checklist.pdf'],
  'vin':        ['Product_Overview.pdf', '30Day_Roadmap.pdf'],
  'schema':     ['Data_Strategy.pdf', 'Security_Brief.pdf'],
  'roadmap':    ['30Day_Roadmap.pdf'],
}

export function detectDocDebt(filesChanged: string[]): string[] {
  const stale = new Set<string>()
  for (const file of filesChanged) {
    const lower = file.toLowerCase()
    for (const [keyword, docs] of Object.entries(DOC_DEBT_MAP)) {
      if (lower.includes(keyword)) docs.forEach(d => stale.add(d))
    }
  }
  return Array.from(stale)
}

async function githubFetch(path: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(10_000),
  })
}

export async function getRecentCommits(repo: string, branch = 'main', limit = 5): Promise<ToolResult<CommitInfo[]>> {
  const timestamp = new Date().toISOString()
  const owner = GITHUB_OWNER()
  if (!GITHUB_TOKEN()) {
    return { tool: 'github_commits', success: false, timestamp, data: [], error: 'GITHUB_TOKEN not set' }
  }
  try {
    const res = await githubFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}`)
    if (!res.ok) throw new Error(`GitHub API: ${res.statusText}`)
    const commits = await res.json() as Array<Record<string, unknown>>
    const result: CommitInfo[] = []
    for (const c of commits) {
      let filesChanged: string[] = []
      try {
        const dr = await githubFetch(`/repos/${owner}/${repo}/commits/${(c as {sha:string}).sha}`)
        if (dr.ok) {
          const d = await dr.json() as { files?: Array<{filename:string}> }
          filesChanged = (d.files || []).map(f => f.filename)
        }
      } catch { /* skip */ }
      result.push({
        sha: ((c as {sha:string}).sha || '').slice(0, 7),
        message: ((c as {commit:{message:string}}).commit?.message || '').split('\n')[0],
        author: (c as {commit:{author:{name:string}}}).commit?.author?.name || 'unknown',
        date: (c as {commit:{author:{date:string}}}).commit?.author?.date || '',
        url: (c as {html_url:string}).html_url || '',
        filesChanged,
      })
    }
    return { tool: 'github_commits', success: true, timestamp, data: result }
  } catch (err) {
    return { tool: 'github_commits', success: false, timestamp, data: [], error: err instanceof Error ? err.message : 'Unknown' }
  }
}

export async function getRepoStatus(repo: string): Promise<ToolResult<RepoStatus>> {
  const timestamp = new Date().toISOString()
  const owner = GITHUB_OWNER()
  if (!GITHUB_TOKEN()) {
    return { tool: 'github_status', success: false, timestamp, data: { repo, defaultBranch: 'main', stagingAheadBy: null, latestCommit: null, openPRs: 0 }, error: 'GITHUB_TOKEN not set' }
  }
  try {
    const repoRes = await githubFetch(`/repos/${owner}/${repo}`)
    if (!repoRes.ok) throw new Error(`GitHub API: ${repoRes.statusText}`)
    const repoData = await repoRes.json() as { default_branch: string }
    const defaultBranch = repoData.default_branch || 'main'
    const prsRes = await githubFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=1`)
    const openPRs = prsRes.ok ? (await prsRes.json() as unknown[]).length : 0
    const commitsResult = await getRecentCommits(repo, defaultBranch, 1)
    const latestCommit = commitsResult.success && commitsResult.data.length > 0 ? commitsResult.data[0] : null
    let stagingAheadBy: number | null = null
    try {
      const cr = await githubFetch(`/repos/${owner}/${repo}/compare/${defaultBranch}...staging`)
      if (cr.ok) {
        const cd = await cr.json() as { ahead_by: number }
        stagingAheadBy = cd.ahead_by ?? 0
      }
    } catch { /* staging may not exist */ }
    return { tool: 'github_status', success: true, timestamp, data: { repo, defaultBranch, stagingAheadBy, latestCommit, openPRs } }
  } catch (err) {
    return { tool: 'github_status', success: false, timestamp, data: { repo, defaultBranch: 'main', stagingAheadBy: null, latestCommit: null, openPRs: 0 }, error: err instanceof Error ? err.message : 'Unknown' }
  }
}

export async function checkAllRepos(): Promise<ToolResult<RepoStatus[]>> {
  const timestamp = new Date().toISOString()

  if (!GITHUB_TOKEN()) {
    return { tool: 'github_all_repos', success: false, timestamp, data: [], error: 'GITHUB_TOKEN not set' }
  }

  const repos = GITHUB_REPOS()
  if (repos.length === 0 || (repos.length === 1 && repos[0] === '')) {
    return { tool: 'github_all_repos', success: false, timestamp, data: [], error: 'GITHUB_REPOS not configured' }
  }

  const results = await Promise.allSettled(repos.map(r => getRepoStatus(r)))

  const statuses: RepoStatus[] = []
  const errors: string[] = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const repoName = repos[i]
    if (r.status === 'fulfilled') {
      if (r.value.success) {
        statuses.push(r.value.data)
      } else {
        errors.push(`${repoName}: ${r.value.error || 'unknown error'}`)
        console.error(`[github] Repo failed: ${repoName} —`, r.value.error)
      }
    } else {
      errors.push(`${repoName}: ${r.reason}`)
      console.error(`[github] Repo rejected: ${repoName} —`, r.reason)
    }
  }

  if (statuses.length === 0) {
    return {
      tool: 'github_all_repos',
      success: false,
      timestamp,
      data: [],
      error: `All repos failed: ${errors.join(' | ')}`,
    }
  }

  return {
    tool: 'github_all_repos',
    success: true,
    timestamp,
    data: statuses,
    ...(errors.length > 0 ? { error: `Partial failure: ${errors.join(' | ')}` } : {}),
  }
}

export const githubCommitsTool: AgentTool = {
  name: 'get_github_commits',
  description: 'Get recent commits from a GitHub repo. Returns commits and detects which docs may now be stale.',
  input_schema: { type: 'object', properties: { repo: { type: 'string' }, branch: { type: 'string' }, limit: { type: 'number' } }, required: ['repo'] },
  execute: async (input) => {
    const result = await getRecentCommits(input.repo as string, (input.branch as string) || 'main', (input.limit as number) || 5)
    if (result.success) {
      const allFiles = result.data.flatMap(c => c.filesChanged)
      const staleDoc = detectDocDebt(allFiles)
      return { ...result, data: { commits: result.data, potentiallyStaleDoc: staleDoc } as unknown as CommitInfo[] }
    }
    return result
  },
}

export const githubStatusTool: AgentTool = {
  name: 'get_github_status',
  description: 'Get status of all CFP GitHub repos — latest commits, staging vs main gap, open PRs.',
  input_schema: { type: 'object', properties: {}, required: [] },
  execute: async () => checkAllRepos(),
}

export const githubTool = githubStatusTool

export async function runGitHubCheck(): Promise<ToolResult<RepoStatus[]>> {
  return checkAllRepos()
}

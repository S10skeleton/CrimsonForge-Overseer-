/**
 * CRM pipeline + stage definitions — single source of truth for the kanban
 * columns and write-time validation. Stages are ordered; adding one is a
 * one-line edit here.
 */

export const PIPELINES = {
  fundraising: ['prospect', 'intro', 'nda', 'data_room', 'partner_meeting', 'diligence', 'term_sheet', 'closed_won', 'closed_lost'],
  enterprise: ['prospect', 'qualified', 'pilot', 'poc', 'contract', 'live', 'lost'],
  partnership: ['prospect', 'agreement_sent', 'signed', 'active', 'churned'],
} as const

export type Pipeline = keyof typeof PIPELINES

export const PIPELINE_KEYS = Object.keys(PIPELINES) as Pipeline[]

export function isPipeline(p: string): p is Pipeline {
  return Object.prototype.hasOwnProperty.call(PIPELINES, p)
}

export function stagesFor(pipeline: string): readonly string[] {
  return isPipeline(pipeline) ? PIPELINES[pipeline] : []
}

export function defaultStage(pipeline: string): string {
  return stagesFor(pipeline)[0] ?? 'prospect'
}

export function isValidStage(pipeline: string, stage: string): boolean {
  return stagesFor(pipeline).includes(stage)
}

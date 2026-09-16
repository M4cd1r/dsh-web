/**
 * Sidebar row model: converts the host overview document into the typed rows
 * the sidebar panel renders. Pure and provider-agnostic — locale copy arrives
 * as callbacks, so the model is testable without DOM or dictionaries.
 * @module @linxin666/dsh-usage/core/sidebar-model
 */

import type { ProviderSnapshotView, UsageOverviewView } from './types.ts'

/** One plan quota window rendered as a progress bar. */
export interface SidebarWindowRow {
  /** Stable window key from the host (`5h`, `week`, `month`, provider strings otherwise). */
  key: string
  /** Localized window label. */
  label: string
  /** Used percent clamped to 0-100. */
  percent: number
  /** ISO 8601 reset instant, when the provider reported one. */
  resetsAt?: string
}

/** One provider row of the sidebar panel. */
export type SidebarProviderRow =
  | {
      kind: 'plan'
      provider: string
      displayName: string
      planName?: string
      windows: SidebarWindowRow[]
      error?: string
    }
  | {
      kind: 'balance'
      provider: string
      displayName: string
      balanceText: string
      error?: string
    }
  | {
      kind: 'muted'
      provider: string
      displayName: string
      note: string
      error?: string
    }

/** Format a balance for display: symbol prefix when known, code suffix otherwise. */
export function formatBalance(currency: string, totalBalance: string): string {
  const code = currency.toUpperCase()
  if (code === 'CNY') return `¥${totalBalance}`
  if (code === 'USD') return `$${totalBalance}`
  return `${totalBalance} ${code}`
}

/**
 * Build the sidebar rows from one overview document. Plan windows win over
 * balances; only windows with a numeric percent become bars; providers with
 * neither fact become a muted row carrying caller-supplied copy.
 * @param overview - the host overview; `null` (no data yet) yields no rows.
 * @param windowLabel - localizes one window (`(key, name) => label`).
 * @param mutedNote - copy for providers without a balance or plan fact.
 */
export function buildSidebarRows(
  overview: UsageOverviewView | null,
  windowLabel: (key: string, name?: string) => string,
  mutedNote: (provider: ProviderSnapshotView) => string,
): SidebarProviderRow[] {
  if (overview === null) return []
  const rows: SidebarProviderRow[] = []
  for (const provider of overview.providers) {
    const error = provider.error
    const windows: SidebarWindowRow[] = []
    for (const window of provider.plan?.windows ?? []) {
      if (typeof window.percent !== 'number' || !Number.isFinite(window.percent)) continue
      windows.push({
        key: window.key,
        label: windowLabel(window.key, window.name),
        percent: Math.max(0, Math.min(100, window.percent)),
        ...(window.resetsAt !== undefined ? { resetsAt: window.resetsAt } : {}),
      })
    }
    if (windows.length > 0) {
      rows.push({
        kind: 'plan',
        provider: provider.provider,
        displayName: provider.displayName,
        ...(provider.plan?.planName !== undefined ? { planName: provider.plan.planName } : {}),
        windows,
        ...(error !== undefined ? { error } : {}),
      })
    } else if (provider.balance !== undefined) {
      rows.push({
        kind: 'balance',
        provider: provider.provider,
        displayName: provider.displayName,
        balanceText: formatBalance(provider.balance.currency, provider.balance.totalBalance),
        ...(error !== undefined ? { error } : {}),
      })
    } else {
      rows.push({
        kind: 'muted',
        provider: provider.provider,
        displayName: provider.displayName,
        note: mutedNote(provider),
        ...(error !== undefined ? { error } : {}),
      })
    }
  }
  return rows
}
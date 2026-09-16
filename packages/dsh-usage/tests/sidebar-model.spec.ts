import { describe, expect, it } from 'vitest'
import { buildSidebarRows, formatBalance } from '../src/core/sidebar-model.ts'
import type { UsageOverviewView } from '../src/core/types.ts'

function overview(providers: UsageOverviewView['providers']): UsageOverviewView {
  return {
    updatedAt: 1,
    providers,
    current: { source: 'default' },
    usage: {
      today: { date: '2026-09-16', totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 0, cost: 0 }, providers: [] },
      days: [],
    },
  }
}

describe('formatBalance', () => {
  it('prefixes CNY and USD symbols', () => {
    expect(formatBalance('CNY', '12.34')).toBe('¥12.34')
    expect(formatBalance('USD', '3.10')).toBe('$3.10')
  })

  it('suffixes other currency codes', () => {
    expect(formatBalance('EUR', '4.00')).toBe('4.00 EUR')
  })

  it('is case-insensitive on the code', () => {
    expect(formatBalance('usd', '1.00')).toBe('$1.00')
  })
})

describe('buildSidebarRows', () => {
  const keyLabel = (key: string, name?: string): string => name ?? `label:${key}`

  it('turns plan windows into bar rows and keeps provider order', () => {
    const rows = buildSidebarRows(overview([
      {
        provider: 'opencode-go', displayName: 'OpenCode Go', credential: 'api-key', supported: true,
        plan: {
          windows: [{ key: '5h', percent: 40 }, { key: 'week', percent: 95, resetsAt: '2026-09-20T00:00:00Z' }],
          updatedAt: 1,
        },
      },
      {
        provider: 'deepseek', displayName: 'DeepSeek', credential: 'api-key', supported: true,
        balance: { currency: 'CNY', totalBalance: '12.34', updatedAt: 1 },
      },
      { provider: 'local', displayName: 'Local Relay', credential: 'none', supported: false },
    ]), keyLabel, () => 'muted-copy')

    expect(rows).toHaveLength(3)
    const [plan, balance, muted] = rows
    expect(plan.kind).toBe('plan')
    if (plan.kind !== 'plan') throw new Error('unreachable')
    expect(plan.windows.map((window) => window.key)).toEqual(['5h', 'week'])
    expect(plan.windows[0]).toMatchObject({ label: 'label:5h', percent: 40 })
    expect(plan.windows[1]).toMatchObject({ percent: 95, resetsAt: '2026-09-20T00:00:00Z' })

    expect(balance.kind).toBe('balance')
    if (balance.kind !== 'balance') throw new Error('unreachable')
    expect(balance.balanceText).toBe('¥12.34')

    expect(muted.kind).toBe('muted')
    if (muted.kind !== 'muted') throw new Error('unreachable')
    expect(muted.note).toBe('muted-copy')
  })

  it('uses the provider window name when present', () => {
    const rows = buildSidebarRows(overview([
      {
        provider: 'kimi-coding', displayName: 'Kimi For Coding', credential: 'api-key', supported: true,
        plan: { planName: 'Pro', windows: [{ key: 'week', name: 'Weekly', percent: 30 }], updatedAt: 1 },
      },
    ]), keyLabel, () => '')
    expect(rows[0]?.kind).toBe('plan')
    if (rows[0]?.kind !== 'plan') throw new Error('unreachable')
    expect(rows[0].planName).toBe('Pro')
    expect(rows[0].windows[0]?.label).toBe('Weekly')
  })

  it('skips percent-less windows and falls back to balance', () => {
    const rows = buildSidebarRows(overview([
      {
        provider: 'zenmux', displayName: 'ZenMux', credential: 'api-key', supported: true,
        plan: { windows: [{ key: '5h' }], updatedAt: 1 },
        balance: { currency: 'USD', totalBalance: '8.00', updatedAt: 1 },
      },
    ]), keyLabel, () => '')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('balance')
  })

  it('clamps percent into 0-100', () => {
    const rows = buildSidebarRows(overview([
      {
        provider: 'zai-coding', displayName: 'GLM Coding Plan', credential: 'api-key', supported: true,
        plan: { windows: [{ key: '5h', percent: 130 }, { key: 'week', percent: -4 }], updatedAt: 1 },
      },
    ]), keyLabel, () => '')
    if (rows[0]?.kind !== 'plan') throw new Error('unreachable')
    expect(rows[0].windows.map((window) => window.percent)).toEqual([100, 0])
  })

  it('carries the provider error line on plan and balance rows', () => {
    const rows = buildSidebarRows(overview([
      {
        provider: 'opencode-go', displayName: 'OpenCode Go', credential: 'api-key', supported: true, error: 'HTTP 401',
        plan: { windows: [{ key: '5h', percent: 10 }], updatedAt: 1 },
      },
    ]), keyLabel, () => '')
    if (rows[0]?.kind !== 'plan') throw new Error('unreachable')
    expect(rows[0].error).toBe('HTTP 401')
  })

  it('returns no rows for a null overview', () => {
    expect(buildSidebarRows(null, keyLabel, () => '')).toEqual([])
  })

  it('renders every provider, including unsupported ones, as a muted row', () => {
    const rows = buildSidebarRows(overview([
      {
        provider: 'relay', displayName: 'Relay', credential: 'none', supported: false,
        error: 'HTTP 500',
      },
    ]), keyLabel, (provider) => `note:${provider.credential}`)
    expect(rows[0]?.kind).toBe('muted')
    if (rows[0]?.kind !== 'muted') throw new Error('unreachable')
    expect(rows[0].note).toBe('note:none')
    expect(rows[0].error).toBe('HTTP 500')
  })
})
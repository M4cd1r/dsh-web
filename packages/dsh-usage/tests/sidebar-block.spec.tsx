/** @vitest-environment jsdom */

/**
 * Sidebar block smoke tests: the entry row and the panel land in the sidebar
 * family (panel directly after the row), rows render from the store snapshot
 * (plan bars, balance rows, muted notes), the collapse state toggles and
 * persists, the poll runs while expanded, and a missing host route reads as
 * "unavailable" instead of a raw transport error.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLAPSED_STORAGE_KEY, ENTRY_SELECTOR, PANEL_SELECTOR, mountUsageSidebarBlock } from '../src/client/sidebar-block.ts'
import { emptyTotals, type ProviderSnapshotView, type UsageOverviewView } from '../src/core/types.ts'
import type { UsageStoreInstance, UsageUiState } from '../src/client/usage-store.ts'
import css from '../src/client/sidebar.module.css'

/** A wire provider row with view defaults. */
function provider(row: Partial<ProviderSnapshotView> & Pick<ProviderSnapshotView, 'provider'>): ProviderSnapshotView {
  return { displayName: row.provider, credential: 'api-key', supported: true, ...row }
}

/** A minimal overview document with the given provider rows. */
function overview(providers: ProviderSnapshotView[]): UsageOverviewView {
  return {
    updatedAt: 1_700_000_000_000,
    providers,
    current: { provider: 'deepseek', model: '', source: 'live' },
    usage: {
      today: { date: '2026-09-16', totals: emptyTotals(), providers: [] },
      days: [],
    },
  }
}

/** Stable-reference store fake with a setter that notifies subscribers. */
function fakeStore(state: UsageUiState): { store: UsageStoreInstance; set: (next: UsageUiState) => void } {
  let current = state
  const listeners = new Set<() => void>()
  return {
    store: {
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      getSnapshot: () => current,
    } as unknown as UsageStoreInstance,
    set: (next: UsageUiState) => {
      current = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** The sidebar shell slice the injection expects: column > root > logo row > button. */
function shell(): void {
  document.body.innerHTML = '<aside data-pane="sidebar"><div class="sidebarRoot"><div class="logoRow"><button class="newSession">New session</button></div></div></aside>'
}

let dispose: (() => void) | undefined

beforeEach(() => {
  shell()
  localStorage.clear()
  document.documentElement.lang = 'en'
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const planOverview = overview([
  provider({
    provider: 'opencode-go',
    displayName: 'OpenCode Go',
    plan: { windows: [{ key: '5h', percent: 40 }, { key: 'week', percent: 95, resetsAt: '2026-09-20T00:00:00.000Z' }], updatedAt: 1 },
  }),
  provider({ provider: 'deepseek', displayName: 'DeepSeek', balance: { currency: 'USD', totalBalance: '12.34', updatedAt: 1 } }),
])

describe('mountUsageSidebarBlock', () => {
  it('mounts the entry row and places the panel directly after it', () => {
    const { store } = fakeStore({ snapshot: planOverview, status: 'ready', error: null })
    dispose = mountUsageSidebarBlock({ store, poll: () => {}, refresh: () => {} })

    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)
    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)
    expect(entry).not.toBeNull()
    expect(panel).not.toBeNull()
    expect(entry?.getAttribute('data-dsh-plugin')).toBe('usage')
    expect(entry?.getAttribute('data-dsh-part')).toBe('sidebar-entry')
    expect(panel?.getAttribute('data-dsh-part')).toBe('sidebar-panel')
    expect(panel?.previousElementSibling).toBe(entry)
    expect(panel?.parentElement).toBe(entry?.parentElement)
    expect(entry?.textContent).toContain('Usage')
    expect(entry?.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders plan bars and balance rows from the snapshot', () => {
    const { store } = fakeStore({ snapshot: planOverview, status: 'ready', error: null })
    dispose = mountUsageSidebarBlock({ store, poll: () => {}, refresh: () => {} })

    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)!
    expect(panel.textContent).toContain('OpenCode Go')
    expect(panel.textContent).toContain('5 hours')
    expect(panel.textContent).toContain('Weekly')
    expect(panel.textContent).toContain('40%')
    expect(panel.textContent).toContain('95%')
    expect(panel.textContent).toContain('DeepSeek')
    expect(panel.textContent).toContain('$12.34')

    const fills = panel.querySelectorAll<HTMLElement>(`.${css['barFill']}, .${css['barWarn']}, .${css['barLow']}`)
    expect(fills).toHaveLength(2)
    expect(fills[0]?.style.width).toBe('40%')
    expect(fills[1]?.className).toBe(css['barLow'])
  })

  it('renders a muted note for providers without a fact', () => {
    const { store } = fakeStore({
      snapshot: overview([provider({ provider: 'relay', displayName: 'Relay', credential: 'none', supported: false })]),
      status: 'ready',
      error: null,
    })
    dispose = mountUsageSidebarBlock({ store, poll: () => {}, refresh: () => {} })
    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)!
    expect(panel.textContent).toContain('Relay')
    expect(panel.textContent).toContain('No credential configured')
  })

  it('collapses and expands, persisting the choice', () => {
    const poll = vi.fn()
    const { store } = fakeStore({ snapshot: planOverview, status: 'ready', error: null })
    dispose = mountUsageSidebarBlock({ store, poll, refresh: () => {} })

    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)!
    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)!
    expect(panel.style.display).toBe('')
    expect(poll).toHaveBeenCalledTimes(1)

    entry.click()
    expect(panel.style.display).toBe('none')
    expect(entry.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBe('1')

    entry.click()
    expect(panel.style.display).toBe('')
    expect(entry.getAttribute('aria-expanded')).toBe('true')
    expect(localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBe('0')
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('mounts collapsed when the stored state says so', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, '1')
    const poll = vi.fn()
    const { store } = fakeStore({ snapshot: planOverview, status: 'ready', error: null })
    dispose = mountUsageSidebarBlock({ store, poll, refresh: () => {} })

    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)!
    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)!
    expect(panel.style.display).toBe('none')
    expect(entry.getAttribute('aria-expanded')).toBe('false')
    expect(poll).not.toHaveBeenCalled()
  })

  it('polls again while expanded and stops once collapsed', () => {
    vi.useFakeTimers()
    const poll = vi.fn()
    const { store } = fakeStore({ snapshot: planOverview, status: 'ready', error: null })
    dispose = mountUsageSidebarBlock({ store, poll, refresh: () => {} })
    expect(poll).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    expect(poll).toHaveBeenCalledTimes(2)

    document.querySelector<HTMLElement>(ENTRY_SELECTOR)!.click()
    vi.advanceTimersByTime(180_000)
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('reads a missing host route as unavailable', () => {
    const { store } = fakeStore({ snapshot: null, status: 'error', error: 'usage /api/dsh-usage/overview failed: 404' })
    dispose = mountUsageSidebarBlock({ store, poll: () => {}, refresh: () => {} })
    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)!
    expect(panel.textContent).toContain('Usage service unavailable')
  })

  it('re-renders when the store publishes a new snapshot', () => {
    const { store, set } = fakeStore({ snapshot: null, status: 'loading', error: null })
    dispose = mountUsageSidebarBlock({ store, poll: () => {}, refresh: () => {} })
    const panel = document.querySelector<HTMLElement>(PANEL_SELECTOR)!
    expect(panel.textContent).toContain('Loading usage data')

    set({ snapshot: planOverview, status: 'ready', error: null })
    expect(panel.textContent).toContain('$12.34')
  })

  it('removes the row and the panel on dispose', () => {
    const { store } = fakeStore({ snapshot: planOverview, status: 'ready', error: null })
    const unmount = mountUsageSidebarBlock({ store, poll: () => {}, refresh: () => {} })
    expect(document.querySelector(ENTRY_SELECTOR)).not.toBeNull()
    unmount()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
    expect(document.querySelector(PANEL_SELECTOR)).toBeNull()
  })
})
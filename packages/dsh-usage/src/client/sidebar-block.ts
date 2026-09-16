/**
 * dsh-usage sidebar block: one collapsible panel of per-provider remaining
 * quota, seated in the sidebar family between the Skill center entry and the
 * Workspaces browser.
 *
 * The toggle row mounts through the family's shared sidebar-entry-core (plain
 * DOM, self-healing, idempotent, no React tree in the sidebar); this module
 * owns everything below it: the panel element and its placement right after
 * the row, the render from the shared usage store, the 60 s overview poll
 * while expanded and visible, the manual probe refresh, and the collapse
 * state persisted to localStorage (default expanded).
 * @module @linxin666/dsh-usage/client/sidebar-block
 */

import type { ProviderSnapshotView } from '../core/types.ts'
import { buildSidebarRows, type SidebarProviderRow } from '../core/sidebar-model.ts'
import type { UsageStoreInstance } from './usage-store.ts'
import { t } from './locales.ts'
import css from './sidebar.module.css'
import { mountSidebarEntry } from './sidebar-entry-core.ts'
import { subscribeBodyInvalidations } from './body-mutations.ts'

/** Stable data attribute identifying the injected entry row (idempotency key). */
export const ENTRY_SELECTOR = '[data-dsh-usage-entry]'

/** Stable data attribute identifying the injected panel root. */
export const PANEL_SELECTOR = '[data-dsh-usage-panel]'

/** LocalStorage key remembering the collapsed state ('1' = collapsed). */
export const COLLAPSED_STORAGE_KEY = 'dsh-usage.sidebar.collapsed'

/** Poll cadence while the panel is expanded and the page is visible. */
export const BLOCK_POLL_MS = 60_000

/** How long the refresh button reports the in-flight probe cycle. */
const REFRESH_FEEDBACK_MS = 3_000

/** Gauge icon normalized to the shell's 18px navigation glyph size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 13.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/><path d="M8 8.5l2.3-2.4"/><circle cx="8" cy="8.5" r="1" fill="currentColor" stroke="none"/></svg>'

/** Collapse chevron appended to the core-built row. */
const CHEVRON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 6.2 2 2 2-2"/></svg>'

/** The block's inputs: the shared store plus the host transport actions. */
export interface UsageSidebarApi {
  /** The usage store the panel renders (shared with the settings section). */
  store: UsageStoreInstance
  /** Fetch one overview now (cheap; the host owns the real probe cycle). */
  poll: () => void
  /** Force one host probe cycle now. */
  refresh: () => void
  /** Locale-change source; re-renders the panel copy on a language switch. */
  locale?: { subscribe(listener: () => void): () => void }
}

/** Read the persisted collapse flag; default expanded. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Persist the collapse flag; a storage-less page keeps the in-memory state. */
function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Private mode / disabled storage: the block still toggles for this page.
  }
}

/** HH:MM for the updated line, empty when the runtime refuses the locale. */
function formatClock(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** Localized reset instant, undefined for an unparseable value. */
function formatReset(iso: string): string | undefined {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  try {
    return t('usage.plan.reset', { date: date.toLocaleString() })
  } catch {
    return undefined
  }
}

/** Bar tone by used percent, matching the settings section thresholds. */
function toneClass(percent: number): string {
  if (percent >= 90) return css['barLow'] as string
  if (percent >= 70) return css['barWarn'] as string
  return css['barFill'] as string
}

/** Copy for a provider the host has no fact for. */
function mutedNote(provider: ProviderSnapshotView): string {
  if (provider.credential === 'oauth') return t('usage.oauth')
  if (provider.credential === 'none') return t('usage.balance.noCredential')
  return t('usage.balance.unsupported')
}

/** Localized window label: the provider name when it sends one, else the key. */
function windowLabel(key: string, name?: string): string {
  if (name !== undefined && name !== '') return name
  return t(`usage.plan.windows.${key}`)
}

/**
 * Mount the sidebar block, waiting for the shell to render and self-healing
 * alongside the entry row on later React re-renders.
 * @param api - the store, transport actions and locale source.
 * @returns disposer removing the panel, the entry row and every observer.
 */
export function mountUsageSidebarBlock(api: UsageSidebarApi): () => void {
  if (typeof document === 'undefined') return () => {}
  // DOM-level idempotency: a second mount (duplicate apply, HMR re-injection)
  // leaves the existing block alone; a full reload is the reset.
  if (document.querySelector(PANEL_SELECTOR) !== null) return () => {}

  const panel = document.createElement('div')
  panel.className = css['panel'] ?? ''
  panel.setAttribute('data-dsh-usage-panel', '')
  panel.setAttribute('data-dsh-part', 'sidebar-panel')

  const header = document.createElement('div')
  header.className = css['panelHeader'] ?? ''
  const updatedLine = document.createElement('span')
  updatedLine.className = css['panelUpdated'] ?? ''
  const refreshBtn = document.createElement('button')
  refreshBtn.type = 'button'
  refreshBtn.className = css['refreshBtn'] ?? ''
  header.append(updatedLine, refreshBtn)

  const list = document.createElement('div')
  list.className = css['providerList'] ?? ''
  panel.append(header, list)

  let collapsed = readCollapsed()
  let refreshUntil = 0
  let timer: number | undefined
  let disposed = false

  const renderRow = (row: SidebarProviderRow): HTMLElement => {
    const container = document.createElement('div')
    container.className = (row.kind === 'plan' ? css['provider'] : css['balanceRow']) ?? ''
    const name = document.createElement('span')
    name.className = css['providerName'] ?? ''
    name.textContent = row.kind === 'plan' && row.planName !== undefined && row.planName !== ''
      ? `${row.displayName} · ${row.planName}`
      : row.displayName
    if (row.kind === 'plan') {
      const head = document.createElement('div')
      head.className = css['providerHead'] ?? ''
      head.append(name)
      container.append(head)
      for (const window of row.windows) {
        const line = document.createElement('div')
        line.className = css['window'] ?? ''
        const lineLabel = document.createElement('span')
        lineLabel.className = css['windowLine'] ?? ''
        const label = document.createElement('span')
        label.className = css['windowLabel'] ?? ''
        label.textContent = window.label
        const percent = document.createElement('span')
        percent.className = css['windowPct'] ?? ''
        percent.textContent = `${window.percent >= 10 ? Math.round(window.percent) : window.percent.toFixed(1)}%`
        lineLabel.append(label, percent)
        const bar = document.createElement('span')
        bar.className = css['bar'] ?? ''
        const fill = document.createElement('span')
        fill.className = toneClass(window.percent)
        fill.style.width = `${window.percent}%`
        bar.append(fill)
        line.append(lineLabel, bar)
        if (window.resetsAt !== undefined) {
          const reset = formatReset(window.resetsAt)
          if (reset !== undefined) {
            const resetLine = document.createElement('span')
            resetLine.className = css['resetLine'] ?? ''
            resetLine.textContent = reset
            line.append(resetLine)
          }
        }
        container.append(line)
      }
    } else {
      const value = document.createElement('span')
      value.className = (row.kind === 'balance' ? css['balanceText'] : css['muted']) ?? ''
      value.textContent = row.kind === 'balance' ? row.balanceText : row.note
      container.append(name, value)
    }
    if (row.error !== undefined) {
      const error = document.createElement('span')
      error.className = css['errorLine'] ?? ''
      error.textContent = `${row.displayName}: ${t('usage.provider.error', { error: row.error })}`
      container.append(error)
    }
    return container
  }

  /** Status copy for a snapshot-less store: a missing route reads as "off". */
  const statusCopy = (error: string | null): string => {
    if (error !== null && error.includes('404')) return t('usage.sidebar.unavailable')
    return t('usage.error', { error: error ?? '' })
  }

  const render = (): void => {
    if (disposed) return
    const state = api.store.getSnapshot()
    const snapshot = state.snapshot
    updatedLine.textContent = snapshot === null ? '' : t('usage.updated', { time: formatClock(snapshot.updatedAt) })
    const refreshing = Date.now() < refreshUntil
    refreshBtn.textContent = refreshing ? t('usage.refreshing') : t('usage.refresh')
    refreshBtn.disabled = refreshing
    list.textContent = ''
    if (snapshot === null) {
      const line = document.createElement('span')
      line.className = css['statusLine'] ?? ''
      line.textContent = state.status === 'error' ? statusCopy(state.error) : t('usage.loading')
      list.append(line)
      return
    }
    for (const row of buildSidebarRows(snapshot, windowLabel, mutedNote)) list.append(renderRow(row))
  }

  const stopTimer = (): void => {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  const startTimer = (): void => {
    if (timer === undefined && !collapsed && document.visibilityState === 'visible') {
      timer = window.setInterval(() => { api.poll() }, BLOCK_POLL_MS)
    }
  }

  /** Reflect the collapse state on the panel and the entry row. */
  const applyCollapsed = (): void => {
    panel.style.display = collapsed ? 'none' : ''
    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)
    if (entry === null) return
    entry.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    entry.setAttribute('title', t(collapsed ? 'usage.sidebar.expand' : 'usage.sidebar.collapse'))
  }

  const setCollapsed = (next: boolean): void => {
    collapsed = next
    writeCollapsed(next)
    applyCollapsed()
    if (collapsed) {
      stopTimer()
      return
    }
    // Expanding is the fresh-read moment; the interval only keeps it fresh.
    api.poll()
    startTimer()
  }

  refreshBtn.addEventListener('click', () => {
    refreshUntil = Date.now() + REFRESH_FEEDBACK_MS
    api.refresh()
    render()
    window.setTimeout(() => {
      refreshUntil = 0
      render()
    }, REFRESH_FEEDBACK_MS)
  })

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      if (!collapsed) {
        api.poll()
        startTimer()
      }
      return
    }
    stopTimer()
  }

  const rootObserver = new MutationObserver(() => { placePanel() })
  let observedRoot: HTMLElement | undefined

  /**
   * Keep the panel directly after the entry row inside the same sidebar root.
   * The row's own placement/self-healing belongs to sidebar-entry-core; this
   * only follows it (and adds the chevron once the row exists).
   */
  function placePanel(): void {
    if (disposed) return
    if (observedRoot !== undefined && !observedRoot.isConnected) {
      rootObserver.disconnect()
      observedRoot = undefined
    }
    const entry = document.querySelector<HTMLElement>(ENTRY_SELECTOR)
    if (entry === null) return
    const root = entry.parentElement
    if (root === null) return
    if (entry.querySelector('[data-dsh-usage-chevron]') === null) {
      const chevron = document.createElement('span')
      chevron.className = css['chevron'] ?? ''
      chevron.setAttribute('data-dsh-usage-chevron', '')
      chevron.innerHTML = CHEVRON
      entry.append(chevron)
      applyCollapsed()
    }
    if (panel.parentElement !== root || panel.previousElementSibling !== entry) {
      root.insertBefore(panel, entry.nextSibling)
      applyCollapsed()
    }
    if (observedRoot !== root) {
      if (observedRoot !== undefined) rootObserver.disconnect()
      rootObserver.observe(root, { childList: true, subtree: true })
      observedRoot = root
    }
  }

  const disposeEntry = mountSidebarEntry({
    rowAttribute: 'data-dsh-usage-entry',
    rowSelector: ENTRY_SELECTOR,
    plugin: 'usage',
    icon: ICON,
    css,
    label: () => t('usage.sidebar.label'),
    tooltip: () => t(collapsed ? 'usage.sidebar.expand' : 'usage.sidebar.collapse'),
    refresh: api.locale === undefined ? undefined : { subscribe: (listener) => api.locale!.subscribe(listener) },
    onToggle: () => { setCollapsed(!collapsed) },
    // Directly after the family block (task board / ssh / skill center) and
    // therefore before the shell's Workspaces browser.
    position: 'after',
    familySelectors: ['[data-dsh-taskboard-entry]', '[data-dsh-ssh-entry]', '[data-dsh-skill-explorer-entry]', ENTRY_SELECTOR],
  })

  const unsubscribeBody = subscribeBodyInvalidations(() => { placePanel() })
  const unsubscribeStore = api.store.subscribe(() => { render() })
  const unsubscribeLocale = api.locale === undefined ? undefined : api.locale.subscribe(() => { render() })
  document.addEventListener('visibilitychange', onVisibility)

  placePanel()
  applyCollapsed()
  render()
  if (!collapsed) {
    api.poll()
    startTimer()
  }

  return () => {
    disposed = true
    unsubscribeBody()
    unsubscribeStore()
    unsubscribeLocale?.()
    document.removeEventListener('visibilitychange', onVisibility)
    stopTimer()
    rootObserver.disconnect()
    panel.remove()
    disposeEntry()
  }
}
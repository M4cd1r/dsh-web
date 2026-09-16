# Agent Note: dsh-usage sidebar usage panel

Status: implemented

## Problem

The dsh web GUI sidebar shows plugin entries (Task board, SSH, Skill center)
but nothing about how much subscription/API quota is left per installed
provider. The dsh-usage plugin already probes every installed provider's
balance/coding-plan endpoint host-side and serves a normalized overview, but
only rendered it as a settings section card (and the pet bubble), so the
state of the day's quota sat one click away.

## Decision

Ship a collapsible sidebar panel inside `packages/dsh-usage`, seated in the
sidebar family between the Skill center entry and the Workspaces browser
(expanded by default, collapse state remembered per browser in
localStorage). It renders the existing loopback-fenced `/api/dsh-usage/overview`
document:

- coding-plan providers render 5-hour / weekly / monthly quota progress bars
  (used percent, reset time per window);
- balance-only providers render a name-and-remaining row (provider left,
  amount right, for example DeepSeek ¥12.34);
- providers with no programmatic endpoint render a muted note;
- the panel re-reads the overview every 60 s while expanded and visible and
  offers a manual probe refresh.

The toggle row mounts through the family's shared `sidebar-entry-core`
pattern (plain DOM, MutationObserver self-heal, no React tree in the
sidebar); the panel sits directly below the row, kept in place by a small
placement observer that follows the row's self-healing. The host half only
gains one config key (`sidebarPanel`, default `true`) surfaced as a checkbox
in the section's settings row; the browser half mounts and unmounts the
block live from the same settings scope (the plugin's `enabled` switch gates
it too). New part value `sidebar-panel` added to the semantic-attrs
contract, owned by `usage`.

## Architecture

- `src/core/sidebar-model.ts`: pure `buildSidebarRows()` / `formatBalance()`
  with locale copy injected as callbacks; unit-tested without DOM.
- `src/client/sidebar-block.ts`: entry row + panel DOM, poll/refresh,
  collapse persistence; `src/client/sidebar.module.css` carries the entry
  and panel styles on host surface tokens.
- `src/client/index.ts` mounts the block under a settings-scope subscription
  (`enabled` AND `sidebarPanel`).
- `scripts/sync-shared.mjs` gained `dsh-usage` consumers for
  `sidebar-entry-core.ts` and `body-mutations.ts` (generated copies).
- The dsh-web-all aggregate inlines the client half; its committed `lib/`
  and `scripts/lib-artifact-fingerprints.json` change with the same PR.

## Alternatives considered

- Separate standalone repo `dsh-usage-sidebar` with its own probes (the
  original request): rejected by user decision — the probe adapters and
  credential handling already live in dsh-usage, and a second plugin would
  duplicate both while the sidebar panel is a rendering surface on the same
  wire document.
- React root inside the sidebar family block: heavier bundle and the first
  React tree in the left sidebar for no user-visible benefit; the family
  precedent (task-board / ssh / skill-explorer) is plain DOM with
  self-healing placement.
- Extending the shared `sidebar-entry-core` to mount a wrapper element:
  would have changed the family contract for all four consumers; a sibling
  panel with its own placement observer keeps the core untouched.

## Consequences

- The sidebar gains one 36 px entry row per page; the panel polls only while
  expanded and visible, so a collapsed or background page pays no polling
  traffic (the host's own 60 s probe cycle is untouched).
- Skins: the block carries `data-dsh-plugin="usage"` with parts
  `sidebar-entry` (row) and `sidebar-panel` (root); portrait-mobile hides the
  whole plugin block through the existing rule.
- The dsh-web-all aggregate bundle regrows by roughly 30 kB; its committed
  lib/ artifacts and fingerprints are refreshed in the same PR.
- `sidebarPanel` defaults to `true`, so existing profiles show the panel
  without configuration; disabling it removes the entry live without
  touching the settings section.
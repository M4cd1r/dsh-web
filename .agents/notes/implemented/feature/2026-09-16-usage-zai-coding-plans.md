# Agent Note: z.ai GLM coding plan support

Status: implemented

## Problem

The dsh-usage plan adapters served the GLM Coding Plan under provider ids
`zai-coding` (international) and `zai-coding-cn` (mainland), but the pi-ai
provider catalog registers the international coding plan under `zai`, and
that is the route the runtime reports for a configured Z.AI provider. A user
on a z.ai coding plan therefore saw no plan fact at all: `adapterFor("zai")`
is undefined, the poll cycle skips the route, and the Plans tab, the sidebar
panel and the pet bubble all stay silent. The parser also treated every
`limits[]` entry uniformly — MCP request ceilings (`TIME_LIMIT`) rendered as
bogus windows under a raw `unit-5` key — and the newer credits-based plans'
server-rounded percentage hid the exact used share.

## Decision

The GLM Coding Plan adapter now serves `zai` (the pi-ai catalog id) alongside
the legacy `zai-coding` alias and `zai-coding-cn`, so any z.ai route the
runtime reports resolves to one adapter. The parser was hardened over the
shared `{host}/api/monitor/usage/quota/limit` envelope:

- only `TOKENS_LIMIT` (token-based plans) and `CREDIT_LIMIT` (the renamed
  buckets on credits-based plans) become quota windows; `TIME_LIMIT` MCP /
  feature request ceilings never render;
- windows are keyed by the undocumented `unit` code — 3 (5h), 6 (weekly),
  5 (monthly) — onto the shared window vocabulary (`5h` / `week` / `month`);
  unknown units are dropped instead of shown under an unlocalized key;
- when the absolute meter is present (`currentValue` spend over `usage`
  allotment, as on the credits-based plans), the exact used share wins over
  the server-rounded `percentage`; any percent is still clamped to 0-100;
- failure envelopes carried inside an HTTP 200 (`success: false`) still
  reject with no fact, as before.

Legacy 5-hour-only plans, current 5h + weekly plans and credits-based plans
all parse from the same endpoint; the plan tier (`data.level`) is surfaced as
the plan name. Tests cover the reordered-array regression (windows keyed by
unit, never by position), the credit-ratio parse, legacy 5h-only plans,
`TIME_LIMIT` / unknown-unit skipping and failure envelopes; the README trio
documents the route ids and plan modes. Cross-links: the adapter registry
grew out of [the usage statistics plugin note](../../implemented/feature/2026-08-29-usage-statistics-plugin.md),
rendered by the [sidebar usage panel note](../../implemented/feature/2026-09-16-dsh-usage-sidebar-panel.md).

## Alternatives considered

- A separate adapter for `zai`: the endpoint, auth (raw key, no Bearer
  prefix) and parse are identical to the other GLM routes; one adapter
  family keeps the family-level fallbacks (pet bubble, spend grouping)
  uniform, exactly like the DeepSeek family's aliases.
- Render `TIME_LIMIT` MCP ceilings as a `month` window: it is a request
  ceiling, not a token/credit quota window, and an unused ceiling would
  render a persistent 0% bar under a misleading label.
- Keep the generic `unit-N` fallback key for unknown windows: the browser
  and section dictionaries hold no such labels, so the raw key would leak
  into the UI; dropping unknown windows is inert instead.

## Consequences

- A configured z.ai provider (route `zai`, key resolved through the
  `llm-pi-ai` profile's `apiKeyEnv`, for example `ZAI_API_KEY`) now probes
  its coding-plan quota and renders the 5h and/or weekly windows in the
  Plans tab, the sidebar panel and the pet bubble; legacy, current and
  credits-based plans all render without extra configuration.
- `TIME_LIMIT` MCP ceilings are deliberately not shown; previously they
  appeared as a bogus window under the raw `unit-5` key.
- No locale changes: every emitted window key (`5h`, `week`, `month`) already
  exists in the zh/en dictionaries and the ru pack, so `i18n:check` stays
  green.
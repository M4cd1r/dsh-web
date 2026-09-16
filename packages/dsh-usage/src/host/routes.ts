import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isUsageAllowed } from './access.ts'
import { writeJson } from './http.ts'
import type { UsageService } from './usage-service.ts'

export const USAGE_API_PREFIX = '/api/dsh-usage'

/**
 * Overview route: provider balances, plan quotas, and token usage totals.
 * Personal account data, so loopback always passes and a live paired-device
 * cookie is the only remote allow path. Without a pairing service or cookie,
 * this remains loopback-only.
 */
export function makeUsageOverviewRoute(service: UsageService, ctx: Context = {} as Context): WebRoute {
  return {
    kind: 'exact',
    path: USAGE_API_PREFIX + '/overview',
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!isUsageAllowed(ctx, req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
        return
      }
      writeJson(res, 200, service.overview(), { 'cache-control': 'no-store' })
    },
  }
}

/**
 * Manual refresh route: forces one probe cycle now and answers with the fresh
 * overview. Uses the same paired-or-loopback fence as the overview route.
 */
export function makeUsageRefreshRoute(service: UsageService, ctx: Context = {} as Context): WebRoute {
  return {
    kind: 'exact',
    path: USAGE_API_PREFIX + '/refresh',
    handler: async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!isUsageAllowed(ctx, req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      try {
        await service.refresh()
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'refresh failed' })
        return
      }
      writeJson(res, 200, service.overview(), { 'cache-control': 'no-store' })
    },
  }
}

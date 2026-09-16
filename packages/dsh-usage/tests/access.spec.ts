import type { IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { isUsageAllowed } from '../src/host/access.ts'

/**
 * Paired-LAN regression: a live paired-device request from another computer
 * must reach the usage overview instead of receiving the loopback fence.
 */
describe('isUsageAllowed', () => {
  it('allows a LAN client with a live paired-device cookie', () => {
    const isPairedDevice = vi.fn(() => true)
    const ctx = {
      get: (name: string) => (name === 'remoteWebUiPairing' ? { isPairedDevice } : undefined),
    }
    const request = {
      method: 'GET',
      headers: { host: '192.168.1.10:3080', cookie: 'dsh_pair=dev-1' },
      socket: { remoteAddress: '192.168.1.20' },
    } as IncomingMessage

    expect(isUsageAllowed(ctx as never, request)).toBe(true)
    expect(isPairedDevice).toHaveBeenCalledWith(request)
  })
})

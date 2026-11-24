import { afterEach, expect, it, vi } from 'vitest'
import { api } from './api'

afterEach(() => vi.unstubAllGlobals())
const reply = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })

it('splits 6 MB files into 1 MB requests and resumes the same upload after a lost response', async () => {
  const file = new File([new Uint8Array(6 * 1024 * 1024)], 'large.png', { type: 'image/png' })
  let received = 0
  let fail = true
  const urls: string[] = []
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    urls.push(url)
    const offset = Number(new URL(url).searchParams.get('offset'))
    const body = init.body as Blob
    expect(body.size).toBeLessThanOrEqual(1024 * 1024)
    if (offset === received) received += body.size
    if (received === 2 * 1024 * 1024 && fail) { fail = false; throw new Error('lost response') }
    return reply({ received, complete: received === file.size })
  })
  vi.stubGlobal('fetch', fetchMock)
  await expect(api.uploadSiteImages('site', [file], [])).rejects.toThrow('lost response')
  await api.uploadSiteImages('site', [file], [])
  expect(received).toBe(file.size)
  expect(new Set(urls.map(url => url.split('?')[0])).size).toBe(1)
  await api.uploadSiteImages('site', [file], [])
  expect(received).toBe(file.size)
})

it('assembles large downloads using bounded range requests', async () => {
  const size = 5 * 1024 * 1024 + 12
  let calls = 0
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const range = (init.headers as Record<string, string>).Range
    const match = /bytes=(\d+)-(\d+)/.exec(range)!
    const start = Number(match[1]); const end = Math.min(size - 1, Number(match[2]))
    calls++
    return new Response(new Uint8Array(end - start + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Type': 'application/pdf' } })
  }))
  const blob = await api.downloadSiteImage('site', 'image')
  expect(blob.size).toBe(size)
  expect(blob.type).toBe('application/pdf')
  expect(calls).toBe(6)
})

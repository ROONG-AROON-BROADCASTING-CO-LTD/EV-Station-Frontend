import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { NewSitePage } from './NewSitePage'
import { api } from '../services/api'
vi.mock('../components/MapPanel', () => ({ MapPanel: () => null }))
vi.mock('../i18n/I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key, language: 'en' }), LanguageSwitcher: () => null }))
vi.mock('../services/api', async importOriginal => {
 const actual = await importOriginal<typeof import('../services/api')>()
 return { ...actual, api: { ...actual.api, createSite: vi.fn(), updateSite: vi.fn(), uploadSiteImages: vi.fn() } }
})
it('retries attachments on the saved site instead of creating a duplicate site', async () => {
 vi.mocked(api.createSite).mockResolvedValue({ id: 'saved-site' } as never)
 vi.mocked(api.updateSite).mockResolvedValue({ id: 'saved-site' } as never)
 vi.mocked(api.uploadSiteImages).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ count: 1 })
 const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><NewSitePage role="admin" /></MemoryRouter></QueryClientProvider>)
 for (const [name, value] of Object.entries({ name: 'Upload retry test', latitude: '13.7', longitude: '100.5', landSize: '1000' })) {
  fireEvent.change(container.querySelector(`[name="${name}"]`)!, { target: { value } })
 }
 fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] } })
 fireEvent.click(screen.getByRole('button', { name: 'Save Site' }))
 await screen.findByText(/Site details are saved/)
 fireEvent.click(screen.getByRole('button', { name: 'Save Site' }))
 await waitFor(() => expect(api.uploadSiteImages).toHaveBeenCalledTimes(2))
 expect(api.createSite).toHaveBeenCalledTimes(1)
 expect(api.updateSite).toHaveBeenCalledWith('saved-site', expect.any(Object))
})

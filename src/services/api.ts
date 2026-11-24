import type { AIAssessment, AnalysisRun, APIUsageSummary, AuthSession, CreateSiteInput, DataSourceCatalogEntry, FranchisePlan, GeocodingResult, GoogleMapsResolution, LineCustomerProfile, Site, SiteAccess, SiteAttachment, StationRecommendation, User, UserRole } from '../types/domain'
import { clearSession, getSessionToken } from './session'

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1'

type Envelope<T> = { data: T }
type ErrorEnvelope = { error?: { code?: string; message?: string } }

export class APIError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message) }
}

const authExpiredEvent = 'rbc:auth-expired'

function clearExpiredSession() {
  clearSession()
  window.dispatchEvent(new Event(authExpiredEvent))
}

function throwAPIError<T>(response: Response, body: Envelope<T> & ErrorEnvelope): never {
  const code = body.error?.code || (response.status === 413 ? 'SITE_EVIDENCE_LIMIT' : 'REQUEST_FAILED')
  if (response.status === 401 && (code === 'INVALID_TOKEN' || code === 'AUTH_REQUIRED')) clearExpiredSession()
  throw new APIError(code, body.error?.message || 'Request failed.', response.status)
}

export function errorMessageKey(error: unknown) {
  return error instanceof APIError ? `error.${error.code}` : 'error.REQUEST_FAILED'
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as Envelope<T> & ErrorEnvelope
  if (!response.ok) throwAPIError(response, body)
  return body.data
}

type APIRequestOptions = { json?: boolean }

function headerRecord(headers?: HeadersInit) {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  return Object.fromEntries(Array.isArray(headers) ? headers : Object.entries(headers))
}

async function authenticatedRequest<T>(path: string, token: string | null, init?: RequestInit, options: APIRequestOptions = {}): Promise<T> {
  const { json = true } = options
  const response = await fetch(`${baseURL}${path}`, {
    ...init,
    headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headerRecord(init?.headers) },
  })
  return readEnvelope<T>(response)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return authenticatedRequest<T>(path, getSessionToken(), init)
}

const chunkBytes = 1024 * 1024
const uploadIDs = new WeakMap<File, Map<string, string>>()

async function uploadSiteFiles(siteID: string, files: File[]): Promise<{ count: number }> {
  for (const file of files) {
    if (!file.size || file.size > 10 * chunkBytes) throw new APIError('SITE_EVIDENCE_LIMIT', 'Each file must be between 1 byte and 10 MB.', 400)
    let ids = uploadIDs.get(file)
    if (!ids) { ids = new Map(); uploadIDs.set(file, ids) }
    let id = ids.get(siteID)
    if (!id) { id = crypto.randomUUID(); ids.set(siteID, id) }
    // Replaying the first chunk returns the persisted offset, or complete=true
    // when the previous response was lost after the file was saved.
    let offset = 0
    while (offset < file.size) {
      const result = await authenticatedRequest<{ received: number; complete: boolean }>(
        `/sites/${siteID}/image-uploads/${id}?offset=${offset}&total=${file.size}`,
        getSessionToken(),
        { method: 'PUT', body: file.slice(offset, offset + chunkBytes), headers: { 'Content-Type': 'application/octet-stream' } },
        { json: false },
      )
      if (!Number.isInteger(result.received) || result.received <= offset || result.received > file.size || (result.complete && result.received !== file.size)) throw new APIError('SITE_IMAGE_UPLOAD_FAILED', 'Invalid upload response.', 502)
      if (result.complete) break
      if (result.received === file.size) throw new APIError('SITE_IMAGE_UPLOAD_FAILED', 'File was not finalized.', 502)
      offset = result.received
    }
  }
  return { count: files.length }
}

async function download(path: string): Promise<Blob> {
  const token = getSessionToken()
  const chunks: ArrayBuffer[] = []
  let offset = 0
  let total: number | undefined
  let type = ''
  do {
    const response = await fetch(`${baseURL}${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Range: `bytes=${offset}-${offset + chunkBytes - 1}` } })
    if (!response.ok) throw new APIError('SITE_IMAGE_LOAD_FAILED', 'Unable to load site evidence file.', response.status)
    if (response.status === 200 && offset === 0) return response.blob()
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '')
    const buffer = await response.arrayBuffer()
    if (!range || Number(range[1]) !== offset || Number(range[2]) + 1 !== offset + buffer.byteLength || !buffer.byteLength || Number(range[3]) > 10 * chunkBytes || (total !== undefined && total !== Number(range[3]))) throw new APIError('SITE_IMAGE_LOAD_FAILED', 'Invalid download range.', 502)
    total = Number(range[3])
    type = response.headers.get('Content-Type') || type
    chunks.push(buffer)
    offset += buffer.byteLength
  } while (offset < total!)
  return new Blob(chunks, { type })
}

async function liffRequest<T>(path: string, idToken: string, init?: RequestInit): Promise<T> {
  return authenticatedRequest<T>(path, idToken, init)
}

async function liffUpload<T>(path: string, idToken: string, form: FormData): Promise<T> {
  return authenticatedRequest<T>(path, idToken, { method: 'POST', body: form }, { json: false })
}

function createImageUploadForm(photos: File[], documents: File[]) { const form = new FormData(); photos.forEach(file => form.append('photos', file)); documents.forEach(file => form.append('images', file)); return form }

export const api = {
  registerVisitorOrdinal: () => request<{ ordinal: number }>('/public/visitor-ordinal', { method: 'POST' }),
  login: (email: string, password: string) => request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, displayName: string, password: string) => request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, displayName, password }) }),
	createUser: (email: string, displayName: string, password: string, role: UserRole) => request<User>('/users', { method: 'POST', body: JSON.stringify({ email, displayName, password, role }) }),
	listUsers: () => request<User[]>('/users'),
	updateUser: (id: string, input: { email: string; displayName: string; password?: string; role: UserRole; isActive: boolean }) => request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
	deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),
	 recommendStation: (id: string, refresh = false) => request<StationRecommendation>(`/analyses/${id}/station-recommendation${refresh ? '?refresh=true' : ''}`, { method: 'POST' }),
  listSites: () => request<Site[]>('/sites'),
  getSite: (id: string) => request<Site>(`/sites/${id}`),
	getLatestAnalysisForSite: (id: string) => request<AnalysisRun | null>(`/sites/${id}/latest-analysis`),
	listSiteImages: (id: string) => request<SiteAttachment[]>(`/sites/${id}/images`),
	downloadSiteImage: (siteID: string, imageID: string) => download(`/sites/${siteID}/images/${imageID}`),
  createSite: (input: CreateSiteInput) => request<Site>('/sites', { method: 'POST', body: JSON.stringify(input) }),
	createLiffSite: (input: CreateSiteInput, idToken: string, requestId: string) => liffRequest<{ site: Site }>('/liff/sites', idToken, { method: 'POST', body: JSON.stringify({ ...input, requestId }) }),
	getLiffCustomerProfile: (idToken: string) => liffRequest<{ profile: LineCustomerProfile | null }>('/liff/customer-profile', idToken).then(result => result.profile),
	completeLiffSite: (id: string, idToken: string) => liffRequest<{ notificationAccepted: boolean }>(`/liff/sites/${id}/complete`, idToken, { method: 'POST' }),
	listLiffSites: (idToken: string) => liffRequest<Array<Site & { customerStatus: 'pending_review' | 'analysis_completed' }>>('/liff/sites', idToken),
	resolveLiffGoogleMapsUrl: (url: string, idToken: string) => liffRequest<GoogleMapsResolution>('/liff/maps/resolve', idToken, { method: 'POST', body: JSON.stringify({ url }) }),
	uploadLiffSiteImages: (id: string, photos: File[], documents: File[], idToken: string) => liffUpload<{ count: number }>(`/liff/sites/${id}/images`, idToken, createImageUploadForm(photos, documents)),
	updateSite: (id: string, input: CreateSiteInput) => request<Site>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
	uploadSiteImages: (id: string, photos: File[], documents: File[]) => uploadSiteFiles(id, [...photos, ...documents]),
	deleteSite: (id: string) => request<void>(`/sites/${id}`, { method: 'DELETE' }),
	listSiteAccess: (id: string) => request<SiteAccess[]>(`/sites/${id}/access`),
	setSiteAccess: (id: string, userId: string, role: UserRole) => request<void>(`/sites/${id}/access`, { method: 'PUT', body: JSON.stringify({ userId, role }) }),
	deleteSiteAccess: (id: string, userId: string) => request<void>(`/sites/${id}/access/${userId}`, { method: 'DELETE' }),
  runAnalysis: (siteId: string, radiusMeters = 3000) => request<AnalysisRun>(`/sites/${siteId}/analyses`, { method: 'POST', body: JSON.stringify({ radiusMeters }) }),
  getAnalysis: (id: string) => request<AnalysisRun>(`/analyses/${id}`),
  recalculatePreliminary: (id: string) => request<AnalysisRun>(`/analyses/${id}/recalculate-preliminary`, { method: 'POST' }),
  generateAIAssessment: (id: string, language: 'th' | 'en', refresh = false) => request<AIAssessment>(`/analyses/${id}/ai-assessment${refresh ? '?refresh=true' : ''}`, { method: 'POST', body: JSON.stringify({ language }) }),
  generateAIAssessments: async (id: string, languages: readonly ('th' | 'en')[], refresh = false) => {
    const results = await Promise.allSettled(languages.map(language => api.generateAIAssessment(id, language, refresh)))
    const assessments: Partial<Record<'th' | 'en', AIAssessment>> = {}
    const errors: Partial<Record<'th' | 'en', unknown>> = {}
    results.forEach((result, index) => {
      const language = languages[index]
      if (result.status === 'fulfilled') assessments[language] = result.value
      else errors[language] = result.reason
    })
    return { assessments, errors }
  },
  searchAddress: (query: string) => request<GeocodingResult[]>(`/geocoding/search?q=${encodeURIComponent(query)}&limit=5`),
  resolveGoogleMapsUrl: (url: string) => request<GoogleMapsResolution>('/maps/resolve', { method: 'POST', body: JSON.stringify({ url }) }),
	getDataSources: () => request<DataSourceCatalogEntry[]>('/data-sources'),
	getAPIUsage: () => request<APIUsageSummary[]>('/api-usage'),
	recordGoogleMapsLoad: () => request<void>('/api-usage/google-maps-load', { method: 'POST' }),
  getFranchisePlans: () => request<FranchisePlan[]>('/financial/plans'),
}

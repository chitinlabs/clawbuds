const BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}` : ''

function getAdminKey(): string | null {
  return sessionStorage.getItem('adminKey')
}

async function adminFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const key = getAdminKey()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers })
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message ?? `Request failed: ${res.status}`)
  }
  return json.data as T
}

export const adminApi = {
  checkAuth: (key: string) =>
    fetch(`${BASE_URL}/admin/health/detail`, {
      headers: { Authorization: `Bearer ${key}` },
    }).then(r => r.status),

  getHealthDetail: () => adminFetch<import('../types/api.js').AdminHealthDetail>('/admin/health/detail'),

  getClaws: (params?: { limit?: number; offset?: number; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    if (params?.search) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return adminFetch<import('../types/api.js').AdminClawsPage>(`/admin/claws${query}`)
  },

  getClawById: (id: string) =>
    adminFetch<import('../types/api.js').AdminClaw>(`/admin/claws/${id}`),

  updateClawStatus: (id: string, status: 'active' | 'suspended') =>
    adminFetch<import('../types/api.js').AdminClaw>(`/admin/claws/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  getStatsOverview: () =>
    adminFetch<import('../types/api.js').AdminStatsOverview>('/admin/stats/overview'),

  getWebhookDeliveries: (limit = 100) =>
    adminFetch<{ deliveries: import('../types/api.js').AdminWebhookDelivery[] }>(`/admin/webhooks/deliveries?limit=${limit}`),

  getReflexStats: () =>
    adminFetch<import('../types/api.js').AdminReflexStats>('/admin/reflexes/stats'),
}

type ManifestRequest = {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

type ManifestResponse = {
  setHeader(name: string, value: string): void
  status(code: number): ManifestResponse
  json(body: unknown): void
}

type PublicTenant = {
  name: string
  slug: string
  logo_url: string | null
  brand: {
    app_name?: unknown
    primary_color?: unknown
    app_icon_192_url?: unknown
    app_icon_512_url?: unknown
  }
}

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function publicImageUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\//i.test(value) ? value : null
}

export default async function handler(request: ManifestRequest, response: ManifestResponse) {
  response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')

  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' })

  const slug = queryValue(request.query?.tenant)
  const app = queryValue(request.query?.app)
  const entry = queryValue(request.query?.entry)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) || !['storefront', 'courier', 'merchant', 'seller'].includes(app)) {
    return response.status(400).json({ error: 'A valid tenant and PWA type are required' })
  }

  const environment = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env ?? {}
  const supabaseUrl = environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL
  const anonKey = environment.SUPABASE_ANON_KEY ?? environment.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return response.status(503).json({ error: 'PWA manifest service is not configured' })

  try {
    const tenantResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_public_tenant`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_slug: slug }),
    })
    if (!tenantResponse.ok) throw new Error('Tenant lookup failed')
    const tenants = await tenantResponse.json() as PublicTenant[]
    const tenant = tenants[0]
    if (!tenant) return response.status(404).json({ error: 'Tenant was not found' })

    const brand = tenant.brand ?? {}
    const storeName = typeof brand.app_name === 'string' && brand.app_name.trim()
      ? brand.app_name.trim()
      : tenant.name
    const appLabel = app === 'courier' ? 'Entregas' : app === 'merchant' ? 'Painel' : app === 'seller' ? 'Vendas' : ''
    const appName = appLabel ? `${storeName} · ${appLabel}` : storeName
    const routePrefix = app === 'courier' ? 'driver' : app === 'merchant' ? 'app' : app === 'seller' ? 'vendedor' : 'loja'
    const memberEntry = (app === 'courier' && entry === 'courier') || (app === 'merchant' && entry === 'merchant') || (app === 'seller' && entry === 'seller')
    const startPath = memberEntry ? (app === 'courier' ? '/entregador' : app === 'merchant' ? '/app' : '/vendedor') : `/${routePrefix}/${encodeURIComponent(tenant.slug)}`
    const themeColor = typeof brand.primary_color === 'string' && /^#[\da-f]{6}$/i.test(brand.primary_color)
      ? brand.primary_color
      : '#f5f6f1'
    const icon192 = publicImageUrl(brand.app_icon_192_url)
    const icon512 = publicImageUrl(brand.app_icon_512_url)
    const fallbackLogo = publicImageUrl(tenant.logo_url)
    const icons = [
      ...(icon192 ? [{ src: icon192, sizes: '192x192', type: 'image/webp', purpose: 'any' }] : []),
      ...(icon512 ? [
        { src: icon512, sizes: '512x512', type: 'image/webp', purpose: 'any' },
        { src: icon512, sizes: '512x512', type: 'image/webp', purpose: 'maskable' },
      ] : []),
      ...(!icon192 && !icon512 && fallbackLogo ? [{ src: fallbackLogo, sizes: 'any', purpose: 'any' }] : []),
    ]

    return response.status(200).json({
      id: startPath,
      name: appName,
      short_name: appName,
      description: `${appName} · Vancely`,
      lang: 'pt-BR',
      start_url: startPath,
      scope: memberEntry ? '/' : startPath,
      display: 'standalone',
      background_color: themeColor,
      theme_color: themeColor,
      icons,
    })
  } catch {
    return response.status(502).json({ error: 'Unable to load tenant PWA branding' })
  }
}
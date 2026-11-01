import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { ArrowLeft, ArrowRight, Banknote, Bike, Camera, CarFront, ChartNoAxesCombined, CircleCheck, ExternalLink, LifeBuoy, LockKeyhole, MapPin, MessageCircle, Minus, Navigation, Package, PackageCheck, Palette, PanelsTopLeft, Plus, RefreshCw, Search, Send, ShoppingCart, Store, Trash2, Upload, UserRound, Wallet, X } from 'lucide-react'
import { requireSupabase } from './services/supabase'
import RouteMap from './components/RouteMap'


type Plan = {
  id: string
  name: string
  monthly_price: number
  commission_rate: number
  max_products: number
  monthly_nfe_limit: number
  max_sellers: number
  max_couriers: number
}
type Membership = { tenant_id: string; role: string }
type Portal = {
  tenantId: string
  tenantName: string
  role: string
  slug: string
  logoUrl: string | null
  brand: { app_name?: string; primary_color?: string; tagline?: string; promotional_banners?: string[]; show_logo_watermark?: boolean; app_icon_192_url?: string; app_icon_512_url?: string }
}
type CatalogProduct = {
  id: string
  sku: string
  name: string
  description: string | null
  price: number
  cost_price: number
  stock: number
  minimum_stock: number
  storage_location: string
  image_url: string | null
  compatible_makes: string[]
  compatible_models: string[]
  compatible_years: number[]
  compatible_engines: string[]
  is_published: boolean
}
type InventoryReceipt = {
  id: string
  product_id: string
  invoice_number: string
  invoice_series: string
  invoice_access_key: string | null
  supplier_name: string
  expected_quantity: number
  counted_quantity: number
  unit_cost: number
  attachment_path: string
  received_at: string
  attachment_url: string
}
type CustomerProfile = {
  user_id: string
  full_name: string
  document: string
  phone: string
  postal_code: string
  street: string
  address_number: string
  complement: string
  district: string
  city: string
  state: string
}
type CustomerOrder = {
  id: string
  order_number: number
  status: string
  payment_status: string
  payment_method: string
  subtotal: number
  shipping_amount: number
  total: number
  is_pickup: boolean
  delivery_address: Record<string, string> | null
  created_at: string
  asaas_checkout_url: string | null
  timeline: { status: string; created_at: string }[]
  items: { product_name: string; sku: string; quantity: number; unit_price: number }[]
}
type TenantCreditStatus = {
  period_start: string
  period_end: string
  plates: { monthly_limit: number; monthly_used: number; addon_balance: number }
  nfe: { monthly_limit: number; monthly_used: number; addon_balance: number }
}
type DeliveryQuote = {
  distance_meters: number
  duration_seconds: number
  distance_km: number
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  shipping_amount: number
  cache_hit: boolean
}
type LiveCourierPosition = {
  latitude: number
  longitude: number
  heading: number | null
  recorded_at: string
}
type Conversation = { id: string; tenant_id: string; subject: string; status: string; created_at: string }
type SupportMessage = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }
type MasterStoreMetrics = {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  plan_name: string | null
  monthly_price: number | null
  commission_rate: number | null
  subscription_status: string | null
  current_period_end: string | null
  monthly_paid_sales: number
  monthly_paid_orders: number
  monthly_delivered: number
  monthly_delivery_fees: number
  monthly_route_fee_estimate: number
  monthly_average_distance_km: number | null
  monthly_split_amount: number
  monthly_split_count: number
  monthly_split_settled: number
}
type MasterDashboardData = {
  generated_at: string
  stores: MasterStoreMetrics[]
  plate_lookups: {
    daily: number; weekly: number; monthly: number; yearly: number
    daily_api: number; weekly_api: number; monthly_api: number; yearly_api: number
    monthly_api_cost: number; monthly_cache_fee_estimate: number
  }
  monthly_trend: {
    month: string
    split_revenue: number
    settled_split_revenue: number
    renewals_forecast: number
    renewals_forecast_amount: number
  }[]
}

const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const TERMS_VERSION = '2026-10-23-v1'
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'vancelysoftware@gmail.com'
const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || '5592920021316'
const BRAND_COLOR_SWATCHES = ['#293125', '#587523', '#718c28', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0f766e']

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.'
}

function monthDisplayDate(value: string) {
  const [year, month] = value.slice(0, 7).split('-').map(Number)
  return new Date(year, month - 1, 15, 12)
}

function storeThemeStyle(color?: string): React.CSSProperties {
  const primaryColor = color && /^#[\da-f]{6}$/i.test(color) ? color : '#293125'
  return { '--store-color': primaryColor } as React.CSSProperties
}

type TenantPwaApp = 'storefront' | 'courier' | 'merchant'

function syncTenantPwaIdentity(
  tenant: Pick<Portal, 'slug' | 'tenantName' | 'logoUrl' | 'brand'> | { slug: string; name: string; logoUrl: string | null; brand: Portal['brand'] },
  app: TenantPwaApp,
) {
  const tenantName = 'name' in tenant ? tenant.name : tenant.tenantName
  const storeName = tenant.brand.app_name?.trim() || tenantName
  const appLabel = app === 'courier' ? 'Entregas' : app === 'merchant' ? 'Painel' : ''
  const appName = appLabel ? `${storeName} · ${appLabel}` : storeName
  const iconUrl = tenant.brand.app_icon_512_url || tenant.brand.app_icon_192_url || tenant.logoUrl
  const themeColor = tenant.brand.primary_color && /^#[\da-f]{6}$/i.test(tenant.brand.primary_color)
    ? tenant.brand.primary_color
    : '#f5f6f1'
  const memberEntry = app === 'courier' && window.location.pathname === '/entregador'
    ? 'courier'
    : app === 'merchant' && window.location.pathname === '/app'
      ? 'merchant'
      : ''
  const manifestUrl = `/api/manifest?tenant=${encodeURIComponent(tenant.slug)}&app=${app}${memberEntry ? `&entry=${memberEntry}` : ''}`

  document.title = appName
  const manifestLink = document.getElementById('tenant-manifest') as HTMLLinkElement | null
  if (manifestLink) manifestLink.href = manifestUrl
  const favicon = document.getElementById('tenant-favicon') as HTMLLinkElement | null
  if (favicon && iconUrl) {
    favicon.href = iconUrl
    favicon.type = iconUrl.includes('.svg') ? 'image/svg+xml' : 'image/webp'
  }
  const appleIcon = document.getElementById('tenant-apple-icon') as HTMLLinkElement | null
  if (appleIcon && (tenant.brand.app_icon_192_url || iconUrl)) appleIcon.href = tenant.brand.app_icon_192_url || iconUrl || ''
  const themeMeta = document.getElementById('tenant-theme-color') as HTMLMetaElement | null
  if (themeMeta) themeMeta.content = themeColor
  const appleTitle = document.getElementById('tenant-apple-title') as HTMLMetaElement | null
  if (appleTitle) appleTitle.content = appName
}

function isValidBrDocument(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits || /^(\d)\1+$/.test(digits)) return false
  if (digits.length === 11) {
    const calculate = (length: number) => {
      const total = Array.from({ length }, (_, index) => Number(digits[index]) * (length + 1 - index))
        .reduce((sum, digit) => sum + digit, 0)
      const remainder = (total * 10) % 11
      return remainder === 10 ? 0 : remainder
    }
    return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10])
  }
  if (digits.length === 14) {
    const calculate = (length: number) => {
      let weight = 2
      let total = 0
      for (let index = length - 1; index >= 0; index--) {
        total += Number(digits[index]) * weight
        weight = weight === 9 ? 2 : weight + 1
      }
      const remainder = total % 11
      return remainder < 2 ? 0 : 11 - remainder
    }
    return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13])
  }
  return false
}

function splitList(value: string) {
  return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean)
}

function productFitment(product: Pick<CatalogProduct, 'compatible_makes' | 'compatible_models' | 'compatible_years' | 'compatible_engines'>) {
  const makes = product.compatible_makes.join(', ')
  const models = product.compatible_models.join(', ')
  const years = product.compatible_years.join(', ')
  const engines = product.compatible_engines.join(', ')
  const details = [makes && `Marca: ${makes}`, models && `Modelo: ${models}`, years && `Ano: ${years}`, engines && `Motor: ${engines}`].filter(Boolean)
  return details.join(' · ')
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: 'Pedido recebido',
    separating: 'Separando produtos',
    checking: 'Conferindo pedido',
    delivery: 'Em Trânsito',
    delivered: 'Pedido entregue',
    cancelled: 'Pedido cancelado',
  }
  return labels[status] ?? 'Atualizando pedido'
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}

function editDistance(left: string, right: string) {
  let previousPrevious: number[] | undefined
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      if (previousPrevious && leftIndex > 1 && rightIndex > 1
        && left[leftIndex - 1] === right[rightIndex - 2]
        && left[leftIndex - 2] === right[rightIndex - 1]) {
        current[rightIndex] = Math.min(current[rightIndex], previousPrevious[rightIndex - 2] + 1)
      }
    }
    previousPrevious = previous
    previous = current
  }
  return previous[right.length]
}

function productSearchScore(query: string, product: Pick<CatalogProduct, 'name' | 'sku' | 'description' | 'compatible_makes' | 'compatible_models' | 'compatible_engines'>) {
  const normalizedQuery = normalizeSearchText(query)
  const fields = [product.name, product.sku, product.description ?? '', ...product.compatible_makes, ...product.compatible_models, ...product.compatible_engines]
    .map(normalizeSearchText)
    .filter(Boolean)
  const queryTokens = normalizedQuery.split(/[^a-z0-9]+/).filter(Boolean)
  if (!queryTokens.length) return 0

  const phraseMatch = fields.some((field) => field.includes(normalizedQuery))
  const tokenScores = queryTokens.map((token) => {
    let bestScore = 0
    for (const field of fields) {
      for (const target of field.split(/[^a-z0-9]+/).filter(Boolean)) {
        if (target === token) bestScore = Math.max(bestScore, 100)
        else if (target.includes(token) || (target.length >= 3 && token.includes(target))) bestScore = Math.max(bestScore, 82)
        else if (token.length >= 3 && target.length >= 3) {
          const distance = editDistance(token, target)
          const tolerance = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0
          if (distance <= tolerance) bestScore = Math.max(bestScore, 72 - distance * 10)
        }
      }
    }
    return bestScore
  })
  const matchedTokens = tokenScores.filter((score) => score > 0)
  if (!matchedTokens.length) return 0
  const average = tokenScores.reduce((total, score) => total + score, 0) / queryTokens.length
  return average + (phraseMatch ? 25 : 0)
}

function convertImageToWebP(file: File, maxDimension = 800, quality = 0.88, removeWhiteBackground = false, targetAspectRatio?: number, backgroundColor = '#f2f3ef', contentScale = 1): Promise<Blob> {
  return createImageBitmap(file).then((image) => {
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    const scaledWidth = Math.max(1, Math.round(image.width * scale))
    const scaledHeight = Math.max(1, Math.round(image.height * scale))
    canvas.width = targetAspectRatio
      ? Math.min(maxDimension, Math.max(scaledWidth, Math.ceil(scaledHeight * targetAspectRatio)))
      : scaledWidth
    canvas.height = targetAspectRatio
      ? Math.max(1, Math.round(canvas.width / targetAspectRatio))
      : scaledHeight
    const context = canvas.getContext('2d')
    if (!context) {
      image.close()
      throw new Error('Não foi possível preparar a imagem.')
    }
    if (targetAspectRatio) {
      context.fillStyle = backgroundColor
      context.fillRect(0, 0, canvas.width, canvas.height)
      const imageScale = Math.min(canvas.width * contentScale / image.width, canvas.height * contentScale / image.height, scale)
      const imageWidth = image.width * imageScale
      const imageHeight = image.height * imageScale
      context.drawImage(image, (canvas.width - imageWidth) / 2, (canvas.height - imageHeight) / 2, imageWidth, imageHeight)
    } else {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    image.close()
    if (removeWhiteBackground) {
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
      const visited = new Uint8Array(width * height)
      const queue = new Uint32Array(width * height)
      let head = 0
      let tail = 0
      const isBackground = (pixel: number) => {
        const offset = pixel * 4
        const red = data[offset]
        const green = data[offset + 1]
        const blue = data[offset + 2]
        return Math.min(red, green, blue) >= 220 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 30
      }
      const enqueue = (pixel: number) => {
        if (!visited[pixel] && isBackground(pixel)) {
          visited[pixel] = 1
          queue[tail++] = pixel
        }
      }
      for (let x = 0; x < width; x += 1) {
        enqueue(x)
        enqueue((height - 1) * width + x)
      }
      for (let y = 1; y < height - 1; y += 1) {
        enqueue(y * width)
        enqueue(y * width + width - 1)
      }
      while (head < tail) {
        const pixel = queue[head++]
        const offset = pixel * 4
        const whiteness = (data[offset] + data[offset + 1] + data[offset + 2]) / 3
        data[offset + 3] = Math.round(data[offset + 3] * Math.max(0, Math.min(1, (245 - whiteness) / 25)))
        const x = pixel % width
        const y = Math.floor(pixel / width)
        if (x > 0) enqueue(pixel - 1)
        if (x < width - 1) enqueue(pixel + 1)
        if (y > 0) enqueue(pixel - width)
        if (y < height - 1) enqueue(pixel + width)
      }
      context.putImageData(new ImageData(data, width, height), 0, 0)
    }
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Não foi possível converter a logomarca para WebP.'))
      }, 'image/webp', quality)
    })
  })
}

function tenantBannerStoragePath(url: string, tenantId: string) {
  return tenantBrandStoragePath(url, tenantId, 'banners')
}

function tenantBrandStoragePath(url: string, tenantId: string, folder: 'banners' | 'icons') {
  try {
    const objectPrefix = '/storage/v1/object/public/tenant-media/'
    const pathname = new URL(url).pathname
    const prefixIndex = pathname.indexOf(objectPrefix)
    if (prefixIndex < 0) return null
    const path = decodeURIComponent(pathname.slice(prefixIndex + objectPrefix.length))
    return path.startsWith(`tenants/${tenantId}/brand/${folder}/`) ? path : null
  } catch {
    return null
  }
}

function isAdminUser(user: User) {
  return user.app_metadata?.role === 'admin_master' || user.app_metadata?.role === 'vancely_admin'
}

function navigate(path: string) {
  window.location.assign(path)
}

async function resolvePortal(user: User): Promise<Portal> {
  const client = requireSupabase()
  const { data: membership, error } = await client
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (error) throw error

  let member = membership as Membership | null
  if (!member) {
    const { error: registrationError } = await client.rpc('complete_tenant_registration')
    if (registrationError) {
      throw new Error('Esta conta ainda não está vinculada a uma loja. Conclua o cadastro ou fale com o suporte.')
    }
    const { data, error: reloadError } = await client
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (reloadError) throw reloadError
    member = data as Membership | null
  }

  if (!member) throw new Error('Não foi possível localizar o acesso da sua loja.')
  const { data: tenant, error: tenantError } = await client
    .from('tenants')
    .select('name, slug, logo_url, brand')
    .eq('id', member.tenant_id)
    .maybeSingle()
  if (tenantError) throw tenantError
  if (!tenant) throw new Error('A loja vinculada a esta conta não está disponível.')
  return {
    tenantId: member.tenant_id,
    tenantName: String(tenant.name),
    slug: String(tenant.slug),
    role: member.role,
    logoUrl: typeof tenant.logo_url === 'string' ? tenant.logo_url : null,
    brand: (tenant.brand ?? {}) as Portal['brand'],
  }
}

async function resolveMasterPortal(slug: string): Promise<Portal> {
  const { data, error } = await requireSupabase().rpc('get_master_tenant_by_slug', { p_slug: slug })
  if (error) throw error
  const tenant = (data?.[0] as {
    id: string
    name: string
    slug: string
    logo_url: string | null
    brand: Portal['brand']
  } | undefined)
  if (!tenant) throw new Error('A loja solicitada não foi encontrada.')
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    slug: tenant.slug,
    role: 'admin_master',
    logoUrl: tenant.logo_url,
    brand: tenant.brand ?? {},
  }
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  if (path === '/registrar') return <RegistrationPage />
  if (path === '/cliente' || path === '/cliente/entrar') return <CustomerAccountPage />
  if (path === '/login') return <LoginPage kind="merchant" />
  if (path === '/admin/login') return <LoginPage kind="admin" />
  const storefrontMatch = path.match(/^\/loja\/([^/]+)$/)
  if (storefrontMatch) return <StorefrontPage slug={decodeURIComponent(storefrontMatch[1])} />
  const masterStoreViewMatch = path.match(/^\/(app|driver)\/([^/]+)$/)
  if (path === '/admin' || path === '/app' || path === '/entregador' || masterStoreViewMatch) {
    return <ProtectedPage path={path} />
  }
  return <LandingPage />
}

function LandingPage() {
  return (
    <main className="auth-page">
      <section className="auth-card landing-card">
        <Brand />
        <p className="eyebrow">PLATAFORMA VANCELY</p>
        <h1>Operação conectada para autopeças.</h1>
        <p className="auth-description">Acesse seu ambiente ou cadastre sua loja para começar.</p>
        <div className="landing-actions">
          <a className="auth-button auth-button-primary" href="/login">Entrar na minha loja <ArrowRight size={17} /></a>
          <a className="auth-button auth-button-secondary" href="/registrar">Cadastrar autopeças</a>
          <a className="auth-subtle-link" href="/admin/login">Acesso administrativo</a>
        </div>
      </section>
    </main>
  )
}

function Brand() {
  return <div className="auth-brand"><span className="brand-mark">V</span><span>vancely<span className="brand-light">software</span></span></div>
}

function LoginPage({ kind }: { kind: 'admin' | 'merchant' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = kind === 'admin'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const client = requireSupabase()
      const { data, error: signInError } = await client.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      if (isAdmin) {
        if (!isAdminUser(data.user)) {
          setError('Esta conta não tem perfil de administrador Vancely.')
          return
        }
        const next = new URLSearchParams(window.location.search).get('next')
        navigate(next && /^\/(?:app|driver)\/[^/]+$/.test(next) ? next : '/admin')
      } else {
        if (isAdminUser(data.user)) {
          navigate('/admin')
          return
        }
        const portal = await resolvePortal(data.user)
        navigate(portal.role === 'courier' ? '/entregador' : '/app')
      }
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Brand />
        <a className="auth-back" href="/"><ArrowLeft size={15} /> Voltar</a>
        <p className="eyebrow">{isAdmin ? 'SOFTWARE PAI' : 'ÁREA DA LOJA'}</p>
        <h1>{isAdmin ? 'Acesso administrativo' : 'Entre na sua conta'}</h1>
        <p className="auth-description">{isAdmin ? 'Acesso restrito à equipe autorizada Vancely.' : 'Use seu e-mail e senha cadastrados pela sua autopeças.'}</p>
        <form className="auth-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          <button className="auth-button auth-button-primary" type="submit" disabled={busy}>
            <LockKeyhole size={16} /> {busy ? 'Verificando acesso…' : 'Entrar'}
          </button>
        </form>
        {!isAdmin && <p className="auth-footer">Ainda não tem uma loja? <a href="/registrar">Faça seu cadastro</a></p>}
      </section>
    </main>
  )
}

function RegistrationPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [fields, setFields] = useState({
    store_name: '', legal_name: '', cnpj: '', whatsapp: '', street: '', number: '',
    city: '', state: '', postal_code: '', owner_name: '', email: '', password: '', plan_id: '',
  })

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: plansError } = await requireSupabase()
          .from('plans')
          .select('id, name, monthly_price, commission_rate, max_products, monthly_nfe_limit, max_sellers, max_couriers')
          .eq('is_active', true).order('monthly_price')
        if (plansError) throw plansError
        if (active) setPlans((data ?? []) as Plan[])
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoadingPlans(false)
      }
    })()
    return () => { active = false }
  }, [])

  function update(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const client = requireSupabase()
      const onboarding = {
        store_name: fields.store_name.trim(),
        legal_name: fields.legal_name.trim(),
        cnpj: fields.cnpj.replace(/\D/g, ''),
        whatsapp: fields.whatsapp.trim(),
        street: fields.street.trim(),
        number: fields.number.trim(),
        city: fields.city.trim(),
        state: fields.state.trim().toUpperCase(),
        postal_code: fields.postal_code.replace(/\D/g, ''),
        owner_name: fields.owner_name.trim(),
        plan_id: fields.plan_id,
        terms_accepted: termsAccepted,
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
      }
      const { data, error: signUpError } = await client.auth.signUp({
        email: fields.email,
        password: fields.password,
        options: {
          data: { full_name: onboarding.owner_name, vancely_onboarding: onboarding },
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('O Supabase não retornou a conta criada.')
      if (!data.session) {
        setNotice('Conta criada. Confirme seu e-mail e depois entre para concluir a criação da loja.')
        return
      }
      const { error: registrationError } = await client.rpc('complete_tenant_registration')
      if (registrationError) throw registrationError
      navigate('/app')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page auth-page-scroll">
      <section className="auth-card registration-card">
        <Brand />
        <a className="auth-back" href="/"><ArrowLeft size={15} /> Voltar</a>
        <p className="eyebrow">ONBOARDING</p>
        <h1>Cadastre sua autopeças</h1>
        <p className="auth-description">Seus dados e o acesso da loja serão vinculados após a confirmação da conta.</p>
        <form className="auth-form registration-form" onSubmit={submit}>
          <h2>Dados da loja</h2>
          <label>Nome fantasia<input required value={fields.store_name} onChange={(event) => update('store_name', event.target.value)} /></label>
          <label>Razão social<input required value={fields.legal_name} onChange={(event) => update('legal_name', event.target.value)} /></label>
          <div className="auth-form-row">
            <label>CNPJ<input required inputMode="numeric" minLength={14} maxLength={18} value={fields.cnpj} onChange={(event) => update('cnpj', event.target.value)} /></label>
            <label>WhatsApp<input required type="tel" value={fields.whatsapp} onChange={(event) => update('whatsapp', event.target.value)} /></label>
          </div>
          <div className="auth-form-row">
            <label>CEP<input required inputMode="numeric" value={fields.postal_code} onChange={(event) => update('postal_code', event.target.value)} /></label>
            <label>Rua / Avenida<input required value={fields.street} onChange={(event) => update('street', event.target.value)} /></label>
          </div>
          <div className="auth-form-row">
            <label>Número<input required value={fields.number} onChange={(event) => update('number', event.target.value)} /></label>
            <label>Cidade<input required value={fields.city} onChange={(event) => update('city', event.target.value)} /></label>
            <label>UF<input required minLength={2} maxLength={2} value={fields.state} onChange={(event) => update('state', event.target.value)} /></label>
          </div>
          <h2>Proprietário e acesso</h2>
          <label>Nome do proprietário<input required value={fields.owner_name} onChange={(event) => update('owner_name', event.target.value)} /></label>
          <label>E-mail de acesso<input required type="email" autoComplete="email" value={fields.email} onChange={(event) => update('email', event.target.value)} /></label>
          <label>Senha (mínimo de 8 caracteres)<input required type="password" minLength={8} autoComplete="new-password" value={fields.password} onChange={(event) => update('password', event.target.value)} /></label>
          <h2>Plano SaaS</h2>
          <label>Plano
            <select required value={fields.plan_id} onChange={(event) => update('plan_id', event.target.value)} disabled={loadingPlans || plans.length === 0}>
              <option value="">{loadingPlans ? 'Carregando planos…' : 'Selecione um plano'}</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>
                {plan.name} · {money(plan.monthly_price)}/mês · {Number(plan.commission_rate) * 100}% comissão · {plan.max_products.toLocaleString('pt-BR')} produtos · {plan.monthly_nfe_limit.toLocaleString('pt-BR')} NF-e
              </option>)}
            </select>
          </label>
          {!loadingPlans && plans.length === 0 && <p className="form-message">Nenhum plano ativo foi configurado no Supabase. A equipe Vancely precisa cadastrar Essencial, Aceleração e Sede para liberar o cadastro.</p>}
          <details className="terms-details">
            <summary>Leia os Termos de Uso, Licenciamento e Cancelamento (versão {TERMS_VERSION})</summary>
            <article className="terms-content">
              <p><b>CONTRATADA:</b> VANCELY SOFTWARE, sob a responsabilidade de VANCELY SOFTWARE (Pessoa Física/Empresário Individual - CPF: 018.339.682-04), com suporte pelo e-mail <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> e telefone/WhatsApp <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer">(92) 92002-1316</a>.</p>
              <p><b>CONTRATANTE:</b> A Pessoa Física ou Jurídica (Dono da Auto Peças) devidamente cadastrada na plataforma Vancely Software.</p>
              <h3>1. Do objeto</h3>
              <p>1.1 O presente contrato concede ao CONTRATANTE uma licença de uso limitada, não exclusiva, intransferível e revogável da plataforma "Vancely Software" (Software como Serviço - SaaS), para gestão de vendas, vitrine B2C, controle de catálogo e gestão de entregas de autopeças.</p>
              <h3>2. Do direito de arrependimento e política de cancelamento (7 dias)</h3>
              <p>2.1 Conforme o Artigo 49 do Código de Defesa do Consumidor (Lei nº 8.078/1990), o CONTRATANTE poderá solicitar o cancelamento da assinatura e o reembolso integral do valor pago no prazo de até 7 (sete) dias corridos a contar da data de assinatura/contratação do plano.</p>
              <p>2.2 Para solicitar o cancelamento com reembolso em até 7 dias, o CONTRATANTE deverá enviar uma solicitação formal via e-mail para <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ou pelo canal oficial de suporte via WhatsApp <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer">(92) 92002-1316</a>.</p>
              <p>2.3 Após o prazo de 7 (sete) dias, a assinatura poderá ser cancelada a qualquer momento através do painel de controle, porém sem restituição proporcional de valores referentes à mensalidade vigente (modelo de renovação recorrente por ciclo).</p>
              <h3>3. Das responsabilidades fiscais, tributárias e legais do lojista</h3>
              <p>3.1 <b>Isenção de Responsabilidade Fiscal da CONTRATADA:</b> A Vancely Software disponibiliza ferramentas e integrações tecnológicas (incluindo emissão via Focus NFe e consultas de dados). Contudo, a CONTRATADA <b>NÃO</b> se responsabiliza pelas obrigações tributárias, fiscais, trabalhistas ou emissão incorreta de documentos fiscais por parte do CONTRATANTE.</p>
              <p>3.2 Toda e qualquer responsabilidade pelo recolhimento de impostos, veracidade das alíquotas (NCM, ICMS, PIS/COFINS), tributação sobre autopeças e cumprimento da legislação fiscal vigente é exclusivamente do <b>CONTRATANTE (Dono da Auto Peças)</b>.</p>
              <p>3.3 O CONTRATANTE declara ter ciência e se responsabiliza integralmente pelas garantias, trocas, devoluções e atendimento pós-venda em conformidade com o Código de Defesa do Consumidor perante os seus Clientes Finais (compradores das peças).</p>
              <h3>4. Das micro-taxas de infraestrutura e reuso de cache (R$ 0,03)</h3>
              <p>4.1 O CONTRATANTE declara ciência de que o reuso de dados de veículos/placas salvos no banco de dados centralizado após a perda do cache local do dispositivo do cliente estará sujeito à taxa de recuperação de infraestrutura de <b>R$ 0,03 (três centavos)</b> por consulta realizada no banco de dados, sendo contabilizado em fatura/extrato de uso.</p>
              <h3>5. Privacidade e proteção de dados (LGPD)</h3>
              <p>5.1 A Vancely Software atua em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), tratando os dados dos clientes finais exclusivamente para o cumprimento da prestação de serviços do software.</p>
            </article>
          </details>
          <label className="auth-checkbox">
            <input type="checkbox" required checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>Li e aceito os Termos de Uso, Licenciamento de Software e Política de Cancelamento de 7 dias acima.</span>
          </label>
          <p className="legal-notice">O aceite será associado à versão {TERMS_VERSION}. Recomendamos revisão jurídica do texto antes de iniciar a operação comercial.</p>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {notice && <p className="form-message" role="status">{notice} <a href="/login">Ir para login</a></p>}
          <button className="auth-button auth-button-primary" type="submit" disabled={busy || loadingPlans || plans.length === 0}>
            {busy ? 'Criando acesso…' : 'Criar conta e loja'} <ArrowRight size={17} />
          </button>
        </form>
        <p className="auth-footer">Já tem acesso? <a href="/login">Entrar</a></p>
      </section>
    </main>
  )
}

function ProtectedPage({ path }: { path: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [portal, setPortal] = useState<Portal | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const client = requireSupabase()
        const { data: sessionData, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) {
          const masterStoreView = /^\/(?:app|driver)\/[^/]+$/.test(path)
          navigate(masterStoreView
            ? `/admin/login?next=${encodeURIComponent(path)}`
            : path === '/admin' ? '/admin/login' : '/login')
          return
        }
        const { data, error: userError } = await client.auth.getUser()
        if (userError) throw userError
        if (!data.user) {
          navigate(path === '/admin' ? '/admin/login' : '/login')
          return
        }
        const masterViewMatch = path.match(/^\/(app|driver)\/([^/]+)$/)
        if (masterViewMatch) {
          if (!isAdminUser(data.user)) {
            setError('A visualização direta de lojas é restrita ao Admin Master.')
            return
          }
          const currentPortal = await resolveMasterPortal(decodeURIComponent(masterViewMatch[2]))
          setUser(data.user)
          setPortal(currentPortal)
          return
        }
        if (path === '/admin') {
          if (!isAdminUser(data.user)) {
            setError('Acesso restrito à equipe administrativa Vancely.')
            return
          }
          setUser(data.user)
          return
        }
        if (isAdminUser(data.user)) {
          navigate('/admin')
          return
        }
        const currentPortal = await resolvePortal(data.user)
        if (path === '/entregador' && currentPortal.role !== 'courier') {
          navigate('/app')
          return
        }
        if (path === '/app' && currentPortal.role === 'courier') {
          navigate('/entregador')
          return
        }
        setUser(data.user)
        setPortal(currentPortal)
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [path])

  async function logout() {
    const { error: logoutError } = await requireSupabase().auth.signOut()
    if (logoutError) {
      setError(logoutError.message)
      return
    }
    navigate(path === '/admin' ? '/admin/login' : '/login')
  }

  if (loading) return <PageMessage title="Verificando acesso…" />
  if (error) return <PageMessage title="Acesso indisponível" message={error} link={path === '/admin' ? '/admin/login' : '/login'} linkText="Ir para login" />
  if (path === '/admin' && user) return <AdminDashboard user={user} onLogout={logout} />
  if (!portal || !user) return <PageMessage title="Acesso indisponível" message="Não encontramos um perfil associado a esta conta." link="/login" linkText="Ir para login" />
  const masterPreview = isAdminUser(user) && /^\/(?:app|driver)\//.test(path)
  if (path === '/entregador' || path.startsWith('/driver/')) {
    return <CourierPortal user={user} portal={portal} onLogout={logout} masterPreview={masterPreview} />
  }
  return <MerchantPortal user={user} portal={portal} onLogout={logout} masterPreview={masterPreview} />
}

function PageMessage({ title, message, link, linkText }: { title: string; message?: string; link?: string; linkText?: string }) {
  return <main className="auth-page"><section className="auth-card"><Brand /><h1>{title}</h1>{message && <p className="auth-description">{message}</p>}{link && <a className="auth-button auth-button-primary" href={link}>{linkText ?? 'Continuar'}</a>}</section></main>
}

function MerchantPortal({ user, portal, onLogout, masterPreview = false }: { user: User; portal: Portal; onLogout: () => void; masterPreview?: boolean }) {
  const [currentPortal, setCurrentPortal] = useState(portal)
  const [supportOpen, setSupportOpen] = useState(false)
  const isStoreTeam = portal.role !== 'courier'
  const canManageSettings = masterPreview || ['owner', 'admin', 'manager'].includes(portal.role)
  useEffect(() => {
    syncTenantPwaIdentity(currentPortal, 'merchant')
  }, [currentPortal])
  return (
    <main className="portal-page" style={storeThemeStyle(currentPortal.brand.primary_color)}>
      {masterPreview && <MasterViewingBanner tenantName={currentPortal.tenantName} />}
      <PortalHeader user={user} title={currentPortal.tenantName} onLogout={onLogout} />
      <section className="portal-content" style={{ '--store-color': currentPortal.brand.primary_color ?? '#293125' } as React.CSSProperties}>
        <p className="eyebrow">AMBIENTE DA LOJA · {portal.role.toUpperCase()}</p>
        <h1>Bem-vindo à {currentPortal.tenantName}</h1>
        <p className="auth-description">{masterPreview ? 'Sessão Admin Master com visualização e gestão autorizadas desta loja.' : 'O acesso está autenticado e isolado para esta loja.'} Catálogo, frete e saldos são exibidos conforme seu perfil; integrações operacionais dependem das APIs de produção.</p>
        <div className="portal-cards">
          <article><Store size={20} /><h2>Dados da loja</h2>{currentPortal.logoUrl && <img className="tenant-logo-preview" src={currentPortal.logoUrl} alt={`Logomarca ${currentPortal.tenantName}`} />}<p>Vitrine: <a href={`/loja/${currentPortal.slug}`} target="_blank" rel="noreferrer">/loja/{currentPortal.slug}</a></p></article>
          <article><LifeBuoy size={20} /><h2>Suporte</h2><p>Triagem inicial e atendimento humano pela central Vancely.</p><button className="auth-button auth-button-secondary" onClick={() => setSupportOpen(true)}>Abrir suporte</button></article>
          <article><LockKeyhole size={20} /><h2>Integrações</h2><p>Catálogo, pedidos, faturamento e entregas aguardam configuração das APIs correspondentes.</p></article>
        </div>
        <section className="portal-panel">
          <div className="portal-panel-heading"><div><p className="eyebrow">APLICATIVOS DA LOJA</p><h2>Experiências PWA</h2></div><span>Disponíveis na estrutura atual</span></div>
          <div className="pwa-links">
            <a href={masterPreview ? `/app/${encodeURIComponent(currentPortal.slug)}` : '/app'}><Store size={17} /><span><b>Lojista + vendedor</b><small>{masterPreview ? `/app/${currentPortal.slug}` : '/app · acesso por perfil'}</small></span></a>
            <a href={masterPreview ? `/driver/${encodeURIComponent(currentPortal.slug)}` : '/entregador'}><Bike size={17} /><span><b>Motoboy</b><small>{masterPreview ? `/driver/${currentPortal.slug}` : '/entregador · acesso por perfil'}</small></span></a>
            <a href={`/loja/${currentPortal.slug}`} target="_blank" rel="noreferrer"><Store size={17} /><span><b>Cliente</b><small>/loja/{currentPortal.slug}</small></span></a>
          </div>
        </section>
        {isStoreTeam && <ProductCatalogManager portal={currentPortal} role={portal.role} />}
        {isStoreTeam && !masterPreview && <TenantCreditPanel portal={currentPortal} />}
        {canManageSettings && <ShippingSettings portal={currentPortal} />}
        {canManageSettings && <TenantAsaasSettings portal={currentPortal} />}
        {canManageSettings && <TenantBrandSettings portal={currentPortal} onSaved={(brand, logoUrl) => {
          setCurrentPortal((current) => ({ ...current, brand, logoUrl }))
        }} />}
      </section>
      {supportOpen && <SupportDialog user={user} tenantId={currentPortal.tenantId} onClose={() => setSupportOpen(false)} />}
    </main>
  )
}

function ShippingSettings({ portal }: { portal: Portal }) {
  const [freeUntilKm, setFreeUntilKm] = useState('0')
  const [pricePerKm, setPricePerKm] = useState('2.50')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setNotice('')
    void (async () => {
      try {
        const { data, error: queryError } = await requireSupabase().from('shipping_rules')
          .select('free_until_km, price_per_km').eq('tenant_id', portal.tenantId).maybeSingle()
        if (queryError) throw queryError
        if (active) {
          setFreeUntilKm(String(data?.free_until_km ?? 0))
          setPricePerKm(String(data?.price_per_km ?? 2.5))
        }
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [portal.tenantId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const freeDistance = Number(freeUntilKm)
      const rate = Number(pricePerKm)
      if (!freeUntilKm.trim() || !Number.isFinite(freeDistance) || freeDistance < 0 || freeDistance > 30) {
        throw new Error('A faixa de entrega grátis deve estar entre 0 e 30 km.')
      }
      if (!pricePerKm.trim() || !Number.isFinite(rate) || rate < 0 || rate > 99999.99) {
        throw new Error('Informe uma taxa válida entre R$ 0,00 e R$ 99.999,99 por km.')
      }
      const { error: saveError } = await requireSupabase().from('shipping_rules').upsert({
        tenant_id: portal.tenantId,
        free_until_km: freeDistance,
        price_per_km: rate,
      }, { onConflict: 'tenant_id' })
      if (saveError) throw saveError
      setNotice('Configuração de entrega atualizada.')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  return <section className="portal-panel">
    <div className="portal-panel-heading"><div><p className="eyebrow">ENTREGAS</p><h2><span aria-hidden="true">🛵</span> Configuração de Entrega</h2></div></div>
    <form className="delivery-settings-form" onSubmit={save}>
      <div className="delivery-setting">
        <div className="delivery-setting-heading">
          <label htmlFor="free-until-km">Entrega grátis até (km)</label>
          <output htmlFor="free-until-km-range">{Number(freeUntilKm || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</output>
        </div>
        <input
          id="free-until-km-range"
          className="delivery-range"
          type="range"
          min="0"
          max="30"
          step="0.1"
          value={Math.min(30, Math.max(0, Number(freeUntilKm) || 0))}
          onChange={(event) => setFreeUntilKm(event.target.value)}
          aria-label="Ajustar faixa de entrega grátis em quilômetros"
          disabled={loading}
        />
        <div className="delivery-range-limits"><span>0 km</span><span>30 km</span></div>
        <input
          id="free-until-km"
          type="number"
          min="0"
          max="30"
          step="0.1"
          required
          value={freeUntilKm}
          onChange={(event) => setFreeUntilKm(event.target.value)}
          disabled={loading}
        />
      </div>
      <label className="delivery-setting">Taxa por km adicional (R$)
        <span className="delivery-currency-input"><span aria-hidden="true">R$</span><input type="number" min="0" max="99999.99" step="0.01" inputMode="decimal" required value={pricePerKm} onChange={(event) => setPricePerKm(event.target.value)} disabled={loading} /></span>
      </label>
      <p className="image-optimization-note">A cobrança é calculada sobre a distância da rota: km acima da faixa grátis × taxa configurada. A distância precisa vir de um serviço de rotas integrado.</p>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message" role="status">{notice}</p>}
      <button className="auth-button auth-button-primary" type="submit" disabled={busy || loading}>{busy ? 'Salvando…' : 'Salvar configuração'}</button>
    </form>
  </section>
}

function TenantCreditPanel({ portal }: { portal: Portal }) {
  const [status, setStatus] = useState<TenantCreditStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: statusError } = await requireSupabase().rpc('tenant_credit_status', { p_tenant_id: portal.tenantId })
        if (statusError) throw statusError
        if (active) setStatus(data as TenantCreditStatus)
      } catch (reason) {
        if (active) setError(errorText(reason))
      }
    })()
    return () => { active = false }
  }, [portal.tenantId])

  return <section className="portal-panel">
    <div className="portal-panel-heading"><div><p className="eyebrow">CONSUMO DO PLANO</p><h2><Wallet size={17} /> Consultas e notas fiscais</h2></div></div>
    {error ? <p className="form-message form-error" role="alert">{error}</p> : status ? <>
      <p className="image-optimization-note">Ciclo atual até {new Date(status.period_end).toLocaleDateString('pt-BR')}. Créditos adicionais de placas são cumulativos; adicionais de NF-e expiram ao fim deste ciclo.</p>
      <div className="credit-summary">
        <article><b>Consultas de placas</b><span>{status.plates.monthly_used} / {status.plates.monthly_limit} da cota mensal</span><small>{status.plates.addon_balance} crédito(s) adicional(is), sem expiração</small></article>
        <article><b>Notas fiscais</b><span>{status.nfe.monthly_used} / {status.nfe.monthly_limit} da cota mensal</span><small>{status.nfe.addon_balance} crédito(s) adicional(is) neste ciclo</small></article>
      </div>
    </> : <p className="auth-description">Carregando saldos…</p>}
  </section>
}

function ProductCatalogManager({ portal, role }: { portal: Portal; role: string }) {
  const canDelete = ['owner', 'admin', 'manager', 'admin_master', 'vancely_admin'].includes(role)
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [editingId, setEditingId] = useState('')
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [costPrice, setCostPrice] = useState('0')
  const [stock, setStock] = useState('0')
  const [minimumStock, setMinimumStock] = useState('0')
  const [storageLocation, setStorageLocation] = useState('')
  const [compatibleMakes, setCompatibleMakes] = useState('')
  const [compatibleModels, setCompatibleModels] = useState('')
  const [compatibleYears, setCompatibleYears] = useState('')
  const [compatibleEngines, setCompatibleEngines] = useState('')
  const [published, setPublished] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [receipts, setReceipts] = useState<InventoryReceipt[]>([])
  const [receiptProductId, setReceiptProductId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceSeries, setInvoiceSeries] = useState('')
  const [invoiceAccessKey, setInvoiceAccessKey] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [expectedQuantity, setExpectedQuantity] = useState('1')
  const [countedQuantity, setCountedQuantity] = useState('1')
  const [receiptUnitCost, setReceiptUnitCost] = useState('')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [receiptBusy, setReceiptBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadProducts() {
    const { data, error: loadError } = await requireSupabase().from('products')
      .select('id, sku, name, description, price, cost_price, stock, minimum_stock, storage_location, image_url, compatible_makes, compatible_models, compatible_years, compatible_engines, is_published')
      .eq('tenant_id', portal.tenantId).order('name')
    if (loadError) throw loadError
    setProducts((data ?? []) as CatalogProduct[])
  }

  async function loadReceipts() {
    const client = requireSupabase()
    const { data, error: receiptError } = await client.from('inventory_receipts')
      .select('id, product_id, invoice_number, invoice_series, invoice_access_key, supplier_name, expected_quantity, counted_quantity, unit_cost, attachment_path, received_at')
      .eq('tenant_id', portal.tenantId)
      .order('received_at', { ascending: false })
      .limit(20)
    if (receiptError) throw receiptError
    const signedReceipts = await Promise.all((data ?? []).map(async (receipt) => {
      const { data: signedFile, error: signedFileError } = await client.storage
        .from('tenant-invoices').createSignedUrl(receipt.attachment_path, 3600)
      if (signedFileError) throw signedFileError
      return { ...receipt, attachment_url: signedFile.signedUrl }
    }))
    setReceipts(signedReceipts as InventoryReceipt[])
  }

  useEffect(() => {
    let active = true
    void Promise.all([loadProducts(), loadReceipts()])
      .catch((reason) => { if (active) setError(errorText(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [portal.tenantId])

  function editProduct(product: CatalogProduct) {
    setEditingId(product.id)
    setSku(product.sku)
    setName(product.name)
    setDescription(product.description ?? '')
    setPrice(String(product.price))
    setCostPrice(String(product.cost_price))
    setStock(String(product.stock))
    setMinimumStock(String(product.minimum_stock))
    setStorageLocation(product.storage_location)
    setCompatibleMakes(product.compatible_makes.join(', '))
    setCompatibleModels(product.compatible_models.join(', '))
    setCompatibleYears(product.compatible_years.join(', '))
    setCompatibleEngines(product.compatible_engines.join(', '))
    setPublished(product.is_published)
    setImageFile(null)
    setNotice('')
    setError('')
  }

  function clearForm() {
    setEditingId('')
    setSku('')
    setName('')
    setDescription('')
    setPrice('')
    setCostPrice('0')
    setStock('0')
    setMinimumStock('0')
    setStorageLocation('')
    setCompatibleMakes('')
    setCompatibleModels('')
    setCompatibleYears('')
    setCompatibleEngines('')
    setPublished(false)
    setImageFile(null)
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const client = requireSupabase()
      const productId = editingId || crypto.randomUUID()
      const years = splitList(compatibleYears).map(Number)
      if (years.some((year) => !Number.isInteger(year) || year < 1950 || year > 2100)) {
        throw new Error('Informe os anos de aplicação entre 1950 e 2100, separados por vírgula.')
      }
      if (![price, costPrice].every((value) => value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0)) {
        throw new Error('Informe valores válidos e não negativos para preço de venda e custo.')
      }
      if (![stock, minimumStock].every((value) => value.trim() && Number.isInteger(Number(value)) && Number(value) >= 0)) {
        throw new Error('Estoque atual e mínimo devem ser números inteiros não negativos.')
      }
      const productValues = {
        tenant_id: portal.tenantId,
        sku: sku.trim(),
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        cost_price: Number(costPrice),
        stock: Number(stock),
        minimum_stock: Number(minimumStock),
        storage_location: storageLocation.trim(),
        compatible_makes: splitList(compatibleMakes),
        compatible_models: splitList(compatibleModels),
        compatible_years: years,
        compatible_engines: splitList(compatibleEngines),
        is_published: published,
      }
      const saveResult = editingId
        ? await client.from('products').update(productValues).eq('id', productId).eq('tenant_id', portal.tenantId)
        : await client.from('products').insert({ ...productValues, id: productId })
      if (saveResult.error) throw saveResult.error
      if (imageFile) {
        const image = await convertImageToWebP(imageFile)
        const path = `tenants/${portal.tenantId}/products/${productId}.webp`
        const { error: uploadError } = await client.storage.from('tenant-media').upload(path, image, {
          cacheControl: '3600',
          contentType: 'image/webp',
          upsert: true,
        })
        if (uploadError) throw uploadError
        const imageUrl = `${client.storage.from('tenant-media').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
        const { error: imageUpdateError } = await client.from('products')
          .update({ image_url: imageUrl }).eq('id', productId).eq('tenant_id', portal.tenantId)
        if (imageUpdateError) throw imageUpdateError
      }
      await loadProducts()
      clearForm()
      setNotice('Produto salvo com sucesso.')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  function clearReceiptForm() {
    setReceiptProductId('')
    setInvoiceNumber('')
    setInvoiceSeries('')
    setInvoiceAccessKey('')
    setSupplierName('')
    setExpectedQuantity('1')
    setCountedQuantity('1')
    setReceiptUnitCost('')
    setInvoiceFile(null)
  }

  async function saveReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setReceiptBusy(true)
    setError('')
    setNotice('')
    let uploadedPath = ''
    let receiptRegistered = false
    try {
      if (!receiptProductId || !invoiceFile) {
        throw new Error('Selecione o produto e anexe o arquivo PDF ou XML da nota fiscal.')
      }
      const extension = invoiceFile.name.split('.').pop()?.toLowerCase()
      if (extension !== 'pdf' && extension !== 'xml') {
        throw new Error('A nota fiscal deve estar em arquivo PDF ou XML.')
      }
      if (invoiceFile.size > 15 * 1024 * 1024) {
        throw new Error('O arquivo da nota fiscal deve ter no máximo 15 MB.')
      }
      const expected = Number(expectedQuantity)
      const counted = Number(countedQuantity)
      const cost = Number(receiptUnitCost)
      if (!Number.isInteger(expected) || expected < 1 || !Number.isInteger(counted) || counted < 0) {
        throw new Error('Informe quantidades inteiras válidas para a nota e a conferência física.')
      }
      if (!Number.isFinite(cost) || cost < 0) {
        throw new Error('Informe um custo unitário válido, igual ou maior que zero.')
      }
      if (invoiceAccessKey.trim() && !/^\d{44}$/.test(invoiceAccessKey.trim())) {
        throw new Error('A chave de acesso da NF-e deve conter 44 dígitos.')
      }

      const client = requireSupabase()
      const receiptId = crypto.randomUUID()
      uploadedPath = `${portal.tenantId}/${receiptId}.${extension}`
      const { error: uploadError } = await client.storage.from('tenant-invoices').upload(uploadedPath, invoiceFile, {
        contentType: extension === 'pdf' ? 'application/pdf' : 'application/xml',
        upsert: false,
      })
      if (uploadError) throw uploadError
      const { error: registerError } = await client.rpc('register_inventory_receipt', {
        p_receipt_id: receiptId,
        p_tenant_id: portal.tenantId,
        p_product_id: receiptProductId,
        p_invoice_number: invoiceNumber.trim(),
        p_invoice_series: invoiceSeries.trim(),
        p_invoice_access_key: invoiceAccessKey.trim() || null,
        p_supplier_name: supplierName.trim(),
        p_expected_quantity: expected,
        p_counted_quantity: counted,
        p_unit_cost: cost,
        p_attachment_path: uploadedPath,
      })
      if (registerError) throw registerError
      receiptRegistered = true
      uploadedPath = ''
      clearReceiptForm()
      setNotice('Recebimento registrado. O estoque foi atualizado pela quantidade conferida.')
      await Promise.all([loadProducts(), loadReceipts()])
    } catch (reason) {
      const message = errorText(reason)
      if (receiptRegistered) {
        setError(`Recebimento registrado, mas não foi possível atualizar a tela: ${message}`)
      } else if (uploadedPath) {
        const { error: cleanupError } = await requireSupabase().storage.from('tenant-invoices').remove([uploadedPath])
        setError(cleanupError ? `${message} Não foi possível remover o anexo não registrado: ${cleanupError.message}` : message)
      } else {
        setError(message)
      }
    } finally {
      setReceiptBusy(false)
    }
  }

  async function deleteProduct(product: CatalogProduct) {
    if (receipts.some((receipt) => receipt.product_id === product.id)) {
      setError('Este produto possui recebimentos fiscais registrados e não pode ser excluído para preservar o histórico.')
      return
    }
    if (!window.confirm(`Excluir o produto "${product.name}"?`)) return
    setError('')
    setNotice('')
    try {
      const { error: deleteError } = await requireSupabase().from('products')
        .delete().eq('id', product.id).eq('tenant_id', portal.tenantId)
      if (deleteError) throw deleteError
      setProducts((current) => current.filter((item) => item.id !== product.id))
      if (editingId === product.id) clearForm()
      setNotice('Produto excluído.')
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  return <section className="portal-panel">
    <div className="portal-panel-heading"><div><p className="eyebrow">CATÁLOGO</p><h2><Package size={17} /> Produtos e peças</h2></div><span>{canDelete ? 'Acesso total' : 'Edição sem exclusão/configurações'}</span></div>
    <form className="product-editor-form" onSubmit={saveProduct}>
      <div className="auth-form-row">
        <label>SKU<input required maxLength={80} value={sku} onChange={(event) => setSku(event.target.value)} /></label>
        <label>Nome da peça<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
      </div>
      <label>Descrição<textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="auth-form-row">
        <label>Preço de venda (R$)<input type="number" min="0" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label>Custo unitário (R$)<input type="number" min="0" step="0.01" required value={costPrice} onChange={(event) => setCostPrice(event.target.value)} /></label>
      </div>
      <div className="auth-form-row">
        <label>Estoque atual<input type="number" min="0" step="1" required value={stock} onChange={(event) => setStock(event.target.value)} /></label>
        <label>Estoque mínimo<input type="number" min="0" step="1" required value={minimumStock} onChange={(event) => setMinimumStock(event.target.value)} /></label>
      </div>
      <label>Endereço físico / prateleira<input maxLength={120} value={storageLocation} onChange={(event) => setStorageLocation(event.target.value)} placeholder="Ex.: Corredor A · Estante 02 · Prateleira 3" /></label>
      <div className="inventory-fitment-fields">
        <h3>Aplicação veicular</h3>
        <p>Informe uma ou mais opções separadas por vírgula. Ex.: Toyota; Corolla; 2018, 2019; 1.8 Flex.</p>
        <div className="auth-form-row">
          <label>Marca(s)<input maxLength={500} value={compatibleMakes} onChange={(event) => setCompatibleMakes(event.target.value)} placeholder="Toyota, Honda" /></label>
          <label>Modelo(s)<input maxLength={500} value={compatibleModels} onChange={(event) => setCompatibleModels(event.target.value)} placeholder="Corolla, Civic" /></label>
        </div>
        <div className="auth-form-row">
          <label>Ano(s) do modelo<input maxLength={500} value={compatibleYears} onChange={(event) => setCompatibleYears(event.target.value)} placeholder="2018, 2019, 2020" /></label>
          <label>Motor(es)<input maxLength={500} value={compatibleEngines} onChange={(event) => setCompatibleEngines(event.target.value)} placeholder="1.8 Flex, 2.0" /></label>
        </div>
      </div>
      <label className="auth-checkbox"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Publicar na vitrine</label>
      <label>Foto da peça (PNG, JPEG ou WebP)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /><small>{imageFile?.name ?? 'A imagem será redimensionada e convertida para WebP antes do envio.'}</small></label>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message" role="status">{notice}</p>}
      <div className="product-form-actions">
        <button className="auth-button auth-button-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : editingId ? 'Atualizar produto' : 'Cadastrar produto'}</button>
        {editingId && <button className="auth-button auth-button-secondary" type="button" onClick={clearForm} disabled={busy}>Cancelar edição</button>}
      </div>
    </form>
    <div className="product-admin-list">
      {loading ? <p className="auth-description">Carregando produtos…</p> : products.length ? products.map((product) => <article key={product.id}>
        {product.image_url ? <img src={product.image_url} alt="" /> : <Package size={20} />}
        <div><b>{product.name}</b><small>{product.sku} · venda {money(Number(product.price))} · custo {money(Number(product.cost_price))} · estoque {product.stock}/{product.minimum_stock} mín. · {product.storage_location || 'sem endereço'} · {product.is_published ? 'publicado' : 'rascunho'}</small>{product.stock <= product.minimum_stock && product.minimum_stock > 0 && <span className="stock-warning">Estoque no mínimo ou abaixo</span>}{productFitment(product) && <small>{productFitment(product)}</small>}</div>
        <button className="auth-button auth-button-secondary" type="button" onClick={() => editProduct(product)}>Editar</button>
        {canDelete && <button className="product-delete-button" type="button" aria-label={`Excluir ${product.name}`} onClick={() => void deleteProduct(product)}><Trash2 size={16} /></button>}
      </article>) : <p className="auth-description">Nenhum produto cadastrado.</p>}
    </div>
    <div className="inventory-receipt">
      <div className="portal-panel-heading"><div><p className="eyebrow">ENTRADA DE ESTOQUE</p><h3>Conferência física e nota fiscal</h3></div><span>O estoque aumenta pela quantidade conferida</span></div>
      <form className="inventory-receipt-form" onSubmit={saveReceipt}>
        <label>Produto<select required value={receiptProductId} onChange={(event) => {
          setReceiptProductId(event.target.value)
          const selectedProduct = products.find((product) => product.id === event.target.value)
          if (selectedProduct) setReceiptUnitCost(String(selectedProduct.cost_price))
        }}><option value="">Selecione o produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label>
        <div className="auth-form-row">
          <label>Número da NF-e<input required maxLength={50} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
          <label>Série<input maxLength={20} value={invoiceSeries} onChange={(event) => setInvoiceSeries(event.target.value)} /></label>
        </div>
        <label>Chave de acesso da NF-e (44 dígitos)<input inputMode="numeric" maxLength={44} value={invoiceAccessKey} onChange={(event) => setInvoiceAccessKey(event.target.value.replace(/\D/g, '').slice(0, 44))} /></label>
        <label>Fornecedor<input maxLength={160} value={supplierName} onChange={(event) => setSupplierName(event.target.value)} /></label>
        <div className="auth-form-row">
          <label>Quantidade na nota<input type="number" min="1" step="1" required value={expectedQuantity} onChange={(event) => setExpectedQuantity(event.target.value)} /></label>
          <label>Quantidade conferida<input type="number" min="0" step="1" required value={countedQuantity} onChange={(event) => setCountedQuantity(event.target.value)} /></label>
        </div>
        <label>Custo unitário conferido (R$)<input type="number" min="0" step="0.01" required value={receiptUnitCost} onChange={(event) => setReceiptUnitCost(event.target.value)} /></label>
        <label>Nota fiscal (PDF ou XML, até 15 MB)<input type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml" required onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} /><small>{invoiceFile?.name ?? 'O documento fica em armazenamento privado da loja.'}</small></label>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {notice && <p className="form-message" role="status">{notice}</p>}
        <button className="auth-button auth-button-primary" type="submit" disabled={receiptBusy || products.length === 0}>{receiptBusy ? 'Registrando recebimento…' : 'Conferir e adicionar ao estoque'}</button>
      </form>
      <div className="inventory-receipt-history">
        <h3>Últimos recebimentos</h3>
        {loading ? <p className="auth-description">Carregando recebimentos…</p> : receipts.length ? receipts.map((receipt) => {
          const product = products.find((item) => item.id === receipt.product_id)
          return <article key={receipt.id}>
            <div><b>{product?.name ?? 'Produto'}</b><small>NF {receipt.invoice_number}{receipt.invoice_series && ` · série ${receipt.invoice_series}`} · previsto {receipt.expected_quantity} · conferido {receipt.counted_quantity} · {new Date(receipt.received_at).toLocaleString('pt-BR')}</small></div>
            <a className="auth-button auth-button-secondary" href={receipt.attachment_url} target="_blank" rel="noreferrer">Abrir NF-e</a>
          </article>
        }) : <p className="auth-description">Nenhum recebimento registrado.</p>}
      </div>
    </div>
  </section>
}

function TenantAsaasSettings({ portal }: { portal: Portal }) {
  const [walletId, setWalletId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: loadError } = await requireSupabase().rpc('get_tenant_asaas_wallet', { p_tenant_id: portal.tenantId })
        if (loadError) throw loadError
        if (active && typeof data === 'string') setWalletId(data)
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [portal.tenantId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(walletId.trim())) {
        throw new Error('Informe o walletId UUID da conta Asaas desta loja.')
      }
      const { error: saveError } = await requireSupabase().rpc('save_tenant_asaas_wallet', {
        p_tenant_id: portal.tenantId,
        p_wallet_id: walletId.trim(),
      })
      if (saveError) throw saveError
      setNotice('Carteira Asaas da loja salva. A chave de API permanece somente no servidor.')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  return <section className="portal-panel">
    <div className="portal-panel-heading"><div><p className="eyebrow">PAGAMENTOS DA LOJA</p><h2><Wallet size={17} /> Conta Asaas e split</h2></div></div>
    <p className="image-optimization-note">Informe o walletId da conta Asaas que receberá a parte da loja. A comissão da Vancely é separada no checkout. Nunca informe uma chave de API aqui.</p>
    <form className="asaas-settings-form" onSubmit={save}>
      <label>walletId Asaas<input required maxLength={36} value={walletId} onChange={(event) => setWalletId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" disabled={loading || busy} /></label>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message" role="status">{notice}</p>}
      <button className="auth-button auth-button-primary" type="submit" disabled={loading || busy}>{busy ? 'Salvando…' : 'Salvar carteira Asaas'}</button>
    </form>
  </section>
}

function TenantBrandSettings({ portal, onSaved }: { portal: Portal; onSaved: (brand: Portal['brand'], logoUrl: string | null) => void }) {
  const [appName, setAppName] = useState(portal.brand.app_name ?? portal.tenantName)
  const [primaryColor, setPrimaryColor] = useState(portal.brand.primary_color ?? '#293125')
  const [tagline, setTagline] = useState(portal.brand.tagline ?? '')
  const [showLogoWatermark, setShowLogoWatermark] = useState(portal.brand.show_logo_watermark ?? true)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUrl, setLogoUrl] = useState(portal.logoUrl)
  const [logoPreview, setLogoPreview] = useState('')
  const [appIcon192Url, setAppIcon192Url] = useState(portal.brand.app_icon_192_url ?? '')
  const [appIcon512Url, setAppIcon512Url] = useState(portal.brand.app_icon_512_url ?? '')
  const [banners, setBanners] = useState(portal.brand.promotional_banners ?? [])
  const [removedBanners, setRemovedBanners] = useState<string[]>([])
  const [bannerFiles, setBannerFiles] = useState<File[]>([])
  const [bannerPreviews, setBannerPreviews] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const previews = bannerFiles.map((file) => URL.createObjectURL(file))
    setBannerPreviews(previews)
    return () => previews.forEach((preview) => URL.revokeObjectURL(preview))
  }, [bannerFiles])

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('')
      return
    }
    const preview = URL.createObjectURL(logoFile)
    setLogoPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [logoFile])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const uploadedPaths: string[] = []
    let regeneratedAppIcons = false
    try {
      const client = requireSupabase()
      let updatedLogoUrl = logoUrl
      let updatedIcon192Url = appIcon192Url
      let updatedIcon512Url = appIcon512Url
      let iconSourceForApp: File | null = logoFile
      if (logoFile) {
        const image = await convertImageToWebP(logoFile, 800, 0.92, true)
        if (image.size > 5 * 1024 * 1024) {
          throw new Error('A logomarca excede o limite de 5 MB mesmo após a compactação.')
        }
        const path = `tenants/${portal.tenantId}/brand/logos/${crypto.randomUUID()}.webp`
        const { error: uploadError } = await client.storage.from('tenant-media').upload(path, image, {
          cacheControl: '3600',
          contentType: 'image/webp',
          upsert: false,
        })
        if (uploadError) throw uploadError
        uploadedPaths.push(path)
        updatedLogoUrl = `${client.storage.from('tenant-media').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
        iconSourceForApp = new File([image], 'tenant-logo.webp', { type: 'image/webp' })
      }
      const previousPrimaryColor = portal.brand.primary_color ?? '#293125'
      const shouldRegenerateIcons = Boolean(logoFile)
        || Boolean(updatedLogoUrl && (!appIcon192Url || !appIcon512Url || primaryColor.toLowerCase() !== previousPrimaryColor.toLowerCase()))
      if (shouldRegenerateIcons && updatedLogoUrl) {
        let iconSourceFile = iconSourceForApp
        if (!iconSourceFile) {
          const logoResponse = await fetch(updatedLogoUrl)
          if (!logoResponse.ok) throw new Error('Não foi possível carregar a logomarca atual para atualizar os ícones do aplicativo.')
          const logoBlob = await logoResponse.blob()
          iconSourceFile = new File([logoBlob], 'tenant-logo.webp', { type: logoBlob.type || 'image/webp' })
        }
        const iconBackground = /^#[\da-f]{6}$/i.test(primaryColor) ? primaryColor : '#293125'
        const iconImages = [
          { size: 192, image: await convertImageToWebP(iconSourceFile, 192, 0.9, false, 1, iconBackground, 0.8) },
          { size: 512, image: await convertImageToWebP(iconSourceFile, 512, 0.9, false, 1, iconBackground, 0.8) },
        ]
        for (const { size, image: iconImage } of iconImages) {
          const iconPath = `tenants/${portal.tenantId}/brand/icons/${crypto.randomUUID()}-${size}.webp`
          const { error: iconUploadError } = await client.storage.from('tenant-media').upload(iconPath, iconImage, {
            cacheControl: '3600',
            contentType: 'image/webp',
            upsert: false,
          })
          if (iconUploadError) throw iconUploadError
          uploadedPaths.push(iconPath)
          const iconUrl = client.storage.from('tenant-media').getPublicUrl(iconPath).data.publicUrl
          if (size === 192) updatedIcon192Url = iconUrl
          else updatedIcon512Url = iconUrl
        }
        regeneratedAppIcons = true
      }
      const uploadedBanners: string[] = []
      for (const [index, file] of bannerFiles.entries()) {
        const image = await convertImageToWebP(file, 1920, 0.84, false, 16 / 7)
        if (image.size > 5 * 1024 * 1024) {
          throw new Error(`A imagem "${file.name}" excede o limite de 5 MB mesmo após a compactação.`)
        }
        const path = `tenants/${portal.tenantId}/brand/banners/${crypto.randomUUID()}-${index}.webp`
        const { error: uploadError } = await client.storage.from('tenant-media').upload(path, image, {
          cacheControl: '3600',
          contentType: 'image/webp',
          upsert: false,
        })
        if (uploadError) throw uploadError
        uploadedPaths.push(path)
        uploadedBanners.push(client.storage.from('tenant-media').getPublicUrl(path).data.publicUrl)
      }
      const updatedBanners = [...banners, ...uploadedBanners]
      const { error: updateError } = await client.rpc('update_tenant_brand_with_pwa', {
        p_tenant_id: portal.tenantId,
        p_app_name: appName.trim(),
        p_primary_color: primaryColor,
        p_tagline: tagline.trim(),
        p_logo_url: updatedLogoUrl,
        p_banners: updatedBanners,
        p_show_logo_watermark: showLogoWatermark,
        p_app_icon_192_url: updatedIcon192Url || null,
        p_app_icon_512_url: updatedIcon512Url || null,
      })
      if (updateError) throw updateError
      uploadedPaths.length = 0
      setLogoUrl(updatedLogoUrl)
      setAppIcon192Url(updatedIcon192Url)
      setAppIcon512Url(updatedIcon512Url)
      setBanners(updatedBanners)
      setBannerFiles([])
      setLogoFile(null)
      onSaved({
        app_name: appName.trim(),
        primary_color: primaryColor.toLowerCase(),
        tagline: tagline.trim(),
        promotional_banners: updatedBanners,
        show_logo_watermark: showLogoWatermark,
        app_icon_192_url: updatedIcon192Url,
        app_icon_512_url: updatedIcon512Url,
      }, updatedLogoUrl)
      const removedIconPaths = regeneratedAppIcons
        ? [appIcon192Url, appIcon512Url].filter(Boolean).map((url) => tenantBrandStoragePath(url, portal.tenantId, 'icons'))
        : []
      const removedPaths = [...removedBanners
        .map((url) => tenantBannerStoragePath(url, portal.tenantId)), ...removedIconPaths]
        .filter((path): path is string => path !== null)
        .filter((path, index, allPaths) => allPaths.indexOf(path) === index)
      if (removedPaths.length) {
        const { error: removalError } = await client.storage.from('tenant-media').remove(removedPaths)
        if (removalError) {
          setError(`Alterações salvas, mas não foi possível excluir ${removedPaths.length} arquivo(s) antigo(s) do Storage: ${removalError.message}`)
        } else {
          setRemovedBanners([])
        }
      } else {
        setRemovedBanners([])
      }
      setNotice('Alterações salvas. A vitrine e o aplicativo do motoboy já estão atualizados.')
    } catch (reason) {
      const saveError = errorText(reason)
      if (uploadedPaths.length) {
        const { error: cleanupError } = await requireSupabase().storage.from('tenant-media').remove(uploadedPaths)
        setError(cleanupError ? `${saveError} Não foi possível remover os arquivos enviados sem salvar: ${cleanupError.message}` : saveError)
      } else {
        setError(saveError)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="portal-panel">
      <div className="portal-panel-heading"><div><p className="eyebrow">PERSONALIZAÇÃO WHITE-LABEL</p><h2><Palette size={17} /> Aparência dos aplicativos</h2></div></div>
      <form className="brand-settings-form" onSubmit={save}>
        <label>Nome do aplicativo<input required minLength={2} maxLength={60} value={appName} onChange={(event) => setAppName(event.target.value)} disabled={busy} /></label>
        <div className="brand-color-field">
          <span>Cor principal</span>
          <div className="brand-color-swatches" role="group" aria-label="Paleta de cores predefinidas">
            {BRAND_COLOR_SWATCHES.map((color) => <button
              key={color}
              type="button"
              className={primaryColor.toLowerCase() === color ? 'brand-color-swatch is-selected' : 'brand-color-swatch'}
              style={{ '--swatch-color': color } as React.CSSProperties}
              aria-label={`Selecionar cor ${color}`}
              aria-pressed={primaryColor.toLowerCase() === color}
              onClick={() => setPrimaryColor(color)}
              disabled={busy}
            />)}
          </div>
          <label className="brand-hex-input">Código hexadecimal<input type="text" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} pattern="^#[0-9A-Fa-f]{6}$" maxLength={7} placeholder="#293125" aria-label="Código hexadecimal da cor principal" disabled={busy} /></label>
        </div>
        <label>Frase da vitrine<input maxLength={120} value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="Ex.: Peças certas para seu veículo" disabled={busy} /></label>
        <label className="brand-logo-input">Logomarca (PNG, JPEG ou WebP)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} disabled={busy} /><small>{logoFile?.name ?? 'O fundo branco conectado às bordas será removido ao enviar a logo.'}</small>{(logoPreview || logoUrl) && <img className="brand-logo-preview" src={logoPreview || logoUrl || ''} alt={`Prévia da logomarca de ${portal.tenantName}`} />}</label>
        <label className="brand-watermark-toggle"><input type="checkbox" checked={showLogoWatermark} onChange={(event) => setShowLogoWatermark(event.target.checked)} disabled={busy || (!logoPreview && !logoUrl)} /><span><b>Aplicar logo como marca-d’água</b><small>Exibe a logo de forma discreta sobre toda a área da vitrine do cliente.</small></span></label>
        <div className="brand-banners">
          <h3>Banners Promocionais da Vitrine</h3>
          <p>Adicione até 5 imagens. Elas serão redimensionadas e convertidas para WebP antes do envio.</p>
          <label>Selecionar banners<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || banners.length + bannerFiles.length >= 5} onChange={(event) => {
            const selectedFiles = Array.from(event.currentTarget.files ?? [])
            event.currentTarget.value = ''
            const availableSlots = 5 - banners.length - bannerFiles.length
            if (selectedFiles.length > availableSlots) {
              setError(`Você pode manter no máximo 5 banners. Ainda há ${availableSlots} vaga(s) disponível(is).`)
              return
            }
            setError('')
            setBannerFiles((current) => [...current, ...selectedFiles])
          }} /></label>
          <div className="brand-banner-grid">
            {banners.map((url, index) => <figure key={url}>
              <img src={url} alt={`Banner promocional ${index + 1}`} />
              <button type="button" aria-label={`Remover banner ${index + 1}`} disabled={busy} onClick={() => {
                setRemovedBanners((current) => current.includes(url) ? current : [...current, url])
                setBanners((current) => current.filter((_, itemIndex) => itemIndex !== index))
              }}><X size={14} /></button>
            </figure>)}
            {bannerFiles.map((file, index) => <figure key={`${file.name}-${index}`}>
              <img src={bannerPreviews[index]} alt={`Prévia do banner ${file.name}`} />
              <button type="button" aria-label={`Remover arquivo ${file.name}`} disabled={busy} onClick={() => setBannerFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
            </figure>)}
          </div>
          <small>{banners.length + bannerFiles.length} de 5 banners selecionados</small>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {notice && <p className="form-message brand-save-toast" role="status">{notice}</p>}
        <button className="auth-button auth-button-primary brand-save-button" type="submit" disabled={busy}>
          <Upload size={15} /> {busy ? 'Salvando…' : 'Salvar Alterações'}
        </button>
      </form>
    </section>
  )
}

type CourierDeliveryOrder = {
  id: string
  order_number: number
  status: string
  payment_method: string
  payment_status: string
  subtotal: number
  shipping_amount: number
  total: number
  delivery_route_geometry: { type: 'LineString'; coordinates: [number, number][] } | null
  delivery_eta_seconds: number | null
  delivery_address: Record<string, unknown> | null
  customer_snapshot: Record<string, unknown>
  courier_id: string | null
  is_pickup: boolean
  created_at: string
  order_items: { product_name: string; sku: string; quantity: number }[]
}

const COURIER_DEMO_ORDER_ID = 'admin-preview-order'
const COURIER_DEMO_POSITIONS: LiveCourierPosition[] = [
  { latitude: -3.0992, longitude: -60.0255, heading: 140, recorded_at: '' },
  { latitude: -3.1011, longitude: -60.0238, heading: 140, recorded_at: '' },
  { latitude: -3.1038, longitude: -60.0217, heading: 140, recorded_at: '' },
  { latitude: -3.1061, longitude: -60.0193, heading: 140, recorded_at: '' },
  { latitude: -3.1088, longitude: -60.0171, heading: 140, recorded_at: '' },
]

function courierAddressLabel(address: Record<string, unknown> | null) {
  if (!address) return 'Endereço não informado'
  const value = (key: string) => typeof address[key] === 'string' ? address[key] as string : ''
  const street = [value('street'), value('number')].filter(Boolean).join(', ')
  const area = [value('district'), [value('city'), value('state')].filter(Boolean).join(' - ')].filter(Boolean).join(' · ')
  return [street, area, value('postal_code')].filter(Boolean).join(' · ') || 'Endereço não informado'
}

function courierMapLinks(address: Record<string, unknown> | null) {
  const query = encodeURIComponent(courierAddressLabel(address))
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${query}`,
    waze: `https://waze.com/ul?q=${query}&navigate=yes`,
  }
}

function CourierPortal({ user, portal, onLogout, masterPreview = false }: { user: User; portal: Portal; onLogout: () => void; masterPreview?: boolean }) {
  const [orders, setOrders] = useState<CourierDeliveryOrder[]>([])
  const [storeAddress, setStoreAddress] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [busyOrderId, setBusyOrderId] = useState('')
  const [activeOrder, setActiveOrder] = useState<CourierDeliveryOrder | null>(null)
  const [note, setNote] = useState('')
  const [amountReceived, setAmountReceived] = useState('')
  const [collectionMethod, setCollectionMethod] = useState<'' | 'cash' | 'card' | 'pix'>('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [trackingOrderId, setTrackingOrderId] = useState('')
  const [, setDemoStage] = useState<'ready' | 'in_transit' | 'delivered'>('ready')
  const [, setDemoPosition] = useState<LiveCourierPosition | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locationWatchRef = useRef<number | null>(null)
  const locationIntervalRef = useRef<number | null>(null)
  const demoIntervalRef = useRef<number | null>(null)
  const demoPositionIndexRef = useRef(0)
  const latestPositionRef = useRef<GeolocationPosition | null>(null)
  const trackingOrderRef = useRef('')

  useEffect(() => {
    syncTenantPwaIdentity(portal, 'courier')
  }, [portal])

  function stopLocationTracking() {
    if (locationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchRef.current)
      locationWatchRef.current = null
    }
    if (locationIntervalRef.current !== null) {
      window.clearInterval(locationIntervalRef.current)
      locationIntervalRef.current = null
    }
    if (demoIntervalRef.current !== null) {
      window.clearInterval(demoIntervalRef.current)
      demoIntervalRef.current = null
    }
    latestPositionRef.current = null
    trackingOrderRef.current = ''
    setTrackingOrderId('')
  }

  async function sendTrackingPosition() {
    const position = latestPositionRef.current
    const orderId = trackingOrderRef.current
    if (!position || !orderId) return
    const { latitude, longitude, heading } = position.coords
    const { error: insertError } = await requireSupabase().from('delivery_tracking').insert({
      order_id: orderId,
      courier_id: user.id,
      latitude,
      longitude,
      heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
    })
    if (insertError) setError(`GPS ativo, mas não foi possível enviar a posição: ${errorText(insertError)}`)
    else setError('')
  }

  function startLocationTracking(order: CourierDeliveryOrder) {
    if (masterPreview && order.id === COURIER_DEMO_ORDER_ID) {
      stopLocationTracking()
      setError('')
      trackingOrderRef.current = order.id
      setTrackingOrderId(order.id)
      demoPositionIndexRef.current = 0
      setDemoPosition({ ...COURIER_DEMO_POSITIONS[0], recorded_at: new Date().toISOString() })
      demoIntervalRef.current = window.setInterval(() => {
        demoPositionIndexRef.current = Math.min(demoPositionIndexRef.current + 1, COURIER_DEMO_POSITIONS.length - 1)
        setDemoPosition({ ...COURIER_DEMO_POSITIONS[demoPositionIndexRef.current], recorded_at: new Date().toISOString() })
      }, 20000)
      return
    }
    if (!navigator.geolocation) {
      setError('Este navegador não oferece geolocalização. Abra o PWA em um navegador compatível e permita o acesso ao GPS.')
      return
    }
    stopLocationTracking()
    setError('')
    trackingOrderRef.current = order.id
    setTrackingOrderId(order.id)
    let firstPosition = true
    try {
      locationWatchRef.current = navigator.geolocation.watchPosition((position) => {
        latestPositionRef.current = position
        if (firstPosition) {
          firstPosition = false
          void sendTrackingPosition()
        }
      }, (positionError) => {
        const message = positionError.code === positionError.PERMISSION_DENIED
          ? 'Permita o acesso à localização para iniciar o rastreamento da entrega.'
          : positionError.code === positionError.POSITION_UNAVAILABLE
            ? 'A localização do dispositivo está indisponível. Verifique o GPS e tente novamente.'
            : 'A leitura do GPS expirou. Verifique o sinal e tente novamente.'
        setError(message)
        if (positionError.code === positionError.PERMISSION_DENIED) stopLocationTracking()
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
      locationIntervalRef.current = window.setInterval(() => { void sendTrackingPosition() }, 20000)
    } catch (reason) {
      stopLocationTracking()
      setError(errorText(reason))
    }
  }

  useEffect(() => () => {
    if (locationWatchRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchRef.current)
    if (locationIntervalRef.current !== null) window.clearInterval(locationIntervalRef.current)
    if (demoIntervalRef.current !== null) window.clearInterval(demoIntervalRef.current)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const { data, error: queryError } = await requireSupabase().from('orders')
          .select('id, order_number, status, payment_method, payment_status, subtotal, shipping_amount, total, delivery_route_geometry, delivery_eta_seconds, delivery_address, customer_snapshot, courier_id, is_pickup, created_at, order_items(product_name, sku, quantity)')
          .eq('tenant_id', portal.tenantId)
          .eq('is_pickup', false)
          .in('status', ['approved', 'separating', 'checking', 'delivery'])
          .or(`courier_id.is.null,courier_id.eq.${user.id}`)
          .order('created_at', { ascending: true })
        if (queryError) throw queryError
        if (active) setOrders((data ?? []) as unknown as CourierDeliveryOrder[])
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [portal.tenantId, user.id, refreshKey])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: queryError } = await requireSupabase().from('tenants')
          .select('address').eq('id', portal.tenantId).single()
        if (queryError) throw queryError
        if (active) setStoreAddress(data.address as Record<string, unknown>)
      } catch (reason) {
        if (active) setError(errorText(reason))
      }
    })()
    return () => { active = false }
  }, [portal.tenantId])

  useEffect(() => {
    const client = requireSupabase()
    const channel = client.channel(`courier-orders-${portal.tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${portal.tenantId}`,
      }, () => setRefreshKey((current) => current + 1))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeState('connected')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeState('offline')
      })
    return () => { void client.removeChannel(channel) }
  }, [portal.tenantId])

  const availableOrders = orders.filter((order) => !order.courier_id)
  const activeOrders = orders.filter((order) => order.courier_id === user.id && order.status === 'delivery')
  const originLinks = courierMapLinks(storeAddress)

  async function acceptOrder(order: CourierDeliveryOrder) {
    setBusyOrderId(order.id)
    setError('')
    setNotice('')
    try {
      if (masterPreview && order.id === COURIER_DEMO_ORDER_ID) {
        setDemoStage('in_transit')
        setNotice(`Demonstração: pedido #${order.order_number} coletado e em trânsito.`)
        return
      }
      const { error: acceptError } = await requireSupabase().rpc('accept_delivery', { p_order_id: order.id })
      if (acceptError) throw acceptError
      setNotice(`Pedido #${order.order_number} atribuído à sua rota.`)
      setRefreshKey((current) => current + 1)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusyOrderId('')
    }
  }

  function openCompletion(order: CourierDeliveryOrder) {
    setActiveOrder(order)
    setNote('')
    setAmountReceived(order.payment_status === 'paid' ? '' : Number(order.total).toFixed(2))
    setCollectionMethod('')
    setProofFile(null)
    setError('')
  }

  async function completeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeOrder) return
    setBusyOrderId(activeOrder.id)
    setError('')
    let uploadedPath = ''
    try {
      if (masterPreview && activeOrder.id === COURIER_DEMO_ORDER_ID) {
        setDemoStage('delivered')
        stopLocationTracking()
        setActiveOrder(null)
        setNotice(`Demonstração: o cliente recebeu o pedido #${activeOrder.order_number}. Nenhum dado real foi alterado.`)
        return
      }
      const numericAmount = Number(amountReceived.replace(',', '.')) || 0
      if (numericAmount > 0 && !collectionMethod) throw new Error('Selecione como o valor foi recebido.')
      if (activeOrder.payment_status !== 'paid' && Math.round(numericAmount * 100) !== Math.round(Number(activeOrder.total) * 100)) {
        throw new Error(`Para concluir este pedido, registre o recebimento integral de ${money(Number(activeOrder.total))}.`)
      }
      if (proofFile && (proofFile.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type))) {
        throw new Error('A foto deve ser JPG, PNG ou WebP e ter no máximo 5 MB.')
      }
      const client = requireSupabase()
      if (proofFile) {
        const extension = proofFile.type === 'image/png' ? 'png' : proofFile.type === 'image/webp' ? 'webp' : 'jpg'
        uploadedPath = `tenants/${portal.tenantId}/delivery-proofs/${activeOrder.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await client.storage.from('delivery-proofs').upload(uploadedPath, proofFile, {
          contentType: proofFile.type,
          cacheControl: '3600',
          upsert: false,
        })
        if (uploadError) throw uploadError
      }
      const { error: completionError } = await client.rpc('complete_delivery', {
        p_order_id: activeOrder.id,
        p_note: note.trim(),
        p_amount_received: numericAmount,
        p_payment_method: numericAmount > 0 ? collectionMethod : null,
        p_proof_path: uploadedPath || null,
      })
      if (completionError) throw completionError
      if (trackingOrderRef.current === activeOrder.id) stopLocationTracking()
      setActiveOrder(null)
      setNotice(`Entrega do pedido #${activeOrder.order_number} concluída.`)
      setRefreshKey((current) => current + 1)
    } catch (reason) {
      const message = errorText(reason)
      if (uploadedPath) {
        const { error: cleanupError } = await requireSupabase().storage.from('delivery-proofs').remove([uploadedPath])
        setError(cleanupError ? `${message} Não foi possível remover a foto enviada sem concluir a entrega: ${cleanupError.message}` : message)
      } else {
        setError(message)
      }
    } finally {
      setBusyOrderId('')
    }
  }

  function deliveryCard(order: CourierDeliveryOrder, assigned: boolean) {
    const destinationLinks = courierMapLinks(order.delivery_address)
    const customerName = typeof order.customer_snapshot.full_name === 'string' ? order.customer_snapshot.full_name : 'Cliente'
    return <article className="courier-delivery-card" key={order.id}>
      <header><div><p className="eyebrow">{assigned ? 'SUA ROTA' : 'PRONTO PARA COLETA'}</p><h3>Pedido #{order.order_number}</h3></div><span className={`courier-payment-status ${order.payment_status === 'paid' ? 'is-paid' : ''}`}>{order.payment_status === 'paid' ? 'Pago via Asaas' : 'Pagamento pendente'}</span></header>
      <div className="courier-delivery-facts"><span>Frete <b>{money(Number(order.shipping_amount))}</b></span><span>Pagamento <b>{order.payment_method === 'pix' ? 'Pix' : order.payment_method === 'card' ? 'Cartão' : order.payment_method}</b></span><span>Total <b>{money(Number(order.total))}</b></span></div>
      {order.payment_status !== 'paid' && <p className="courier-collection-hint"><Banknote size={15} /> Se receber algum valor na entrega, registre na confirmação. O status Asaas não será alterado pelo PWA.</p>}
      <div className="courier-address-grid">
        <section><small><MapPin size={14} /> ORIGEM · LOJA</small><b>{portal.tenantName}</b><p>{courierAddressLabel(storeAddress)}</p><div><a href={originLinks.google} target="_blank" rel="noreferrer">Google Maps <ExternalLink size={12} /></a><a href={originLinks.waze} target="_blank" rel="noreferrer">Waze <ExternalLink size={12} /></a></div></section>
        <section><small><MapPin size={14} /> DESTINO · {customerName.toLocaleUpperCase('pt-BR')}</small><p>{courierAddressLabel(order.delivery_address)}</p><div><a href={destinationLinks.google} target="_blank" rel="noreferrer">Google Maps <ExternalLink size={12} /></a><a href={destinationLinks.waze} target="_blank" rel="noreferrer">Waze <ExternalLink size={12} /></a></div></section>
      </div>
      {assigned && <div className="courier-route-actions"><a className="auth-button auth-button-secondary" href={destinationLinks.google} target="_blank" rel="noreferrer"><Navigation size={15} /> Iniciar Navegação</a><a href={destinationLinks.waze} target="_blank" rel="noreferrer">Abrir no Waze <ExternalLink size={12} /></a></div>}
      <section className="courier-items-check"><h4><PackageCheck size={16} /> Conferência de peças</h4>{order.order_items.map((item) => <div key={`${item.sku}-${item.product_name}`}><span>{item.product_name}<small>SKU {item.sku}</small></span><b>× {item.quantity}</b></div>)}</section>
      {assigned && (trackingOrderId === order.id
        ? <div className="courier-tracking-controls"><span><i /> GPS transmitindo a cada 20 segundos</span><button type="button" className="auth-button auth-button-secondary" onClick={stopLocationTracking}>Parar rastreamento</button></div>
        : <button className="auth-button auth-button-secondary courier-action-button" type="button" onClick={() => startLocationTracking(order)}><MapPin size={16} /> Iniciar Corrida / A caminho da entrega</button>)}
      {assigned ? <button className="auth-button auth-button-primary courier-action-button" type="button" disabled={busyOrderId === order.id} onClick={() => openCompletion(order)}><CircleCheck size={16} /> Confirmar Entrega na Oficina</button> : <button className="auth-button auth-button-primary courier-action-button" type="button" disabled={busyOrderId === order.id || masterPreview} onClick={() => void acceptOrder(order)}><Bike size={16} /> {busyOrderId === order.id ? 'Atribuindo…' : 'Coletar Peça na Loja'}</button>}
    </article>
  }

  return <main className="portal-page" style={storeThemeStyle(portal.brand.primary_color)}>
    {masterPreview && <MasterViewingBanner tenantName={portal.tenantName} />}
    <PortalHeader user={user} title={`Entregas · ${portal.tenantName}`} onLogout={onLogout} />
    <section className="portal-content courier-workflow-page">
      <div className="courier-workflow-heading"><div><p className="eyebrow">PWA DO ENTREGADOR</p><h1>Olá, {user.user_metadata?.full_name ?? user.email}</h1><p className="auth-description">Fila e rotas de entrega da {portal.tenantName}.</p></div><span className={`courier-realtime-state ${realtimeState}`}><i /> {realtimeState === 'connected' ? 'Ao vivo' : realtimeState === 'offline' ? 'Reconectando' : 'Conectando'}</span></div>
      {!masterPreview && <div className="courier-workflow-stats"><article><span>Disponíveis</span><b>{availableOrders.length}</b></article><article><span>Na sua rota</span><b>{activeOrders.length}</b></article><button type="button" className="auth-button auth-button-secondary" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading}><RefreshCw size={15} /> Atualizar</button></div>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message courier-success-notice" role="status">{notice}</p>}
      {masterPreview && <p className="courier-preview-note">Visualização administrativa: ações de entrega ficam desativadas.</p>}
      {loading ? <p className="auth-description">Carregando pedidos de entrega…</p> : <div className="courier-delivery-columns">
        <section><div className="courier-section-heading"><h2>Minha rota</h2><span>{activeOrders.length}</span></div>{activeOrders.length ? activeOrders.map((order) => deliveryCard(order, true)) : <p className="courier-empty-state">Você ainda não tem entregas em andamento.</p>}</section>
        <section><div className="courier-section-heading"><h2>Fila de coleta</h2><span>{availableOrders.length}</span></div>{availableOrders.length ? availableOrders.map((order) => deliveryCard(order, false)) : <p className="courier-empty-state">Não há pedidos prontos para coleta neste momento.</p>}</section>
      </div>}
      <a className="auth-subtle-link courier-back-link" href={masterPreview ? `/app/${encodeURIComponent(portal.slug)}` : '/app'}>Acessar ambiente da loja</a>
    </section>
    {activeOrder && <div className="courier-confirm-backdrop" onClick={() => { if (!busyOrderId) setActiveOrder(null) }}>
      <form className="courier-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="courier-confirm-title" onSubmit={(event) => void completeOrder(event)} onClick={(event) => event.stopPropagation()}>
        <header><div><p className="eyebrow">BAIXA DA ROTA</p><h2 id="courier-confirm-title">Concluir pedido #{activeOrder.order_number}</h2></div><button type="button" className="icon-button" aria-label="Fechar confirmação" disabled={Boolean(busyOrderId)} onClick={() => setActiveOrder(null)}><X size={18} /></button></header>
        <p className="courier-confirm-address">{courierAddressLabel(activeOrder.delivery_address)}</p>
        {activeOrder.payment_status === 'paid' ? <p className="courier-paid-note">Pagamento já confirmado pelo Asaas. Não registre nova cobrança na entrega.</p> : <div className="courier-collection-fields"><label>Valor recebido na entrega (total: {money(Number(activeOrder.total))})<input inputMode="decimal" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} placeholder="0,00" /></label>{Number(amountReceived.replace(',', '.')) > 0 && <label>Forma de recebimento<select required value={collectionMethod} onChange={(event) => setCollectionMethod(event.target.value as typeof collectionMethod)}><option value="">Selecione…</option><option value="cash">Dinheiro</option><option value="card">Cartão</option><option value="pix">Pix</option></select></label>}<small>O status de pagamento do Asaas permanece inalterado; este valor fica registrado como recebimento na entrega.</small></div>}
        <label className="courier-note-field">Observação<textarea maxLength={1000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: entregue na recepção da oficina" /></label>
        <label className="courier-proof-field"><Camera size={16} /> Foto do comprovante (opcional)<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} />{proofFile && <small>{proofFile.name}</small>}</label>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        <div className="courier-confirm-actions"><button type="button" className="auth-button auth-button-secondary" disabled={Boolean(busyOrderId)} onClick={() => setActiveOrder(null)}>Cancelar</button><button type="submit" className="auth-button auth-button-primary" disabled={Boolean(busyOrderId)}><CircleCheck size={15} /> {busyOrderId === activeOrder.id ? 'Salvando entrega…' : 'Confirmar entrega'}</button></div>
      </form>
    </div>}
  </main>
}

function MasterViewingBanner({ tenantName }: { tenantName: string }) {
  return <aside className="master-viewing-banner"><span>Você está visualizando a loja <b>{tenantName}</b> como Admin Master.</span><a href="/admin">Voltar à Central Vancely</a></aside>
}

function PortalHeader({
  user,
  title,
  onLogout,
  tenantOptions,
}: {
  user: User
  title: string
  onLogout: () => void
  tenantOptions?: Pick<MasterStoreMetrics, 'id' | 'name' | 'slug'>[]
}) {
  return <header className="portal-header"><a href="/"><Brand /></a><span>{title}</span>{tenantOptions && <label className="master-tenant-select">Visualizar loja<select value="" aria-label="Assumir visão de uma loja" onChange={(event) => {
    if (event.target.value) navigate(`/app/${encodeURIComponent(event.target.value)}`)
  }}><option value="">Selecione uma loja…</option>{tenantOptions.map((tenant) => <option key={tenant.id} value={tenant.slug}>{tenant.name}</option>)}</select></label>}<div><small>{user.email}</small><button className="auth-button auth-button-secondary" onClick={onLogout}>Sair</button></div></header>
}

function MasterAdminProfile({ user }: { user: User }) {
  const [document, setDocument] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error: queryError } = await requireSupabase().from('master_admin_profiles')
          .select('document, postal_code').eq('user_id', user.id).maybeSingle()
        if (queryError) throw queryError
        if (active && data) {
          setDocument(data.document)
          setPostalCode(data.postal_code)
        }
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [user.id])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!isValidBrDocument(document)) {
      setError('Informe um CPF válido.')
      return
    }
    if (!/^\d{8}$/.test(postalCode)) {
      setError('Informe um CEP válido com 8 dígitos.')
      return
    }

    setBusy(true)
    try {
      const { error: saveError } = await requireSupabase().from('master_admin_profiles').upsert({
        user_id: user.id,
        document,
        postal_code: postalCode,
      }, { onConflict: 'user_id' })
      if (saveError) throw saveError
      setNotice('Dados do Admin Master salvos com segurança.')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  return <section className="portal-panel master-admin-profile">
    <div className="portal-panel-heading"><div><p className="eyebrow">DADOS DO ADMIN</p><h2>Perfil do Admin Master</h2></div></div>
    <form className="auth-form" onSubmit={(event) => void saveProfile(event)}>
      <div className="auth-form-row">
        <label>CPF<input inputMode="numeric" autoComplete="off" maxLength={11} value={document} onChange={(event) => setDocument(event.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="11 dígitos" disabled={loading || busy} required /></label>
        <label>CEP<input inputMode="numeric" autoComplete="postal-code" maxLength={8} value={postalCode} onChange={(event) => setPostalCode(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="8 dígitos" disabled={loading || busy} required /></label>
      </div>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      {notice && <p className="form-message" role="status">{notice}</p>}
      <button className="auth-button auth-button-primary" type="submit" disabled={loading || busy}>{loading ? 'Carregando…' : busy ? 'Salvando…' : 'Salvar dados'}</button>
    </form>
  </section>
}

function AdminDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [dashboard, setDashboard] = useState<MasterDashboardData | null>(null)
  const [error, setError] = useState('')
  const [supportOpen, setSupportOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('')

  async function loadAnalytics() {
    setLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await requireSupabase().rpc('get_master_dashboard_analytics')
      if (queryError) throw queryError
      const result = data as MasterDashboardData
      setDashboard(result)
      setSelectedMonth((current) => current || result.monthly_trend.at(-1)?.month || '')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAnalytics()
  }, [])

  const stores = dashboard?.stores ?? []
  const selectedTrend = dashboard?.monthly_trend.find((trend) => trend.month === selectedMonth)
  const monthlySales = stores.reduce((total, store) => total + Number(store.monthly_paid_sales), 0)
  const monthlySplit = stores.reduce((total, store) => total + Number(store.monthly_split_amount), 0)
  const monthlyDeliveries = stores.reduce((total, store) => total + Number(store.monthly_delivered), 0)
  const monthlyDeliveryFees = stores.reduce((total, store) => total + Number(store.monthly_delivery_fees), 0)
  const monthlyRouteFees = stores.reduce((total, store) => total + Number(store.monthly_route_fee_estimate), 0)
  const trendMax = Math.max(1, ...(dashboard?.monthly_trend ?? []).flatMap((trend) => [Number(trend.split_revenue), Number(trend.renewals_forecast_amount)]))

  return (
    <main className="portal-page">
      <PortalHeader user={user} title="Software Pai Vancely" onLogout={onLogout} tenantOptions={stores} />
      <section className="portal-content">
        <p className="eyebrow">ADMINISTRAÇÃO SAAS</p>
        <h1>Central Vancely</h1>
        <p className="auth-description">Acesso administrativo verificado pelo perfil seguro do Supabase Auth.</p>
        <MasterAdminProfile user={user} />
        <div className="admin-heading-actions">
          <span>{dashboard ? `Atualizado ${new Date(dashboard.generated_at).toLocaleTimeString('pt-BR')}` : 'Painel de métricas'}</span>
          <button className="auth-button auth-button-secondary" onClick={() => void loadAnalytics()} disabled={loading}><RefreshCw size={15} /> Atualizar</button>
        </div>
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {loading && !dashboard ? <p className="auth-description">Carregando métricas da plataforma…</p> : dashboard && <>
          <div className="admin-metrics-grid">
            <article><Store size={18} /><span>Lojas cadastradas</span><b>{stores.length}</b><small>{stores.filter((store) => store.status === 'active').length} ativas</small></article>
            <article><ChartNoAxesCombined size={18} /><span>Vendas pagas neste mês</span><b>{money(monthlySales)}</b><small>Subtotal registrado nos pedidos pagos</small></article>
            <article><LockKeyhole size={18} /><span>Split gerado neste mês</span><b>{money(monthlySplit)}</b><small>Receita reconhecida somente após liquidação: {money(stores.reduce((total, store) => total + Number(store.monthly_split_settled), 0))}</small></article>
            <article><ArrowRight size={18} /><span>Entregas concluídas</span><b>{monthlyDeliveries}</b><small>Fretes registrados: {money(monthlyDeliveryFees)}</small></article>
          </div>
          <div className="admin-analytics-grid">
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">12 MESES</p><h2>Splits e renovações previstas</h2></div><div className="admin-chart-legend"><span><i /> Split</span><span><i /> Renovação prevista</span></div></div>
              <div className="admin-chart" role="group" aria-label="Gráfico mensal interativo de split e renovações previstas">
                {dashboard.monthly_trend.map((trend) => {
                  const splitHeight = Math.max(2, Number(trend.split_revenue) / trendMax * 100)
                  const renewalHeight = Math.max(2, Number(trend.renewals_forecast_amount) / trendMax * 100)
                  const monthName = monthDisplayDate(trend.month).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
                  return <button className={`admin-chart-month ${selectedMonth === trend.month ? 'admin-chart-month-active' : ''}`} key={trend.month} onClick={() => setSelectedMonth(trend.month)} aria-pressed={selectedMonth === trend.month} aria-label={`${monthName}: split ${money(Number(trend.split_revenue))}, ${trend.renewals_forecast} renovações previstas`}>
                    <span className="admin-chart-bars"><i style={{ height: `${splitHeight}%` }} /><i style={{ height: `${renewalHeight}%` }} /></span>
                    <small>{monthName}</small>
                  </button>
                })}
              </div>
              {selectedTrend && <p className="admin-chart-summary">
                <b>{monthDisplayDate(selectedTrend.month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
                <span>Split: {money(Number(selectedTrend.split_revenue))}</span>
                <span>Liquidado: {money(Number(selectedTrend.settled_split_revenue))}</span>
                <span>Renovações previstas: {selectedTrend.renewals_forecast} · {money(Number(selectedTrend.renewals_forecast_amount))}</span>
              </p>}
              <p className="admin-disclaimer">Renovações são projeções de assinatura, não pagamentos processados. Esta base não possui histórico financeiro do gateway.</p>
            </section>
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">USO DA PLATAFORMA</p><h2>Consultas de placas</h2></div></div>
              <div className="plate-analytics-grid">
                {[
                  ['Hoje', dashboard.plate_lookups.daily, dashboard.plate_lookups.daily_api],
                  ['Semana', dashboard.plate_lookups.weekly, dashboard.plate_lookups.weekly_api],
                  ['Mês', dashboard.plate_lookups.monthly, dashboard.plate_lookups.monthly_api],
                  ['Ano', dashboard.plate_lookups.yearly, dashboard.plate_lookups.yearly_api],
                ].map(([label, count, apiCount]) => <div key={label}><small>{label}</small><b>{count}</b><span>{apiCount} via API</span></div>)}
              </div>
              <p className="admin-cost-line">API estimada (mês) <b>{money(Number(dashboard.plate_lookups.monthly_api_cost))}</b></p>
              <p className="admin-cost-line">Taxa estimada de cache (R$ 0,03/consulta) <b>{money(Number(dashboard.plate_lookups.monthly_cache_fee_estimate))}</b></p>
              <p className="admin-disclaimer">Limites de placas por plano e cobrança efetiva ainda não estão configurados.</p>
            </section>
          </div>
          <section className="admin-analytics-grid admin-operations-grid">
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">LOGÍSTICA</p><h2>Rotas e taxas registradas</h2></div></div>
              <div className="admin-logistics-summary"><div><small>Entregas concluídas no mês</small><b>{monthlyDeliveries}</b></div><div><small>Frete registrado nos pedidos</small><b>{money(monthlyDeliveryFees)}</b></div><div><small>Taxa estimada pelas regras e rotas</small><b>{money(monthlyRouteFees)}</b></div></div>
              <p className="admin-disclaimer">A estimativa aplica as regras existentes (km grátis e preço por km) às distâncias dos pedidos entregues. Custos de chamadas de geocodificação e roteirização não são contabilizados; o cálculo não substitui a cobrança efetiva.</p>
            </section>
            <section className="portal-panel">
              <div className="portal-panel-heading"><div><p className="eyebrow">RECEITAS ADICIONAIS</p><h2>Produtos e NF-e</h2></div></div>
              <p className="admin-disclaimer">O schema atual não registra vendas de blocos de estoque nem de notas fiscais adicionais. Nenhum valor é contabilizado para evitar receita fictícia ou duplicada.</p>
            </section>
          </section>
        </>}
        <section className="tenant-list">
          <div className="portal-panel-heading"><div><p className="eyebrow">LOJAS E PLANOS</p><h2>Lojas cadastradas</h2></div><button className="auth-button auth-button-primary" onClick={() => setSupportOpen(true)}><MessageCircle size={15} /> Central de suporte</button></div>
          {!loading && !error && stores.length === 0 ? <p className="auth-description">Nenhuma loja cadastrada.</p> : stores.map((store) => (
            <article className="tenant-row" key={store.id}>
              <div className="tenant-row-heading"><div><b>{store.name}</b><small>/loja/{store.slug} · {store.plan_name ?? 'Sem plano'}</small></div><span className={`tenant-status status-${store.status}`}>{store.status}</span></div>
              <nav className="tenant-pwa-actions" aria-label={`Aplicativos de ${store.name}`}>
                <a className="tenant-pwa-action" href={`/loja/${encodeURIComponent(store.slug)}`}><ShoppingCart size={15} /> Vitrine Cliente</a>
                <a className="tenant-pwa-action" href={`/app/${encodeURIComponent(store.slug)}`}><PanelsTopLeft size={15} /> Painel Lojista</a>
                <a className="tenant-pwa-action" href={`/driver/${encodeURIComponent(store.slug)}`}><Bike size={15} /> App Motoboy</a>
              </nav>
              <div className="tenant-metrics">
                <span><small>Vendas pagas no mês</small><b>{money(Number(store.monthly_paid_sales))}</b></span>
                <span><small>Pedidos pagos</small><b>{store.monthly_paid_orders}</b></span>
                <span><small>Entregas concluídas</small><b>{store.monthly_delivered}</b></span>
                <span><small>Plano / mensalidade</small><b>{store.plan_name ?? '—'} · {store.monthly_price == null ? '—' : `${money(Number(store.monthly_price))}/mês`}</b></span>
                <span><small>Comissão do plano</small><b>{store.commission_rate == null ? '—' : `${(Number(store.commission_rate) * 100).toLocaleString('pt-BR')}%`}</b></span>
                <span><small>Split gerado / liquidado</small><b>{money(Number(store.monthly_split_amount))} / {money(Number(store.monthly_split_settled))}</b></span>
                <span><small>Frete registrado</small><b>{money(Number(store.monthly_delivery_fees))}</b></span>
                <span><small>Taxa estimada por rota</small><b>{money(Number(store.monthly_route_fee_estimate))}</b></span>
                <span><small>Distância média registrada</small><b>{store.monthly_average_distance_km == null ? '—' : `${Number(store.monthly_average_distance_km).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`}</b></span>
                <span><small>Renovação prevista</small><b>{store.current_period_end ? new Date(store.current_period_end).toLocaleDateString('pt-BR') : '—'} · {store.subscription_status ?? 'sem assinatura'}</b></span>
              </div>
            </article>
          ))}
        </section>
      </section>
      {supportOpen && <SupportDialog user={user} admin onClose={() => setSupportOpen(false)} />}
    </main>
  )
}

function CustomerAccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [courierPositions, setCourierPositions] = useState<Record<string, LiveCourierPosition>>({})
  const ordersRef = useRef<CustomerOrder[]>([])
  const [authMode, setAuthMode] = useState<'login' | 'register'>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login',
  )
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [cancelBusyId, setCancelBusyId] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [liveNotice, setLiveNotice] = useState('')
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState({
    full_name: '',
    document: '',
    phone: '',
    postal_code: '',
    street: '',
    address_number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
  })

  const requestedNext = new URLSearchParams(window.location.search).get('next')
  const nextPath = requestedNext && /^\/loja\/[^/?#]+(?:\?checkout=1)?$/.test(requestedNext)
    ? requestedNext
    : ''
  const returnMessage = new URLSearchParams(window.location.search).get('retorno')
  const returningOrder = new URLSearchParams(window.location.search).get('pedido')

  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const client = requireSupabase()
        const { data: sessionData, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) return
        const { data: userData, error: userError } = await client.auth.getUser()
        if (userError) throw userError
        if (!userData.user) return
        const { data: profileData, error: profileError } = await client.from('customer_profiles')
          .select('user_id, full_name, document, phone, postal_code, street, address_number, complement, district, city, state')
          .eq('user_id', userData.user.id)
          .maybeSingle()
        if (profileError) throw profileError
        if (!active) return
        setUser(userData.user)
        setEmail(userData.user.email ?? '')
        if (profileData) {
          const currentProfile = profileData as CustomerProfile
          setProfile(currentProfile)
          setFields({
            full_name: currentProfile.full_name,
            document: currentProfile.document,
            phone: currentProfile.phone,
            postal_code: currentProfile.postal_code,
            street: currentProfile.street,
            address_number: currentProfile.address_number,
            complement: currentProfile.complement,
            district: currentProfile.district,
            city: currentProfile.city,
            state: currentProfile.state,
          })
          const { data: orderRows, error: ordersError } = await client.from('orders')
            .select('id, order_number, status, payment_status, payment_method, subtotal, shipping_amount, total, is_pickup, delivery_address, created_at, asaas_checkout_url')
            .eq('customer_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(50)
          if (ordersError) throw ordersError
          const rows = orderRows ?? []
          const orderIds = rows.map((order) => order.id)
          const { data: itemRows, error: itemsError } = orderIds.length
            ? await client.from('order_items').select('order_id, product_name, sku, quantity, unit_price').in('order_id', orderIds)
            : { data: [], error: null }
          if (itemsError) throw itemsError
          const { data: timelineRows, error: timelineError } = orderIds.length
            ? await client.from('order_status_events').select('order_id, status, created_at').in('order_id', orderIds).order('created_at', { ascending: true })
            : { data: [], error: null }
          if (timelineError) throw timelineError
          const trackingOrderIds = rows.filter((order) => order.status === 'delivery' && !order.is_pickup).map((order) => order.id)
          const { data: trackingRows, error: trackingError } = trackingOrderIds.length
            ? await client.rpc('get_customer_delivery_tracking', { p_order_ids: trackingOrderIds })
            : { data: [], error: null }
          if (trackingError) throw trackingError
          if (!active) return
          const typedTrackingRows = (trackingRows ?? []) as {
            order_id: string
            latitude: number
            longitude: number
            heading: number | null
            recorded_at: string
          }[]
          const positions = Object.fromEntries(typedTrackingRows.map((position) => [position.order_id, {
            latitude: Number(position.latitude),
            longitude: Number(position.longitude),
            heading: typeof position.heading === 'number' ? position.heading : null,
            recorded_at: position.recorded_at,
          }])) as Record<string, LiveCourierPosition>
          setCourierPositions(positions)
          setOrders(rows.map((order) => ({
            ...order,
            items: (itemRows ?? []).filter((item) => item.order_id === order.id),
            timeline: (timelineRows ?? []).filter((event) => event.order_id === order.id),
          })) as CustomerOrder[])
          if (nextPath) navigate(nextPath)
        } else {
          setEditing(true)
        }
      } catch (reason) {
        if (active) setError(errorText(reason))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user || loading) return
    const client = requireSupabase()
    setRealtimeState('connecting')
    const channel = client.channel(`customer-orders-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `customer_id=eq.${user.id}`,
      }, (payload) => {
        const changed = payload.new as Partial<CustomerOrder> & { id: string }
        const previous = ordersRef.current.find((order) => order.id === changed.id)
        if (!previous) return
        const statusChanged = previous.status !== changed.status
        const paymentChanged = previous.payment_status !== changed.payment_status
        if (!statusChanged && !paymentChanged) return
        const updatedOrder = { ...previous, ...changed }
        ordersRef.current = ordersRef.current.map((order) => order.id === changed.id ? updatedOrder : order)
        setOrders(ordersRef.current)
        const nextStatus = statusChanged && typeof changed.status === 'string' ? orderStatusLabel(changed.status) : 'Pagamento atualizado'
        const paymentMessage = paymentChanged && changed.payment_status === 'paid' ? 'Pagamento confirmado' : ''
        const message = `Pedido #${previous.order_number}: ${paymentMessage || nextStatus}.`
        setLiveNotice(message)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('Atualização do seu pedido', { body: message, tag: `order-${changed.id}` })
          } catch (reason) {
            setError(`O pedido foi atualizado, mas o navegador não mostrou a notificação: ${errorText(reason)}`)
          }
        }
        void client.from('order_status_events')
          .select('status, created_at')
          .eq('order_id', previous.id)
          .order('created_at', { ascending: true })
          .then(({ data, error: timelineError }) => {
            if (timelineError) {
              setError(`Pedido atualizado, mas não foi possível carregar a linha do tempo: ${errorText(timelineError)}`)
              return
            }
            ordersRef.current = ordersRef.current.map((entry) =>
              entry.id === previous.id ? { ...entry, timeline: data ?? [] } : entry,
            )
            setOrders(ordersRef.current)
          })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'delivery_tracking',
      }, (payload) => {
        const position = payload.new as {
          order_id: string
          latitude: number
          longitude: number
          heading: number | null
          recorded_at: string
        }
        const currentOrder = ordersRef.current.find((order) => order.id === position.order_id && order.status === 'delivery')
        if (!currentOrder) return
        setCourierPositions((current) => ({
          ...current,
          [position.order_id]: {
            latitude: Number(position.latitude),
            longitude: Number(position.longitude),
            heading: typeof position.heading === 'number' ? position.heading : null,
            recorded_at: position.recorded_at,
          },
        }))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeState('connected')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeState('offline')
      })
    return () => { void client.removeChannel(channel) }
  }, [user, loading])

  function updateField(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }))
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const client = requireSupabase()
      if (authMode === 'register') {
        const redirect = `${window.location.origin}/cliente/entrar${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`
        const { data, error: signupError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirect },
        })
        if (signupError) throw signupError
        if (!data.session) {
          setNotice('Conta criada. Confirme seu e-mail; depois entre para cadastrar CPF/CNPJ e concluir a compra.')
          return
        }
        window.location.reload()
        return
      }
      const { error: signinError } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (signinError) throw signinError
      window.location.reload()
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (!user) throw new Error('Entre na sua conta antes de salvar seus dados.')
      const document = fields.document.replace(/\D/g, '')
      if (!isValidBrDocument(document)) throw new Error('Informe um CPF ou CNPJ válido.')
      const phone = fields.phone.replace(/\D/g, '')
      if (phone.length < 10 || phone.length > 15) throw new Error('Informe um telefone com DDD válido.')
      const postalCode = fields.postal_code.replace(/\D/g, '')
      if (postalCode.length !== 8) throw new Error('Informe um CEP válido com 8 dígitos.')
      const { error: saveError } = await requireSupabase().rpc('save_customer_profile', {
        p_full_name: fields.full_name.trim(),
        p_document: document,
        p_phone: phone,
        p_postal_code: postalCode,
        p_street: fields.street.trim(),
        p_address_number: fields.address_number.trim(),
        p_complement: fields.complement.trim(),
        p_district: fields.district.trim(),
        p_city: fields.city.trim(),
        p_state: fields.state.trim().toUpperCase(),
      })
      if (saveError) throw saveError
      if (nextPath) {
        navigate(nextPath)
        return
      }
      setProfile({ user_id: user.id, ...fields, document, phone, postal_code: postalCode, state: fields.state.toUpperCase() })
      setEditing(false)
      setNotice('Seus dados foram salvos com segurança para os próximos pedidos.')
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    const { error: logoutError } = await requireSupabase().auth.signOut()
    if (logoutError) {
      setError(errorText(logoutError))
      return
    }
    window.location.reload()
  }

  async function enableOrderNotifications() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      setNotice('Este navegador não oferece notificações do sistema. As atualizações ao vivo continuam disponíveis nesta página.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      setNotice(permission === 'granted'
        ? 'Notificações ativadas. Avisaremos quando o status dos seus pedidos mudar.'
        : permission === 'denied'
          ? 'O navegador bloqueou notificações. Você ainda acompanha as mudanças nesta página.'
          : 'As notificações não foram ativadas. Você ainda acompanha as mudanças nesta página.')
    } catch (reason) {
      setError(`Não foi possível ativar notificações: ${errorText(reason)}`)
    }
  }

  async function cancelPendingOrder(orderId: string) {
    setCancelBusyId(orderId)
    setError('')
    try {
      const { error: cancelError } = await requireSupabase().rpc('cancel_my_pending_storefront_order', {
        p_order_id: orderId,
      })
      if (cancelError) throw cancelError
      window.location.reload()
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setCancelBusyId('')
    }
  }

  const themeColor = (() => {
    try {
      return localStorage.getItem('vancely-store-theme') ?? undefined
    } catch {
      return undefined
    }
  })()

  if (loading) return <PageMessage title="Carregando sua conta…" />
  return <main className="portal-page customer-account-page" style={storeThemeStyle(themeColor)}>
    <header className="portal-header">
      <a href="/"><Brand /></a>
      <span>Minha conta e pedidos</span>
      <div>{user ? <><small>{user.email}</small><button className="auth-button auth-button-secondary" onClick={() => void logout()}>Sair</button></> : <a className="auth-button auth-button-secondary" href="/">Voltar à vitrine</a>}</div>
    </header>
    <section className="portal-content customer-account-content">
      <p className="eyebrow">ÁREA DO CLIENTE</p>
      <h1><UserRound size={23} /> {user ? `Olá, ${profile?.full_name ?? user.email}` : 'Entre para finalizar sua compra'}</h1>
      {returningOrder && <p className="form-message customer-return-message" role="status">
        {returnMessage === 'cancelado' ? 'O checkout foi cancelado. Se o pedido ainda estiver pendente, você poderá tentar novamente abaixo.' : returnMessage === 'expirado' ? 'O prazo do checkout terminou. Verifique o status do pedido; o pagamento só será confirmado pelo retorno seguro do Asaas.' : 'Retorno do Asaas recebido. A confirmação de pagamento depende do webhook seguro e não apenas desta página.'}
      </p>}
      {!user ? <section className="portal-panel customer-auth-panel">
        <div className="portal-panel-heading"><div><p className="eyebrow">COMPRA SEGURA</p><h2>{authMode === 'login' ? 'Acesse sua conta' : 'Crie sua conta de cliente'}</h2></div></div>
        <p className="auth-description">Você pode navegar pelo catálogo sem entrar. Para finalizar o pedido, identificamos sua conta e guardamos seus dados e histórico.</p>
        <form className="customer-profile-form" onSubmit={submitAuth}>
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Senha<input type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error && <p className="form-message form-error" role="alert">{error}</p>}
          {notice && <p className="form-message" role="status">{notice}</p>}
          <button className="auth-button auth-button-primary" type="submit" disabled={busy}>{busy ? 'Aguarde…' : authMode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <button className="auth-subtle-link customer-mode-toggle" type="button" onClick={() => { setAuthMode((mode) => mode === 'login' ? 'register' : 'login'); setError(''); setNotice('') }}>
          {authMode === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </section> : <>
        {profile && !editing && <section className="portal-panel customer-profile-summary">
          <div className="portal-panel-heading"><div><p className="eyebrow">DADOS SALVOS</p><h2>Seu cadastro</h2></div><button className="auth-button auth-button-secondary" onClick={() => setEditing(true)}>Editar dados</button></div>
          <p><b>{profile.full_name}</b> · Documento {profile.document.length === 11 ? 'CPF' : 'CNPJ'} final {profile.document.slice(-4)}</p>
          <small>{profile.phone} · CEP {profile.postal_code}</small>
        </section>}
        {(editing || !profile) && <section className="portal-panel">
          <div className="portal-panel-heading"><div><p className="eyebrow">CADASTRO ÚNICO</p><h2>Dados para compra e garantia</h2></div></div>
          <p className="auth-description">Seu CPF/CNPJ e contato ficam vinculados à sua conta e são reutilizados nos próximos pedidos. A loja só recebe os dados necessários ao pedido.</p>
          <form className="customer-profile-form" onSubmit={saveProfile}>
            <label>Nome completo ou razão social<input required minLength={2} maxLength={160} value={fields.full_name} onChange={(event) => updateField('full_name', event.target.value)} /></label>
            <div className="auth-form-row">
              <label>CPF ou CNPJ<input required inputMode="numeric" maxLength={18} value={fields.document} onChange={(event) => updateField('document', event.target.value)} /></label>
              <label>Telefone com DDD<input required type="tel" autoComplete="tel" value={fields.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
            </div>
            <h3>Endereço padrão</h3>
            <div className="auth-form-row">
              <label>CEP<input required inputMode="numeric" autoComplete="postal-code" maxLength={9} value={fields.postal_code} onChange={(event) => updateField('postal_code', event.target.value)} /></label>
              <label>Rua / avenida<input maxLength={160} autoComplete="street-address" value={fields.street} onChange={(event) => updateField('street', event.target.value)} /></label>
            </div>
            <div className="auth-form-row">
              <label>Número<input maxLength={30} value={fields.address_number} onChange={(event) => updateField('address_number', event.target.value)} /></label>
              <label>Complemento<input maxLength={120} value={fields.complement} onChange={(event) => updateField('complement', event.target.value)} /></label>
            </div>
            <div className="auth-form-row">
              <label>Bairro<input maxLength={120} value={fields.district} onChange={(event) => updateField('district', event.target.value)} /></label>
              <label>Cidade<input maxLength={120} value={fields.city} onChange={(event) => updateField('city', event.target.value)} /></label>
              <label>UF<input maxLength={2} value={fields.state} onChange={(event) => updateField('state', event.target.value)} /></label>
            </div>
            {error && <p className="form-message form-error" role="alert">{error}</p>}
            {notice && <p className="form-message" role="status">{notice}</p>}
            <div className="product-form-actions">
              <button className="auth-button auth-button-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar meus dados'}</button>
              {profile && <button className="auth-button auth-button-secondary" type="button" onClick={() => { setEditing(false); setError('') }} disabled={busy}>Cancelar</button>}
            </div>
          </form>
        </section>}
        {profile && <section className="portal-panel customer-orders-panel">
          <div className="portal-panel-heading">
            <div><p className="eyebrow">HISTÓRICO E GARANTIA</p><h2>Meus pedidos</h2>
              <span className={`orders-live-indicator is-${realtimeState}`}><i />{realtimeState === 'connected' ? 'Acompanhamento ao vivo ativo' : realtimeState === 'connecting' ? 'Conectando atualizações ao vivo…' : 'Atualização ao vivo indisponível'}</span>
            </div>
            <div className="orders-toolbar">
              {notificationPermission === 'default' && <button className="auth-button auth-button-secondary" type="button" onClick={() => void enableOrderNotifications()}>Ativar notificações</button>}
              {notificationPermission === 'granted' && <span className="notification-enabled"><i />Notificações ativadas</span>}
              <button className="auth-button auth-button-secondary" type="button" onClick={() => window.location.reload()}>Atualizar</button>
            </div>
          </div>
          {(notificationPermission === 'unsupported' || notificationPermission === 'denied') && <small className="orders-notification-note">{notificationPermission === 'denied' ? 'Notificações do sistema foram bloqueadas no navegador; as mudanças de status aparecem nesta página em tempo real.' : 'Este navegador não oferece notificações do sistema; as mudanças de status aparecem aqui em tempo real.'}</small>}
          {liveNotice && <p className="orders-live-notice" role="status" aria-live="polite">{liveNotice}<button type="button" aria-label="Fechar notificação" onClick={() => setLiveNotice('')}><X size={14} /></button></p>}
          {realtimeState === 'offline' && <p className="orders-realtime-warning" role="status">Não foi possível manter a conexão ao vivo. Use “Atualizar” para consultar o status mais recente.</p>}
          {orders.length ? <div className="customer-orders-list">{orders.map((order) => <article key={order.id}>
            <div className="customer-order-heading"><div><b>Pedido #{order.order_number}</b><small>{new Date(order.created_at).toLocaleString('pt-BR')} · {order.is_pickup ? 'Retirada no balcão' : 'Entrega por motoboy'}</small></div><span className={`customer-order-status status-${order.payment_status}`}>{order.payment_status === 'paid' ? 'Pagamento confirmado' : order.payment_status === 'failed' ? 'Pagamento não concluído' : order.payment_status === 'refunded' ? 'Estornado' : 'Aguardando pagamento'}</span></div>
            <div className="customer-order-items">{order.items.map((item, index) => <span key={`${order.id}-${index}`}>{item.quantity}× {item.product_name} ({item.sku})</span>)}</div>
            {order.delivery_address && <small>{order.delivery_address.street}, {order.delivery_address.number} · CEP {order.delivery_address.postal_code}</small>}
            {order.status === 'delivery' && !order.is_pickup && <section className="customer-live-tracking"><h3><Bike size={15} /> Localização do motoboy</h3>{courierPositions[order.id] ? <><RouteMap courierPosition={courierPositions[order.id]} /><small>Última atualização: {new Date(courierPositions[order.id].recorded_at).toLocaleTimeString('pt-BR')}</small></> : <p>Aguardando a primeira posição do motoboy…</p>}</section>}
            <div className="customer-order-total"><span>{orderStatusLabel(order.status)}</span><b>Total {money(Number(order.total))}</b></div>
            <ol className={`customer-order-timeline${order.status === 'cancelled' ? ' is-cancelled' : ''}`} aria-label={`Acompanhamento do pedido ${order.order_number}`}>
              {(order.timeline.length ? order.timeline : [{ status: order.status, created_at: order.created_at }]).map((event, index) => <li key={`${order.id}-${event.status}-${event.created_at}-${index}`}>
                <i /><span><b>{orderStatusLabel(event.status)}</b><small>{new Date(event.created_at).toLocaleString('pt-BR')}</small></span>
              </li>)}
            </ol>
            {order.payment_status === 'pending' && order.asaas_checkout_url && <a className="auth-button auth-button-primary" href={order.asaas_checkout_url} target="_blank" rel="noreferrer">Continuar pagamento no Asaas</a>}
            {order.payment_status === 'pending' && !order.asaas_checkout_url && <button className="auth-button auth-button-secondary" type="button" disabled={cancelBusyId === order.id} onClick={() => void cancelPendingOrder(order.id)}>{cancelBusyId === order.id ? 'Cancelando…' : 'Cancelar pedido pendente'}</button>}
          </article>)}</div> : <p className="auth-description">Seus pedidos finalizados aparecerão aqui, com status e número para acompanhamento e garantia.</p>}
        </section>}
      </>}
    </section>
  </main>
}

function StorefrontShop({
  store,
  products,
  catalogLoaded,
  pickupEnabled,
  freeUntilKm,
  masterViewing,
}: {
  store: { id: string; slug: string; name: string; logo_url: string | null; whatsapp: string | null; status: string; brand: { app_name?: string; primary_color?: string; tagline?: string; promotional_banners?: string[] } }
  products: Pick<CatalogProduct, 'id' | 'sku' | 'name' | 'description' | 'price' | 'stock' | 'image_url' | 'compatible_makes' | 'compatible_models' | 'compatible_years' | 'compatible_engines'>[]
  catalogLoaded: boolean
  pickupEnabled: boolean
  freeUntilKm: number
  masterViewing: boolean
}) {
  const cartStorageKey = `vancely-cart-${store.slug}`
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(cartStorageKey)
      const parsed: unknown = saved ? JSON.parse(saved) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return Object.fromEntries(Object.entries(parsed).filter(([, quantity]) =>
        Number.isInteger(quantity) && Number(quantity) > 0,
      )) as Record<string, number>
    } catch {
      return {}
    }
  })
  const [userId, setUserId] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [plate, setPlate] = useState('')
  const [search, setSearch] = useState('')
  const [vehicleNotice, setVehicleNotice] = useState('')
  const [vehicleError, setVehicleError] = useState('')
  const [cartNotice, setCartNotice] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(() =>
    new URLSearchParams(window.location.search).get('checkout') === '1'
      && Object.values(cart).some((quantity) => quantity > 0),
  )
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'delivery'>(pickupEnabled ? 'pickup' : 'delivery')
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix')
  const [address, setAddress] = useState({
    postal_code: '', street: '', number: '', complement: '', district: '', city: '', state: '',
  })
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  useEffect(() => {
    if (!catalogLoaded) return
    const availableProducts = new Map(products.map((product) => [product.id, product.stock]))
    setCart((current) => {
      const next = Object.fromEntries(
        Object.entries(current)
          .flatMap(([id, quantity]) => {
            const stock = availableProducts.get(id)
            const maxQuantity = Math.max(stock ?? 0, store.status === 'trial' ? 1 : 0)
            return maxQuantity > 0 ? [[id, Math.min(quantity, maxQuantity)]] : []
          }),
      )
      return Object.keys(next).length === Object.keys(current).length
        && Object.entries(next).every(([id, quantity]) => current[id] === quantity)
        ? current
        : next
    })
  }, [catalogLoaded, products, store.status])

  useEffect(() => {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart))
    } catch (reason) {
      setCheckoutError(`Não foi possível salvar o carrinho neste navegador: ${errorText(reason)}`)
    }
  }, [cart, cartStorageKey])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const client = requireSupabase()
        const { data: sessionData, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (!sessionData.session) return
        const { data: userData, error: userError } = await client.auth.getUser()
        if (userError) throw userError
        if (!userData.user) return
        if (active) {
          setUserId(userData.user.id)
          setCustomerEmail(userData.user.email ?? '')
        }
        const { data, error: profileError } = await client.from('customer_profiles')
          .select('user_id, full_name, document, phone, postal_code, street, address_number, complement, district, city, state')
          .eq('user_id', userData.user.id).maybeSingle()
        if (profileError) throw profileError
        if (!active || !data) return
        const savedProfile = data as CustomerProfile
        setProfile(savedProfile)
        setAddress({
          postal_code: savedProfile.postal_code,
          street: savedProfile.street,
          number: savedProfile.address_number,
          complement: savedProfile.complement,
          district: savedProfile.district,
          city: savedProfile.city,
          state: savedProfile.state,
        })
      } catch (reason) {
        if (active) setCheckoutError(errorText(reason))
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!checkoutOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setCheckoutOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [checkoutOpen])

  const makes = [...new Set(products.flatMap((product) => product.compatible_makes))].sort()
  const vehiclesForMake = make
    ? products.filter((product) => product.compatible_makes.length === 0 || product.compatible_makes.some((value) => value.toLocaleLowerCase('pt-BR') === make.toLocaleLowerCase('pt-BR')))
    : products
  const models = [...new Set(vehiclesForMake.flatMap((product) => product.compatible_models))].sort()
  const vehiclesForModel = model
    ? vehiclesForMake.filter((product) => product.compatible_models.length === 0 || product.compatible_models.some((value) => value.toLocaleLowerCase('pt-BR') === model.toLocaleLowerCase('pt-BR')))
    : vehiclesForMake
  const years = [...new Set(vehiclesForModel.flatMap((product) => product.compatible_years.map(String)))].sort()
  const cartProducts = products.filter((product) => (cart[product.id] ?? 0) > 0)
  const cartCount = cartProducts.reduce((total, product) => total + cart[product.id], 0)
  const subtotal = cartProducts.reduce((total, product) => total + Number(product.price) * cart[product.id], 0)
  const filteredProducts = products.map((product, index) => ({
    product,
    index,
    score: search.trim() ? productSearchScore(search, product) : 0,
  })).filter(({ product, score }) => {
    const makeMatch = !make || product.compatible_makes.length === 0 || product.compatible_makes.some((value) => value.toLocaleLowerCase('pt-BR') === make.toLocaleLowerCase('pt-BR'))
    const modelMatch = !model || product.compatible_models.length === 0 || product.compatible_models.some((value) => value.toLocaleLowerCase('pt-BR') === model.toLocaleLowerCase('pt-BR'))
    const yearMatch = !year || product.compatible_years.length === 0 || product.compatible_years.includes(Number(year))
    return (!search.trim() || score > 0) && makeMatch && modelMatch && yearMatch
  }).sort((left, right) => right.score - left.score || left.index - right.index).map(({ product }) => product)

  function updateAddress(field: keyof typeof address, value: string) {
    setAddress((current) => ({ ...current, [field]: value }))
    if (field === 'postal_code') setQuote(null)
  }

  function updateCart(product: typeof products[number], change: number) {
    if (change > 0 && product.stock <= 0 && store.status !== 'trial') {
      setCartNotice(`${product.name} está sem estoque e não pode ser adicionado.`)
      return
    }
    if (change > 0) setCartNotice(`${product.name} adicionado ao carrinho.`)
    if (change > 0) setCheckoutOpen(true)
    setCart((current) => {
      const maxQuantity = Math.max(product.stock, store.status === 'trial' ? 1 : 0)
      const nextQuantity = Math.min(maxQuantity, Math.max(0, (current[product.id] ?? 0) + change))
      const updated = { ...current }
      if (nextQuantity === 0) delete updated[product.id]
      else updated[product.id] = nextQuantity
      return updated
    })
  }

  async function searchVehicleByPlate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setVehicleError('')
    setVehicleNotice('')
    const normalizedPlate = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (!/^[A-Z0-9]{7}$/.test(normalizedPlate)) {
      setVehicleError('Informe uma placa com 7 letras e números.')
      return
    }
    if (!userId) {
      setVehicleNotice('A consulta por placa exige uma conta. Você pode pesquisar por marca, modelo e ano sem entrar.')
      return
    }
    setSearchBusy(true)
    try {
      const { data, error: lookupError } = await requireSupabase().rpc('get_cached_vehicle', { p_plate: normalizedPlate })
      if (lookupError) throw lookupError
      const vehicle = data?.[0] as { make: string; model: string; year: number; motor: string } | undefined
      if (!vehicle) {
        setVehicleNotice('Essa placa ainda não está no cache. A consulta automática depende da integração de placas; pesquise pelo veículo ou peça nos campos abaixo.')
        return
      }
      setMake(vehicle.make)
      setModel(vehicle.model)
      setYear(String(vehicle.year))
      setVehicleNotice(`Veículo identificado no cache: ${vehicle.make} ${vehicle.model} ${vehicle.year}${vehicle.motor ? ` · ${vehicle.motor}` : ''}.`)
    } catch (reason) {
      setVehicleError(errorText(reason))
    } finally {
      setSearchBusy(false)
    }
  }

  async function lookupPostalCode() {
    const postalCode = address.postal_code.replace(/\D/g, '')
    if (postalCode.length !== 8) return
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`)
      if (!response.ok) throw new Error('Não foi possível consultar esse CEP agora.')
      const result = await response.json()
      if (result.erro) throw new Error('CEP não encontrado. Confira o número ou preencha o endereço manualmente.')
      setAddress((current) => ({
        ...current,
        street: result.logradouro || current.street,
        district: result.bairro || current.district,
        city: result.localidade || current.city,
        state: result.uf || current.state,
      }))
    } catch (reason) {
      setCheckoutError(errorText(reason))
    }
  }

  async function calculateCheckoutQuote() {
    setQuoteBusy(true)
    setCheckoutError('')
    setQuote(null)
    try {
      const postalCode = address.postal_code.replace(/\D/g, '')
      if (postalCode.length !== 8) throw new Error('Informe um CEP de entrega válido com 8 dígitos.')
      const { data, error: quoteError } = await requireSupabase().functions.invoke('quote-delivery', {
        body: { store_id: store.id, destination_cep: postalCode },
      })
      if (quoteError) {
        if (quoteError.context instanceof Response) {
          const responseBody = await quoteError.context.clone().json().catch(() => null)
          if (typeof responseBody?.error === 'string') throw new Error(responseBody.error)
        }
        throw quoteError
      }
      if (!data || typeof data.shipping_amount !== 'number' || typeof data.distance_km !== 'number') {
        throw new Error('O serviço de rotas retornou uma cotação inválida.')
      }
      setQuote(data as DeliveryQuote)
    } catch (reason) {
      setCheckoutError(errorText(reason))
    } finally {
      setQuoteBusy(false)
    }
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCheckoutError('')
    if (!cartProducts.length) {
      setCheckoutError('Adicione ao menos um produto ao carrinho.')
      return
    }
    if (deliveryOption === 'delivery' && !quote) {
      setCheckoutError('Calcule o frete pelo CEP antes de finalizar o pedido.')
      return
    }
    if (!userId) {
      navigate(`/cliente/entrar?next=${encodeURIComponent(`/loja/${store.slug}?checkout=1`)}`)
      return
    }
    if (!profile) {
      navigate(`/cliente/entrar?next=${encodeURIComponent(`/loja/${store.slug}?checkout=1`)}`)
      return
    }
    setCheckoutBusy(true)
    try {
      if (deliveryOption === 'delivery') {
        const postalCode = address.postal_code.replace(/\D/g, '')
        if (postalCode.length !== 8 || !address.street.trim() || !address.number.trim()
          || !address.city.trim() || !/^[A-Za-z]{2}$/.test(address.state.trim())) {
          throw new Error('Preencha CEP, rua, número, cidade e UF para receber por motoboy.')
        }
        await requireSupabase().rpc('save_customer_profile', {
          p_full_name: profile.full_name,
          p_document: profile.document,
          p_phone: profile.phone,
          p_postal_code: postalCode,
          p_street: address.street.trim(),
          p_address_number: address.number.trim(),
          p_complement: address.complement.trim(),
          p_district: address.district.trim(),
          p_city: address.city.trim(),
          p_state: address.state.trim().toUpperCase(),
        }).then(({ error: profileError }) => {
          if (profileError) throw profileError
        })
        const { data: quoteData, error: quoteError } = await requireSupabase().functions.invoke('quote-delivery', {
          body: { store_id: store.id, destination_cep: postalCode },
        })
        if (quoteError) {
          if (quoteError.context instanceof Response) {
            const responseBody = await quoteError.context.clone().json().catch(() => null)
            if (typeof responseBody?.error === 'string') throw new Error(responseBody.error)
          }
          throw quoteError
        }
        if (!quoteData || typeof quoteData.shipping_amount !== 'number' || typeof quoteData.distance_km !== 'number') {
          throw new Error('O serviço de rotas retornou uma cotação inválida.')
        }
        setQuote(quoteData as DeliveryQuote)
      }
      const client = requireSupabase()
      const { data: orderData, error: orderError } = await client.rpc('create_storefront_order', {
        p_tenant_id: store.id,
        p_items: cartProducts.map((product) => ({ product_id: product.id, quantity: cart[product.id] })),
        p_delivery_option: deliveryOption,
        p_delivery_address: deliveryOption === 'delivery' ? {
          postal_code: address.postal_code.replace(/\D/g, ''),
          street: address.street.trim(),
          number: address.number.trim(),
          complement: address.complement.trim(),
          district: address.district.trim(),
          city: address.city.trim(),
          state: address.state.trim().toUpperCase(),
        } : null,
        p_payment_method: paymentMethod,
      })
      if (orderError) throw orderError
      const order = orderData as { id: string; order_number: number; total: number }
      const { data: checkoutData, error: paymentError } = await client.functions.invoke('create-asaas-checkout', {
        body: { order_id: order.id },
      })
      if (paymentError) {
        if (paymentError.context instanceof Response) {
          const responseBody = await paymentError.context.clone().json().catch(() => null)
          if (typeof responseBody?.error === 'string') throw new Error(responseBody.error)
        }
        throw paymentError
      }
      if (typeof checkoutData?.checkout_url !== 'string' || !checkoutData.checkout_url.startsWith('https://')) {
        throw new Error('O Asaas não retornou um link seguro para pagamento. Consulte o histórico de pedidos antes de repetir.')
      }
      setCart({})
      localStorage.removeItem(cartStorageKey)
      window.location.assign(checkoutData.checkout_url)
    } catch (reason) {
      setCheckoutError(errorText(reason))
    } finally {
      setCheckoutBusy(false)
    }
  }

  const signInHref = `/cliente/entrar?next=${encodeURIComponent(`/loja/${store.slug}?checkout=1`)}`
  const registerHref = `/cliente/entrar?mode=register&next=${encodeURIComponent(`/loja/${store.slug}?checkout=1`)}`
  const whatsappNumber = store.whatsapp?.replace(/\D/g, '')
  const whatsappHref = `https://wa.me/${whatsappNumber ?? ''}?text=${encodeURIComponent('Olá! Tenho uma dúvida sobre compatibilidade de uma peça.')}`

  return <>
    <header className="storefront-heading storefront-store-header" style={{ '--storefront-logo-watermark': store.logo_url ? `url("${store.logo_url}")` : 'none' } as React.CSSProperties}>
      <div className="storefront-brand">
        {store.logo_url && <div className="storefront-logo-frame"><img className="storefront-logo" src={store.logo_url} alt={`Logomarca ${store.name}`} /></div>}
        <div><p className="eyebrow">VITRINE B2C / B2B</p><h1>{store.brand.app_name ?? store.name}</h1><p className="auth-description">{store.brand.tagline || `Vitrine oficial ${store.name}.`}</p></div>
      </div>
      <form className="storefront-top-search" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="storefront-header-search">
          <Search size={19} aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar peças, modelo, SKU ou código OEM" aria-label="Buscar peças, modelo, SKU ou código OEM" />
        </label>
        <button type="submit" aria-label="Buscar"><Search size={18} /></button>
      </form>
      <nav className="storefront-account-nav" aria-label="Conta e carrinho">
        {masterViewing ? <a className="auth-subtle-link" href="/admin">Central Vancely</a> : userId ? <a className="storefront-customer-link" href="/cliente"><UserRound size={17} /><span><small>Olá,</small><b>{profile?.full_name || customerEmail.split('@')[0] || 'Cliente'}</b></span></a> : <div className="storefront-signin-links"><a href={signInHref}>Entre</a><a href={registerHref}>Crie a sua conta</a></div>}
        <button className="storefront-header-cart" type="button" aria-label={`Abrir carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`} aria-expanded={checkoutOpen} onClick={() => setCheckoutOpen(true)}><ShoppingCart size={21} /><span>Carrinho</span><b>{cartCount}</b></button>
      </nav>
    </header>
    {store.brand.promotional_banners?.length ? <PromoBannerCarousel banners={store.brand.promotional_banners} /> : <section className="storefront-default-banner" aria-label="Destaque da loja"><span>PEÇAS CERTAS PARA O SEU VEÍCULO</span><h2>{store.brand.tagline || 'Encontre o que seu carro precisa.'}</h2><p>Consulte aplicação, disponibilidade e entrega com a loja.</p></section>}
    {store.status === 'trial' && <p className="storefront-trial-message">Loja em demonstração: você pode explorar o catálogo, mas pedidos e pagamentos ficam disponíveis após a ativação comercial.</p>}
    <section className="storefront-quick-links" aria-label="Atalhos da loja">
      <button type="button" onClick={() => { document.getElementById(`storefront-plate-${store.slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.requestAnimationFrame(() => document.getElementById(`storefront-plate-${store.slug}`)?.focus()) }}><span><CarFront size={20} /></span><b>Consulta por placa</b><small>Encontre peças para seu veículo</small></button>
      <a href={whatsappHref} target="_blank" rel="noreferrer"><span><MessageCircle size={20} /></span><b>Atendimento técnico</b><small>{whatsappNumber ? 'Tire dúvidas pelo WhatsApp' : 'Fale com um consultor'}</small></a>
    </section>
    <section className="storefront-catalog">
    <div className="storefront-shop-heading">
      <div><p className="eyebrow">CATÁLOGO DA LOJA</p><h2>Encontre sua peça</h2><p>Filtre pela aplicação do veículo e confira disponibilidade na loja.</p></div>
    </div>
    {cartNotice && <p className="storefront-cart-notice" role="status">{cartNotice}</p>}
    <div className="storefront-search-panel">
      <form className="storefront-plate-search" onSubmit={(event) => void searchVehicleByPlate(event)}>
        <label htmlFor={`storefront-plate-${store.slug}`}><CarFront size={16} /> Buscar peças pela placa</label>
        <div><input id={`storefront-plate-${store.slug}`} value={plate} maxLength={8} onChange={(event) => setPlate(event.target.value.toUpperCase())} placeholder="ABC1D23" aria-label="Placa do veículo" /><button className="auth-button auth-button-secondary" type="submit" disabled={searchBusy}>{searchBusy ? 'Buscando…' : 'Consultar placa'}</button></div>
      </form>
      <div className="storefront-fitment-search">
        <label>Marca<select value={make} onChange={(event) => { setMake(event.target.value); setModel(''); setYear('') }}><option value="">Todas as marcas</option>{makes.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Modelo<select value={model} onChange={(event) => { setModel(event.target.value); setYear('') }}><option value="">Todos os modelos</option>{models.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Ano<select value={year} onChange={(event) => setYear(event.target.value)}><option value="">Todos os anos</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label>
        {(search || make || model || year || plate) && <button className="storefront-clear-filters" type="button" onClick={() => {
          setSearch('')
          setMake('')
          setModel('')
          setYear('')
          setPlate('')
          setVehicleError('')
          setVehicleNotice('')
        }}>Limpar filtros</button>}
      </div>
      {vehicleError && <p className="form-message form-error" role="alert">{vehicleError}</p>}
      {vehicleNotice && <p className="form-message" role="status">{vehicleNotice}</p>}
    </div>
    {search.trim() && filteredProducts.length > 0 && <p className="storefront-search-results" role="status">{filteredProducts.length} {filteredProducts.length === 1 ? 'peça encontrada' : 'peças sugeridas'} para “{search}”, ordenadas por semelhança.</p>}
    {filteredProducts.length ? <div id="storefront-products" className="storefront-products">{filteredProducts.map((product) => {
      const quantity = cart[product.id] ?? 0
      return <article key={product.id}>
        {product.image_url ? <img src={product.image_url} alt="" /> : <div className="storefront-product-placeholder"><Package size={24} /></div>}
        <div><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}{productFitment(product) && <small className="storefront-fitment">{productFitment(product)}</small>}<b>{money(Number(product.price))}</b><small>{product.stock > 0 ? `${product.stock} em estoque` : 'Sem estoque disponível'}</small>
          {quantity === 0 ? <button className="auth-button auth-button-primary storefront-add-button" type="button" disabled={product.stock <= 0 && store.status !== 'trial'} onClick={() => updateCart(product, 1)}><ShoppingCart size={15} /> {product.stock > 0 ? 'Adicionar ao carrinho' : store.status === 'trial' ? 'Adicionar à prévia' : 'Produto esgotado'}</button> : <div className="storefront-quantity"><button type="button" aria-label={`Remover uma unidade de ${product.name}`} onClick={() => updateCart(product, -1)}><Minus size={14} /></button><b>{quantity}</b><button type="button" aria-label={`Adicionar uma unidade de ${product.name}`} disabled={quantity >= Math.max(product.stock, store.status === 'trial' ? 1 : 0)} onClick={() => updateCart(product, 1)}><Plus size={14} /></button></div>}
        </div>
      </article>
    })}</div> : <p className="storefront-empty-state">{!catalogLoaded ? 'Carregando produtos da loja…' : search.trim() ? `Não encontramos peças parecidas com “${search}”. Tente menos palavras ou confira a escrita.` : 'Nenhuma peça encontrada para esses filtros. Ajuste a busca ou pesquise pelo modelo.'}</p>}

    </section>
    {checkoutOpen && <div className="storefront-drawer-backdrop" onClick={() => setCheckoutOpen(false)}>
    <aside className="storefront-checkout storefront-cart-drawer" role="dialog" aria-modal="true" aria-label="Carrinho e finalização da compra" onClick={(event) => event.stopPropagation()}>
      <div className="portal-panel-heading"><div><p className="eyebrow">SEU PEDIDO</p><h2><ShoppingCart size={17} /> Carrinho e entrega</h2></div><button className="icon-button" type="button" aria-label="Fechar carrinho" onClick={() => setCheckoutOpen(false)}><X size={18} /></button></div>
      {cartProducts.length ? <div className="storefront-cart-items">{cartProducts.map((product) => <article key={product.id}>
        <div><b>{product.name}</b><small>{cart[product.id]} × {money(Number(product.price))}</small></div>
        <strong>{money(Number(product.price) * cart[product.id])}</strong>
        <div className="storefront-quantity"><button type="button" aria-label={`Remover uma unidade de ${product.name}`} onClick={() => updateCart(product, -1)}><Minus size={14} /></button><b>{cart[product.id]}</b><button type="button" aria-label={`Adicionar uma unidade de ${product.name}`} disabled={cart[product.id] >= product.stock} onClick={() => updateCart(product, 1)}><Plus size={14} /></button></div>
      </article>)}</div> : <p className="auth-description">Seu carrinho está vazio. Adicione uma peça para exibir as opções de frete e pagamento.</p>}
      {cartProducts.length > 0 && <form className="storefront-checkout-form" onSubmit={(event) => void checkout(event)}>
        <fieldset><legend>Como deseja receber?</legend>
          {pickupEnabled && <label className="checkout-choice"><input type="radio" name={`delivery-${store.slug}`} checked={deliveryOption === 'pickup'} onChange={() => { setDeliveryOption('pickup'); setQuote(null) }} /><span><b>Retirar no balcão</b><small>Sem cobrança de frete</small></span></label>}
          <label className="checkout-choice"><input type="radio" name={`delivery-${store.slug}`} checked={deliveryOption === 'delivery'} onChange={() => { setDeliveryOption('delivery'); setQuote(null) }} /><span><b>Receber por motoboy</b><small>{freeUntilKm > 0 ? `Frete grátis até ${freeUntilKm} km conforme regra da loja; além disso, a taxa é calculada pela rota.` : 'O frete é calculado pela rota e regra de preço da loja.'}</small></span></label>
        </fieldset>
        {deliveryOption === 'delivery' && <div className="storefront-delivery-address">
          {!userId && <p className="auth-description">Entre ou crie sua conta para preencher e guardar seu endereço, sem perder o carrinho.</p>}
          <div className="auth-form-row">
            <label>CEP<input required inputMode="numeric" autoComplete="postal-code" maxLength={9} value={address.postal_code} onChange={(event) => updateAddress('postal_code', event.target.value)} onBlur={() => void lookupPostalCode()} /></label>
            <label>Rua<input required maxLength={160} autoComplete="street-address" value={address.street} onChange={(event) => updateAddress('street', event.target.value)} /></label>
          </div>
          <div className="auth-form-row">
            <label>Número<input required maxLength={30} value={address.number} onChange={(event) => updateAddress('number', event.target.value)} /></label>
            <label>Complemento<input maxLength={120} value={address.complement} onChange={(event) => updateAddress('complement', event.target.value)} /></label>
          </div>
          <div className="auth-form-row">
            <label>Bairro<input maxLength={120} value={address.district} onChange={(event) => updateAddress('district', event.target.value)} /></label>
            <label>Cidade<input required maxLength={120} value={address.city} onChange={(event) => updateAddress('city', event.target.value)} /></label>
            <label>UF<input required maxLength={2} value={address.state} onChange={(event) => updateAddress('state', event.target.value.toUpperCase())} /></label>
          </div>
          <button className="auth-button auth-button-secondary" type="button" onClick={() => void calculateCheckoutQuote()} disabled={quoteBusy}>{quoteBusy ? 'Calculando rota…' : 'Calcular frete pelo CEP'}</button>
          {quote && <div className="delivery-quote-result"><b>{quote.shipping_amount === 0 ? 'Frete grátis' : money(quote.shipping_amount)}</b><span>{quote.distance_km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</span><small>A taxa será novamente validada no servidor ao criar o pedido.</small></div>}
        </div>}
        <fieldset><legend>Forma de pagamento pelo Asaas</legend>
          <label className="checkout-choice"><input type="radio" name={`payment-${store.slug}`} checked={paymentMethod === 'pix'} onChange={() => setPaymentMethod('pix')} /><span><b>Pix</b><small>Pagamento na página segura do Asaas</small></span></label>
          <label className="checkout-choice"><input type="radio" name={`payment-${store.slug}`} checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} /><span><b>Cartão de crédito</b><small>Os dados do cartão são informados somente no Asaas</small></span></label>
        </fieldset>
        <div className="storefront-order-summary"><span>Produtos</span><b>{money(subtotal)}</b><span>Frete</span><b>{deliveryOption === 'pickup' ? money(0) : quote ? money(quote.shipping_amount) : 'Calcular pelo CEP'}</b><strong>Total estimado</strong><strong>{money(subtotal + (deliveryOption === 'pickup' ? 0 : quote?.shipping_amount ?? 0))}</strong></div>
        {checkoutError && <p className="form-message form-error" role="alert">{checkoutError}</p>}
        <button className="auth-button auth-button-primary storefront-place-order" type="submit" disabled={checkoutBusy || cartProducts.length === 0 || store.status !== 'active'}>{store.status !== 'active' ? 'Pedidos indisponíveis nesta demonstração' : checkoutBusy ? 'Validando estoque e preparando pagamento…' : userId ? 'Validar pedido e pagar no Asaas' : 'Entrar / criar conta para comprar'}</button>
        <small className="checkout-secure-note">Preço, estoque, frete e total são validados no banco antes de abrir o checkout do Asaas. O pedido só é confirmado após o webhook de pagamento.</small>
      </form>}
    </aside>
    </div>}
  </>
}

function StorefrontPage({ slug }: { slug: string }) {
  const [store, setStore] = useState<{
    id: string
    slug: string
    name: string
    logo_url: string | null
    whatsapp: string | null
    status: string
    brand: { app_name?: string; primary_color?: string; tagline?: string; promotional_banners?: string[]; show_logo_watermark?: boolean; app_icon_192_url?: string; app_icon_512_url?: string }
  } | null>(null)
  const [products, setProducts] = useState<Pick<CatalogProduct, 'id' | 'sku' | 'name' | 'description' | 'price' | 'stock' | 'image_url' | 'compatible_makes' | 'compatible_models' | 'compatible_years' | 'compatible_engines'>[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [pickupEnabled, setPickupEnabled] = useState(false)
  const [freeUntilKm, setFreeUntilKm] = useState(0)
  const [masterViewing, setMasterViewing] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const client = requireSupabase()
        const { data: sessionData, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        let isMaster = false
        if (sessionData.session) {
          const { data: userData, error: userError } = await client.auth.getUser()
          if (userError) throw userError
          isMaster = userData.user ? isAdminUser(userData.user) : false
        }
        const { data, error: queryError } = isMaster
          ? await client.rpc('get_master_tenant_by_slug', { p_slug: slug })
          : await client.rpc('get_public_tenant', { p_slug: slug })
        if (queryError) throw queryError
        const currentStore = (data?.[0] as typeof store) ?? null
        if (!active) return
        setMasterViewing(isMaster)
        setStore(currentStore)
        if (currentStore) {
          const [{ data: catalog, error: catalogError }, { data: shippingRules, error: shippingError }] = await Promise.all([
            client.from('products')
            .select('id, sku, name, description, price, stock, image_url, compatible_makes, compatible_models, compatible_years, compatible_engines')
            .eq('tenant_id', currentStore.id)
            .eq('is_published', true)
            .order('name'),
            client.from('shipping_rules').select('pickup_enabled, free_until_km')
              .eq('tenant_id', currentStore.id).maybeSingle(),
          ])
          if (catalogError) throw catalogError
          if (shippingError) throw shippingError
          if (active) {
            setProducts((catalog ?? []) as typeof products)
            setCatalogLoaded(true)
            setPickupEnabled(Boolean(shippingRules?.pickup_enabled))
            setFreeUntilKm(Number(shippingRules?.free_until_km ?? 0))
            try {
              const color = currentStore.brand.primary_color
              if (color && /^#[\da-f]{6}$/i.test(color)) localStorage.setItem('vancely-store-theme', color)
            } catch (reason) {
              console.warn('Unable to persist storefront theme preference', reason)
            }
          }
        }
      } catch (reason) {
        if (active) setError(errorText(reason))
      }
    })()
    return () => { active = false }
  }, [slug])
  useEffect(() => {
    if (store) syncTenantPwaIdentity({ slug: store.slug, name: store.name, logoUrl: store.logo_url, brand: store.brand }, 'storefront')
  }, [store])
  return <main className="storefront-page" style={storeThemeStyle(store?.brand.primary_color)}>
    {masterViewing && store && <MasterViewingBanner tenantName={store.name} />}
    <section className="storefront-shell">
      {store?.logo_url && store.brand.show_logo_watermark !== false && <img className="storefront-watermark" src={store.logo_url} alt="" aria-hidden="true" />}
      {error && <section className="storefront-heading"><p className="eyebrow">VITRINE B2C / B2B</p><h1>Vitrine indisponível</h1><p className="auth-description">{error}</p></section>}
      {!store && !error && <section className="storefront-heading"><p className="eyebrow">VITRINE B2C / B2B</p><h1>Carregando vitrine…</h1></section>}
      {store && !error && <StorefrontShop store={store} products={products} catalogLoaded={catalogLoaded} pickupEnabled={pickupEnabled} freeUntilKm={freeUntilKm} masterViewing={masterViewing} />}
    </section>
  </main>
}

function PromoBannerCarousel({ banners }: { banners: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const currentIndex = activeIndex % banners.length
  useEffect(() => {
    if (banners.length < 2 || isHovered) return
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % banners.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [banners.length, isHovered, currentIndex])

  return <section className="storefront-banner-carousel" aria-label="Ofertas e banners promocionais" aria-roledescription="carrossel" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
    <img key={currentIndex} src={banners[currentIndex]} alt={`Oferta promocional ${currentIndex + 1}`} />
    {banners.length > 1 && <>
      <button type="button" aria-label="Banner anterior" onClick={() => setActiveIndex((index) => (index - 1 + banners.length) % banners.length)}><ArrowLeft size={18} /></button>
      <button type="button" aria-label="Próximo banner" onClick={() => setActiveIndex((index) => (index + 1) % banners.length)}><ArrowRight size={18} /></button>
      <div className="storefront-banner-dots">{banners.map((_, index) => <button key={index} type="button" aria-label={`Exibir banner ${index + 1}`} aria-current={index === currentIndex} onClick={() => setActiveIndex(index)} />)}</div>
    </>}
  </section>
}

function SupportDialog({ user, tenantId, admin = false, onClose }: { user: User; tenantId?: string; admin?: boolean; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [botAnswers, setBotAnswers] = useState<{ question: string; answer: string }[]>([])
  const [handoffQuestion, setHandoffQuestion] = useState('')
  const activeConversation = conversations.find((conversation) => conversation.id === activeId)

  async function loadConversations() {
    const client = requireSupabase()
    let query = client.from('support_conversations').select('id, tenant_id, subject, status, created_at').order('updated_at', { ascending: false })
    if (!admin && tenantId) query = query.eq('tenant_id', tenantId)
    const { data, error: queryError } = await query
    if (queryError) throw queryError
    const rows = (data ?? []) as Conversation[]
    setConversations(rows)
    setActiveId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '')
  }

  useEffect(() => {
    let active = true
    void loadConversations().catch((reason) => { if (active) setError(errorText(reason)) })
    const channel = requireSupabase().channel(`support-conversations-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => {
        void loadConversations().catch((reason) => setError(errorText(reason)))
      }).subscribe()
    return () => {
      active = false
      void requireSupabase().removeChannel(channel)
    }
  }, [tenantId, admin, user.id])

  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }
    let active = true
    const client = requireSupabase()
    const loadMessages = async () => {
      const { data, error: queryError } = await client.from('support_messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', activeId).order('created_at')
      if (queryError) throw queryError
      if (active) setMessages((data ?? []) as SupportMessage[])
    }
    void loadMessages().catch((reason) => { if (active) setError(errorText(reason)) })
    const channel = client.channel(`support-messages-${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${activeId}` }, () => {
        void loadMessages().catch((reason) => setError(errorText(reason)))
      }).subscribe()
    return () => {
      active = false
      void client.removeChannel(channel)
    }
  }, [activeId])

  function askBot(question: string) {
    const lower = question.toLocaleLowerCase('pt-BR')
    const answer = lower.includes('senha') || lower.includes('login')
      ? 'Para acessar, use o e-mail cadastrado em /login. Se o problema continuar, solicite atendimento humano.'
      : lower.includes('placa') || lower.includes('veículo')
        ? 'A consulta de placa depende da API de veículos configurada pela Vancely. A equipe pode verificar o status da integração.'
        : lower.includes('pedido') || lower.includes('entrega')
          ? 'Pedidos e entregas dependem das integrações operacionais da loja. Posso encaminhar sua dúvida para a equipe.'
          : 'Ainda não encontrei uma resposta automática para isso. Você pode tentar outra dúvida ou falar com a equipe Vancely.'
    setBotAnswers((current) => [...current, { question, answer }])
    setHandoffQuestion(question)
  }

  async function startHumanSupport() {
    if (!tenantId) return
    setError('')
    try {
      const client = requireSupabase()
      const subject = handoffQuestion || 'Solicitação de suporte'
      const { data, error: createError } = await client.from('support_conversations')
        .insert({ tenant_id: tenantId, created_by: user.id, subject })
        .select('id, tenant_id, subject, status, created_at').single()
      if (createError) throw createError
      const conversation = data as Conversation
      const { error: messageError } = await client.from('support_messages').insert({
        conversation_id: conversation.id, sender_id: user.id,
        body: handoffQuestion ? `Triagem: ${handoffQuestion}` : 'Solicito atendimento humano.',
      })
      if (messageError) throw messageError
      setConversations((current) => [conversation, ...current])
      setActiveId(conversation.id)
      setBotAnswers([])
      setHandoffQuestion('')
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    if (!body) return
    if (!activeId && !admin) {
      askBot(body)
      setDraft('')
      return
    }
    if (!activeId) return
    setError('')
    const { error: sendError } = await requireSupabase().from('support_messages').insert({
      conversation_id: activeId, sender_id: user.id, body,
    })
    if (sendError) setError(sendError.message)
    else setDraft('')
  }

  return (
    <div className="support-overlay" role="dialog" aria-modal="true" aria-label={admin ? 'Central de suporte' : 'Suporte Vancely'}>
      <section className={`support-dialog ${admin ? 'support-admin' : ''}`}>
        <header className="support-header"><div><MessageCircle size={19} /><span><b>{admin ? 'Central de suporte' : 'Suporte Vancely'}</b><small>{admin ? 'Atendimento dos lojistas' : 'Triagem e atendimento humano'}</small></span></div><button className="support-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header>
        <div className="support-body">
          {(admin || conversations.length > 0) && <nav className="support-threads" aria-label="Chamados">
            {!admin && <button className="new-thread-button" onClick={() => { setActiveId(''); setBotAnswers([]); setHandoffQuestion('') }}>Novo chamado</button>}
            {conversations.map((conversation) => <button key={conversation.id} className={conversation.id === activeId ? 'thread-active' : ''} onClick={() => setActiveId(conversation.id)}><b>{conversation.subject}</b><small>{conversation.status} · {conversation.tenant_id.slice(0, 8)}</small></button>)}
            {!conversations.length && <p>Nenhum chamado encontrado.</p>}
          </nav>}
          <section className="support-conversation">
            {!activeId && !admin ? <div className="bot-triage">
              <div className="bot-message">Olá! Sou o assistente Vancely. Como posso ajudar? Se eu não resolver, conecto você ao atendimento humano.</div>
              {botAnswers.map((entry, index) => <div className="bot-answer" key={`${index}-${entry.question}`}><div className="user-message">{entry.question}</div><div className="bot-message">{entry.answer}</div></div>)}
              <div className="faq-choices">
                <button onClick={() => askBot('Preciso de ajuda com login e senha')}>Login e senha</button>
                <button onClick={() => askBot('Como funciona a consulta de placa?')}>Consulta de placa</button>
                <button onClick={() => askBot('Tenho uma dúvida sobre pedido ou entrega')}>Pedidos e entregas</button>
              </div>
              {handoffQuestion && <button className="handoff-button" onClick={() => void startHumanSupport()}>Falar com atendimento humano <ArrowRight size={15} /></button>}
            </div> : activeConversation || admin ? <>
              <div className="message-list">
                {messages.map((message) => <div className={`chat-message ${message.sender_id === user.id ? 'chat-own' : ''}`} key={message.id}><p>{message.body}</p><time>{new Date(message.created_at).toLocaleString('pt-BR')}</time></div>)}
                {!messages.length && <p className="empty-chat">Selecione um chamado para acompanhar a conversa.</p>}
              </div>
              {activeId && <form className="chat-compose" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva uma mensagem…" required /><button aria-label="Enviar mensagem"><Send size={16} /></button></form>}
            </> : <div className="empty-chat">Selecione uma conversa ou comece pela triagem.</div>}
            {error && <p className="form-message form-error" role="alert">{error}</p>}
            {!admin && <div className="support-contact-links">
              <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <a href={`mailto:${SUPPORT_EMAIL}`}>E-mail</a>
            </div>}
          </section>
        </div>
      </section>
    </div>
  )
}

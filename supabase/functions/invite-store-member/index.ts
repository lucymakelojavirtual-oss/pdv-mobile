import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error('Member invitation service is not configured')

    const token = (request.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return jsonResponse({ error: 'Sign in as a store manager before inviting staff' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return jsonResponse({ error: 'The current session is invalid' }, 401)

    const body = await request.json()
    const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = body.role
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
      return jsonResponse({ error: 'A valid store is required' }, 400)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return jsonResponse({ error: 'Enter a valid team member email' }, 400)
    }
    if (role !== 'staff' && role !== 'courier') {
      return jsonResponse({ error: 'Only seller and courier invitations are allowed' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: membership, error: membershipError } = await admin.from('tenant_members')
      .select('role').eq('tenant_id', tenantId).eq('user_id', userData.user.id).maybeSingle()
    if (membershipError) throw membershipError
    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return jsonResponse({ error: 'Store manager access required' }, 403)
    }

    const { data: subscription, error: subscriptionError } = await admin.from('subscriptions')
      .select('plan_id').eq('tenant_id', tenantId).in('status', ['trial', 'active']).maybeSingle()
    if (subscriptionError) throw subscriptionError
    if (!subscription) return jsonResponse({ error: 'This store has no active plan' }, 409)
    const { data: plan, error: planError } = await admin.from('plans')
      .select('max_sellers, max_couriers').eq('id', subscription.plan_id).maybeSingle()
    if (planError) throw planError
    if (!plan) return jsonResponse({ error: 'The store plan could not be found' }, 409)

    const { count, error: countError } = await admin.from('tenant_members')
      .select('user_id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('role', role)
    if (countError) throw countError
    const limit = role === 'staff' ? plan.max_sellers : plan.max_couriers
    if ((count ?? 0) >= limit) return jsonResponse({ error: `The plan limit of ${limit} ${role === 'staff' ? 'seller(s)' : 'courier(s)'} has been reached` }, 409)

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_tenant_id: tenantId, invited_tenant_role: role },
    })
    if (inviteError) return jsonResponse({ error: inviteError.message }, 409)
    if (!invited.user) throw new Error('The authentication service did not return the invited user')

    const { error: insertError } = await admin.from('tenant_members').insert({
      tenant_id: tenantId,
      user_id: invited.user.id,
      role,
    })
    if (insertError) {
      await admin.auth.admin.deleteUser(invited.user.id)
      throw insertError
    }
    return jsonResponse({ invited: true, email, role })
  } catch (reason) {
    return jsonResponse({ error: reason instanceof Error ? reason.message : 'Unable to invite this team member' }, 500)
  }
})
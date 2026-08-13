import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
}

Deno.serve(async (req) => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders})
  if(req.method!=='POST') return json({error:'Method not allowed'},405)

  const supabaseUrl=Deno.env.get('SUPABASE_URL')!
  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl=Deno.env.get('APP_URL') || 'https://hassan-87psp.github.io/business-empire-webapp/'
  const authHeader=req.headers.get('Authorization')||''
  const jwt=authHeader.replace(/^Bearer\s+/i,'')
  if(!jwt) return json({error:'Not authenticated'},401)

  const admin=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:{user:caller},error:userErr}=await admin.auth.getUser(jwt)
  if(userErr||!caller) return json({error:'Invalid session'},401)
  const {data:owner}=await admin.from('profiles').select('id,role,status').eq('id',caller.id).maybeSingle()
  if(!owner||owner.role!=='owner'||owner.status!=='active') return json({error:'Owner access required'},403)

  const body=await req.json().catch(()=>({}))
  const action=String(body.action||'')

  if(action==='invite'){
    const email=String(body.email||'').trim().toLowerCase()
    const name=String(body.name||'').trim()
    const businessIds=Array.isArray(body.businessIds)?[...new Set(body.businessIds.map(String))]:[]
    if(!email.includes('@')||!name||businessIds.length===0) return json({error:'Name, email and at least one business are required'},400)
    const {data:existing}=await admin.from('profiles').select('id,status').eq('email',email).maybeSingle()
    if(existing) return json({error:'This email already exists. Edit or resend the existing collaborator instead.'},409)
    const {data:inv,error:invErr}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:appUrl,data:{name}})
    if(invErr||!inv.user) return json({error:invErr?.message||'Invite failed'},400)
    await admin.from('profiles').upsert({id:inv.user.id,email,name,role:'collaborator',status:'invited',updated_at:new Date().toISOString()},{onConflict:'id'})
    await admin.from('business_access').delete().eq('user_id',inv.user.id)
    const rows=businessIds.map(business_id=>({user_id:inv.user!.id,business_id,granted_by:caller.id}))
    const {error:accErr}=await admin.from('business_access').insert(rows)
    if(accErr) return json({error:accErr.message},400)
    return json({ok:true,userId:inv.user.id,status:'invited'})
  }

  const userId=String(body.userId||'')
  if(!userId) return json({error:'userId is required'},400)
  const {data:target}=await admin.from('profiles').select('id,email,name,status,role').eq('id',userId).maybeSingle()
  if(!target||target.role!=='collaborator') return json({error:'Collaborator not found'},404)

  if(action==='update_access'){
    const businessIds=Array.isArray(body.businessIds)?[...new Set(body.businessIds.map(String))]:[]
    const name=String(body.name||target.name||'').trim()
    if(!businessIds.length) return json({error:'At least one business is required'},400)
    await admin.from('profiles').update({name,updated_at:new Date().toISOString()}).eq('id',userId)
    await admin.from('business_access').delete().eq('user_id',userId)
    const {error}=await admin.from('business_access').insert(businessIds.map(business_id=>({user_id:userId,business_id,granted_by:caller.id})))
    if(error) return json({error:error.message},400)
    return json({ok:true})
  }

  if(action==='resend_invite'){
    if(target.status!=='invited') return json({error:'Only pending invitations can be resent'},400)
    const {data:access}=await admin.from('business_access').select('business_id').eq('user_id',userId)
    await admin.auth.admin.deleteUser(userId)
    const {data:inv,error}=await admin.auth.admin.inviteUserByEmail(target.email,{redirectTo:appUrl,data:{name:target.name||''}})
    if(error||!inv.user) return json({error:error?.message||'Resend failed'},400)
    await admin.from('profiles').upsert({id:inv.user.id,email:target.email,name:target.name||'',role:'collaborator',status:'invited',updated_at:new Date().toISOString()},{onConflict:'id'})
    if(access?.length) await admin.from('business_access').insert(access.map(a=>({user_id:inv.user!.id,business_id:a.business_id,granted_by:caller.id})))
    return json({ok:true,userId:inv.user.id})
  }

  if(action==='disable'){
    const {error}=await admin.auth.admin.updateUserById(userId,{ban_duration:'876000h'})
    if(error) return json({error:error.message},400)
    await admin.from('profiles').update({status:'disabled',updated_at:new Date().toISOString()}).eq('id',userId)
    return json({ok:true})
  }


  if(action==='remove'){
    const {error}=await admin.auth.admin.deleteUser(userId)
    if(error) return json({error:error.message},400)
    return json({ok:true})
  }

  return json({error:'Unknown action'},400)
})

// رفيق — google-token: returns a short-lived Google Drive access token for the signed-in user.
// Needs one secret in Supabase → Edge Functions → Secrets:  GOOGLE_CLIENT_SECRET
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
import { createClient } from 'npm:@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = '684548318481-m5h5qbl7fgbbiof6kf2g34af3p469lqr.apps.googleusercontent.com';
const ALLOWED_ORIGINS = ['https://myrafeeq.github.io', 'https://omarmostafa599-star.github.io'];

function cors(req: Request) {
  const o = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json(req, { error: 'unauthorized' }, 401);

    const { data: link } = await admin.from('google_links').select('refresh_token').eq('user_id', user.id).maybeSingle();
    if (!link) return json(req, { error: 'not_linked' });

    const secret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!secret) return json(req, { error: 'missing_secret' });

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: secret, refresh_token: link.refresh_token, grant_type: 'refresh_token' }),
    });
    const g = await r.json();
    if (!r.ok) {
      if (g.error === 'invalid_grant') { // user removed access from their Google account
        await admin.from('google_links').delete().eq('user_id', user.id);
        return json(req, { error: 'not_linked' });
      }
      return json(req, { error: g.error || 'google_error' }, 502);
    }
    return json(req, { access_token: g.access_token, expires_in: g.expires_in ?? 3600 });
  } catch (e) {
    return json(req, { error: 'server', detail: String(e) }, 500);
  }
});

const { createClient } = require('@supabase/supabase-js')

// El backend usa la service_role key cuando está disponible (bypasea RLS,
// nunca se expone al navegador). Si todavía no está configurada, cae a la
// anon key para no romper el entorno de desarrollo.
function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
  return createClient(process.env.SUPABASE_URL, key)
}

module.exports = { getSupabase }

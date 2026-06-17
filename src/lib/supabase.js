import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // Mensaje claro en consola si faltan las variables
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisá tu .env')
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true }
})

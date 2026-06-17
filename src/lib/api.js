import { supabase } from './supabase'

// Llama a la Edge Function "ai" pasando el token del usuario.
export async function ai(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')

  const { data, error } = await supabase.functions.invoke('ai', {
    body: { action, payload }
  })
  if (error) {
    // supabase.functions.invoke envuelve los errores; intentamos leer el detalle
    let detail = error.message
    try {
      const ctx = await error.context?.json?.()
      if (ctx?.error) detail = ctx.error
    } catch { /* noop */ }
    throw new Error(detail || 'Error llamando a la IA')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Fecha de HOY en horario de Argentina (YYYY-MM-DD), no UTC.
const AR_TZ = 'America/Argentina/Buenos_Aires'
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())

// Etiqueta amigable: "Hoy", "Ayer" o la fecha.
export function dateLabel(day) {
  const t = today()
  const y = new Intl.DateTimeFormat('en-CA', {
    timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(Date.now() - 86400000))
  if (day === t) return 'Hoy'
  if (day === y) return 'Ayer'
  const [Y, M, D] = day.split('-')
  return `${D}/${M}/${Y}`
}

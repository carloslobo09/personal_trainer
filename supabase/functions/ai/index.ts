// ============================================================
//  Edge Function "ai" — proxy seguro a Groq (Llama, gratis)
//  Tu GROQ_API_KEY vive como SECRETO acá, nunca en el navegador.
//
//  Deploy:  supabase functions deploy ai --project-ref <ref>
//  Secreto: supabase secrets set GROQ_API_KEY=...  (gratis en console.groq.com)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
// Modelo gratuito de Groq. Alternativas: 'llama-3.1-8b-instant' (más rápido).
const MODEL = 'llama-3.3-70b-versatile'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

// Describe la forma del JSON esperado para el modo JSON de Groq
function typeHint(s: any): string {
  if (!s || typeof s !== 'object') return 'valor'
  if (s.type === 'array') return `[ ${typeHint(s.items)} ]`
  if (s.type === 'object') {
    const parts = Object.entries(s.properties || {}).map(([k, v]: any) =>
      `"${k}": ${typeHint(v)}${v.description ? ` /* ${v.description} */` : ''}`)
    return `{ ${parts.join(', ')} }`
  }
  const m: Record<string, string> = { string: 'string', number: 'número', integer: 'entero', boolean: 'booleano' }
  return m[s.type] || 'valor'
}
function schemaHint(schema: any) {
  return 'Respondé SOLO con un objeto JSON válido (sin markdown, sin texto extra) con esta forma exacta:\n' +
    typeHint(schema)
}

async function callAI(opts: { system: string; user: string; max_tokens?: number; schema?: any }) {
  const messages = [
    { role: 'system', content: opts.system },
    { role: 'user', content: opts.schema ? `${opts.user}\n\n${schemaHint(opts.schema)}` : opts.user }
  ]
  const body: any = { model: MODEL, max_tokens: opts.max_tokens ?? 1024, temperature: 0.7, messages }
  if (opts.schema) body.response_format = { type: 'json_object' }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function profileBlock(p: any) {
  if (!p) return 'Sin datos de perfil.'
  return [
    `Altura: ${p.height_cm ?? '?'} cm`, `Peso: ${p.weight_kg ?? '?'} kg`,
    `Creatina diaria: ${p.creatine_g ?? 0} g`, `Objetivo: ${p.goal ?? '-'}`,
    `Actividad: ${p.activity ?? '-'}`,
    p.body_composition ? `Composición/complexión: ${p.body_composition}` : '',
    p.notes ? `Notas: ${p.notes}` : ''
  ].filter(Boolean).join('\n')
}

function candidatesBlock(cands: any[]) {
  return (cands || []).slice(0, 140)
    .map((c) => `${c.id} | ${c.name} | ${c.muscle} | ${c.equipment}`).join('\n')
}

function goalGuide(goal: string) {
  const g: Record<string, string> = {
    definir: 'Objetivo DEFINIR / quemar grasa: 15-20 reps por serie, peso moderado-bajo, descanso corto (~30-45s).',
    equilibrio: 'Objetivo EQUILIBRIO (músculo + algo de quema): 10-15 reps por serie, descanso medio (~60s).',
    musculo: 'Objetivo MÚSCULO / fuerza: 6-10 reps por serie, peso alto, descanso largo (~90-120s).'
  }
  return g[goal] || g.equilibrio
}

// ----- Fechas en horario de Argentina -----
const AR_TZ = 'America/Argentina/Buenos_Aires'
const fmtAR = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const todayAR = () => fmtAR(new Date())
const daysAgoAR = (n: number) => fmtAR(new Date(Date.now() - n * 86400000))
function daysSince(dayStr: string) {
  const a = new Date(todayAR() + 'T00:00:00Z').getTime()
  const b = new Date(dayStr + 'T00:00:00Z').getTime()
  return Math.round((a - b) / 86400000)
}

// ----- Contexto desde la base de datos (independiente de la IA) -----
// Cuándo se trabajó cada músculo (últimos 21 días) → para crecer equilibrado
async function trainingBalance(supabase: any) {
  const { data } = await supabase.from('exercise_logs')
    .select('day, routine_exercises(primary_muscles)')
    .gte('day', daysAgoAR(21))
  const last: Record<string, string> = {}
  for (const l of data || []) {
    const ms = l.routine_exercises?.primary_muscles || []
    for (const m of ms) { if (!last[m] || l.day > last[m]) last[m] = l.day }
  }
  const entries = Object.entries(last)
    .sort((a, b) => daysSince(b[1]) - daysSince(a[1]))
    .map(([m, d]) => `${m}: hace ${daysSince(d)} día(s)`)
  if (!entries.length) return 'Sin entrenamientos registrados en los últimos 21 días.'
  return 'Músculos trabajados (de más abandonado a más reciente):\n' + entries.join('\n')
}

// Resumen de nutrición + peso reciente
async function nutritionWeightContext(supabase: any) {
  const since = daysAgoAR(7)
  const [{ data: foods }, { data: weights }, { data: acts }] = await Promise.all([
    supabase.from('food_logs').select('day, protein_g').gte('day', since),
    supabase.from('weight_logs').select('day, weight_kg').order('day', { ascending: false }).limit(8),
    supabase.from('activities').select('type, duration_min, calories_est').gte('day', since)
  ])
  const byDay: Record<string, number> = {}
  for (const f of foods || []) byDay[f.day] = (byDay[f.day] || 0) + (+f.protein_g || 0)
  const vals = Object.values(byDay)
  const avgP = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  const w = weights || []
  const peso = w.length
    ? `peso actual ${w[0].weight_kg} kg${w.length > 1 ? ` (hace unos días ${w[w.length - 1].weight_kg} kg)` : ''}`
    : 'sin registros de peso'
  const aMin = (acts || []).reduce((s, a) => s + (+a.duration_min || 0), 0)
  const aKcal = Math.round((acts || []).reduce((s, a) => s + (+a.calories_est || 0), 0))
  const cardio = (acts || []).length
    ? `Cardio/deporte últimos 7 días: ${(acts || []).length} sesiones, ${aMin} min, ~${aKcal} kcal quemadas.`
    : 'Sin cardio/deporte registrado en los últimos 7 días.'
  return `Proteína promedio últimos 7 días: ${avgP} g/día (días con registro). Peso: ${peso}.\n${cardio}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return json({ error: 'Sesión inválida' }, 401)

    const { action, payload = {} } = await req.json()
    const { data: profile } = await supabase.from('profiles').select('*').single()
    const perfil = profileBlock(profile)

    // ---------------- COMIDA: estimar macros ----------------
    if (action === 'analyze_food') {
      const text = String(payload.text ?? '').slice(0, 2000)
      const schema = {
        type: 'object',
        properties: {
          calories: { type: 'number', description: 'kcal totales' },
          protein_g: { type: 'number' }, carbs_g: { type: 'number' }, fat_g: { type: 'number' },
          notes: { type: 'string', description: 'comentario breve, 1 frase' }
        },
        required: ['calories', 'protein_g', 'carbs_g', 'fat_g', 'notes']
      }
      const out = await callAI({
        max_tokens: 400, schema,
        system: 'Sos nutricionista. Estimás macros de comidas en español rioplatense, ' +
          'números realistas para porciones típicas. Conciso.',
        user: `Perfil:\n${perfil}\n\nComida: "${text}"\n\nEstimá calorías y macros.`
      })
      let parsed; try { parsed = JSON.parse(out) } catch { parsed = null }
      return json({ result: parsed, raw: out })
    }

    // ---------------- COMIDA: consejo del día ----------------
    if (action === 'daily_advice') {
      const day = String(payload.day ?? todayAR())
      const { data: foods } = await supabase
        .from('food_logs').select('*').eq('day', day).order('logged_at')
      const { data: logs } = await supabase
        .from('exercise_logs').select('exercise_name').eq('day', day)
      const { data: acts } = await supabase
        .from('activities').select('type, duration_min, intensity, calories_est').eq('day', day)
      const entreno = logs && logs.length
        ? `Sí (ejercicios registrados: ${logs.map((l) => l.exercise_name).join(', ')}).`
        : 'No registró gym hoy.'
      const burned = (acts || []).reduce((s, a) => s + (+a.calories_est || 0), 0)
      const actLista = (acts || []).map((a) =>
        `- ${a.type} ${a.duration_min} min (${a.intensity}, ~${Math.round(a.calories_est || 0)} kcal)`)
        .join('\n') || '(nada)'
      const totalP = (foods || []).reduce((s, f) => s + (+f.protein_g || 0), 0)
      const totalC = (foods || []).reduce((s, f) => s + (+f.calories || 0), 0)
      const lista = (foods || []).map((f) =>
        `- ${f.raw_text} (${Math.round(f.calories || 0)} kcal, ${Math.round(f.protein_g || 0)}g prot)`)
        .join('\n') || '(nada registrado)'
      const out = await callAI({
        max_tokens: 750,
        system: 'Sos entrenador personal y nutricionista, cercano y directo (español rioplatense). ' +
          'Consejos breves y accionables. Recomendás gramos de proteína diaria según peso y si entrenó. ' +
          'Tené en cuenta el cardio/deporte y las calorías quemadas. Pocos párrafos o bullets, sin tablas largas.',
        user: `Perfil:\n${perfil}\n\n¿Entrenó gym hoy? ${entreno}\n` +
          `Cardio/deporte de hoy:\n${actLista}\nCalorías quemadas aprox: ${Math.round(burned)}.\n\n` +
          `Comida de hoy (${day}):\n${lista}\n\nTotales comida: ${Math.round(totalC)} kcal, ${Math.round(totalP)} g proteína.\n\n` +
          `Decime cómo voy: si me falta proteína (cuánta apuntar hoy según mi peso, si entrené y lo que quemé) y un consejo concreto.`
      })
      return json({ result: out, totals: { calories: Math.round(totalC), protein_g: Math.round(totalP) } })
    }

    // ---------------- RUTINA: armar combo desde el catálogo ----------------
    if (action === 'build_combo') {
      const focus = String(payload.focus_label ?? 'que decidas vos').slice(0, 60)
      const goal = String(payload.goal ?? 'equilibrio')
      const felt = String(payload.felt ?? '').slice(0, 400)
      const cands = candidatesBlock(payload.candidates || [])
      const balance = await trainingBalance(supabase)
      const schema = {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          focus: { type: 'string', description: 'grupo trabajado, ej Empuje' },
          motivo: { type: 'string', description: '1-2 frases de por qué este combo hoy' },
          ejercicios: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'id EXACTO de la lista de candidatos' },
                nombre: { type: 'string', description: 'nombre en español' },
                series: { type: 'string', description: 'cantidad de series, solo el número, ej 4' },
                reps: { type: 'string', description: 'rango de reps según objetivo, ej 10-15' },
                descripcion_es: { type: 'string', description: 'cómo hacerlo, 1-2 frases, español' }
              }
            }
          }
        },
        required: ['titulo', 'focus', 'motivo', 'ejercicios']
      }
      const out = await callAI({
        max_tokens: 2000, schema,
        system: 'Sos entrenador experto en hipertrofia. Armás un combo para crecimiento EQUILIBRADO de ' +
          'TODO el cuerpo, pero si el usuario pide ÉNFASIS en ciertos músculos, priorizás ejercicios para ' +
          'esos músculos (más volumen) sin descuidar lo demás. Tené en cuenta su composición corporal y ' +
          'objetivo. Considerás qué trabajó recientemente. Elegís entre 4 y 6 ejercicios SOLO de la lista ' +
          'de candidatos, usando su id EXACTO (no inventes ids). El rango de reps respeta el objetivo. ' +
          'Traducís nombre y técnica al español rioplatense.',
        user: `Perfil:\n${perfil}\n\nEnfoque pedido: ${focus}\n${goalGuide(goal)}\n` +
          `Énfasis / preferencias del usuario para este combo: "${felt || 'ninguna'}"\n\n${balance}\n\n` +
          `Candidatos (id | nombre | músculo | equipo):\n${cands}\n\n` +
          `Armá el combo priorizando el énfasis pedido y respetando el balance del cuerpo.`
      })
      let parsed; try { parsed = JSON.parse(out) } catch { parsed = null }
      return json({ result: parsed, raw: out })
    }

    // ---------------- RUTINA: reemplazar un ejercicio ----------------
    if (action === 'swap_exercise') {
      const muscle = String(payload.muscle ?? '').slice(0, 40)
      const goal = String(payload.goal ?? 'equilibrio')
      const cands = candidatesBlock(payload.candidates || [])
      const exclude = (payload.exclude || []).join(', ')
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id EXACTO de un candidato' },
          nombre: { type: 'string' },
          series: { type: 'string', description: 'cantidad de series, ej 4' },
          reps: { type: 'string', description: 'rango de reps según objetivo' },
          descripcion_es: { type: 'string' }
        },
        required: ['id', 'nombre', 'series', 'reps', 'descripcion_es']
      }
      const out = await callAI({
        max_tokens: 400, schema,
        system: 'Sos entrenador. Elegís UN ejercicio alternativo de la lista de candidatos (id exacto) ' +
          'que trabaje el mismo músculo. Las reps respetan el objetivo. Nombre y técnica en español rioplatense.',
        user: `Músculo objetivo: ${muscle}\n${goalGuide(goal)}\nNo repitas estos ids: ${exclude}\n\n` +
          `Candidatos (id | nombre | músculo | equipo):\n${cands}\n\nDame un reemplazo.`
      })
      let parsed; try { parsed = JSON.parse(out) } catch { parsed = null }
      return json({ result: parsed, raw: out })
    }

    // ---------------- RUTINA: describir un ejercicio en español ----------------
    if (action === 'describe_exercise') {
      const name = String(payload.name ?? '').slice(0, 120)
      const muscle = String(payload.muscle ?? '').slice(0, 60)
      const equipment = String(payload.equipment ?? '').slice(0, 60)
      const goal = String(payload.goal ?? 'equilibrio')
      const schema = {
        type: 'object',
        properties: {
          nombre_es: { type: 'string', description: 'nombre en español' },
          series: { type: 'string', description: 'cantidad de series, ej 4' },
          reps: { type: 'string', description: 'rango de reps según objetivo' },
          descripcion_es: { type: 'string', description: 'cómo hacerlo + 1 tip, 2-3 frases' }
        },
        required: ['nombre_es', 'series', 'reps', 'descripcion_es']
      }
      const out = await callAI({
        max_tokens: 400, schema,
        system: 'Sos entrenador. Explicás un ejercicio en español rioplatense: nombre, técnica y un tip. ' +
          'Las reps respetan el objetivo. Breve.',
        user: `Ejercicio: "${name}" (músculo: ${muscle}, equipo: ${equipment}).\n${goalGuide(goal)}`
      })
      let parsed; try { parsed = JSON.parse(out) } catch { parsed = null }
      return json({ result: parsed, raw: out })
    }

    // ---------------- TUTOR: recomendar split de entrenamiento ----------------
    if (action === 'recommend_split') {
      const balance = await trainingBalance(supabase)
      const out = await callAI({
        max_tokens: 800,
        system: 'Sos entrenador y tutor. Explicás de forma breve y clara (español rioplatense) los ' +
          'métodos de entrenamiento y recomendás UNO según el perfil. Sé educativo pero conciso: ' +
          'bullets cortos, sin tablas largas.',
        user: `Perfil:\n${perfil}\n\n${balance}\n\n` +
          `Explicame en 1 frase cada método: Full Body, Upper/Lower, Push/Pull/Legs (PPL) y Arnold Split. ` +
          `Después recomendame EL que mejor me va según mi frecuencia de entrenamiento, mi objetivo y mi ` +
          `complexión, y explicá por qué en 2-3 frases.`
      })
      return json({ result: out })
    }

    // ---------------- Pregunta libre al coach ----------------
    if (action === 'ask') {
      const q = String(payload.question ?? '').slice(0, 1500)
      const balance = await trainingBalance(supabase)
      const nut = await nutritionWeightContext(supabase)
      const out = await callAI({
        max_tokens: 900,
        system: 'Sos el entrenador y nutricionista del usuario. Conocés su perfil, su historial de ' +
          'entrenamiento y su nutrición reciente. Usá ese contexto para responder concreto y ' +
          'accionable, en español rioplatense.',
        user: `Perfil:\n${perfil}\n\nContexto reciente (de su base de datos):\n${balance}\n${nut}\n\n` +
          `Pregunta: ${q}`
      })
      return json({ result: out })
    }

    return json({ error: `Acción desconocida: ${action}` }, 400)
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500)
  }
})

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

// Regla común: respuestas cortas y al grano.
const CONCISE = ' Respondé MUY conciso: máximo 4-5 frases cortas o bullets, sin vueltas ni relleno. ' +
  'Dejá claro qué recomendás, en base a qué (1-2 datos concretos) y cómo viene. Nada de introducciones largas.'

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

// Busca un alimento en USDA FoodData Central y devuelve macros por 100g.
// El primer resultado suele ser malo, así que filtramos partes raras (piel sola, etc.) y elegimos el mejor.
async function usdaLookup(query: string, key: string) {
  const baseu = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&pageSize=10&dataType=${encodeURIComponent('Foundation,SR Legacy')}`
  const search = async (req: boolean) => {
    const url = `${baseu}&query=${encodeURIComponent(query)}${req ? '&requireAllWords=true' : ''}`
    const r = await fetch(url); if (!r.ok) return []
    return (await r.json()).foods || []
  }
  let foods = await search(true)
  if (!foods.length) foods = await search(false)
  if (!foods.length) return null
  // Si el alimento NO es seco/crudo, descartamos versiones secas/en polvo/concentradas (ej. leche en polvo)
  const wantsDry = /\b(dry|dried|raw|powder|uncooked|flour|oat)\b/i.test(query)
  const bad = wantsDry
    ? /skin \(|baby food|infant|added solution/i
    : /skin \(|baby food|infant|added solution|\bdry\b|\bdried\b|powder|dehydrated|condensed|evaporated/i
  const pick = foods.find((f: any) => !bad.test(f.description || '')) || foods[0]
  const ns = pick.foodNutrients || []
  const get = (num: string) => { const n = ns.find((x: any) => String(x.nutrientNumber) === num); return n ? Number(n.value) : null }
  const kcal = get('208')
  if (kcal == null) return null
  return { kcal, prot: get('203') || 0, carb: get('205') || 0, fat: get('204') || 0, fib: get('291') || 0 }
}

function profileBlock(p: any) {
  if (!p) return 'Sin datos de perfil.'
  const goalMap: Record<string, string> = {
    definir: 'definir (quemar grasa)',
    equilibrio: 'equilibrio (músculo + algo de grasa)',
    musculo: 'músculo (hipertrofia)'
  }
  return [
    `Altura: ${p.height_cm ?? '?'} cm`, `Peso: ${p.weight_kg ?? '?'} kg`,
    `Objetivo: ${goalMap[p.training_goal] || p.training_goal || '-'}`,
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
    definir: 'Objetivo DEFINIR / quemar grasa: 3 series de 15-20 reps, peso moderado-bajo, descanso corto (~30-45s).',
    equilibrio: 'Objetivo EQUILIBRIO (músculo + algo de quema): 4 series de 10-15 reps, descanso medio (~60s).',
    musculo: 'Objetivo MÚSCULO / fuerza: 4 series de 6-10 reps, peso alto, descanso largo (~90-120s).'
  }
  return g[goal] || g.equilibrio
}

// Cantidad de ejercicios según el método (split): cubrir todo vs concentrar volumen.
function countGuide(split: string) {
  const m: Record<string, string> = {
    full_body: '6 a 8 ejercicios cubriendo TODOS los grupos principales (≈1 por grupo: pecho, espalda, hombros, cuádriceps, isquios/glúteos, y core o brazos).',
    upper_lower: '5 a 7 ejercicios (2-3 por zona del tren que toca).',
    ppl: '4 a 6 ejercicios (alrededor de 2 por grupo).',
    arnold: '5 a 7 ejercicios concentrados en los grupos del día (varios por músculo).'
  }
  return m[split] || '4 a 6 ejercicios.'
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
  const [{ data: foods }, { data: weights }, { data: acts }, { data: sups }] = await Promise.all([
    supabase.from('food_logs').select('day, protein_g').gte('day', since),
    supabase.from('weight_logs').select('day, weight_kg').order('day', { ascending: false }).limit(8),
    supabase.from('activities').select('type, duration_min, calories_est').gte('day', since),
    supabase.from('supplements').select('name, dose')
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
  const stack = (sups || []).length
    ? `Suplementos del stack: ${(sups || []).map((s) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ')}.`
    : 'No tiene suplementos configurados.'
  return `Proteína promedio últimos 7 días: ${avgP} g/día (días con registro). Peso: ${peso}.\n${cardio}\n${stack}`
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
      // 1) La IA divide la comida en ingredientes (con nombre en inglés para USDA + gramos + respaldo)
      const parseSchema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                original: { type: 'string', description: 'cómo lo nombró el usuario, en español' },
                query: { type: 'string', description: 'nombre del alimento en INGLÉS simple y genérico para buscar en USDA (ej: "chicken thigh cooked", "white rice cooked", "banana raw", "baked potato")' },
                grams: { type: 'number', description: 'gramos comestibles estimados (peso cocido; descontá hueso/piel no comestible)' },
                est_kcal: { type: 'number', description: 'kcal por 100g, estimación de respaldo' },
                est_protein: { type: 'number' }, est_carbs: { type: 'number' }, est_fat: { type: 'number' }, est_fiber: { type: 'number' }
              },
              required: ['original', 'query', 'grams', 'est_kcal', 'est_protein', 'est_carbs', 'est_fat', 'est_fiber']
            }
          }
        },
        required: ['items']
      }
      const ptxt = await callAI({
        max_tokens: 900, schema: parseSchema,
        system: 'Sos nutricionista. El usuario es de Argentina (Salta): interpretá los términos locales ' +
          '(zapallo=squash, choclo=corn, palta=avocado, morrón=bell pepper, batata=sweet potato, ' +
          'panceta=bacon, queso cremoso=soft white cheese, frutilla=strawberry) y DESCOMPONÉ los platos ' +
          'típicos en sus ingredientes para buscarlos en USDA (empanada=masa+relleno de carne; ' +
          'milanesa=carne+pan rallado+huevo+aceite; humita=choclo+cebolla+queso; tamal=maíz+carne; ' +
          'locro=maíz+zapallo+carne+porotos; provoleta=queso provolone). ' +
          'Dividís la comida en ingredientes individuales y SEPARÁS los platos ' +
          'combinados (ej: "avena con leche" = avena + leche; "café con leche" = café + leche). Para cada ingrediente: ' +
          'el nombre en INGLÉS simple y genérico para USDA (para CARNES incluí "meat" y el método de ' +
          'cocción, ej "chicken thigh meat roasted"; para secos como avena/arroz/pasta aclará si está ' +
          'CRUDO/SECO o COCIDO, ej "oats dry", "white rice cooked"; para lácteos líquidos aclará "fluid", ej ' +
          '"skim milk fluid"); los gramos COMESTIBLES en ESE estado ' +
          '(si dice "40g de avena" es seca → 40g de "oats dry"; un patamuslo de 170g con hueso ≈ 120g de carne); ' +
          'y un estimado por 100g de respaldo REALISTA (pollo ~25g prot, avena seca ~380kcal/13g prot, ' +
          'arroz cocido ~130kcal/2.7g prot, pan ~8g prot, banana ~1g prot). Asumí porciones típicas si es ambiguo.',
        user: `Comida: "${text}"\n\nDividila en ingredientes con su cantidad en gramos.`
      })
      let parsed: any; try { parsed = JSON.parse(ptxt) } catch { parsed = null }
      const items = parsed?.items || []
      const USDA = Deno.env.get('USDA_API_KEY')

      // 2) Para cada ingrediente: macros reales de USDA (o el respaldo de la IA)
      const enriched = await Promise.all(items.map(async (it: any) => {
        let per100: any = null, src = 'estimado'
        if (USDA && it.query) {
          try { const u = await usdaLookup(it.query, USDA); if (u) { per100 = u; src = 'USDA' } } catch { /* sigue con respaldo */ }
        }
        if (!per100) per100 = { kcal: +it.est_kcal || 0, prot: +it.est_protein || 0, carb: +it.est_carbs || 0, fat: +it.est_fat || 0, fib: +it.est_fiber || 0 }
        const f = (+it.grams || 0) / 100
        return {
          original: it.original, grams: +it.grams || 0, src,
          cal: per100.kcal * f, prot: per100.prot * f, carb: per100.carb * f, fat: per100.fat * f, fib: per100.fib * f
        }
      }))

      // 3) Sumar y armar desglose
      const tot = enriched.reduce((a, e) => ({
        cal: a.cal + e.cal, prot: a.prot + e.prot, carb: a.carb + e.carb, fat: a.fat + e.fat, fib: a.fib + e.fib
      }), { cal: 0, prot: 0, carb: 0, fat: 0, fib: 0 })
      const desglose = enriched.map((e) =>
        `${e.original} (${e.src}) ${Math.round(e.grams)}g ~${Math.round(e.cal)}kcal/${Math.round(e.prot)}g prot`).join('; ')

      const result = {
        calories: Math.round(tot.cal), protein_g: Math.round(tot.prot), carbs_g: Math.round(tot.carb),
        fat_g: Math.round(tot.fat), fiber_g: Math.round(tot.fib),
        desglose: desglose || '(no se pudo desglosar)', notes: ''
      }
      return json({ result, raw: ptxt })
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
      const { data: sups } = await supabase.from('supplements').select('id, name, dose, pills_per_day')
      const { data: slogs } = await supabase.from('supplement_logs').select('supplement_id, qty').eq('day', day)
      const qtyById: Record<string, number> = {}
      for (const s of slogs || []) qtyById[s.supplement_id] = s.qty
      const supLista = (sups || []).map((s) =>
        `- ${s.name}${s.dose ? ` (${s.dose})` : ''}${s.pills_per_day ? `, recomendado ${s.pills_per_day}/día` : ''}: tomó ${qtyById[s.id] || 0} hoy`)
        .join('\n') || '(sin suplementos configurados)'
      const entreno = logs && logs.length
        ? `Sí (ejercicios registrados: ${logs.map((l) => l.exercise_name).join(', ')}).`
        : 'No registró gym hoy.'
      const burned = (acts || []).reduce((s, a) => s + (+a.calories_est || 0), 0)
      const actLista = (acts || []).map((a) =>
        `- ${a.type} ${a.duration_min} min (${a.intensity}, ~${Math.round(a.calories_est || 0)} kcal)`)
        .join('\n') || '(nada)'
      const totalP = (foods || []).reduce((s, f) => s + (+f.protein_g || 0), 0)
      const totalC = (foods || []).reduce((s, f) => s + (+f.calories || 0), 0)
      const totalF = (foods || []).reduce((s, f) => s + (+f.fiber_g || 0), 0)
      const lista = (foods || []).map((f) =>
        `- ${f.raw_text} (${Math.round(f.calories || 0)} kcal, ${Math.round(f.protein_g || 0)}g prot)`)
        .join('\n') || '(nada registrado)'
      const out = await callAI({
        max_tokens: 550,
        system: 'Sos entrenador personal y nutricionista, cercano y directo (español rioplatense). ' +
          'Recomendás gramos de proteína diaria según peso y si entrenó. ' +
          'Tené en cuenta el cardio/calorías quemadas, la fibra y los suplementos (avisá si falta tomar ' +
          'alguno o si conviene sumar alguno para el objetivo). Si algún alimento del día ' +
          'aporta el mismo nutriente que un suplemento (pescado graso/salmón/sardinas/atún = omega-3; ' +
          'frutos secos, semillas, legumbres y verduras de hoja = magnesio; carnes/huevos = creatina/B12), ' +
          'avisá que ese día puede tomar MENOS pastillas de ese suplemento (decí cuántas).' + CONCISE,
        user: `Perfil:\n${perfil}\n\n¿Entrenó gym hoy? ${entreno}\n` +
          `Cardio/deporte de hoy:\n${actLista}\nCalorías quemadas aprox: ${Math.round(burned)}.\n\n` +
          `Comida de hoy (${day}):\n${lista}\n\nTotales comida: ${Math.round(totalC)} kcal, ` +
          `${Math.round(totalP)} g proteína, ${Math.round(totalF)} g fibra.\n\n` +
          `Suplementos de hoy:\n${supLista}\n\n` +
          `Decime cómo voy: si me falta proteína (cuánta apuntar según mi peso, si entrené y lo que quemé), ` +
          `cómo va la fibra y los suplementos, y un consejo concreto.`
      })
      return json({ result: out, totals: { calories: Math.round(totalC), protein_g: Math.round(totalP) } })
    }

    // ---------------- RUTINA: armar combo desde el catálogo ----------------
    if (action === 'build_combo') {
      const focus = String(payload.focus_label ?? 'que decidas vos').slice(0, 60)
      const goal = String(payload.goal ?? 'equilibrio')
      const split = String(payload.split ?? '')
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
        max_tokens: 2400, schema,
        system: 'Sos entrenador experto en hipertrofia. Armás un combo para crecimiento EQUILIBRADO de ' +
          'TODO el cuerpo, pero si el usuario pide ÉNFASIS en ciertos músculos, priorizás ejercicios para ' +
          'esos músculos (más volumen) sin descuidar lo demás. Tené en cuenta su composición corporal y ' +
          'objetivo. Considerás qué trabajó recientemente. Elegís SOLO ejercicios de la lista de ' +
          'candidatos (usando su id EXACTO, no inventes ids); la CANTIDAD de ejercicios la definís según ' +
          'la indicación del método. El rango de reps respeta el objetivo. Traducís nombre y técnica al ' +
          'español rioplatense.',
        user: `Perfil:\n${perfil}\n\nEnfoque pedido: ${focus}\n${goalGuide(goal)}\n` +
          `Cantidad de ejercicios: ${countGuide(split)}\n` +
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
        max_tokens: 600,
        system: 'Sos entrenador y tutor. Explicás 1 frase por método de entrenamiento y recomendás UNO ' +
          'según el perfil, justificando en 1-2 frases (español rioplatense). Bullets cortos, sin relleno.' + CONCISE,
        user: `Perfil:\n${perfil}\n\n${balance}\n\n` +
          `Explicame en 1 frase cada método: Full Body, Upper/Lower, Push/Pull/Legs (PPL) y Arnold Split. ` +
          `Después recomendame EL que mejor me va según mi frecuencia de entrenamiento, mi objetivo y mi ` +
          `complexión, y explicá por qué en 2-3 frases.`
      })
      return json({ result: out })
    }

    // ---------------- PESO: estado / cómo voy ----------------
    if (action === 'weight_status') {
      const { data: ws } = await supabase.from('weight_logs')
        .select('day, weight_kg').order('day', { ascending: false }).limit(12)
      const hist = (ws || []).map((w) => `${w.day}: ${w.weight_kg} kg`).join('\n') || 'sin registros'
      const { data: ms } = await supabase.from('measurements').select('*').order('day', { ascending: true })
      const fields = [['waist_cm', 'Cintura'], ['chest_cm', 'Pecho'], ['arm_cm', 'Brazo'], ['thigh_cm', 'Pierna'], ['hip_cm', 'Cadera']]
      const measLine = fields.map(([f, label]) => {
        const vals = (ms || []).filter((m) => m[f] != null)
        if (!vals.length) return null
        const last = vals[vals.length - 1][f], first = vals[0][f]
        const d = (last - first).toFixed(1)
        return `${label}: ${last} cm${vals.length > 1 ? ` (${d >= 0 ? '+' : ''}${d} desde inicio)` : ''}`
      }).filter(Boolean).join(' | ') || 'sin medidas registradas'
      const out = await callAI({
        max_tokens: 450,
        system: 'Sos entrenador. Evaluás la evolución del usuario según su objetivo y composición. ' +
          'Honesto y motivador (español rioplatense). En recomposición la balanza puede no moverse aunque ' +
          'haya progreso: si la CINTURA baja y el peso se mantiene (o suben brazo/pecho/pierna), está ' +
          'ganando músculo y perdiendo grasa = va bien. Priorizá las medidas sobre el número de la balanza.' + CONCISE,
        user: `Perfil:\n${perfil}\n\nHistorial de peso (más reciente primero):\n${hist}\n\n` +
          `Medidas corporales:\n${measLine}\n\n` +
          `Decime cómo voy: tendencia de peso y medidas, si está alineado con mi objetivo, y un consejo corto.`
      })
      return json({ result: out })
    }

    // ---------------- NUTRICIÓN: calcular metas personalizadas ----------------
    if (action === 'compute_targets') {
      const { data: sups } = await supabase.from('supplements').select('name, dose')
      const supText = (sups || []).map((s) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join('; ') || 'ninguno'
      const schema = {
        type: 'object',
        properties: {
          proteina_g: { type: 'number', description: 'meta diaria de proteína en gramos' },
          fibra_g: { type: 'number', description: 'meta diaria de fibra en gramos' },
          calorias: { type: 'number', description: 'meta diaria de calorías' },
          agua_ml: { type: 'number', description: 'meta diaria de agua en ml' },
          resumen: { type: 'string', description: '1-2 frases explicando las metas según objetivo y complexión' },
          suplementos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'nombre EXACTO del suplemento del usuario' },
                pastillas_dia: { type: 'number', description: 'cuántas pastillas por día según la dosis por pastilla' },
                para_que: { type: 'string', description: 'para qué sirve, 1-2 frases' }
              }
            }
          },
          faltantes: { type: 'array', items: { type: 'string', description: 'suplemento/vitamina que convendría sumar y por qué, breve' } }
        },
        required: ['proteina_g', 'fibra_g', 'calorias', 'agua_ml', 'resumen', 'suplementos', 'faltantes']
      }
      const out = await callAI({
        max_tokens: 1000, schema,
        system: 'Sos entrenador y nutricionista. Calculás metas diarias PERSONALIZADAS (proteína, fibra, ' +
          'calorías, agua) según peso, complexión y objetivo del usuario. Para cada suplemento que tiene, ' +
          'decís cuántas pastillas por día según la dosis por pastilla, y para qué sirve. Sugerís ' +
          'suplementos/vitaminas que le falten para el objetivo (ej: vitamina D). Español rioplatense.',
        user: `Perfil:\n${perfil}\n\nSuplementos del usuario (con dosis por pastilla): ${supText}\n\n` +
          `Calculá mis metas diarias y las pastillas por día de cada suplemento que tengo.`
      })
      let parsed; try { parsed = JSON.parse(out) } catch { parsed = null }
      return json({ result: parsed, raw: out })
    }

    // ---------------- Pregunta libre al coach ----------------
    if (action === 'ask') {
      const q = String(payload.question ?? '').slice(0, 1500)
      const balance = await trainingBalance(supabase)
      const nut = await nutritionWeightContext(supabase)
      const out = await callAI({
        max_tokens: 550,
        system: 'Sos el entrenador y nutricionista del usuario. Conocés su perfil, su historial de ' +
          'entrenamiento y su nutrición reciente. Usá ese contexto para responder concreto y ' +
          'accionable, en español rioplatense.' + CONCISE,
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

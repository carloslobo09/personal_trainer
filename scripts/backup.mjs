// Exporta todos los datos del usuario a un JSON (y de paso mantiene activo el proyecto de Supabase).
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... BACKUP_EMAIL=... BACKUP_PASSWORD=... node scripts/backup.mjs [archivo.json]
import { writeFileSync } from 'fs'

const { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, BACKUP_EMAIL, BACKUP_PASSWORD } = process.env
if (!URL || !ANON || !BACKUP_EMAIL || !BACKUP_PASSWORD) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_ANON_KEY, BACKUP_EMAIL, BACKUP_PASSWORD')
  process.exit(1)
}
const TABLES = [
  'profiles', 'routines', 'routine_exercises', 'exercise_logs', 'food_logs', 'weight_logs',
  'activities', 'supplements', 'supplement_logs', 'measurements', 'quick_foods'
]

const auth = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: BACKUP_EMAIL, password: BACKUP_PASSWORD })
})).json()
if (!auth.access_token) { console.error('Login falló:', JSON.stringify(auth)); process.exit(1) }
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` }

const data = {}
for (const t of TABLES) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL}/rest/v1/${t}?select=*&order=id`, {
      headers: { ...H, Range: `${from}-${from + 999}` }
    })
    if (!r.ok) { console.error(`Error leyendo ${t}: ${r.status} ${await r.text()}`); process.exit(1) }
    const page = await r.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  data[t] = rows
}

const out = process.argv[2] || `backup-${new Date().toISOString().slice(0, 10)}.json`
writeFileSync(out, JSON.stringify({ created_at: new Date().toISOString(), version: 1, data }, null, 1))
console.log(`✓ Backup en ${out}: ` + TABLES.map((t) => `${t}=${data[t].length}`).join(' · '))

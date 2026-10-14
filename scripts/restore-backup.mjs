// Restaura un backup JSON (de scripts/backup.mjs) en una base vacía: primero correr supabase/schema.sql
// y crear el usuario. Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... BACKUP_EMAIL=... BACKUP_PASSWORD=... \
//   node scripts/restore-backup.mjs backup.json [--force]
import { readFileSync } from 'fs'

const { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, BACKUP_EMAIL, BACKUP_PASSWORD } = process.env
const file = process.argv[2]
if (!URL || !ANON || !BACKUP_EMAIL || !BACKUP_PASSWORD || !file) {
  console.error('Uso: SUPABASE_URL SUPABASE_ANON_KEY BACKUP_EMAIL BACKUP_PASSWORD node scripts/restore-backup.mjs backup.json [--force]')
  process.exit(1)
}
const { data } = JSON.parse(readFileSync(file, 'utf8'))

const auth = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: BACKUP_EMAIL, password: BACKUP_PASSWORD })
})).json()
if (!auth.access_token) { console.error('Login falló:', JSON.stringify(auth)); process.exit(1) }
const uid = auth.user.id
const H = { apikey: ANON, Authorization: `Bearer ${auth.access_token}`, 'content-type': 'application/json' }

async function insert(table, rows) {
  if (!rows.length) return []
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows)
  })
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
  return r.json()
}
// quita el id viejo y asigna el usuario actual
const clean = ({ id, ...row }) => ({ ...row, user_id: uid })

const existing = await (await fetch(`${URL}/rest/v1/routines?select=id&limit=1`, { headers: H })).json()
if (existing.length && !process.argv.includes('--force')) {
  console.error('La cuenta ya tiene datos. Para restaurar igual (duplica), agregá --force.')
  process.exit(1)
}

// perfil (upsert: el trigger de alta puede haberlo creado)
const prof = data.profiles?.[0]
if (prof) {
  await fetch(`${URL}/rest/v1/profiles`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ ...prof, id: uid })
  })
}

// tablas con IDs referenciados: se insertan de a una para mapear id viejo -> id nuevo
const map = { routines: {}, routine_exercises: {}, supplements: {} }
for (const r of data.routines || []) map.routines[r.id] = (await insert('routines', [clean(r)]))[0].id
for (const r of data.routine_exercises || []) {
  map.routine_exercises[r.id] = (await insert('routine_exercises', [{ ...clean(r), routine_id: map.routines[r.routine_id] }]))[0].id
}
for (const r of data.supplements || []) map.supplements[r.id] = (await insert('supplements', [clean(r)]))[0].id

await insert('exercise_logs', (data.exercise_logs || []).map((r) => ({
  ...clean(r),
  routine_id: r.routine_id != null ? map.routines[r.routine_id] ?? null : null,
  routine_exercise_id: r.routine_exercise_id != null ? map.routine_exercises[r.routine_exercise_id] ?? null : null
})))
await insert('supplement_logs', (data.supplement_logs || []).map((r) => ({ ...clean(r), supplement_id: map.supplements[r.supplement_id] })))
for (const t of ['food_logs', 'weight_logs', 'activities', 'measurements', 'quick_foods']) await insert(t, (data[t] || []).map(clean))

console.log('✓ Restaurado: ' + Object.entries(data).map(([t, rows]) => `${t}=${rows.length}`).join(' · '))

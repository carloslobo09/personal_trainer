import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { today, dateLabel } from '../lib/api'
import { musclesEs } from '../lib/catalog'
import { GOALS } from '../lib/goals'
import ExerciseImage from './ExerciseImage'
import CatalogPicker from './CatalogPicker'

// Sugerencia de sobrecarga: si venís ≥3 registros con el mismo peso, proponé subir.
function overloadHint(logs) {
  if (!logs || logs.length < 3) return null
  const latest = +logs[logs.length - 1].weight_kg
  let count = 0
  for (let i = logs.length - 1; i >= 0; i--) {
    if (+logs[i].weight_kg === latest) count++; else break
  }
  if (count < 3) return null
  const inc = Math.max(2.5, Math.round((latest * 0.05) / 2.5) * 2.5)
  return { count, latest, next: +(latest + inc).toFixed(1) }
}

export default function ComboDetail({ session, routineId, equipment, onBack, onDeleted }) {
  const uid = session.user.id
  const [routine, setRoutine] = useState(null)
  const [exs, setExs] = useState([])
  const [logsByEx, setLogsByEx] = useState({})
  const [day, setDay] = useState(today())
  const [draft, setDraft] = useState({})        // { rexId: {weight, reps} }
  const [showPicker, setShowPicker] = useState(false)
  const [pending, setPending] = useState(null)  // ejercicio elegido esperando peso inicial
  const [pendWeight, setPendWeight] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data: r } = await supabase.from('routines').select('*').eq('id', routineId).single()
    setRoutine(r)
    const { data: e } = await supabase.from('routine_exercises')
      .select('*').eq('routine_id', routineId).order('position')
    setExs(e || [])
    const { data: logs } = await supabase.from('exercise_logs')
      .select('*').eq('routine_id', routineId).order('logged_at')
    const grouped = {}
    ;(logs || []).forEach((l) => { (grouped[l.routine_exercise_id] = grouped[l.routine_exercise_id] || []).push(l) })
    setLogsByEx(grouped)
  }
  useEffect(() => { load() }, [routineId])

  async function logToday(rex) {
    const d = draft[rex.id] || {}
    const w = parseFloat(d.weight)
    if (!w) { setErr('Poné el peso que levantaste'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.from('exercise_logs').insert({
      user_id: uid, routine_id: routineId, routine_exercise_id: rex.id,
      catalog_id: rex.catalog_id, exercise_name: rex.name,
      day, weight_kg: w, reps: d.reps ? parseInt(d.reps) : null
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDraft({ ...draft, [rex.id]: {} })
    load()
  }

  async function removeEx(rex) {
    if (!confirm(`¿Quitar "${rex.name}" del combo?`)) return
    await supabase.from('routine_exercises').delete().eq('id', rex.id)
    load()
  }

  async function deleteRoutine() {
    if (!confirm('¿Borrar todo el combo? Se borran también sus registros.')) return
    await supabase.from('routines').delete().eq('id', routineId)
    onDeleted()
  }

  function onPicked(item) { setShowPicker(false); setPending(item); setPendWeight('') }

  async function confirmAdd() {
    const w = parseFloat(pendWeight)
    if (!w) { setErr('El peso inicial es obligatorio'); return }
    setBusy(true); setErr('')
    const pos = exs.length
    const { data: rex, error } = await supabase.from('routine_exercises').insert({
      user_id: uid, routine_id: routineId, catalog_id: pending.catalog_id || null,
      name: pending.name, equipment: pending.equipment, primary_muscles: pending.primary_muscles || [],
      image_url: pending.image_url, description_es: pending.description_es,
      target_sets: pending.target_sets, target_reps: pending.target_reps, start_weight_kg: w, position: pos
    }).select().single()
    if (!error && rex) {
      await supabase.from('exercise_logs').insert({
        user_id: uid, routine_id: routineId, routine_exercise_id: rex.id,
        catalog_id: rex.catalog_id, exercise_name: rex.name, weight_kg: w, day: today()
      })
    }
    setBusy(false); setPending(null)
    if (error) setErr(error.message); else load()
  }

  if (!routine) return <span className="spinner" />

  return (
    <>
      <div className="card">
        <div className="modal-head">
          <div>
            <h2 style={{ margin: 0 }}>{routine.name}</h2>
            {routine.focus && <span className="pill">{routine.focus}</span>}
            {routine.goal && <span className="pill">{GOALS[routine.goal]?.label || routine.goal}</span>}
          </div>
          <button className="ghost" style={{ padding: '8px 12px' }} onClick={onBack}>← Volver</button>
        </div>
        <label>Día del registro</label>
        <div className="row">
          <input type="date" value={day} max={today()}
            onChange={(e) => setDay(e.target.value || today())} />
          {day !== today() && (
            <button className="ghost" style={{ flex: '0 0 auto' }} onClick={() => setDay(today())}>Hoy</button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Registrás el peso para <b>{dateLabel(day)}</b>.</p>
      </div>

      {exs.map((rex) => {
        const logs = logsByEx[rex.id] || []
        const latest = logs.length ? logs[logs.length - 1].weight_kg : rex.start_weight_kg
        const delta = (latest - rex.start_weight_kg)
        const hint = overloadHint(logs)
        const d = draft[rex.id] || {}
        return (
          <div className="card exercise-card" key={rex.id}>
            <div className="ex-top">
              <ExerciseImage src={rex.image_url} alt={rex.name} size={72} />
              <div style={{ flex: 1 }}>
                <div className="name">{rex.name}</div>
                <div className="series">{rex.target_sets}{rex.target_reps ? ` × ${rex.target_reps} reps` : ''}</div>
                <div className="muted">{musclesEs(rex.primary_muscles).join(', ')}</div>
              </div>
              <button className="x" onClick={() => removeEx(rex)}>✕</button>
            </div>
            {rex.description_es && <div className="how">{rex.description_es}</div>}

            <div className="progress-row">
              <div><span className="muted">Inicial</span><br />{rex.start_weight_kg} kg</div>
              <div><span className="muted">Actual</span><br /><b>{latest} kg</b></div>
              <div className={delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>
                <span className="muted">Progreso</span><br />
                {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}{delta !== 0 ? Math.abs(delta) + ' kg' : ''}
              </div>
            </div>

            {hint && (
              <div className="overload">
                💡 Llevás {hint.count} sesiones en {hint.latest} kg — toca subir: probá <b>{hint.next} kg</b>
              </div>
            )}

            <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={{ margin: '0 0 4px' }}>Peso hoy (kg)</label>
                <input type="number" inputMode="decimal" placeholder={`${latest}`}
                  value={d.weight ?? ''} onChange={(e) => setDraft({ ...draft, [rex.id]: { ...d, weight: e.target.value } })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ margin: '0 0 4px' }}>Reps</label>
                <input type="number" inputMode="numeric" placeholder="-"
                  value={d.reps ?? ''} onChange={(e) => setDraft({ ...draft, [rex.id]: { ...d, reps: e.target.value } })} />
              </div>
              <button style={{ flex: '0 0 auto' }} onClick={() => logToday(rex)} disabled={busy}>Registrar</button>
            </div>

            {logs.length > 1 && (
              <div className="muted" style={{ marginTop: 8 }}>
                Últimos: {logs.slice(-4).map((l) => `${l.weight_kg}kg`).join(' → ')}
              </div>
            )}
          </div>
        )
      })}

      <button className="ghost full" onClick={() => setShowPicker(true)}>＋ Agregar ejercicio al combo</button>
      <button className="danger full" onClick={deleteRoutine}>🗑 Borrar combo</button>

      {pending && (
        <div className="modal-bg" onClick={() => setPending(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{pending.name}</h2><button className="x" onClick={() => setPending(null)}>✕</button></div>
            {pending.description_es && <p className="muted">{pending.description_es}</p>}
            <label>Peso inicial (kg) — obligatorio</label>
            <input type="number" inputMode="decimal" autoFocus
              value={pendWeight} onChange={(e) => setPendWeight(e.target.value)} />
            <button className="full" style={{ marginTop: 12 }} onClick={confirmAdd} disabled={busy}>
              {busy ? <span className="spinner" /> : 'Agregar al combo'}
            </button>
          </div>
        </div>
      )}

      {showPicker && <CatalogPicker equipment={equipment} goal={routine.goal || 'equilibrio'}
        onClose={() => setShowPicker(false)} onPick={onPicked} />}
      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}
    </>
  )
}

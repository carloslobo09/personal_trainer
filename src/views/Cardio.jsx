import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { today, dateLabel } from '../lib/api'
import {
  ACTIVITIES, ACTIVITY_KEYS, INTENSITIES, estimateCalories, activityLabel
} from '../lib/activities'

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d)
}

export default function Cardio({ session }) {
  const uid = session.user.id
  const [weight, setWeight] = useState(80)
  const [day, setDay] = useState(today())
  const [type, setType] = useState('correr')
  const [intensity, setIntensity] = useState('media')
  const [minutes, setMinutes] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([])
  const [week, setWeek] = useState({ min: 0, kcal: 0, n: 0 })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data: prof } = await supabase.from('profiles').select('weight_kg').eq('id', uid).single()
    if (prof?.weight_kg) setWeight(prof.weight_kg)
    const { data } = await supabase.from('activities')
      .select('*').eq('day', day).order('logged_at')
    setItems(data || [])
    const { data: w } = await supabase.from('activities')
      .select('duration_min, calories_est').gte('day', daysAgo(7))
    const min = (w || []).reduce((s, a) => s + (+a.duration_min || 0), 0)
    const kcal = (w || []).reduce((s, a) => s + (+a.calories_est || 0), 0)
    setWeek({ min, kcal: Math.round(kcal), n: (w || []).length })
  }
  useEffect(() => { load() }, [day])

  const preview = estimateCalories(type, intensity, minutes, weight)

  async function add() {
    const dur = parseInt(minutes)
    if (!dur || dur <= 0) { setErr('Poné cuántos minutos hiciste'); return }
    setBusy(true); setErr('')
    const cals = estimateCalories(type, intensity, dur, weight)
    const { error } = await supabase.from('activities').insert({
      user_id: uid, day, type, intensity, duration_min: dur,
      calories_est: cals, notes: notes.trim() || null
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMinutes(''); setNotes('')
    load()
  }

  async function del(id) {
    await supabase.from('activities').delete().eq('id', id)
    load()
  }

  return (
    <>
      <div className="card">
        <label>Día</label>
        <div className="row">
          <input type="date" value={day} max={today()}
            onChange={(e) => setDay(e.target.value || today())} />
          {day !== today() && (
            <button className="ghost" style={{ flex: '0 0 auto' }} onClick={() => setDay(today())}>Hoy</button>
          )}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Registrás actividad del <b>{dateLabel(day)}</b>.</p>
      </div>

      <div className="card">
        <h2>¿Qué hiciste?</h2>
        <div className="chips">
          {ACTIVITY_KEYS.map((k) => (
            <button key={k} className={`chip ${type === k ? 'on' : ''}`}
              onClick={() => setType(k)}>{ACTIVITIES[k].icon} {ACTIVITIES[k].label}</button>
          ))}
        </div>

        <label style={{ marginTop: 12 }}>Intensidad</label>
        <div className="chips">
          {INTENSITIES.map((i) => (
            <button key={i.key} className={`chip ${intensity === i.key ? 'on' : ''}`}
              onClick={() => setIntensity(i.key)}>{i.label}</button>
          ))}
        </div>

        <label style={{ marginTop: 12 }}>Duración (minutos)</label>
        <input type="number" inputMode="numeric" placeholder="Ej: 30"
          value={minutes} onChange={(e) => setMinutes(e.target.value)} />

        <label>Notas (opcional)</label>
        <input placeholder="Ej: corrida suave en el parque"
          value={notes} onChange={(e) => setNotes(e.target.value)} />

        {minutes > 0 && (
          <p className="muted" style={{ marginTop: 10 }}>
            Estimado: <b style={{ color: 'var(--warn)' }}>~{preview} kcal</b> quemadas
          </p>
        )}
        <button className="full" style={{ marginTop: 10 }} onClick={add} disabled={busy}>
          {busy ? <span className="spinner" /> : '＋ Registrar actividad'}
        </button>
      </div>

      <div className="card">
        <h2>{dateLabel(day)}</h2>
        {items.length === 0 && <p className="muted">No registraste actividad este día.</p>}
        {items.map((a) => (
          <div className="list-item" key={a.id}>
            <div>
              <div>{activityLabel(a.type)} · {a.duration_min} min</div>
              <div className="muted">
                Intensidad {a.intensity} · ~{Math.round(a.calories_est || 0)} kcal
                {a.notes ? ` · ${a.notes}` : ''}
              </div>
            </div>
            <button className="x" onClick={() => del(a.id)}>✕</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Últimos 7 días</h2>
        <div className="stat-grid">
          <div className="stat"><div className="n">{week.n}</div><div className="l">Sesiones</div></div>
          <div className="stat"><div className="n">{week.min}</div><div className="l">Minutos</div></div>
          <div className="stat"><div className="n" style={{ color: 'var(--warn)' }}>{week.kcal}</div><div className="l">kcal quemadas</div></div>
        </div>
      </div>

      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}
    </>
  )
}

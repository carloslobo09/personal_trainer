import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { today } from '../lib/api'

function daysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function Sparkline({ points }) {
  if (points.length < 2) return <p className="muted">Cargá al menos 2 pesos para ver la curva.</p>
  const ws = points.map((p) => p.weight_kg)
  const min = Math.min(...ws), max = Math.max(...ws)
  const span = max - min || 1
  const W = 320, H = 80, pad = 6
  const step = (W - pad * 2) / (points.length - 1)
  const path = points.map((p, i) => {
    const x = pad + i * step
    const y = pad + (1 - (p.weight_kg - min) / span) * (H - pad * 2)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90 }}>
      <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const x = pad + i * step
        const y = pad + (1 - (p.weight_kg - min) / span) * (H - pad * 2)
        return <circle key={i} cx={x} cy={y} r="3" fill="#38bdf8" />
      })}
    </svg>
  )
}

export default function Progreso({ session }) {
  const uid = session.user.id
  const [weight, setWeight] = useState('')
  const [weights, setWeights] = useState([])
  const [trainedDays, setTrainedDays] = useState(0)
  const [avgProtein, setAvgProtein] = useState(0)
  const [cardio, setCardio] = useState({ n: 0, min: 0, kcal: 0 })
  const [err, setErr] = useState('')

  async function load() {
    const since = daysAgo(30)
    const [{ data: w }, { data: wk }, { data: f }, { data: ac }] = await Promise.all([
      supabase.from('weight_logs').select('*').gte('day', since).order('day'),
      supabase.from('exercise_logs').select('day').gte('day', daysAgo(7)),
      supabase.from('food_logs').select('day, protein_g').gte('day', daysAgo(7)),
      supabase.from('activities').select('duration_min, calories_est').gte('day', daysAgo(7))
    ])
    setWeights(w || [])
    setTrainedDays(new Set((wk || []).map((x) => x.day)).size)

    // proteína promedio por día con registro (últimos 7)
    const byDay = {}
    ;(f || []).forEach((r) => { byDay[r.day] = (byDay[r.day] || 0) + (+r.protein_g || 0) })
    const vals = Object.values(byDay)
    setAvgProtein(vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0)

    setCardio({
      n: (ac || []).length,
      min: (ac || []).reduce((s, a) => s + (+a.duration_min || 0), 0),
      kcal: Math.round((ac || []).reduce((s, a) => s + (+a.calories_est || 0), 0))
    })
  }
  useEffect(() => { load() }, [])

  async function addWeight() {
    const v = parseFloat(weight)
    if (!v) return
    setErr('')
    const { error } = await supabase.from('weight_logs')
      .upsert({ user_id: uid, day: today(), weight_kg: v }, { onConflict: 'user_id,day' })
    if (error) { setErr(error.message); return }
    setWeight(''); load()
  }

  const lastW = weights.length ? weights[weights.length - 1].weight_kg : null
  const firstW = weights.length ? weights[0].weight_kg : null
  const diff = lastW != null && firstW != null ? (lastW - firstW).toFixed(1) : null

  return (
    <>
      <div className="card">
        <h2>Resumen (últimos 7 días)</h2>
        <div className="stat-grid">
          <div className="stat"><div className="n">{trainedDays}</div><div className="l">Días entrenados</div></div>
          <div className="stat"><div className="n protein">{avgProtein}g</div><div className="l">Prot. prom/día</div></div>
          <div className="stat"><div className="n">{lastW ?? '—'}</div><div className="l">Peso actual</div></div>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          🏃 Cardio: {cardio.n} sesiones · {cardio.min} min · ~{cardio.kcal} kcal quemadas
        </p>
      </div>

      <div className="card">
        <h2>Peso corporal</h2>
        <div className="row">
          <input type="number" inputMode="decimal" placeholder="Ej: 87.5"
            value={weight} onChange={(e) => setWeight(e.target.value)} />
          <button style={{ flex: '0 0 auto' }} onClick={addWeight}>Registrar hoy</button>
        </div>
        <div style={{ marginTop: 14 }}>
          <Sparkline points={weights} />
          {diff != null && (
            <p className="muted center">
              {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)} kg en {weights.length} registros (30 días)
            </p>
          )}
        </div>
      </div>

      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}
    </>
  )
}

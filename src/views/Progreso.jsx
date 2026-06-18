import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai, today, dateLabel } from '../lib/api'

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

const MEAS_FIELDS = [
  { k: 'waist_cm', label: 'Cintura', goodDown: true },
  { k: 'chest_cm', label: 'Pecho', goodDown: false },
  { k: 'arm_cm', label: 'Brazo', goodDown: false },
  { k: 'thigh_cm', label: 'Pierna', goodDown: false },
  { k: 'hip_cm', label: 'Cadera', goodDown: true }
]

export default function Progreso({ session, onWeighIn }) {
  const uid = session.user.id
  const [weight, setWeight] = useState('')
  const [weights, setWeights] = useState([])
  const [trainedDays, setTrainedDays] = useState(0)
  const [avgProtein, setAvgProtein] = useState(0)
  const [cardio, setCardio] = useState({ n: 0, min: 0, kcal: 0 })
  const [status, setStatus] = useState('')
  const [statusBusy, setStatusBusy] = useState(false)
  const [meas, setMeas] = useState({})
  const [measHist, setMeasHist] = useState([])
  const [measSaved, setMeasSaved] = useState(false)
  const [err, setErr] = useState('')

  async function fetchStatus() {
    setStatusBusy(true)
    try { const { result } = await ai('weight_status'); setStatus(result || '') }
    catch (e) { setErr(e.message) } finally { setStatusBusy(false) }
  }

  async function load() {
    const since = daysAgo(30)
    const [{ data: w }, { data: wk }, { data: f }, { data: ac }, { data: m }] = await Promise.all([
      supabase.from('weight_logs').select('*').gte('day', since).order('day'),
      supabase.from('exercise_logs').select('day').gte('day', daysAgo(7)),
      supabase.from('food_logs').select('day, protein_g').gte('day', daysAgo(7)),
      supabase.from('activities').select('duration_min, calories_est').gte('day', daysAgo(7)),
      supabase.from('measurements').select('*').order('day')
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

    setMeasHist(m || [])
    const latest = (m || [])[(m || []).length - 1]
    if (latest) {
      const pre = {}
      MEAS_FIELDS.forEach(({ k }) => { if (latest[k] != null) pre[k] = String(latest[k]) })
      setMeas(pre)
    }
  }

  async function saveMeas() {
    setErr(''); setMeasSaved(false)
    const row = { user_id: uid, day: today() }
    MEAS_FIELDS.forEach(({ k }) => { row[k] = meas[k] !== '' && meas[k] != null ? parseFloat(meas[k]) : null })
    const { error } = await supabase.from('measurements').upsert(row, { onConflict: 'user_id,day' })
    if (error) { setErr(error.message); return }
    setMeasSaved(true); load()
  }

  // por campo: valor más reciente y cambio vs el primer registro
  function measInfo(k) {
    const vals = measHist.filter((x) => x[k] != null)
    if (!vals.length) return null
    const last = +vals[vals.length - 1][k]
    const first = +vals[0][k]
    return { last, delta: vals.length > 1 ? +(last - first).toFixed(1) : null }
  }
  useEffect(() => { load() }, [])

  async function addWeight() {
    const v = parseFloat(weight)
    if (!v) return
    setErr('')
    const { error } = await supabase.from('weight_logs')
      .upsert({ user_id: uid, day: today(), weight_kg: v }, { onConflict: 'user_id,day' })
    if (error) { setErr(error.message); return }
    setWeight(''); await load()
    onWeighIn?.()        // limpia el banner de "toca pesarte"
    fetchStatus()        // consejo de la IA sobre tu evolución
  }

  const lastW = weights.length ? weights[weights.length - 1].weight_kg : null
  const firstW = weights.length ? weights[0].weight_kg : null
  const diff = lastW != null && firstW != null ? (lastW - firstW).toFixed(1) : null

  // historial (más reciente primero) con variación vs registro anterior
  const history = weights.map((w, i) => ({
    day: w.day, kg: +w.weight_kg,
    delta: i > 0 ? +(w.weight_kg - weights[i - 1].weight_kg).toFixed(1) : null
  })).reverse()

  const weekVals = weights.filter((w) => w.day >= daysAgo(6)).map((w) => +w.weight_kg)
  const weekAvg = weekVals.length ? (weekVals.reduce((a, b) => a + b, 0) / weekVals.length).toFixed(1) : null

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
        <p className="muted" style={{ marginTop: 8 }}>
          Pesate los <b>domingos</b>, en ayunas y siempre en las mismas condiciones.
          {weekAvg && <> Promedio 7 días: <b>{weekAvg} kg</b>.</>}
        </p>
        <div style={{ marginTop: 8 }}>
          <Sparkline points={weights} />
          {diff != null && (
            <p className="muted center">
              {diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {Math.abs(diff)} kg en {weights.length} registros (30 días)
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Medidas (cm)</h2>
        <p className="muted">
          Clave para la recomposición: la <b>cintura baja</b> = perdés grasa; <b>brazo/pecho/pierna suben</b> = ganás músculo.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {MEAS_FIELDS.map(({ k, label }) => (
            <div key={k} style={{ flex: '1 1 45%' }}>
              <label>{label}</label>
              <input type="number" inputMode="decimal" placeholder="—"
                value={meas[k] ?? ''}
                onChange={(e) => { setMeas({ ...meas, [k]: e.target.value }); setMeasSaved(false) }} />
            </div>
          ))}
        </div>
        <button className="full" style={{ marginTop: 12 }} onClick={saveMeas}>
          {measSaved ? '✓ Guardado' : '💾 Guardar medidas de hoy'}
        </button>
        {measHist.length > 0 && (
          <div className="progress-row" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            {MEAS_FIELDS.map(({ k, label, goodDown }) => {
              const info = measInfo(k)
              if (!info) return null
              const good = info.delta == null ? null : (goodDown ? info.delta < 0 : info.delta > 0)
              return (
                <div key={k}>
                  <span className="muted">{label}</span><br />
                  {info.last} cm
                  {info.delta != null && info.delta !== 0 && (
                    <span style={{ marginLeft: 6, color: good ? 'var(--good)' : 'var(--danger)' }}>
                      {info.delta > 0 ? '+' : ''}{info.delta}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h2>¿Cómo voy con el peso?</h2>
        <button className="full ghost" onClick={fetchStatus} disabled={statusBusy}>
          {statusBusy ? <span className="spinner" /> : '🤖 Pedir estado'}
        </button>
        {status && <div className="advice" style={{ marginTop: 12 }}>{status}</div>}
      </div>

      {history.length > 0 && (
        <div className="card">
          <h2>Historial de peso</h2>
          {history.map((h, i) => (
            <div className="list-item" key={i}>
              <div>{dateLabel(h.day)}</div>
              <div>
                <b>{h.kg} kg</b>
                {h.delta != null && h.delta !== 0 && (
                  <span className="muted" style={{ marginLeft: 8, color: h.delta > 0 ? 'var(--good)' : 'var(--danger)' }}>
                    {h.delta > 0 ? '▲ +' : '▼ '}{Math.abs(h.delta)} kg
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}
    </>
  )
}

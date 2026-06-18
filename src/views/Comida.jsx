import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai, today, dateLabel } from '../lib/api'

export default function Comida({ session }) {
  const uid = session.user.id
  const [day, setDay] = useState(today())
  const [text, setText] = useState('')
  const [foods, setFoods] = useState([])
  const [sups, setSups] = useState([])
  const [takenIds, setTakenIds] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [advice, setAdvice] = useState('')
  const [adviceBusy, setAdviceBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const [{ data: f }, { data: s }, { data: sl }] = await Promise.all([
      supabase.from('food_logs').select('*').eq('day', day).order('logged_at'),
      supabase.from('supplements').select('*').order('position'),
      supabase.from('supplement_logs').select('supplement_id').eq('day', day)
    ])
    setFoods(f || [])
    setSups(s || [])
    setTakenIds(new Set((sl || []).map((x) => x.supplement_id)))
  }
  useEffect(() => { load(); setAdvice('') }, [day])

  async function add() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      const { result } = await ai('analyze_food', { text: text.trim() })
      const r = result || {}
      const { error } = await supabase.from('food_logs').insert({
        user_id: uid, day, raw_text: text.trim(),
        calories: r.calories ?? null, protein_g: r.protein_g ?? null,
        carbs_g: r.carbs_g ?? null, fat_g: r.fat_g ?? null, fiber_g: r.fiber_g ?? null,
        ai_notes: r.notes ?? null
      })
      if (error) throw error
      setText(''); setAdvice('')
      await load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function del(id) {
    await supabase.from('food_logs').delete().eq('id', id)
    load()
  }

  async function toggleSup(s) {
    if (takenIds.has(s.id)) {
      await supabase.from('supplement_logs').delete().eq('supplement_id', s.id).eq('day', day)
    } else {
      await supabase.from('supplement_logs').insert({ user_id: uid, supplement_id: s.id, day })
    }
    load()
  }

  async function howAmIDoing() {
    setAdviceBusy(true); setErr('')
    try {
      const { result } = await ai('daily_advice', { day })
      setAdvice(result || 'Sin respuesta.')
    } catch (e) { setErr(e.message) } finally { setAdviceBusy(false) }
  }

  const tCal = Math.round(foods.reduce((s, f) => s + (+f.calories || 0), 0))
  const tProt = Math.round(foods.reduce((s, f) => s + (+f.protein_g || 0), 0))
  const tCarb = Math.round(foods.reduce((s, f) => s + (+f.carbs_g || 0), 0))
  const tFib = Math.round(foods.reduce((s, f) => s + (+f.fiber_g || 0), 0))

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
        <p className="muted" style={{ marginTop: 6 }}>
          Estás cargando del <b>{dateLabel(day)}</b>. Podés elegir otro día si se te pasó.
        </p>
      </div>

      <div className="card">
        <h2>¿Qué comiste?</h2>
        <textarea placeholder="Ej: 3 huevos revueltos, avena con leche y banana, café"
          value={text} onChange={(e) => setText(e.target.value)} />
        <button className="full" style={{ marginTop: 10 }} onClick={add} disabled={busy}>
          {busy ? <span className="spinner" /> : '＋ Agregar comida'}
        </button>
        <p className="muted" style={{ marginTop: 8 }}>La IA estima calorías, proteína y fibra automáticamente.</p>
      </div>

      <div className="card">
        <h2>{dateLabel(day)}</h2>
        <div className="stat-grid">
          <div className="stat"><div className="n protein">{tProt}g</div><div className="l">Proteína</div></div>
          <div className="stat"><div className="n">{tCal}</div><div className="l">Calorías</div></div>
          <div className="stat"><div className="n">{tCarb}g</div><div className="l">Carbos</div></div>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>🌱 Fibra: <b>{tFib} g</b></p>
        <div style={{ marginTop: 8 }}>
          {foods.length === 0 && <p className="muted">No hay comidas registradas para este día.</p>}
          {foods.map((f) => (
            <div className="list-item" key={f.id}>
              <div>
                <div>{f.raw_text}</div>
                <div className="muted">
                  {Math.round(f.calories || 0)} kcal · {Math.round(f.protein_g || 0)}g prot
                  {f.fiber_g != null ? ` · ${Math.round(f.fiber_g)}g fibra` : ''}
                  {f.ai_notes ? ` · ${f.ai_notes}` : ''}
                </div>
              </div>
              <button className="x" onClick={() => del(f.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Suplementos de hoy</h2>
        {sups.length === 0 && (
          <p className="muted">No configuraste suplementos. Cargalos en <b>Perfil → Suplementos</b>.</p>
        )}
        {sups.map((s) => {
          const taken = takenIds.has(s.id)
          return (
            <button key={s.id} className="sup-item" onClick={() => toggleSup(s)}>
              <span className={`check ${taken ? 'on' : ''}`}>{taken ? '✓' : ''}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {s.name}{s.dose ? <span className="muted"> · {s.dose}</span> : ''}
              </span>
            </button>
          )
        })}
        {sups.length > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            Tomados: {takenIds.size}/{sups.length}
          </p>
        )}
      </div>

      <div className="card">
        <h2>¿Cómo voy?</h2>
        <button className="full ghost" onClick={howAmIDoing} disabled={adviceBusy}>
          {adviceBusy ? <span className="spinner" /> : '🤖 Pedir consejo del día'}
        </button>
        {advice && <div className="advice" style={{ marginTop: 12 }}>{advice}</div>}
      </div>

      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}
    </>
  )
}

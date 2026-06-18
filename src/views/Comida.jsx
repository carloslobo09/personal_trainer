import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai, today, dateLabel } from '../lib/api'

function MetaBar({ label, cur, target, unit }) {
  if (!target) return null
  const pct = Math.min(100, Math.round((cur / target) * 100))
  const done = cur >= target
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
        <span>{label}</span>
        <span style={{ color: done ? 'var(--good)' : 'var(--text)' }}>
          {Math.round(cur)} / {Math.round(target)} {unit} {done ? '✓' : ''}
        </span>
      </div>
      <div className="bar"><div className="bar-fill"
        style={{ width: pct + '%', background: done ? 'var(--good)' : 'var(--accent)' }} /></div>
    </div>
  )
}

export default function Comida({ session }) {
  const uid = session.user.id
  const [day, setDay] = useState(today())
  const [text, setText] = useState('')
  const [foods, setFoods] = useState([])
  const [sups, setSups] = useState([])
  const [takenIds, setTakenIds] = useState(new Set())
  const [targets, setTargets] = useState(null)
  const [infoId, setInfoId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [computing, setComputing] = useState(false)
  const [advice, setAdvice] = useState('')
  const [adviceBusy, setAdviceBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const [{ data: f }, { data: s }, { data: sl }, { data: prof }] = await Promise.all([
      supabase.from('food_logs').select('*').eq('day', day).order('logged_at'),
      supabase.from('supplements').select('*').order('position'),
      supabase.from('supplement_logs').select('supplement_id').eq('day', day),
      supabase.from('profiles').select('nutrition_targets').eq('id', uid).single()
    ])
    setFoods(f || [])
    setSups(s || [])
    setTakenIds(new Set((sl || []).map((x) => x.supplement_id)))
    setTargets(prof?.nutrition_targets || null)
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
      setText(''); setAdvice(''); await load()
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

  async function computeTargets() {
    setComputing(true); setErr('')
    try {
      const { result } = await ai('compute_targets')
      if (!result) throw new Error('No se pudieron calcular las metas')
      await supabase.from('profiles').update({
        nutrition_targets: {
          proteina_g: result.proteina_g, fibra_g: result.fibra_g,
          calorias: result.calorias, agua_ml: result.agua_ml,
          resumen: result.resumen, faltantes: result.faltantes || []
        }
      }).eq('id', uid)
      for (const sp of result.suplementos || []) {
        const match = sups.find((x) => x.name.toLowerCase() === String(sp.name).toLowerCase())
        if (match) {
          await supabase.from('supplements').update({
            pills_per_day: Math.round(sp.pastillas_dia) || null, purpose: sp.para_que || null
          }).eq('id', match.id)
        }
      }
      await load()
    } catch (e) { setErr(e.message) } finally { setComputing(false) }
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
          Estás cargando del <b>{dateLabel(day)}</b>.
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
        <h2>Metas del día ({dateLabel(day)})</h2>
        {targets ? (
          <>
            <MetaBar label="Proteína" cur={tProt} target={targets.proteina_g} unit="g" />
            <MetaBar label="Fibra" cur={tFib} target={targets.fibra_g} unit="g" />
            <MetaBar label="Calorías" cur={tCal} target={targets.calorias} unit="kcal" />
            {targets.agua_ml ? <p className="muted">💧 Agua: meta {Math.round(targets.agua_ml)} ml</p> : null}
            {targets.resumen && <p className="muted" style={{ marginTop: 6 }}>{targets.resumen}</p>}
            {targets.faltantes?.length > 0 && (
              <p className="muted" style={{ marginTop: 6 }}>
                💡 Te convendría sumar: {targets.faltantes.join(' · ')}
              </p>
            )}
            <button className="ghost full" style={{ marginTop: 10 }} onClick={computeTargets} disabled={computing}>
              {computing ? <span className="spinner" /> : '↻ Recalcular metas'}
            </button>
          </>
        ) : (
          <>
            <p className="muted">Tu entrenador puede calcular tus metas diarias personalizadas según tu peso,
              complexión y objetivo.</p>
            <button className="full" style={{ marginTop: 8 }} onClick={computeTargets} disabled={computing}>
              {computing ? <span className="spinner" /> : '🤖 Calcular mis metas'}
            </button>
          </>
        )}
        <div style={{ marginTop: 12 }}>
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
            <div key={s.id}>
              <div className="sup-item">
                <button className={`check ${taken ? 'on' : ''}`} onClick={() => toggleSup(s)}>
                  {taken ? '✓' : ''}
                </button>
                <div style={{ flex: 1 }} onClick={() => setInfoId(infoId === s.id ? null : s.id)}>
                  <div>{s.name}{s.pills_per_day ? <span className="series"> · {s.pills_per_day} pastilla(s)/día</span> : ''}</div>
                  {s.dose && <div className="muted">{s.dose}</div>}
                </div>
                <button className="info" onClick={() => setInfoId(infoId === s.id ? null : s.id)}>ℹ️</button>
              </div>
              {infoId === s.id && (
                <div className="advice" style={{ marginBottom: 8 }}>
                  {s.purpose || 'Tocá "Calcular mis metas" arriba para que la IA complete para qué sirve y cuántas tomar.'}
                </div>
              )}
            </div>
          )
        })}
        {sups.length > 0 && <p className="muted" style={{ marginTop: 4 }}>Tomados: {takenIds.size}/{sups.length}</p>}
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

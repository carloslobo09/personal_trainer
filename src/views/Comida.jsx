import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai, today, dateLabel, parseNum } from '../lib/api'

const EDIT_FIELDS = [
  { k: 'calories', l: 'Calorías' }, { k: 'protein_g', l: 'Proteína' },
  { k: 'carbs_g', l: 'Carbos' }, { k: 'fat_g', l: 'Grasa' }, { k: 'fiber_g', l: 'Fibra' }
]

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
  const [qtyById, setQtyById] = useState({})
  const [targets, setTargets] = useState(null)
  const [infoId, setInfoId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editVals, setEditVals] = useState({})
  const [quickFoods, setQuickFoods] = useState([])
  const [qfForm, setQfForm] = useState(null)   // null | {name, calories, ...} (nuevo/edición)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [computing, setComputing] = useState(false)
  const [advice, setAdvice] = useState('')
  const [adviceBusy, setAdviceBusy] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    const [{ data: f }, { data: s }, { data: sl }, { data: prof }, { data: qf }] = await Promise.all([
      supabase.from('food_logs').select('*').eq('day', day).order('logged_at'),
      supabase.from('supplements').select('*').order('position'),
      supabase.from('supplement_logs').select('supplement_id, qty').eq('day', day),
      supabase.from('profiles').select('nutrition_targets').eq('id', uid).single(),
      supabase.from('quick_foods').select('*').order('position')
    ])
    setFoods(f || [])
    setSups(s || [])
    const q = {}; (sl || []).forEach((x) => { q[x.supplement_id] = x.qty }); setQtyById(q)
    setTargets(prof?.nutrition_targets || null)
    setQuickFoods(qf || [])
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
        ai_notes: r.desglose || r.notes || null
      })
      if (error) throw error
      setText(''); setAdvice(''); await load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function del(id) {
    await supabase.from('food_logs').delete().eq('id', id)
    load()
  }

  function startEdit(f) {
    setEditId(f.id)
    setEditVals({
      calories: f.calories ?? '', protein_g: f.protein_g ?? '', carbs_g: f.carbs_g ?? '',
      fat_g: f.fat_g ?? '', fiber_g: f.fiber_g ?? ''
    })
  }
  async function saveEdit() {
    const upd = {}
    EDIT_FIELDS.forEach(({ k }) => { upd[k] = parseNum(editVals[k]) })
    const { error } = await supabase.from('food_logs').update(upd).eq('id', editId)
    if (error) { setErr(error.message); return }
    setEditId(null); load()
  }

  // ---- Alimentos rápidos (favoritos) ----
  async function logQuick(qf) {
    const { error } = await supabase.from('food_logs').insert({
      user_id: uid, day, raw_text: qf.name,
      calories: qf.calories ?? null, protein_g: qf.protein_g ?? null,
      carbs_g: qf.carbs_g ?? null, fat_g: qf.fat_g ?? null, fiber_g: qf.fiber_g ?? null
    })
    if (error) { setErr(error.message); return }
    setNote(`✓ ${qf.name}`)
    setTimeout(() => setNote(''), 1500)
    setAdvice(''); await load()
  }
  function startAddQuick() { setQfForm({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' }) }
  function startEditQuick(qf) {
    setQfForm({ id: qf.id, name: qf.name, calories: qf.calories ?? '', protein_g: qf.protein_g ?? '', carbs_g: qf.carbs_g ?? '', fat_g: qf.fat_g ?? '', fiber_g: qf.fiber_g ?? '' })
  }
  async function saveQuick() {
    if (!qfForm.name.trim()) { setErr('Poné un nombre'); return }
    const row = {
      name: qfForm.name.trim(),
      calories: parseNum(qfForm.calories), protein_g: parseNum(qfForm.protein_g),
      carbs_g: parseNum(qfForm.carbs_g), fat_g: parseNum(qfForm.fat_g), fiber_g: parseNum(qfForm.fiber_g)
    }
    const { error } = qfForm.id
      ? await supabase.from('quick_foods').update(row).eq('id', qfForm.id)
      : await supabase.from('quick_foods').insert({ user_id: uid, ...row, position: quickFoods.length })
    if (error) { setErr(error.message); return }
    setQfForm(null); load()
  }
  async function delQuick(id) { await supabase.from('quick_foods').delete().eq('id', id); load() }

  async function incSup(s) {
    const cur = qtyById[s.id] || 0
    if (cur === 0) await supabase.from('supplement_logs').insert({ user_id: uid, supplement_id: s.id, day, qty: 1 })
    else await supabase.from('supplement_logs').update({ qty: cur + 1 }).eq('supplement_id', s.id).eq('day', day)
    load()
  }
  async function decSup(s) {
    const cur = qtyById[s.id] || 0
    if (cur <= 1) await supabase.from('supplement_logs').delete().eq('supplement_id', s.id).eq('day', day)
    else await supabase.from('supplement_logs').update({ qty: cur - 1 }).eq('supplement_id', s.id).eq('day', day)
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
        <h2>⚡ Carga rápida</h2>
        <p className="muted">Tocá un alimento fijo para sumar sus macros al día.</p>
        <div className="quick-grid">
          {quickFoods.map((qf) => (
            <div className="quick-item" key={qf.id}>
              <button className="quick-add" onClick={() => logQuick(qf)}>
                <span className="qf-name">＋ {qf.name}</span>
                <span className="qf-macros">
                  {qf.protein_g != null ? `${Math.round(qf.protein_g)}g prot` : ''}
                  {qf.calories != null ? ` · ${Math.round(qf.calories)} kcal` : ''}
                  {qf.fiber_g ? ` · ${Math.round(qf.fiber_g)}g fibra` : ''}
                </span>
              </button>
              <button className="qf-mini" onClick={() => startEditQuick(qf)} title="Editar">✏️</button>
              <button className="qf-mini" onClick={() => delQuick(qf.id)} title="Borrar">✕</button>
            </div>
          ))}
        </div>
        {qfForm ? (
          <div className="edit-macros" style={{ marginTop: 10 }}>
            <label style={{ margin: '0 0 2px' }}>Nombre</label>
            <input value={qfForm.name} placeholder="Ej: Lata de atún 100g"
              onChange={(e) => setQfForm({ ...qfForm, name: e.target.value })} />
            <div className="macro-grid" style={{ marginTop: 8 }}>
              {EDIT_FIELDS.map(({ k, l }) => (
                <div key={k}>
                  <label style={{ margin: '0 0 2px' }}>{l}</label>
                  <input type="text" inputMode="decimal" value={qfForm[k] ?? ''}
                    onChange={(e) => setQfForm({ ...qfForm, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={saveQuick}>Guardar</button>
              <button className="ghost" onClick={() => setQfForm(null)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button className="ghost full" style={{ marginTop: 10 }} onClick={startAddQuick}>＋ Agregar alimento rápido</button>
        )}
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
            <div key={f.id}>
              <div className="list-item">
                <div>
                  <div>{f.raw_text}</div>
                  <div className="muted">
                    {Math.round(f.calories || 0)} kcal · {Math.round(f.protein_g || 0)}g prot
                    {f.fiber_g != null ? ` · ${Math.round(f.fiber_g)}g fibra` : ''}
                    {f.ai_notes ? ` · ${f.ai_notes}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}>
                  <button className="x" onClick={() => startEdit(f)} title="Editar">✏️</button>
                  <button className="x" onClick={() => del(f.id)} title="Borrar">✕</button>
                </div>
              </div>
              {editId === f.id && (
                <div className="edit-macros">
                  <div className="macro-grid">
                    {EDIT_FIELDS.map(({ k, l }) => (
                      <div key={k}>
                        <label style={{ margin: '0 0 2px' }}>{l}</label>
                        <input type="text" inputMode="decimal" value={editVals[k] ?? ''}
                          onChange={(e) => setEditVals({ ...editVals, [k]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button onClick={saveEdit}>Guardar</button>
                    <button className="ghost" onClick={() => setEditId(null)}>Cancelar</button>
                  </div>
                </div>
              )}
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
          const qty = qtyById[s.id] || 0
          const done = s.pills_per_day ? qty >= s.pills_per_day : qty > 0
          return (
            <div key={s.id}>
              <div className="sup-item" onClick={() => incSup(s)}>
                <span className={`count-badge ${done ? 'on' : ''}`}>{qty}</span>
                <div style={{ flex: 1 }}>
                  <div>{s.name}
                    <span className="series"> {qty}{s.pills_per_day ? `/${s.pills_per_day}` : ''} hoy</span>
                  </div>
                  {s.dose && <div className="muted">{s.dose}</div>}
                </div>
                <button className="minus" onClick={(e) => { e.stopPropagation(); decSup(s) }}>−</button>
                <button className="info" onClick={(e) => { e.stopPropagation(); setInfoId(infoId === s.id ? null : s.id) }}>ℹ️</button>
              </div>
              {infoId === s.id && (
                <div className="advice" style={{ marginBottom: 8 }}>
                  {s.purpose || 'Tocá "Calcular mis metas" arriba para que la IA complete para qué sirve y cuántas tomar.'}
                </div>
              )}
            </div>
          )
        })}
        {sups.length > 0 && (
          <p className="muted" style={{ marginTop: 4 }}>Tocá el suplemento para sumar una; el botón − para restar.</p>
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
      {note && <div className="toast ok">{note}</div>}
    </>
  )
}

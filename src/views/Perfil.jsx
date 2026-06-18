import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai } from '../lib/api'
import { SELECTABLE_EQUIPMENT, EQUIPMENT_ES } from '../lib/catalog'
import { GOALS, GOAL_KEYS } from '../lib/goals'

export default function Perfil({ session }) {
  const uid = session.user.id
  const [p, setP] = useState(null)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [qBusy, setQBusy] = useState(false)

  const [sups, setSups] = useState([])
  const [supName, setSupName] = useState('')
  const [supDose, setSupDose] = useState('')

  async function load() {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    setP(data || {
      id: uid, height_cm: 190, weight_kg: 87, creatine_g: 5,
      goal: 'crecimiento muscular equilibrado', activity: 'entreno 4-5 dias por semana',
      equipment: [], training_goal: 'equilibrio', body_composition: '', notes: ''
    })
  }
  async function loadSups() {
    const { data } = await supabase.from('supplements').select('*').order('position')
    setSups(data || [])
  }
  useEffect(() => { load(); loadSups() }, [])

  async function addSup() {
    if (!supName.trim()) return
    setErr('')
    const { error } = await supabase.from('supplements').insert({
      user_id: uid, name: supName.trim(), dose: supDose.trim() || null, position: sups.length
    })
    if (error) { setErr(error.message); return }
    setSupName(''); setSupDose(''); loadSups()
  }
  async function delSup(id) {
    await supabase.from('supplements').delete().eq('id', id)
    loadSups()
  }

  function set(k, v) { setP({ ...p, [k]: v }); setSaved(false) }
  function toggleEquip(k) {
    const cur = p.equipment || []
    set('equipment', cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k])
  }

  async function save() {
    setErr('')
    const { error } = await supabase.from('profiles').upsert({
      id: uid, height_cm: p.height_cm, weight_kg: p.weight_kg, creatine_g: p.creatine_g,
      goal: p.goal, activity: p.activity, equipment: p.equipment || [],
      training_goal: p.training_goal || 'equilibrio',
      body_composition: p.body_composition, notes: p.notes, updated_at: new Date().toISOString()
    })
    if (error) { setErr(error.message); return }
    setSaved(true)
  }

  async function ask() {
    if (!q.trim()) return
    setQBusy(true); setErr(''); setA('')
    try {
      const { result } = await ai('ask', { question: q.trim() })
      setA(result || '')
    } catch (e) { setErr(e.message) } finally { setQBusy(false) }
  }

  if (!p) return <span className="spinner" />
  const equip = p.equipment || []

  return (
    <>
      <div className="card">
        <h2>Mi perfil</h2>
        <p className="muted">La IA usa estos datos para personalizar sus consejos.</p>
        <div className="row">
          <div>
            <label>Altura (cm)</label>
            <input type="number" value={p.height_cm ?? ''} onChange={(e) => set('height_cm', e.target.value)} />
          </div>
          <div>
            <label>Peso (kg)</label>
            <input type="number" value={p.weight_kg ?? ''} onChange={(e) => set('weight_kg', e.target.value)} />
          </div>
        </div>
        <label>Creatina por día (g)</label>
        <input type="number" value={p.creatine_g ?? ''} onChange={(e) => set('creatine_g', e.target.value)} />
        <label>Objetivo</label>
        <input value={p.goal ?? ''} onChange={(e) => set('goal', e.target.value)} />
        <label>Actividad / frecuencia</label>
        <input value={p.activity ?? ''} onChange={(e) => set('activity', e.target.value)} />
        <label>Composición / complexión</label>
        <textarea placeholder="Ej: flaco con grasa en torso, pecho y cara; quiero ganar músculo en piernas y glúteos"
          value={p.body_composition ?? ''} onChange={(e) => set('body_composition', e.target.value)} />
        <label>Notas (lesiones, preferencias, etc.)</label>
        <textarea value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        <button className="full" style={{ marginTop: 12 }} onClick={save}>
          {saved ? '✓ Guardado' : '💾 Guardar perfil'}
        </button>
      </div>

      <div className="card">
        <h2>Mi equipo</h2>
        <p className="muted">Marcá lo que tenés. La IA arma combos solo con esto (peso corporal siempre está).</p>
        <div className="chips">
          {SELECTABLE_EQUIPMENT.map((k) => (
            <button key={k} className={`chip ${equip.includes(k) ? 'on' : ''}`}
              onClick={() => toggleEquip(k)}>{EQUIPMENT_ES[k]}</button>
          ))}
        </div>
        <button className="full" style={{ marginTop: 12 }} onClick={save}>
          {saved ? '✓ Guardado' : '💾 Guardar'}
        </button>
      </div>

      <div className="card">
        <h2>Objetivo por defecto</h2>
        <p className="muted">Define las reps que te recomienda la IA. Lo podés cambiar en cada combo.</p>
        <div className="chips">
          {GOAL_KEYS.map((k) => (
            <button key={k} className={`chip ${(p.training_goal || 'equilibrio') === k ? 'on' : ''}`}
              onClick={() => set('training_goal', k)}>{GOALS[k].label}</button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {GOALS[p.training_goal || 'equilibrio'].desc} (~{GOALS[p.training_goal || 'equilibrio'].reps} reps)
        </p>
        <button className="full" style={{ marginTop: 12 }} onClick={save}>
          {saved ? '✓ Guardado' : '💾 Guardar'}
        </button>
      </div>

      <div className="card">
        <h2>Suplementos</h2>
        <p className="muted">Tu stack diario. La IA lo tiene en cuenta, y lo marcás cada día en Comida.</p>
        {sups.length === 0 && <p className="muted">Todavía no cargaste suplementos.</p>}
        {sups.map((s) => (
          <div className="list-item" key={s.id}>
            <div>
              <div>{s.name}</div>
              {s.dose && <div className="muted">{s.dose}</div>}
            </div>
            <button className="x" onClick={() => delSup(s.id)}>✕</button>
          </div>
        ))}
        <label style={{ marginTop: 12 }}>Agregar suplemento</label>
        <input placeholder="Nombre (ej: Omega-3)" value={supName}
          onChange={(e) => setSupName(e.target.value)} />
        <input style={{ marginTop: 8 }} placeholder="Dosis (ej: 920mg EPA / 360mg DHA)"
          value={supDose} onChange={(e) => setSupDose(e.target.value)} />
        <button className="full" style={{ marginTop: 10 }} onClick={addSup}>＋ Agregar</button>
      </div>

      <div className="card">
        <h2>Preguntale al coach</h2>
        <textarea placeholder="Ej: ¿cuánta proteína debería comer los días de descanso?"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="full" style={{ marginTop: 10 }} onClick={ask} disabled={qBusy}>
          {qBusy ? <span className="spinner" /> : '🤖 Preguntar'}
        </button>
        {a && <div className="advice" style={{ marginTop: 12 }}>{a}</div>}
      </div>

      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}
    </>
  )
}

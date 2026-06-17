import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai, today } from '../lib/api'
import { candidatesFor, getById, imageUrl, FOCUS_GROUPS, musclesEs } from '../lib/catalog'
import { GOALS, GOAL_KEYS, goalReps } from '../lib/goals'
import ExerciseImage from './ExerciseImage'
import CatalogPicker from './CatalogPicker'

const FOCUS_OPTIONS = ['Empuje', 'Tirón', 'Pierna', 'Core']

let _k = 0
const newKey = () => `it_${++_k}`

function fromCatalog(ej, goalKey) {
  const cat = getById(ej.id)
  return {
    key: newKey(),
    catalog_id: ej.id,
    name: ej.nombre || cat?.name || ej.id,
    equipment: cat?.equipment || 'body only',
    primary_muscles: cat?.primary || [],
    image_url: cat ? imageUrl(cat) : null,
    description_es: ej.descripcion_es || '',
    target_sets: ej.series || '4',
    target_reps: ej.reps || goalReps(goalKey),
    start_weight: ''
  }
}

export default function ComboBuilder({ session, equipment, defaultGoal = 'equilibrio', onSaved, onCancel }) {
  const uid = session.user.id
  const [step, setStep] = useState('config')   // 'config' | 'review'
  const [focus, setFocus] = useState(null)      // null = que decida la IA / cuerpo completo
  const [goal, setGoal] = useState(defaultGoal)
  const [felt, setFelt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [name, setName] = useState('')
  const [items, setItems] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [swapping, setSwapping] = useState(null)

  async function generate() {
    setBusy(true); setErr('')
    try {
      const candidates = await candidatesFor({ focus, equipment })
      if (candidates.length === 0) {
        setErr('No hay ejercicios para tu equipo. Cargá tu equipo en Perfil.')
        setBusy(false); return
      }
      const { result } = await ai('build_combo', {
        focus_label: focus || 'que decidas vos (cuerpo completo equilibrado)',
        goal, felt: felt.trim(), candidates
      })
      if (!result?.ejercicios?.length) throw new Error('La IA no devolvió ejercicios')
      setName(result.titulo || (focus || 'Combo'))
      setItems(result.ejercicios.map((ej) => fromCatalog(ej, goal)))
      setStep('review')
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  function startEmpty() {
    setName(focus || 'Mi combo')
    setItems([])
    setStep('review')
  }

  async function swap(item) {
    setSwapping(item.key); setErr('')
    try {
      const muscle = item.primary_muscles?.[0] || null
      const candidates = await candidatesFor({ focus, equipment })
      const exclude = items.map((i) => i.catalog_id).filter(Boolean)
      const { result } = await ai('swap_exercise', { muscle, goal, candidates, exclude })
      if (!result?.id) throw new Error('No se encontró reemplazo')
      setItems(items.map((i) => (i.key === item.key ? fromCatalog(result, goal) : i)))
    } catch (e) { setErr(e.message) } finally { setSwapping(null) }
  }

  function remove(key) { setItems(items.filter((i) => i.key !== key)) }
  function setWeight(key, v) { setItems(items.map((i) => (i.key === key ? { ...i, start_weight: v } : i))) }
  function addPicked(picked) {
    setShowPicker(false)
    setItems([...items, { key: newKey(), start_weight: '', ...picked }])
  }

  const missing = items.some((i) => i.start_weight === '' || isNaN(parseFloat(i.start_weight)))
  const canSave = items.length > 0 && !missing && name.trim()

  async function save() {
    setBusy(true); setErr('')
    try {
      const { data: r, error: e1 } = await supabase.from('routines')
        .insert({ user_id: uid, name: name.trim(), focus: focus || null, goal }).select().single()
      if (e1) throw e1

      const rows = items.map((it, i) => ({
        user_id: uid, routine_id: r.id, catalog_id: it.catalog_id || null,
        name: it.name, equipment: it.equipment, primary_muscles: it.primary_muscles || [],
        image_url: it.image_url, description_es: it.description_es,
        target_sets: it.target_sets, target_reps: it.target_reps,
        start_weight_kg: parseFloat(it.start_weight), position: i
      }))
      const { data: rex, error: e2 } = await supabase.from('routine_exercises').insert(rows).select()
      if (e2) throw e2

      const logs = rex.map((x) => ({
        user_id: uid, routine_id: r.id, routine_exercise_id: x.id,
        catalog_id: x.catalog_id, exercise_name: x.name, weight_kg: x.start_weight_kg, day: today()
      }))
      await supabase.from('exercise_logs').insert(logs)

      onSaved(r.id)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  // ---------- PASO 1: configurar ----------
  if (step === 'config') {
    return (
      <div className="card">
        <div className="modal-head">
          <h2>Nuevo combo</h2>
          <button className="x" onClick={onCancel}>✕</button>
        </div>

        <label>¿Qué querés trabajar?</label>
        <div className="chips">
          {FOCUS_OPTIONS.map((f) => (
            <button key={f} className={`chip ${focus === f ? 'on' : ''}`}
              onClick={() => setFocus(f)}>{f}</button>
          ))}
          <button className={`chip ${focus === null ? 'on' : ''}`}
            onClick={() => setFocus(null)}>Que decida la IA</button>
        </div>
        {focus && <p className="muted">Músculos: {musclesEs(FOCUS_GROUPS[focus]).join(', ')}</p>}

        <label style={{ marginTop: 14 }}>Objetivo (define las reps)</label>
        <div className="chips">
          {GOAL_KEYS.map((k) => (
            <button key={k} className={`chip ${goal === k ? 'on' : ''}`}
              onClick={() => setGoal(k)}>{GOALS[k].label}</button>
          ))}
        </div>
        <p className="muted">{GOALS[goal].desc} (~{GOALS[goal].reps} reps)</p>

        <label style={{ marginTop: 14 }}>¿Cómo te sentís hoy? (opcional)</label>
        <input placeholder="Ej: con energía, hombro un poco cargado"
          value={felt} onChange={(e) => setFelt(e.target.value)} />

        <button className="full" style={{ marginTop: 14 }} onClick={generate} disabled={busy}>
          {busy ? <span className="spinner" /> : '🤖 Que la IA arme el combo'}
        </button>
        <button className="ghost full" style={{ marginTop: 10 }} onClick={startEmpty} disabled={busy}>
          Armarlo a mano
        </button>
        {err && <p className="muted" style={{ color: 'var(--danger)' }}>{err}</p>}
      </div>
    )
  }

  // ---------- PASO 2: revisar y cargar pesos ----------
  return (
    <>
      <div className="card">
        <div className="modal-head">
          <h2>Revisá tu combo</h2>
          <button className="x" onClick={onCancel}>✕</button>
        </div>
        <label>Nombre del combo</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <p className="muted" style={{ marginTop: 8 }}>
          Objetivo: <b>{GOALS[goal].short}</b> · Cargá el <b>peso inicial</b> de cada ejercicio
          (obligatorio). Elegí un peso con el que las últimas reps cuesten. Si no podés hacer alguno,
          tocá <b>Cambiar</b>.
        </p>
      </div>

      {items.map((it) => (
        <div className="card exercise-card" key={it.key}>
          <div className="ex-top">
            <ExerciseImage src={it.image_url} alt={it.name} size={72} />
            <div style={{ flex: 1 }}>
              <div className="name">{it.name}</div>
              <div className="series">{it.target_sets} × {it.target_reps} reps</div>
              <div className="muted">{musclesEs(it.primary_muscles).join(', ')}</div>
            </div>
          </div>
          {it.description_es && <div className="how">{it.description_es}</div>}
          <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <label style={{ margin: '0 0 4px' }}>Peso inicial (kg) *</label>
              <input type="number" inputMode="decimal" placeholder="Ej: 20"
                value={it.start_weight} onChange={(e) => setWeight(it.key, e.target.value)} />
            </div>
            <button className="ghost" style={{ flex: 1 }} onClick={() => swap(it)} disabled={swapping}>
              {swapping === it.key ? <span className="spinner" /> : '↺ Cambiar'}
            </button>
            <button className="danger" style={{ flex: '0 0 auto' }} onClick={() => remove(it.key)}>Quitar</button>
          </div>
        </div>
      ))}

      <button className="ghost full" onClick={() => setShowPicker(true)}>＋ Agregar ejercicio</button>
      <button className="full" onClick={save} disabled={!canSave || busy}>
        {busy ? <span className="spinner" /> : '💾 Guardar combo'}
      </button>
      {missing && items.length > 0 && <p className="muted center">Falta cargar el peso de algún ejercicio.</p>}
      {err && <div className="toast" onClick={() => setErr('')}>{err}</div>}

      {showPicker && (
        <CatalogPicker equipment={equipment} goal={goal}
          onClose={() => setShowPicker(false)} onPick={addPicked} />
      )}
    </>
  )
}

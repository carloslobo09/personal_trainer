import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ai } from '../lib/api'
import { loadCatalog, musclesEs } from '../lib/catalog'
import { SPLITS, SPLIT_KEYS } from '../lib/splits'
import ComboBuilder from '../components/ComboBuilder'
import ComboDetail from '../components/ComboDetail'

export default function Rutina({ session }) {
  const uid = session.user.id
  const [view, setView] = useState('list')   // 'list' | 'build' | 'detail'
  const [selected, setSelected] = useState(null)
  const [buildInit, setBuildInit] = useState(null) // { split, dayName }
  const [routines, setRoutines] = useState([])
  const [equipment, setEquipment] = useState([])
  const [defaultGoal, setDefaultGoal] = useState('equilibrio')
  const [activeSplit, setActiveSplit] = useState(null)
  const [rotationIndex, setRotationIndex] = useState(0)
  const [splitTip, setSplitTip] = useState('')
  const [tipBusy, setTipBusy] = useState(false)
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  async function recommendSplit() {
    setTipBusy(true)
    try { const { result } = await ai('recommend_split'); setSplitTip(result || '') }
    catch (e) { setSplitTip('No se pudo: ' + e.message) } finally { setTipBusy(false) }
  }

  async function load() {
    setLoading(true)
    loadCatalog().catch(() => {})
    const [{ data: prof }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('equipment, training_goal, active_split, rotation_index').eq('id', uid).single(),
      supabase.from('routines').select('*').eq('archived', false).order('created_at', { ascending: false })
    ])
    setEquipment(prof?.equipment || [])
    setDefaultGoal(prof?.training_goal || 'equilibrio')
    setActiveSplit(prof?.active_split || null)
    setRotationIndex(prof?.rotation_index || 0)
    setRoutines(r || [])
    const ids = (r || []).map((x) => x.id)
    if (ids.length) {
      const { data: rex } = await supabase.from('routine_exercises').select('routine_id').in('routine_id', ids)
      const c = {}
      ;(rex || []).forEach((x) => { c[x.routine_id] = (c[x.routine_id] || 0) + 1 })
      setCounts(c)
    } else setCounts({})
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const days = activeSplit ? SPLITS[activeSplit].days : []
  const curDay = days.length ? days[rotationIndex % days.length] : null
  const matching = curDay ? routines.filter((r) => r.focus === curDay.name) : []

  async function setPlan(key) {
    await supabase.from('profiles').update({ active_split: key, rotation_index: 0 }).eq('id', uid)
    setActiveSplit(key); setRotationIndex(0)
  }
  async function clearPlan() {
    await supabase.from('profiles').update({ active_split: null }).eq('id', uid)
    setActiveSplit(null)
  }
  async function advance() {
    const ni = days.length ? (rotationIndex + 1) % days.length : 0
    await supabase.from('profiles').update({ rotation_index: ni }).eq('id', uid)
    setRotationIndex(ni)
  }

  if (view === 'build') {
    return (
      <ComboBuilder session={session} equipment={equipment} defaultGoal={defaultGoal}
        initialSplit={buildInit?.split} initialDayName={buildInit?.dayName}
        onCancel={() => { setBuildInit(null); setView('list') }}
        onSaved={(id) => { setBuildInit(null); setSelected(id); setView('detail') }} />
    )
  }
  if (view === 'detail' && selected) {
    return (
      <ComboDetail session={session} routineId={selected} equipment={equipment}
        onBack={() => { setView('list'); load() }}
        onDeleted={() => { setView('list'); load() }} />
    )
  }

  const ComboCard = (r) => (
    <button key={r.id} className="card combo-card" onClick={() => { setSelected(r.id); setView('detail') }}>
      <div>
        <div className="name">{r.name}</div>
        <div className="muted">{r.focus ? r.focus + ' · ' : ''}{counts[r.id] || 0} ejercicios</div>
      </div>
      <span className="chev">›</span>
    </button>
  )

  return (
    <>
      {equipment.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <h2>⚠️ Cargá tu equipo</h2>
          <p className="muted">Andá a <b>Perfil</b> y marcá qué equipo tenés. La IA arma los combos solo con eso.</p>
        </div>
      )}

      {/* ---- Plan rotativo ---- */}
      <div className="card">
        <h2>📅 Tu plan</h2>
        {!activeSplit ? (
          <>
            <p className="muted">
              Elegí tu método y la app te dice qué toca cada vez que entrenás. Es una <b>rotación flexible</b>:
              si un día no podés, no se rompe — seguís por donde ibas.
            </p>
            {SPLIT_KEYS.map((k) => (
              <div className="exercise" key={k}>
                <div className="name">{SPLITS[k].label}</div>
                <div className="muted" style={{ marginTop: 4 }}>{SPLITS[k].desc}</div>
                <button className="full" style={{ marginTop: 8 }} onClick={() => setPlan(k)}>
                  Elegir {SPLITS[k].label}
                </button>
              </div>
            ))}
            <button className="ghost full" style={{ marginTop: 4 }} onClick={recommendSplit} disabled={tipBusy}>
              {tipBusy ? <span className="spinner" /> : '🤖 ¿Cuál me conviene?'}
            </button>
            {splitTip && <div className="advice" style={{ marginTop: 10 }}>{splitTip}</div>}
          </>
        ) : (
          <>
            <p className="muted"><b>{SPLITS[activeSplit].label}</b> — {SPLITS[activeSplit].desc}</p>
            <div className="today-box">
              <div className="muted">Hoy toca</div>
              <div className="today-name">{curDay.name}</div>
              <div className="muted">{musclesEs(curDay.muscles).join(', ')}</div>
            </div>

            {matching.length > 0 ? (
              <div style={{ marginTop: 10 }}>
                <p className="muted">Tu combo para hoy:</p>
                {matching.map(ComboCard)}
              </div>
            ) : (
              <button className="full" style={{ marginTop: 10 }}
                onClick={() => { setBuildInit({ split: activeSplit, dayName: curDay.name }); setView('build') }}>
                ＋ Crear combo de {curDay.name}
              </button>
            )}

            <button className="full" style={{ marginTop: 10 }} onClick={advance}>
              ✓ Hice este día → siguiente
            </button>
            <button className="ghost full" style={{ marginTop: 10 }} onClick={clearPlan}>Cambiar método</button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Mis combos</h2>
        <p className="muted">Plantillas reutilizables. Entrás a cada una para registrar el peso y ver tu progreso.</p>
        <button className="full" style={{ marginTop: 10 }}
          onClick={() => { setBuildInit(null); setView('build') }}>＋ Crear combo</button>
      </div>

      {loading && <div className="center"><span className="spinner" /></div>}
      {!loading && routines.length === 0 && (
        <div className="card center"><p className="muted">Todavía no tenés combos. Creá el primero 💪</p></div>
      )}
      {routines.map(ComboCard)}
    </>
  )
}

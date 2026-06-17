import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadCatalog } from '../lib/catalog'
import ComboBuilder from '../components/ComboBuilder'
import ComboDetail from '../components/ComboDetail'

export default function Rutina({ session }) {
  const uid = session.user.id
  const [view, setView] = useState('list')   // 'list' | 'build' | 'detail'
  const [selected, setSelected] = useState(null)
  const [routines, setRoutines] = useState([])
  const [equipment, setEquipment] = useState([])
  const [defaultGoal, setDefaultGoal] = useState('equilibrio')
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    loadCatalog().catch(() => {})  // precargar catálogo en segundo plano
    const [{ data: prof }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('equipment, training_goal').eq('id', uid).single(),
      supabase.from('routines').select('*').eq('archived', false).order('created_at', { ascending: false })
    ])
    setEquipment(prof?.equipment || [])
    setDefaultGoal(prof?.training_goal || 'equilibrio')
    setRoutines(r || [])
    // contar ejercicios por combo
    const ids = (r || []).map((x) => x.id)
    if (ids.length) {
      const { data: rex } = await supabase.from('routine_exercises')
        .select('routine_id').in('routine_id', ids)
      const c = {}
      ;(rex || []).forEach((x) => { c[x.routine_id] = (c[x.routine_id] || 0) + 1 })
      setCounts(c)
    } else setCounts({})
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  if (view === 'build') {
    return (
      <ComboBuilder session={session} equipment={equipment} defaultGoal={defaultGoal}
        onCancel={() => setView('list')}
        onSaved={(id) => { setSelected(id); setView('detail'); }} />
    )
  }
  if (view === 'detail' && selected) {
    return (
      <ComboDetail session={session} routineId={selected} equipment={equipment}
        onBack={() => { setView('list'); load() }}
        onDeleted={() => { setView('list'); load() }} />
    )
  }

  return (
    <>
      {equipment.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <h2>⚠️ Cargá tu equipo</h2>
          <p className="muted">
            Andá a <b>Perfil</b> y marcá qué equipo tenés (mancuernas, barra, máquina, etc.).
            La IA arma los combos solo con lo que podés usar.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Mis combos</h2>
        <p className="muted">Plantillas reutilizables. Entrás a cada una para registrar el peso y ver tu progreso.</p>
        <button className="full" style={{ marginTop: 10 }} onClick={() => setView('build')}>
          ＋ Crear combo
        </button>
      </div>

      {loading && <div className="center"><span className="spinner" /></div>}

      {!loading && routines.length === 0 && (
        <div className="card center">
          <p className="muted">Todavía no tenés combos. Creá el primero 💪</p>
        </div>
      )}

      {routines.map((r) => (
        <button key={r.id} className="card combo-card"
          onClick={() => { setSelected(r.id); setView('detail') }}>
          <div>
            <div className="name">{r.name}</div>
            <div className="muted">
              {r.focus ? r.focus + ' · ' : ''}{counts[r.id] || 0} ejercicios
            </div>
          </div>
          <span className="chev">›</span>
        </button>
      ))}
    </>
  )
}

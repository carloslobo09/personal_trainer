import { useEffect, useState } from 'react'
import { searchCatalog, imageUrl, MUSCLE_ES, EQUIPMENT_ES } from '../lib/catalog'
import { goalReps } from '../lib/goals'
import { ai } from '../lib/api'
import ExerciseImage from './ExerciseImage'

// Modal para elegir un ejercicio del catálogo y agregarlo.
// onPick(item) recibe: { catalog_id, name, equipment, primary_muscles, image_url, description_es, target_sets, target_reps }
export default function CatalogPicker({ equipment = [], goal = 'equilibrio', onPick, onClose }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)
  const [results, setResults] = useState([])
  const [picking, setPicking] = useState(null) // id en proceso de describir

  async function run() {
    const r = await searchCatalog({
      query: q, muscle: muscle || null,
      equipment, onlyAvailable: onlyMine
    })
    setResults(r)
  }
  useEffect(() => { run() }, [q, muscle, onlyMine])

  async function choose(ex) {
    setPicking(ex.id)
    let desc = null
    try {
      const { result } = await ai('describe_exercise', {
        name: ex.name, muscle: (ex.primary || [])[0] || '', equipment: ex.equipment || '', goal
      })
      desc = result
    } catch { /* si falla la traducción, seguimos igual */ }
    setPicking(null)
    onPick({
      catalog_id: ex.id,
      name: desc?.nombre_es || ex.name,
      equipment: ex.equipment || 'body only',
      primary_muscles: ex.primary || [],
      image_url: imageUrl(ex),
      description_es: desc?.descripcion_es || '',
      target_sets: desc?.series || '4',
      target_reps: desc?.reps || goalReps(goal)
    })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Agregar ejercicio</h2>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        <input placeholder="Buscar (en inglés: bench, squat, curl...)"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            <option value="">Todos los músculos</option>
            {Object.entries(MUSCLE_ES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <input type="checkbox" style={{ width: 'auto' }}
            checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Solo con mi equipo
        </label>

        <div className="picker-list">
          {results.length === 0 && <p className="muted">Sin resultados.</p>}
          {results.map((ex) => (
            <button key={ex.id} className="picker-item" onClick={() => choose(ex)} disabled={picking}>
              <ExerciseImage src={imageUrl(ex)} alt={ex.name} size={48} />
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="name">{ex.name}</div>
                <div className="muted">
                  {(ex.primary || []).map((m) => MUSCLE_ES[m] || m).join(', ')}
                  {' · '}{EQUIPMENT_ES[ex.equipment] || ex.equipment || 'Peso corporal'}
                </div>
              </div>
              {picking === ex.id ? <span className="spinner" /> : <span className="add">＋</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

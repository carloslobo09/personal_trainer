// Catálogo de ejercicios (free-exercise-db, dominio público).
// Se descarga una vez desde /exercise-catalog.json y se cachea en memoria.

const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

let _catalog = null
let _byId = null
let _loading = null

export async function loadCatalog() {
  if (_catalog) return _catalog
  if (_loading) return _loading
  _loading = fetch(`${import.meta.env.BASE_URL}exercise-catalog.json`)
    .then((r) => {
      if (!r.ok) throw new Error('No se pudo cargar el catálogo de ejercicios')
      return r.json()
    })
    .then((data) => {
      _catalog = data
      _byId = new Map(data.map((e) => [e.id, e]))
      return data
    })
  return _loading
}

export function getById(id) {
  return _byId ? _byId.get(id) : null
}

export function imageUrl(ex) {
  const path = ex?.images?.[0]
  return path ? IMG_BASE + path : null
}

// Equipo del catálogo -> etiqueta en español (lo que el usuario elige tener)
export const EQUIPMENT_ES = {
  'dumbbell': 'Mancuernas',
  'barbell': 'Barra',
  'e-z curl bar': 'Barra Z',
  'cable': 'Polea / cable',
  'machine': 'Máquina',
  'kettlebells': 'Kettlebell',
  'bands': 'Bandas elásticas',
  'medicine ball': 'Balón medicinal',
  'exercise ball': 'Pelota de ejercicio',
  'foam roll': 'Rodillo de espuma',
  'other': 'Otro'
}
// Equipo que el usuario puede tildar (peso corporal va implícito siempre)
export const SELECTABLE_EQUIPMENT = Object.keys(EQUIPMENT_ES)

export const MUSCLE_ES = {
  abdominals: 'Abdominales', hamstrings: 'Isquiotibiales', adductors: 'Aductores',
  quadriceps: 'Cuádriceps', biceps: 'Bíceps', shoulders: 'Hombros', chest: 'Pecho',
  'middle back': 'Espalda media', calves: 'Pantorrillas', glutes: 'Glúteos',
  'lower back': 'Espalda baja', lats: 'Dorsales', triceps: 'Tríceps', traps: 'Trapecios',
  forearms: 'Antebrazos', neck: 'Cuello', abductors: 'Abductores'
}

// Enfoques (qué tocar hoy) -> músculos primarios incluidos
export const FOCUS_GROUPS = {
  'Empuje': ['chest', 'shoulders', 'triceps'],
  'Tirón': ['lats', 'middle back', 'biceps', 'traps', 'forearms'],
  'Pierna': ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  'Core': ['abdominals', 'lower back']
}

export function musclesEs(arr) {
  return (arr || []).map((m) => MUSCLE_ES[m] || m)
}

// ¿El usuario puede hacer este ejercicio con su equipo?
function available(ex, equipment) {
  const eq = ex.equipment
  if (!eq || eq === 'body only') return true
  return equipment.includes(eq)
}

// Candidatos para mandarle a la IA: filtra por equipo y (opcional) enfoque.
// Devuelve [{id,name,muscle,equipment}], diversificado por músculo.
export async function candidatesFor({ focus = null, muscles = null, equipment = [], cap = 120 }) {
  const cat = await loadCatalog()
  const targetMuscles = muscles || (focus ? FOCUS_GROUPS[focus] : null)
  const filtered = cat.filter((ex) => {
    if (!available(ex, equipment)) return false
    if (targetMuscles) return (ex.primaryMuscles || ex.primary || []).some((m) => targetMuscles.includes(m))
    return true
  })
  // Diversificar: agrupar por músculo primario y tomar de a poco
  const byMuscle = {}
  for (const ex of filtered) {
    const m = (ex.primaryMuscles || ex.primary || [])[0] || 'otro'
    ;(byMuscle[m] = byMuscle[m] || []).push(ex)
  }
  const perMuscle = targetMuscles ? 12 : 8
  const out = []
  for (const m of Object.keys(byMuscle)) {
    for (const ex of byMuscle[m].slice(0, perMuscle)) {
      out.push({
        id: ex.id, name: ex.name,
        muscle: (ex.primaryMuscles || ex.primary || [])[0] || '',
        equipment: ex.equipment || 'body only'
      })
    }
  }
  return out.slice(0, cap)
}

// Buscar en el catálogo (para agregar a mano)
export async function searchCatalog({ query = '', muscle = null, equipment = [], onlyAvailable = false }) {
  const cat = await loadCatalog()
  const q = query.trim().toLowerCase()
  return cat.filter((ex) => {
    if (onlyAvailable && equipment.length && !available(ex, equipment)) return false
    if (muscle && !(ex.primary || []).includes(muscle)) return false
    if (q && !ex.name.toLowerCase().includes(q)) return false
    return true
  }).slice(0, 80)
}

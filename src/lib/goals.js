// Objetivos de entrenamiento: reps, series y descanso recomendados.
// Nota: lo que más cambia por objetivo son las REPS y el DESCANSO; las series son ~3-4 en todos.
// reps = ejercicios COMPUESTOS (press, remo, sentadilla); isoReps = AISLACIONES (curl, lateral, etc.);
// absReps = abdominales/core (siempre reps altas).
export const GOALS = {
  definir: {
    label: '🔥 Definir', short: 'Definir', reps: '15-20', isoReps: '15-20', absReps: '20-30', sets: '3', rest: '30-45s',
    perSession: '6-8', sessionNote: 'descanso corto, podés meter más ejercicios (más densidad y quema)',
    desc: 'Quemar grasa: reps altas, peso moderado-bajo, descanso corto.'
  },
  equilibrio: {
    label: '⚖️ Equilibrio', short: 'Equilibrio', reps: '10-15', isoReps: '12-20', absReps: '15-25', sets: '4', rest: '60s',
    perSession: '5-7', sessionNote: 'volumen moderado',
    desc: 'Músculo + algo de quema: reps medias, descanso medio.'
  },
  musculo: {
    label: '💪 Músculo', short: 'Músculo', reps: '6-10', isoReps: '10-15', absReps: '15-20', sets: '4', rest: '90-120s',
    perSession: '5-6', sessionNote: 'menos ejercicios pero más series y peso, con descanso largo',
    desc: 'Hipertrofia/fuerza: reps bajas, peso alto, descanso largo.'
  }
}

export const GOAL_KEYS = Object.keys(GOALS)
export const goalLabel = (k) => GOALS[k]?.label || k
export const goalShort = (k) => GOALS[k]?.short || k
export const goalReps = (k) => GOALS[k]?.reps || '10-15'
export const goalSets = (k) => GOALS[k]?.sets || '4'
export const goalPerSession = (k) => GOALS[k]?.perSession || '5-7'

// Reps apropiadas según el TIPO de ejercicio (compuesto / aislación / abdominales).
export function goalRepsFor(goalKey, { mechanic, muscles } = {}) {
  const G = GOALS[goalKey] || GOALS.equilibrio
  const m = muscles || []
  if (m.includes('abdominals')) return G.absReps || G.isoReps || G.reps
  const iso = mechanic === 'isolation' || m.includes('calves')
  return iso ? (G.isoReps || G.reps) : G.reps
}

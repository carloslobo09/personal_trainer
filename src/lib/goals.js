// Objetivos de entrenamiento: reps, series y descanso recomendados.
// Nota: lo que más cambia por objetivo son las REPS y el DESCANSO; las series son ~3-4 en todos.
export const GOALS = {
  definir: {
    label: '🔥 Definir', short: 'Definir', reps: '15-20', sets: '3', rest: '30-45s',
    desc: 'Quemar grasa: reps altas, peso moderado-bajo, descanso corto.'
  },
  equilibrio: {
    label: '⚖️ Equilibrio', short: 'Equilibrio', reps: '10-15', sets: '4', rest: '60s',
    desc: 'Músculo + algo de quema: reps medias, descanso medio.'
  },
  musculo: {
    label: '💪 Músculo', short: 'Músculo', reps: '6-10', sets: '4', rest: '90-120s',
    desc: 'Hipertrofia/fuerza: reps bajas, peso alto, descanso largo.'
  }
}

export const GOAL_KEYS = Object.keys(GOALS)
export const goalLabel = (k) => GOALS[k]?.label || k
export const goalShort = (k) => GOALS[k]?.short || k
export const goalReps = (k) => GOALS[k]?.reps || '10-15'
export const goalSets = (k) => GOALS[k]?.sets || '4'

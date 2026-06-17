// Objetivos de entrenamiento y su rango de reps recomendado.
export const GOALS = {
  definir: {
    label: '🔥 Definir', short: 'Definir', reps: '15-20',
    desc: 'Quemar grasa: reps altas, peso moderado-bajo, descanso corto.'
  },
  equilibrio: {
    label: '⚖️ Equilibrio', short: 'Equilibrio', reps: '10-15',
    desc: 'Músculo + algo de quema: reps medias, descanso medio.'
  },
  musculo: {
    label: '💪 Músculo', short: 'Músculo', reps: '6-10',
    desc: 'Hipertrofia/fuerza: reps bajas, peso alto, descanso largo.'
  }
}

export const GOAL_KEYS = Object.keys(GOALS)
export const goalLabel = (k) => GOALS[k]?.label || k
export const goalShort = (k) => GOALS[k]?.short || k
export const goalReps = (k) => GOALS[k]?.reps || '10-15'

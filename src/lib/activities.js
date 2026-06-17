// Tipos de actividad/cardio + estimación de calorías por MET.
// Calorías ≈ MET × peso(kg) × horas.  (estimación, no exacto)

export const ACTIVITIES = {
  correr:   { label: 'Correr',   icon: '🏃', met: { suave: 7.0, media: 9.8, alta: 11.5 } },
  futbol:   { label: 'Fútbol',   icon: '⚽', met: { suave: 5.0, media: 7.0, alta: 10.0 } },
  bici:     { label: 'Bici',     icon: '🚴', met: { suave: 4.0, media: 8.0, alta: 10.0 } },
  natacion: { label: 'Natación', icon: '🏊', met: { suave: 6.0, media: 8.0, alta: 10.0 } },
  caminar:  { label: 'Caminar',  icon: '🚶', met: { suave: 2.8, media: 3.5, alta: 4.3 } },
  otro:     { label: 'Otro',     icon: '🤸', met: { suave: 4.0, media: 6.0, alta: 8.0 } }
}
export const ACTIVITY_KEYS = Object.keys(ACTIVITIES)

export const INTENSITIES = [
  { key: 'suave', label: 'Suave' },
  { key: 'media', label: 'Media' },
  { key: 'alta', label: 'Alta' }
]

export function activityLabel(type) {
  const a = ACTIVITIES[type]
  return a ? `${a.icon} ${a.label}` : type
}

export function estimateCalories(type, intensity, minutes, weightKg) {
  const met = ACTIVITIES[type]?.met?.[intensity] ?? 6
  const w = Number(weightKg) || 80
  const min = Number(minutes) || 0
  return Math.round(met * w * (min / 60))
}

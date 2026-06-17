// Métodos de entrenamiento (splits) y los "días" que los componen.
// Cada día define qué músculos trabaja (claves en inglés, como el catálogo).

export const SPLITS = {
  full_body: {
    label: 'Full Body',
    desc: 'Todo el cuerpo en cada sesión. Ideal si entrenás 2-3 días/semana o estás empezando. Mucha frecuencia por músculo.',
    days: [
      { name: 'Cuerpo completo', muscles: ['chest', 'lats', 'shoulders', 'quadriceps', 'hamstrings', 'glutes', 'biceps', 'triceps', 'abdominals', 'calves'] }
    ]
  },
  upper_lower: {
    label: 'Upper / Lower',
    desc: 'Alternás tren superior y tren inferior. Suele ser 4 días/semana. Buen equilibrio entre frecuencia y volumen.',
    days: [
      { name: 'Tren superior', muscles: ['chest', 'lats', 'middle back', 'shoulders', 'biceps', 'triceps', 'traps', 'forearms'] },
      { name: 'Tren inferior', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lower back', 'abdominals'] }
    ]
  },
  ppl: {
    label: 'Push / Pull / Legs',
    desc: 'Empuje (pecho/hombro/tríceps), Tirón (espalda/bíceps), Pierna. 3 o 6 días/semana. Clásico para hipertrofia.',
    days: [
      { name: 'Empuje', muscles: ['chest', 'shoulders', 'triceps'] },
      { name: 'Tirón', muscles: ['lats', 'middle back', 'biceps', 'traps', 'forearms'] },
      { name: 'Pierna', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'] }
    ]
  },
  arnold: {
    label: 'Arnold Split',
    desc: 'Pecho+espalda / hombros+brazos / piernas. Volumen alto, más avanzado. Suele ser 6 días/semana.',
    days: [
      { name: 'Pecho y espalda', muscles: ['chest', 'lats', 'middle back'] },
      { name: 'Hombros y brazos', muscles: ['shoulders', 'biceps', 'triceps', 'forearms'] },
      { name: 'Piernas', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'] }
    ]
  }
}

export const SPLIT_KEYS = Object.keys(SPLITS)

import { useState } from 'react'

// Muestra la imagen del ejercicio con un fallback si falla la carga.
export default function ExerciseImage({ src, alt, size = 64 }) {
  const [err, setErr] = useState(false)
  if (!src || err) {
    return (
      <div className="ex-img placeholder" style={{ width: size, height: size }}>💪</div>
    )
  }
  return (
    <img className="ex-img" src={src} alt={alt || ''} loading="lazy"
      style={{ width: size, height: size }} onError={() => setErr(true)} />
  )
}

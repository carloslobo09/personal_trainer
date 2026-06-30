import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err) {
      setMsg('⚠️ ' + (err.message || 'Error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="logo">💪</div>
      <h1 className="center">Gym <span className="accent">Coach</span></h1>
      <p className="muted center">Tu control de comida y rutina con IA</p>
      <form onSubmit={submit} className="card" style={{ marginTop: 20 }}>
        <label>Email</label>
        <input type="email" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} required />
        <label>Contraseña</label>
        <input type="password" value={password} autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <button className="full" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? <span className="spinner" /> : 'Entrar'}
        </button>
        {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
      </form>
    </div>
  )
}

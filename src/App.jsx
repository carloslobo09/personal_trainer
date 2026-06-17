import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './views/Login'
import Comida from './views/Comida'
import Rutina from './views/Rutina'
import Cardio from './views/Cardio'
import Progreso from './views/Progreso'
import Perfil from './views/Perfil'

const TABS = [
  { id: 'comida', label: 'Comida', ic: '🍽️', C: Comida },
  { id: 'rutina', label: 'Rutina', ic: '💪', C: Rutina },
  { id: 'cardio', label: 'Cardio', ic: '🏃', C: Cardio },
  { id: 'progreso', label: 'Progreso', ic: '📈', C: Progreso },
  { id: 'perfil', label: 'Perfil', ic: '⚙️', C: Perfil }
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('comida')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div className="center" style={{ marginTop: '40vh' }}><span className="spinner" /></div>
  }
  if (!session) return <Login />

  const Active = TABS.find((t) => t.id === tab).C

  return (
    <div className="app">
      <header className="topbar">
        <h1>Gym <span className="accent">Coach</span></h1>
        <button className="ghost" style={{ padding: '8px 12px', fontSize: 13 }}
          onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>
      <main>
        <Active session={session} />
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="ic">{t.ic}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

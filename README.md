# 💪 Gym Coach

App personal (web + PWA instalable en el celu) para llevar el control de tu
**comida** y **rutina de gym**, con consejos de IA. Gratis de mantener:
GitHub Pages (hosting) + Supabase (datos + login + proxy de IA) + Groq/Llama (IA gratis).

- **Comida:** escribís lo que comés en lenguaje natural y la IA estima calorías y proteína.
  Podés cargar comida de hoy, ayer o cualquier día (selector de fecha).
- **Rutina:** creás **combos (plantillas) reutilizables**. La IA te propone ejercicios según tu
  **equipo disponible**, tu **objetivo** (definir / equilibrio / músculo) y tu historial; aceptás,
  cambiás (↺) o quitás cada uno, agregás los que quieras del catálogo, y registrás el
  **peso inicial (obligatorio)**. Cada ejercicio trae **imagen**, **descripción en español** y
  **reps recomendadas** según el objetivo. Después registrás el peso que levantás y ves tu **progreso**.
- **Progreso:** peso corporal, días entrenados, proteína promedio.
- **Perfil:** tus datos (altura, peso, creatina, objetivo), **tu equipo**, tu **objetivo por defecto**,
  y un chat para preguntarle al coach (que conoce tu historial).

> Las fechas se registran en **horario de Argentina**.

### Cómo funciona la rutina (el flujo)
1. En **Perfil** marcás tu equipo y tu objetivo por defecto.
2. En **Rutina → Crear combo** elegís qué trabajar (Empuje / Tirón / Pierna / Core, o "que decida la IA").
3. La IA arma el combo con **solo ejercicios que podés hacer con tu equipo**, equilibrando el cuerpo
   según lo que entrenaste últimamente, y con las reps acordes a tu objetivo.
4. Revisás: cargás el peso inicial de cada uno, cambiás (↺) los que no puedas, quitás o agregás.
5. Guardás el combo. Cada vez que lo hacés, registrás el peso → ves si vas subiendo.

> Las imágenes y técnicas salen de [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
> (dominio público). El catálogo ya viene incluido en `public/exercise-catalog.json` y las imágenes
> se sirven gratis desde un CDN — **no hay que configurar nada extra** para esto.

---

## 🚀 Puesta en marcha (una sola vez)

> **Ninguna clave secreta va en el código.** Todo lo sensible se carga aparte (ver
> [Seguridad](#-seguridad)). El archivo `.env` está en `.gitignore` y nunca se sube.

### 1. Crear el proyecto en Supabase
1. https://supabase.com → **New project** (plan Free).
2. **Project Settings → API**, anotá:
   - **Project URL** → tu `VITE_SUPABASE_URL`
   - **anon / publishable key** → tu `VITE_SUPABASE_ANON_KEY`

### 2. Crear las tablas
**SQL Editor → New query**, pegá TODO [`supabase/schema.sql`](supabase/schema.sql) → **Run**.

### 3. Configurar el login (importante para seguridad)
En **Authentication → Sign In / Providers → Email**:
- Desactivá *"Confirm email"* (para entrar sin confirmar el correo).
- Creá tu usuario una vez (desde la app, botón "Crear cuenta").
- **Después, desactivá los registros nuevos** (*"Allow new users to sign up"* → OFF). Así nadie más
  puede crear cuentas en tu app. Ver [Seguridad](#-seguridad).

### 4. Subir la Edge Function de IA (proxy de Groq)
Necesitás la CLI de Supabase y una API key gratis de Groq.

```bash
# instalar CLI (macOS)
brew install supabase/tap/supabase

# login (token de https://supabase.com/dashboard/account/tokens)
supabase login --token TU-TOKEN

# guardar tu API key de Groq como SECRETO (no se expone nunca)
supabase secrets set GROQ_API_KEY=tu-key --project-ref TU-PROJECT-REF

# desplegar
supabase functions deploy ai --project-ref TU-PROJECT-REF
```

> API key de Groq: **gratis** en https://console.groq.com → **API Keys** (sin tarjeta).

### 5. Probar en local
```bash
cp .env.example .env      # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

---

## 🌐 Publicar en GitHub Pages (gratis)

> Pages gratuito requiere repo **público**. Es seguro: el código no contiene secretos, y la única
> clave que viaja al navegador (la *anon/publishable key*) está pensada para ser pública y los datos
> quedan protegidos por RLS (ver [Seguridad](#-seguridad)).

1. Subí el código a un repo de GitHub.
2. **Settings → Secrets and variables → Actions**, creá los secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages → Source: GitHub Actions**.
4. Cada `push` a `main` despliega solo, en `https://TU-USUARIO.github.io/TU-REPO/`.

> El workflow usa el nombre del repo como `base` automáticamente. No hay que tocar nada.

---

## 📲 Instalar en el celular
- **Android/Chrome:** menú ⋮ → *"Instalar app"* / *"Agregar a pantalla de inicio"*.
- **iPhone/Safari:** compartir → *"Agregar a inicio"*.

---

## 💸 Costos
- **GitHub Pages:** $0 · **Supabase Free:** $0 · **Groq / Llama:** $0 (tier gratuito).

### Cambiar de modelo de IA
Editá [`supabase/functions/ai/index.ts`](supabase/functions/ai/index.ts) y volvé a desplegar:
```ts
const MODEL = 'llama-3.3-70b-versatile'   // gratis; 'llama-3.1-8b-instant' = más rápido
```
Cambiar de proveedor de IA (Gemini, Claude, etc.) es solo editar ese archivo — el resto no se toca.

---

## 🗂️ Estructura
```
public/exercise-catalog.json   Catálogo de ejercicios (free-exercise-db, dominio público)
src/views/                     Pantallas: Comida, Rutina, Progreso, Perfil, Login
src/components/                ComboBuilder, ComboDetail, CatalogPicker, ExerciseImage
src/lib/                       Cliente Supabase, llamadas a la IA, catálogo, objetivos
supabase/schema.sql            Tablas + seguridad por usuario (RLS)
supabase/functions/ai/         Edge Function: proxy seguro a la IA (Groq)
.github/workflows/             Deploy automático a GitHub Pages
```

---

## 🔒 Seguridad

**Dónde vive cada cosa (qué es secreto y qué no):**

| Dato | Dónde vive | ¿En el repo? | ¿Público? |
|---|---|---|---|
| `GROQ_API_KEY` (clave de IA) | Secreto de Supabase (servidor) | ❌ Nunca | ❌ Nunca sale del servidor |
| Supabase URL + *anon/publishable key* | GitHub Actions secrets → build | ❌ No (`.env` ignorado) | ✅ Sí, va al navegador **a propósito** |
| Datos del usuario | Postgres de Supabase | ❌ | ❌ Protegidos por RLS |

**Por qué la anon key pública no es un problema:** la *anon/publishable key* está diseñada para
estar en el cliente. Por sí sola no da acceso a nada: cada tabla tiene **Row Level Security (RLS)**,
así que un usuario solo puede leer/escribir **sus propios** datos, y solo estando autenticado. La
clave de IA (la que sí podría costar plata o ser robada) **nunca** llega al navegador: vive como
secreto en la Edge Function.

**Lo que ya está protegido:**
- ✅ RLS en todas las tablas (cada uno ve solo lo suyo).
- ✅ La función de IA exige sesión válida (JWT) — solo usuarios logueados la pueden llamar.
- ✅ `.env` y las keys reales fuera del repo.

**Recomendado hacer (en el panel de Supabase):**
- 🔒 **Cerrar los registros nuevos** una vez creada tu cuenta:
  *Authentication → Sign In / Providers → "Allow new users to sign up" → OFF*.
  Evita que desconocidos creen cuentas y usen tu cuota de IA.
- 🔁 Si alguna vez exponés una clave por error, rotala: la de Groq en console.groq.com, y las de
  Supabase en *Project Settings → API* (y actualizá el secret correspondiente).
- 🗑️ Tus datos los podés borrar desde la app o desde el panel de Supabase.

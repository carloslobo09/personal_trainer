# 💪 Gym Coach

App personal (web + PWA instalable en el celu) para llevar el control de tu
**comida** y **rutina de gym**, con consejos de IA (Claude). Gratis de mantener:
GitHub Pages (hosting) + Supabase (datos + login + proxy de IA).

- **Comida:** escribís lo que comés en lenguaje natural y la IA estima calorías y proteína.
- **Rutina:** creás **combos (plantillas) reutilizables**. La IA te propone ejercicios según tu
  **equipo disponible** y tu recuperación; aceptás, cambiás (↺) o quitás cada uno, agregás los que
  quieras del catálogo, y registrás el **peso inicial (obligatorio)**. Cada ejercicio trae **imagen** y
  **descripción en español**. Después, en cada combo registrás el peso que levantás y ves tu **progreso**.
- **Progreso:** peso corporal, días entrenados, proteína promedio.
- **Perfil:** tus datos (altura, peso, creatina, objetivo), **tu equipo disponible**, y un chat para
  preguntarle al coach.

### Cómo funciona la rutina (el flujo)
1. En **Perfil** marcás tu equipo (mancuernas, barra, máquina, polea, etc.).
2. En **Rutina → Crear combo** elegís qué trabajar (Empuje / Tirón / Pierna / Core, o "que decida la IA").
3. La IA arma el combo eligiendo **solo ejercicios que podés hacer con tu equipo**.
4. Revisás: cargás el peso inicial de cada uno, cambiás (↺) los que no puedas, quitás o agregás.
5. Guardás el combo. Cada vez que lo hacés, registrás el peso → ves si vas subiendo.

> Las imágenes y técnicas salen de [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
> (dominio público). El catálogo ya viene incluido en `public/exercise-catalog.json` y las imágenes
> se sirven gratis desde un CDN — **no hay que configurar nada extra** para esto.

Tu API key de Claude **nunca** queda expuesta: vive como secreto dentro de una
Edge Function de Supabase.

---

## 🚀 Puesta en marcha (una sola vez, ~20 min)

### 1. Crear el proyecto en Supabase
1. Entrá a https://supabase.com → **New project** (plan Free).
2. Cuando esté listo, andá a **Project Settings → API** y anotá:
   - **Project URL** → será tu `VITE_SUPABASE_URL`
   - **anon public key** → será tu `VITE_SUPABASE_ANON_KEY`

### 2. Crear las tablas
1. En Supabase: **SQL Editor → New query**.
2. Pegá TODO el contenido de [`supabase/schema.sql`](supabase/schema.sql) y dale **Run**.

### 3. (Recomendado) Permitir login sin confirmar email
Para uso personal, **Authentication → Sign In / Providers → Email** y desactivá
*"Confirm email"*. Así te registrás y entrás directo.

### 4. Subir la Edge Function de IA (el proxy de Groq)
Necesitás la CLI de Supabase y una API key gratis de Groq. En tu compu:

```bash
# instalar CLI (macOS)
brew install supabase/tap/supabase

# login (usá un token de https://supabase.com/dashboard/account/tokens)
supabase login --token TU-TOKEN

# guardar tu API key de Groq como SECRETO (no se expone nunca)
supabase secrets set GROQ_API_KEY=tu-key --project-ref TU-PROJECT-REF

# desplegar la función
supabase functions deploy ai --project-ref TU-PROJECT-REF
```

> Tu API key de Groq la sacás **gratis** en https://console.groq.com → **API Keys**
> (sin tarjeta). El tier gratuito alcanza de sobra para uso personal.

### 5. Probar en local
```bash
cp .env.example .env      # y completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # abrí http://localhost:5173
```

---

## 🌐 Publicar en GitHub Pages (gratis)

1. Creá un repo en GitHub (ej. `personal_trainer`) y subí este código:
   ```bash
   git init && git add -A && git commit -m "Gym Coach"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/personal_trainer.git
   git push -u origin main
   ```
2. En el repo: **Settings → Secrets and variables → Actions → New repository secret**, creá:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Cada `push` a `main` despliega solo. Tu app quedará en:
   `https://TU-USUARIO.github.io/personal_trainer/`

> Si tu repo tiene otro nombre, el workflow ya usa el nombre del repo automáticamente
> para el `base` path. No tenés que tocar nada.

---

## 📲 Instalar en el celular
Abrí la URL en el navegador del celu:
- **Android/Chrome:** menú ⋮ → *"Agregar a pantalla de inicio"* / *"Instalar app"*.
- **iPhone/Safari:** botón compartir → *"Agregar a inicio"*.

Queda como una app con su ícono y pantalla completa.

---

## 💸 Costos
- **Hosting (GitHub Pages):** $0
- **Base de datos / login (Supabase Free):** $0
- **IA (Groq / Llama, tier gratuito):** $0 para uso personal.

### Cambiar de modelo
Editá el modelo en [`supabase/functions/ai/index.ts`](supabase/functions/ai/index.ts):
```ts
const MODEL = 'llama-3.3-70b-versatile'   // gratis; 'llama-3.1-8b-instant' = más rápido
```
Después de cambiar, volvé a desplegar: `supabase functions deploy ai --project-ref TU-PROJECT-REF`.

---

## 🗂️ Estructura
```
public/
  exercise-catalog.json   Catálogo de ejercicios (free-exercise-db, dominio público)
src/                      Frontend React (PWA)
  views/                  Pantallas: Comida, Rutina, Progreso, Perfil, Login
  components/             ComboBuilder, ComboDetail, CatalogPicker, ExerciseImage
  lib/                    Cliente Supabase, llamadas a la IA, y el catálogo
supabase/
  schema.sql              Tablas + seguridad por usuario (RLS)
  functions/ai/           Edge Function: proxy seguro a Claude
.github/workflows/        Deploy automático a GitHub Pages
```

## 🔒 Privacidad y seguridad
- Cada usuario solo ve sus propios datos (Row Level Security en Postgres).
- La API key de Claude vive solo en Supabase (secreto del servidor).
- Tus datos los podés borrar desde la app o desde el panel de Supabase.

-- ============================================================
--  Gym Coach — Esquema de base de datos (Supabase / Postgres)
--  Pegá todo esto en: Supabase -> SQL Editor -> New query -> Run
--  Se puede correr varias veces sin romper nada.
-- ============================================================

-- 1) PERFIL (datos fijos tuyos + equipo disponible)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  height_cm     numeric default 190,
  weight_kg     numeric default 87,
  creatine_g    numeric default 5,
  goal          text default 'crecimiento muscular equilibrado',
  activity      text default 'entreno 4-5 dias por semana',
  equipment     text[] default '{}',   -- ej: {dumbbell, barbell, cable, machine}
  notes         text,
  updated_at    timestamptz default now()
);
-- por si la tabla ya existía sin estas columnas:
alter table public.profiles add column if not exists equipment text[] default '{}';
alter table public.profiles add column if not exists training_goal text default 'equilibrio';  -- definir | equilibrio | musculo

-- 2) COMIDAS (un registro por cosa que comés)
create table if not exists public.food_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null default current_date,
  logged_at   timestamptz not null default now(),
  raw_text    text not null,
  calories    numeric,
  protein_g   numeric,
  carbs_g     numeric,
  fat_g       numeric,
  ai_notes    text
);
create index if not exists food_logs_user_day on public.food_logs(user_id, day);

-- 3) COMBOS / PLANTILLAS de entrenamiento (reutilizables)
create table if not exists public.routines (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  focus       text,                 -- ej: "Empuje", "Pierna"
  goal        text default 'equilibrio',  -- definir | equilibrio | musculo
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists routines_user on public.routines(user_id);
alter table public.routines add column if not exists goal text default 'equilibrio';

-- 4) EJERCICIOS dentro de un combo (snapshot del catálogo: queda autocontenido)
create table if not exists public.routine_exercises (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  routine_id      bigint not null references public.routines(id) on delete cascade,
  catalog_id      text,                 -- id del catálogo (puede ser null si es propio)
  name            text not null,        -- nombre (en español o el del catálogo)
  equipment       text,
  primary_muscles text[] default '{}',
  image_url       text,                 -- URL de la imagen
  description_es  text,                 -- cómo hacerlo, en español
  target_sets     text,                 -- cantidad de series, ej "4"
  target_reps     text,                 -- rango de reps según objetivo, ej "10-15"
  start_weight_kg numeric not null,     -- peso inicial OBLIGATORIO
  position        int not null default 0
);
create index if not exists routine_exercises_routine on public.routine_exercises(routine_id);
alter table public.routine_exercises add column if not exists target_reps text;

-- 5) REGISTRO DE PESO por ejercicio (progreso a lo largo del tiempo)
create table if not exists public.exercise_logs (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references auth.users(id) on delete cascade,
  routine_id          bigint references public.routines(id) on delete set null,
  routine_exercise_id bigint references public.routine_exercises(id) on delete cascade,
  catalog_id          text,
  exercise_name       text not null,
  day                 date not null default current_date,
  logged_at           timestamptz not null default now(),
  weight_kg           numeric not null,
  reps                int,
  sets                int,
  notes               text
);
create index if not exists exercise_logs_user_day on public.exercise_logs(user_id, day);
create index if not exists exercise_logs_rex on public.exercise_logs(routine_exercise_id);

-- 6) PESO CORPORAL (seguimiento)
create table if not exists public.weight_logs (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  day       date not null default current_date,
  weight_kg numeric not null
);
create unique index if not exists weight_logs_user_day on public.weight_logs(user_id, day);

-- 7) ACTIVIDAD / CARDIO / DEPORTE (correr, fútbol, bici, etc.)
create table if not exists public.activities (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null default current_date,
  logged_at     timestamptz not null default now(),
  type          text not null,        -- correr | futbol | bici | natacion | caminar | otro
  duration_min  int not null,
  intensity     text not null,        -- suave | media | alta
  calories_est  numeric,
  notes         text
);
create index if not exists activities_user_day on public.activities(user_id, day);

-- ============================================================
--  Seguridad por fila (RLS): cada usuario solo ve lo suyo
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.food_logs         enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.exercise_logs     enable row level security;
alter table public.weight_logs       enable row level security;
alter table public.activities        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','food_logs','routines','routine_exercises','exercise_logs','weight_logs','activities'] loop
    execute format('drop policy if exists "own_select_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "own_insert_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "own_update_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "own_delete_%1$s" on public.%1$s', t);
  end loop;
end $$;

-- profiles usa la columna id como dueño; el resto usa user_id
create policy "own_select_profiles" on public.profiles for select using (auth.uid() = id);
create policy "own_insert_profiles" on public.profiles for insert with check (auth.uid() = id);
create policy "own_update_profiles" on public.profiles for update using (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['food_logs','routines','routine_exercises','exercise_logs','weight_logs','activities'] loop
    execute format('create policy "own_select_%1$s" on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format('create policy "own_insert_%1$s" on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own_update_%1$s" on public.%1$s for update using (auth.uid() = user_id)', t);
    execute format('create policy "own_delete_%1$s" on public.%1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ============================================================
--  Crear el perfil automáticamente al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

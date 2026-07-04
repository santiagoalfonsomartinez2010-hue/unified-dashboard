-- Esquema del Panel Unificado de Empleia.
-- Ejecútalo una vez en tu proyecto de Supabase (SQL Editor → New query → Run).
--
-- Crea la tabla "paneles" donde cada usuario guarda sus dashboards, con
-- Row Level Security para que cada cuenta solo pueda ver y tocar los suyos.

create table if not exists public.paneles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nombre text not null default 'Mi panel',
  -- Todo el contenido del dashboard: { fuentes, resumen, tipoPanel, tema }
  datos jsonb not null default '{}'::jsonb,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create index if not exists paneles_user_id_idx on public.paneles (user_id, actualizado desc);

alter table public.paneles enable row level security;

drop policy if exists "cada usuario ve sus paneles" on public.paneles;
create policy "cada usuario ve sus paneles"
  on public.paneles for select
  using (auth.uid() = user_id);

drop policy if exists "cada usuario crea sus paneles" on public.paneles;
create policy "cada usuario crea sus paneles"
  on public.paneles for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada usuario edita sus paneles" on public.paneles;
create policy "cada usuario edita sus paneles"
  on public.paneles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cada usuario borra sus paneles" on public.paneles;
create policy "cada usuario borra sus paneles"
  on public.paneles for delete
  using (auth.uid() = user_id);

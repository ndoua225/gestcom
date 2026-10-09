-- GestCom: une sauvegarde privée par compte administrateur.
-- À exécuter une seule fois dans Supabase > SQL Editor.
create table if not exists public.gestcom_workspace (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gestcom_workspace enable row level security;

drop policy if exists "GestCom owner can read workspace" on public.gestcom_workspace;
create policy "GestCom owner can read workspace"
  on public.gestcom_workspace for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "GestCom owner can create workspace" on public.gestcom_workspace;
create policy "GestCom owner can create workspace"
  on public.gestcom_workspace for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "GestCom owner can update workspace" on public.gestcom_workspace;
create policy "GestCom owner can update workspace"
  on public.gestcom_workspace for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "GestCom owner can delete workspace" on public.gestcom_workspace;
create policy "GestCom owner can delete workspace"
  on public.gestcom_workspace for delete to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.gestcom_workspace to authenticated;

-- Confluence simulated-trades schema. Run this once in the Supabase
-- project's SQL editor (Dashboard > SQL Editor > New query > paste > Run).
--
-- These are hypothetical, user-created paper trades — the app never
-- recommends a direction or size; it only records what the user chose and
-- tracks the outcome against real synced prices. Row-level security means
-- every user can only ever see or modify their own rows, enforced by
-- Postgres itself, not by application code.

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('long', 'short')),
  capital numeric not null check (capital > 0),
  leverage numeric not null default 1 check (leverage >= 1 and leverage <= 50),
  entry_price numeric not null check (entry_price > 0),
  entry_date timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed', 'liquidated')),
  close_price numeric,
  close_date timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trades_user_id_idx on trades (user_id);

alter table trades enable row level security;

create policy "Users can view their own trades"
  on trades for select
  using (auth.uid() = user_id);

create policy "Users can insert their own trades"
  on trades for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own trades"
  on trades for update
  using (auth.uid() = user_id);

create policy "Users can delete their own trades"
  on trades for delete
  using (auth.uid() = user_id);

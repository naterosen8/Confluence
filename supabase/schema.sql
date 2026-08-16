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

-- --------------------------------------------------------------------------
-- Feedback
-- --------------------------------------------------------------------------
-- A site whose whole claim is "these numbers are real and checkable" needs a
-- way to be told when one of them is not. That is the report worth optimising
-- for, and it is the one most likely to be unreproducible by the time anyone
-- reads it: the snapshot rolls every weekday, so "the P/B on this page looks
-- wrong" is unanswerable a week later. So a submission carries the route and
-- the snapshot timestamp it was sent from, captured automatically rather than
-- asked for.
--
-- Same anonymous-identity model as trades: no email, no password. A sender can
-- read back their own submissions and nobody else's. There is deliberately no
-- update or delete policy — a submitted report is a record of what was seen at
-- a moment, and letting it be edited afterwards would make it useless as one.

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('wrong-number', 'bug', 'confusing', 'suggestion', 'other')),
  message text not null check (char_length(message) between 4 and 2000),
  -- Optional: only if the sender wants a reply. Never required, and the form
  -- says plainly that leaving it blank is fine.
  contact text check (contact is null or char_length(contact) <= 200),
  -- Captured, not typed. Without these a "this number is wrong" report cannot
  -- be reproduced once the daily sync has moved on.
  page text check (page is null or char_length(page) <= 300),
  snapshot_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_at_idx on feedback (created_at desc);
create index if not exists feedback_user_id_idx on feedback (user_id);

alter table feedback enable row level security;

-- Counted in a security-definer function on purpose. A policy that selects
-- from the table it guards recurses through its own RLS and Postgres rejects
-- it — the classic version of this rate limit is an infinite-recursion error
-- at the first insert. Security definer runs the count outside RLS, which is
-- exactly what is wanted here: it must see every row for this user, including
-- ones the caller could not select.
create or replace function feedback_recent_count(uid uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.feedback
  where user_id = uid and created_at > now() - interval '1 hour'
$$;

create policy "Users can send their own feedback"
  on feedback for insert
  with check (
    auth.uid() = user_id
    -- An anonymous identity is free to mint, so this is a speed bump rather
    -- than a wall. It costs an honest sender nothing and makes a bored one
    -- work for it.
    and feedback_recent_count(auth.uid()) < 10
  );

create policy "Users can view their own feedback"
  on feedback for select
  using (auth.uid() = user_id);

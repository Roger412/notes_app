-- Run this in your Supabase project's SQL editor

create extension if not exists "uuid-ossp";

-- ── Tables ────────────────────────────────────────────────────────────────────

create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  display_name text,
  created_at  timestamptz default now()
);

create table public.note_folders (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  name       text not null,
  created_at timestamptz default now()
);

create table public.notes (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  folder_id    uuid references public.note_folders on delete set null,
  title        text not null default 'Untitled',
  content      jsonb default '{}',
  is_protected boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table public.transactions (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  amount      numeric(12, 2) not null check (amount > 0),
  type        text not null check (type in ('income', 'expense')),
  category    text not null check (category in (
    'food', 'transport', 'entertainment', 'health',
    'housing', 'utilities', 'clothing', 'education', 'savings', 'other'
  )),
  description text default '',
  date        date not null default current_date,
  created_at  timestamptz default now()
);

create table public.budgets (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references auth.users on delete cascade not null,
  category     text not null,
  limit_amount numeric(12, 2) not null,
  month        text not null, -- YYYY-MM
  unique (user_id, category, month)
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table public.profiles    enable row level security;
alter table public.note_folders enable row level security;
alter table public.notes        enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

create policy "profiles_own"     on public.profiles     for all using (auth.uid() = id);
create policy "folders_own"      on public.note_folders for all using (auth.uid() = user_id);
create policy "notes_own"        on public.notes        for all using (auth.uid() = user_id);
create policy "transactions_own" on public.transactions for all using (auth.uid() = user_id);
create policy "budgets_own"      on public.budgets      for all using (auth.uid() = user_id);

-- ── Triggers ──────────────────────────────────────────────────────────────────

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep notes.updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_updated_at
  before update on public.notes
  for each row execute procedure public.set_updated_at();

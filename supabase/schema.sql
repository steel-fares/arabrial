-- ARBR Supabase schema
-- Run this file in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(12, 2) not null check (amount_usd >= 10 and amount_usd <= 5000),
  token_amount numeric(18, 2) generated always as (amount_usd * 1000) stored,
  payment_method text not null check (payment_method in ('USDT (TRC20 / Polygon)', 'Visa / Mastercard')),
  wallet_address text not null check (length(trim(wallet_address)) >= 6),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected', 'completed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists purchase_requests_set_updated_at on public.purchase_requests;
create trigger purchase_requests_set_updated_at
before update on public.purchase_requests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    phone = excluded.phone;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.purchase_requests enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can read own purchase requests" on public.purchase_requests;
create policy "Users can read own purchase requests"
on public.purchase_requests for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own purchase requests" on public.purchase_requests;
create policy "Users can create own purchase requests"
on public.purchase_requests for insert
to authenticated
with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.purchase_requests to authenticated;

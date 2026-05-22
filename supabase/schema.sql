-- ARBR Supabase schema
-- Run this file in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text not null default '',
  country text not null default '',
  account_status text not null default 'active' check (account_status in ('active', 'disabled', 'under_review')),
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'submitted', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists country text not null default '';
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists kyc_status text not null default 'pending';

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  arbr_balance numeric(18, 2) not null default 0,
  locked_arbr numeric(18, 2) not null default 0,
  total_deposit_omr numeric(14, 3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wallets (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_omr numeric(14, 3) not null check (amount_omr >= 10 and amount_omr <= 5000),
  estimated_arbr numeric(18, 2) not null check (estimated_arbr >= 10000),
  amount_usd numeric(12, 2),
  token_amount numeric(18, 2) generated always as (estimated_arbr) stored,
  payment_method text not null check (payment_method in ('USDT (TRC20 / Polygon)', 'Visa / Mastercard')),
  note text not null check (length(trim(note)) >= 2),
  wallet_address text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected', 'completed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_requests add column if not exists amount_omr numeric(14, 3);
alter table public.purchase_requests add column if not exists estimated_arbr numeric(18, 2);
alter table public.purchase_requests add column if not exists note text;
alter table public.purchase_requests alter column amount_usd drop not null;
alter table public.purchase_requests alter column wallet_address drop not null;

update public.purchase_requests
set amount_omr = coalesce(amount_omr, amount_usd),
    estimated_arbr = coalesce(estimated_arbr, token_amount, amount_usd * 1000),
    note = coalesce(note, wallet_address, '')
where amount_omr is null or estimated_arbr is null or note is null;

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

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
before update on public.wallets
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
  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
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

drop policy if exists "Users can read own wallet" on public.wallets;
create policy "Users can read own wallet"
on public.wallets for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own purchase requests" on public.purchase_requests;
create policy "Users can read own purchase requests"
on public.purchase_requests for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own purchase requests" on public.purchase_requests;
create policy "Users can create own purchase requests"
on public.purchase_requests for insert
to authenticated
with check (auth.uid() = user_id and status = 'pending');

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.wallets to authenticated;
grant select, insert on public.purchase_requests to authenticated;

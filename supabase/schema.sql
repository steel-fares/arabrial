-- ARBR Supabase schema
-- Run this file in Supabase Dashboard > SQL Editor.
-- Admin-only actions should be performed from Supabase Dashboard, Edge Functions,
-- or a trusted server using Supabase service role. Never expose service_role in GitHub Pages.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  phone text not null default '',
  country text not null default '',
  account_status text not null default 'active' check (account_status in ('active', 'disabled', 'under_review')),
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'submitted', 'approved', 'rejected')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists country text not null default '';
alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists kyc_status text not null default 'pending';
alter table public.profiles add column if not exists verification_status text not null default 'unverified';

update public.profiles
set verification_status = case
  when verification_status in ('unverified', 'pending', 'verified', 'rejected') then verification_status
  when kyc_status = 'approved' then 'verified'
  when kyc_status = 'submitted' then 'pending'
  when kyc_status = 'rejected' then 'rejected'
  else 'unverified'
end;

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
  amount_omr numeric(14, 3) not null check (amount_omr >= 10),
  estimated_arbr numeric(18, 2) not null check (estimated_arbr >= 100),
  amount_usd numeric(12, 2),
  token_amount numeric(18, 2) generated always as (estimated_arbr) stored,
  payment_method text not null check (payment_method in ('USDT (TRC20 / Polygon)', 'Visa / Mastercard')),
  payment_reference text,
  note text not null check (length(trim(note)) >= 2),
  wallet_address text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected', 'completed')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_requests add column if not exists amount_omr numeric(14, 3);
alter table public.purchase_requests add column if not exists estimated_arbr numeric(18, 2);
alter table public.purchase_requests add column if not exists amount_usd numeric(12, 2);
alter table public.purchase_requests add column if not exists payment_reference text;
alter table public.purchase_requests add column if not exists note text;
alter table public.purchase_requests add column if not exists wallet_address text;
alter table public.purchase_requests add column if not exists admin_notes text;
alter table public.purchase_requests add column if not exists reviewed_at timestamptz;
alter table public.purchase_requests alter column amount_usd drop not null;
alter table public.purchase_requests alter column wallet_address drop not null;
alter table public.purchase_requests drop constraint if exists purchase_requests_amount_omr_check;
alter table public.purchase_requests add constraint purchase_requests_amount_omr_check check (amount_omr >= 10);
alter table public.purchase_requests drop constraint if exists purchase_requests_estimated_arbr_check;
alter table public.purchase_requests add constraint purchase_requests_estimated_arbr_check check (estimated_arbr >= 100);

update public.purchase_requests
set amount_omr = coalesce(amount_omr, amount_usd),
    estimated_arbr = coalesce(estimated_arbr, token_amount, amount_usd * 1000),
    note = coalesce(note, wallet_address, ''),
    wallet_address = coalesce(wallet_address, note)
where amount_omr is null or estimated_arbr is null or note is null or wallet_address is null;

create table if not exists public.pilot_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_omr numeric(14, 3) not null check (amount_omr > 0),
  payment_method text not null,
  payment_reference text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'active', 'rejected', 'refund_requested', 'refunded', 'cancelled')),
  is_refundable boolean not null default true,
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.redeem_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_arbr numeric(18, 2) not null check (amount_arbr > 0),
  estimated_gross_omr numeric(14, 3) not null default 0,
  service_fee_omr numeric(14, 3) not null default 0,
  processing_fee_omr numeric(14, 3) not null default 0,
  estimated_final_omr numeric(14, 3) not null default 0,
  wallet_address text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'approved', 'rejected', 'completed')),
  admin_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transaction_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  transaction_type text not null check (transaction_type in ('purchase_credit', 'redeem_debit', 'balance_adjustment')),
  arbr_amount numeric(18, 2) not null default 0,
  omr_amount numeric(14, 3) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists transaction_ledger_source_unique
on public.transaction_ledger (source_table, source_id, transaction_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, verification_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'unverified'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name);

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.apply_purchase_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'completed')
     and coalesce(old.status, '') not in ('approved', 'completed') then
    new.reviewed_at = coalesce(new.reviewed_at, now());

    update public.wallets
    set arbr_balance = arbr_balance + new.estimated_arbr,
        total_deposit_omr = total_deposit_omr + new.amount_omr,
        updated_at = now()
    where user_id = new.user_id;

    insert into public.transaction_ledger (
      user_id, source_table, source_id, transaction_type, arbr_amount, omr_amount, note
    )
    values (
      new.user_id, 'purchase_requests', new.id, 'purchase_credit',
      new.estimated_arbr, new.amount_omr, 'Approved ARBR purchase request'
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.apply_redeem_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'completed')
     and coalesce(old.status, '') not in ('approved', 'completed') then
    new.reviewed_at = coalesce(new.reviewed_at, now());

    update public.wallets
    set arbr_balance = greatest(0, arbr_balance - new.amount_arbr),
        updated_at = now()
    where user_id = new.user_id;

    insert into public.transaction_ledger (
      user_id, source_table, source_id, transaction_type, arbr_amount, omr_amount, note
    )
    values (
      new.user_id, 'redeem_requests', new.id, 'redeem_debit',
      -new.amount_arbr, new.estimated_final_omr, 'Approved ARBR redeem request'
    )
    on conflict do nothing;
  end if;
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

drop trigger if exists purchase_requests_apply_approval on public.purchase_requests;
create trigger purchase_requests_apply_approval
before update of status on public.purchase_requests
for each row execute function public.apply_purchase_approval();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists pilot_deposits_set_updated_at on public.pilot_deposits;
create trigger pilot_deposits_set_updated_at
before update on public.pilot_deposits
for each row execute function public.set_updated_at();

drop trigger if exists redeem_requests_set_updated_at on public.redeem_requests;
create trigger redeem_requests_set_updated_at
before update on public.redeem_requests
for each row execute function public.set_updated_at();

drop trigger if exists redeem_requests_apply_approval on public.redeem_requests;
create trigger redeem_requests_apply_approval
before update of status on public.redeem_requests
for each row execute function public.apply_redeem_approval();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.pilot_deposits enable row level security;
alter table public.redeem_requests enable row level security;
alter table public.transaction_ledger enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own editable profile fields" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own editable profile fields"
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
with check (
  auth.uid() = user_id
  and status = 'pending'
  and (
    amount_omr < 5000
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.verification_status = 'verified'
    )
  )
);

drop policy if exists "Users can read own pilot deposits" on public.pilot_deposits;
create policy "Users can read own pilot deposits"
on public.pilot_deposits for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Verified users can create own pilot deposits" on public.pilot_deposits;
create policy "Verified users can create own pilot deposits"
on public.pilot_deposits for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.verification_status = 'verified'
  )
);

drop policy if exists "Users can read own redeem requests" on public.redeem_requests;
create policy "Users can read own redeem requests"
on public.redeem_requests for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Verified users can create own redeem requests" on public.redeem_requests;
create policy "Verified users can create own redeem requests"
on public.redeem_requests for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.verification_status = 'verified'
  )
);

drop policy if exists "Users can read own ledger" on public.transaction_ledger;
create policy "Users can read own ledger"
on public.transaction_ledger for select
to authenticated
using (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;

revoke update on public.profiles from authenticated;
revoke insert, update, delete on public.wallets from authenticated;
revoke insert, update, delete on public.purchase_requests from authenticated;
revoke insert, update, delete on public.pilot_deposits from authenticated;
revoke insert, update, delete on public.redeem_requests from authenticated;
revoke insert, update, delete on public.transaction_ledger from authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, country) on public.profiles to authenticated;
grant select on public.wallets to authenticated;

grant select on public.purchase_requests to authenticated;
grant insert (
  user_id, amount_omr, amount_usd, estimated_arbr, payment_method,
  payment_reference, note, wallet_address, status
) on public.purchase_requests to authenticated;

grant select on public.pilot_deposits to authenticated;
grant insert (
  user_id, amount_omr, payment_method, payment_reference, notes, status, is_refundable
) on public.pilot_deposits to authenticated;

grant select on public.redeem_requests to authenticated;
grant insert (
  user_id, amount_arbr, estimated_gross_omr, service_fee_omr,
  processing_fee_omr, estimated_final_omr, wallet_address, note, status
) on public.redeem_requests to authenticated;

grant select on public.transaction_ledger to authenticated;

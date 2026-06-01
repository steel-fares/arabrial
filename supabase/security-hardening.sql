-- ARBR security hardening (run after schema.sql in Supabase SQL Editor)
-- Ensures RLS, blocks anon data access, prevents privilege escalation from the client.

-- Revoke broad anon access; only platform_state remains readable by anon.
revoke all on table public.profiles from anon;
revoke all on table public.wallets from anon;
revoke all on table public.purchase_requests from anon;
revoke all on table public.pilot_deposits from anon;
revoke all on table public.redeem_requests from anon;
revoke all on table public.transaction_ledger from anon;

grant select on public.platform_state to anon;

-- Protect sensitive profile columns from non-admin updates.
create or replace function public.protect_profile_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.verification_status := old.verification_status;
    new.kyc_status := old.kyc_status;
    new.account_status := old.account_status;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_sensitive on public.profiles;
create trigger profiles_protect_sensitive
before update on public.profiles
for each row execute function public.protect_profile_sensitive_columns();

create or replace function public.enforce_request_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  pending_count integer;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Request user mismatch' using errcode = '42501';
  end if;

  execute format(
    'select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 hour''',
    tg_table_name
  )
  into recent_count
  using new.user_id;

  execute format(
    'select count(*) from public.%I where user_id = $1 and status in (''pending'', ''reviewing'')',
    tg_table_name
  )
  into pending_count
  using new.user_id;

  if recent_count >= 5 then
    raise exception 'Too many requests in one hour' using errcode = 'P0001';
  end if;

  if pending_count >= 5 then
    raise exception 'Too many pending requests' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_requests_rate_limit on public.purchase_requests;
create trigger purchase_requests_rate_limit
before insert on public.purchase_requests
for each row execute function public.enforce_request_rate_limit();

drop trigger if exists pilot_deposits_rate_limit on public.pilot_deposits;
create trigger pilot_deposits_rate_limit
before insert on public.pilot_deposits
for each row execute function public.enforce_request_rate_limit();

drop trigger if exists redeem_requests_rate_limit on public.redeem_requests;
create trigger redeem_requests_rate_limit
before insert on public.redeem_requests
for each row execute function public.enforce_request_rate_limit();

create or replace function public.admin_review_purchase_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid purchase request status' using errcode = '22023';
  end if;

  update public.purchase_requests
  set status = p_status,
      admin_notes = coalesce(nullif(trim(p_admin_notes), ''), admin_notes),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id
    and status in ('pending', 'reviewing')
  returning 1 into v_updated;

  if v_updated is null then
    raise exception 'Purchase request is not pending or does not exist' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_review_pilot_deposit(
  p_deposit_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid pilot deposit status' using errcode = '22023';
  end if;

  update public.pilot_deposits
  set status = p_status,
      admin_notes = coalesce(nullif(trim(p_admin_notes), ''), admin_notes),
      reviewed_at = now(),
      updated_at = now()
  where id = p_deposit_id
    and status in ('pending', 'reviewing')
  returning 1 into v_updated;

  if v_updated is null then
    raise exception 'Pilot deposit is not pending or does not exist' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_review_purchase_request(uuid, text, text) from public;
revoke all on function public.admin_review_pilot_deposit(uuid, text, text) from public;
grant execute on function public.admin_review_purchase_request(uuid, text, text) to authenticated;
grant execute on function public.admin_review_pilot_deposit(uuid, text, text) to authenticated;

-- Explicit deny: no anonymous reads on user tables (RLS already blocks; grants reinforce).
drop policy if exists "Deny anon profiles" on public.profiles;
create policy "Deny anon profiles"
on public.profiles for all
to anon
using (false)
with check (false);

drop policy if exists "Deny anon wallets" on public.wallets;
create policy "Deny anon wallets"
on public.wallets for all
to anon
using (false)
with check (false);

drop policy if exists "Deny anon purchase requests" on public.purchase_requests;
create policy "Deny anon purchase requests"
on public.purchase_requests for all
to anon
using (false)
with check (false);

drop policy if exists "Deny anon pilot deposits" on public.pilot_deposits;
create policy "Deny anon pilot deposits"
on public.pilot_deposits for all
to anon
using (false)
with check (false);

drop policy if exists "Deny anon redeem requests" on public.redeem_requests;
create policy "Deny anon redeem requests"
on public.redeem_requests for all
to anon
using (false)
with check (false);

drop policy if exists "Deny anon ledger" on public.transaction_ledger;
create policy "Deny anon ledger"
on public.transaction_ledger for all
to anon
using (false)
with check (false);

-- Admin read policies audit (idempotent re-create).
drop policy if exists "Admins can read all redeem requests" on public.redeem_requests;
create policy "Admins can read all redeem requests"
on public.redeem_requests for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update purchase request review status" on public.purchase_requests;
create policy "Admins can update purchase request review status"
on public.purchase_requests for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can update pilot deposit review status" on public.pilot_deposits;
create policy "Admins can update pilot deposit review status"
on public.pilot_deposits for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Users can update own editable profile fields" on public.profiles;
create policy "Users can update own editable profile fields"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = (select role from public.profiles where id = auth.uid())
  and verification_status = (select verification_status from public.profiles where id = auth.uid())
  and kyc_status = (select kyc_status from public.profiles where id = auth.uid())
  and account_status = (select account_status from public.profiles where id = auth.uid())
);

drop policy if exists "Users can delete own pending purchase requests" on public.purchase_requests;
create policy "Users can delete own pending purchase requests"
on public.purchase_requests for delete
to authenticated
using (auth.uid() = user_id and status = 'pending');

grant update (full_name, phone, country) on public.profiles to authenticated;
grant delete on public.purchase_requests to authenticated;
grant execute on function public.enforce_request_rate_limit() to authenticated;

-- Audit: RLS must stay enabled.
alter table public.profiles force row level security;
alter table public.wallets force row level security;
alter table public.purchase_requests force row level security;
alter table public.pilot_deposits force row level security;
alter table public.redeem_requests force row level security;
alter table public.transaction_ledger force row level security;
alter table public.platform_state force row level security;

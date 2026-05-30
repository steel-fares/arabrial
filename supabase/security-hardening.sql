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
    new.phone := old.phone;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_sensitive on public.profiles;
create trigger profiles_protect_sensitive
before update on public.profiles
for each row execute function public.protect_profile_sensitive_columns();

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

-- Audit: RLS must stay enabled.
alter table public.profiles force row level security;
alter table public.wallets force row level security;
alter table public.purchase_requests force row level security;
alter table public.pilot_deposits force row level security;
alter table public.redeem_requests force row level security;
alter table public.transaction_ledger force row level security;
alter table public.platform_state force row level security;

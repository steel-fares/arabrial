-- Fix unsafe profiles RLS/privacy exposure.
-- This migration removes the broad recipient lookup policy and replaces it
-- with own-profile/admin-only profile access plus a safe recipient lookup RPC.

alter table public.profiles enable row level security;

drop policy if exists "Public can resolve transfer recipients" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Users can update own editable profile fields" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_basic_fields" on public.profiles;

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.is_admin()
);

create policy "profiles_update_own_basic_fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

revoke select on public.profiles from anon;
revoke select on public.profiles from authenticated;
revoke update on public.profiles from anon;
revoke update on public.profiles from authenticated;
revoke update (full_name, phone, country, username) on public.profiles from authenticated;

-- Table-level SELECT remains necessary for Supabase clients, but RLS now
-- limits rows to the owner or admins only. Column-level UPDATE limits direct
-- self-service edits to non-sensitive basic profile fields.
grant select on public.profiles to authenticated;
grant update (full_name, country, username) on public.profiles to authenticated;

create or replace function public.resolve_transfer_recipient(identifier text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  wallet_id text,
  wallet_address text,
  verification_status text,
  is_verified boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_identifier text := nullif(trim(identifier), '');
begin
  if v_identifier is null then
    raise exception 'Recipient identifier is required' using errcode = '22023';
  end if;

  return query
  select
    p.id as user_id,
    p.username::text as username,
    nullif(p.full_name, '') as display_name,
    w.wallet_id,
    w.wallet_address,
    p.verification_status,
    (p.verification_status = 'verified' and p.kyc_status = 'approved') as is_verified
  from public.profiles p
  join public.wallets w on w.user_id = p.id
  where (
      lower(p.username::text) = lower(v_identifier)
      or w.wallet_id = v_identifier
      or w.wallet_address = v_identifier
    )
    and coalesce(p.account_status, 'active') = 'active'
    and coalesce(p.login_disabled, false) = false
    and p.frozen_at is null
  order by p.created_at asc
  limit 1;
end;
$$;

revoke all on function public.resolve_transfer_recipient(text) from public;
grant execute on function public.resolve_transfer_recipient(text) to authenticated;
grant execute on function public.create_wallet_transfer(text, numeric, text) to authenticated;

comment on function public.resolve_transfer_recipient(text) is
'Safe transfer-recipient lookup. Returns only public transfer confirmation fields and hides frozen/disabled accounts.';

-- Rollback for 20260603_fix_profiles_rls_privacy.sql.
-- Restores the previous migration's broad recipient lookup behavior.
-- WARNING: this rollback reintroduces the privacy issue and is intended only
-- for emergency compatibility testing.

drop function if exists public.resolve_transfer_recipient(text);

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_basic_fields" on public.profiles;

create policy "Public can resolve transfer recipients"
on public.profiles
for select
to authenticated
using (true);

grant select on public.profiles to authenticated;
grant update (full_name, country, username) on public.profiles to authenticated;

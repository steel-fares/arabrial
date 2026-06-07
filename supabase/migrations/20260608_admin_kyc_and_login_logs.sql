-- Migration: 20260608_admin_kyc_and_login_logs.sql

-- 1. Create function to manually approve/reject KYC
create or replace function public.admin_set_user_kyc(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_request boolean;
begin
  if not public.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected') then raise exception 'Invalid status' using errcode = '22023'; end if;

  select exists(select 1 from public.kyc_requests where user_id = p_user_id) into v_has_request;

  if v_has_request then
    -- This will trigger after_kyc_update() which updates public.profiles, verification_logs, and notifications
    update public.kyc_requests
    set status = p_status,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where user_id = p_user_id;
  else
    -- Update profiles directly
    update public.profiles
    set kyc_status = p_status,
        verification_status = case when p_status = 'approved' then 'verified' else 'rejected' end
    where id = p_user_id;

    insert into public.verification_logs(user_id, admin_id, verification_type, status, details)
    values (p_user_id, auth.uid(), 'kyc', p_status, jsonb_build_object('manual', true));

    perform public.create_notification(
      p_user_id,
      'kyc_' || p_status,
      case when p_status = 'approved' then 'KYC Approved' else 'KYC Rejected' end,
      case when p_status = 'approved' then 'Your account is now verified.' else 'Your KYC status was set to rejected/unverified.' end,
      jsonb_build_object('manual', true)
    );
  end if;

  insert into public.admin_activity_logs(admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'manual_kyc_update', 'user', p_user_id::text, jsonb_build_object('status', p_status));
end;
$$;

-- 2. Create function to log login attempts
create or replace function public.log_login_attempt(
  p_identifier text,
  p_status text,
  p_device_id text,
  p_reason text default null,
  p_client_ip text default null,
  p_client_ua text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip inet;
  v_ip_str text;
  v_user_agent text;
  v_user_id uuid;
begin
  -- Try to get request headers from PostgREST context
  begin
    v_headers := coalesce(current_setting('request.headers', true)::json, '{}'::json);
  exception when others then
    v_headers := '{}'::json;
  end;

  -- Resolve IP from headers, falling back to p_client_ip
  v_ip_str := coalesce(
    nullif(v_headers->>'x-forwarded-for', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(p_client_ip, '')
  );
  if v_ip_str is not null then
    v_ip_str := trim(split_part(v_ip_str, ',', 1));
    begin
      v_ip := v_ip_str::inet;
    exception when others then
      v_ip := null;
    end;
  end if;

  -- Resolve User Agent
  v_user_agent := coalesce(
    nullif(v_headers->>'user-agent', ''),
    nullif(p_client_ua, '')
  );

  -- Resolve user_id from profiles (matching email or phone)
  select id into v_user_id
  from public.profiles
  where lower(email) = lower(trim(p_identifier))
     or replace(phone, ' ', '') = replace(trim(p_identifier), ' ', '')
  limit 1;

  -- If still null, try finding user in auth.users by email or phone
  if v_user_id is null then
    select id into v_user_id
    from auth.users
    where lower(email) = lower(trim(p_identifier))
       or replace(phone, ' ', '') = replace(trim(p_identifier), ' ', '')
    limit 1;
  end if;

  -- Insert into login_logs
  insert into public.login_logs (
    user_id, identifier, ip_address, user_agent, device_id, status, reason
  )
  values (
    v_user_id, p_identifier, v_ip, v_user_agent, p_device_id, p_status, p_reason
  );

  -- If success, update profiles and user_devices
  if p_status = 'success' and v_user_id is not null then
    update public.profiles
    set last_login_at = now(),
        last_login_ip = v_ip
    where id = v_user_id;

    insert into public.user_devices (
      user_id, device_id, user_agent, first_ip, last_ip, first_seen_at, last_seen_at
    )
    values (
      v_user_id, p_device_id, v_user_agent, v_ip, v_ip, now(), now()
    )
    on conflict (user_id, device_id) do update set
      last_ip = excluded.last_ip,
      last_seen_at = excluded.last_seen_at,
      user_agent = coalesce(excluded.user_agent, public.user_devices.user_agent);
  end if;
end;
$$;

-- Grant permissions to make these RPCs callable from frontend (via anon and authenticated roles)
grant execute on function public.log_login_attempt(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_set_user_kyc(uuid, text) to authenticated;

-- 3. Fix check constraints on public.profiles to allow all necessary verification and KYC statuses
-- Disable the protection trigger temporarily so updates from SQL editor are not blocked
alter table public.profiles disable trigger profiles_protect_sensitive;

-- Correct any swapped/mismatched values first
update public.profiles
set kyc_status = 'approved'
where kyc_status = 'verified';

update public.profiles
set verification_status = 'verified'
where verification_status = 'approved';

update public.profiles
set verification_status = 'pending'
where verification_status = 'submitted';

-- Clean up any other invalid values to defaults
update public.profiles
set kyc_status = 'pending'
where kyc_status not in ('pending', 'submitted', 'approved', 'rejected') 
   or kyc_status is null;

update public.profiles
set verification_status = 'unverified'
where verification_status not in ('unverified', 'pending', 'verified', 'rejected') 
   or verification_status is null;

-- Dynamically drop all old check constraints related to kyc or verification to avoid conflicts
do $$
declare
  r record;
begin
  for r in (
    select conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.contype = 'c'
      and (conname like '%kyc%' or conname like '%verification%')
  ) loop
    execute 'alter table public.profiles drop constraint if exists ' || quote_ident(r.conname);
  end loop;
end $$;

-- Add correct check constraints
alter table public.profiles add constraint profiles_verification_status_check check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));
alter table public.profiles add constraint profiles_kyc_status_check check (kyc_status in ('pending', 'submitted', 'approved', 'rejected'));

-- Re-enable the protection trigger
alter table public.profiles enable trigger profiles_protect_sensitive;

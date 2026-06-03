-- ARBR platform feature expansion
-- Apply after the existing schema.sql. This migration is additive and preserves
-- current balances, wallet user_id values, and transaction history.

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('kyc-documents', 'kyc-documents', false)
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.profiles add column if not exists username citext;
alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.profiles add column if not exists email_verified_at timestamptz;
alter table public.profiles add column if not exists google_subject text;
alter table public.profiles add column if not exists login_disabled boolean not null default false;
alter table public.profiles add column if not exists frozen_at timestamptz;
alter table public.profiles add column if not exists freeze_reason text;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists last_login_ip inet;

alter table public.wallets add column if not exists wallet_id text;
alter table public.wallets add column if not exists wallet_address text;
alter table public.wallets add column if not exists circulating_arbr numeric(18, 2) not null default 0;

update public.profiles
set username = lower(regexp_replace(coalesce(nullif(split_part(email, '@', 1), ''), 'user-' || left(id::text, 8)), '[^a-zA-Z0-9_]+', '_', 'g')) || '_' || left(id::text, 4)
where username is null;

update public.wallets
set wallet_id = 'ARBR-' || upper(replace(left(user_id::text, 13), '-', '')),
    wallet_address = coalesce(wallet_address, 'ARBR-' || upper(replace(user_id::text, '-', '')))
where wallet_id is null or wallet_address is null;

create unique index if not exists profiles_username_unique on public.profiles (lower(username::text));
create unique index if not exists profiles_phone_unique on public.profiles (phone) where nullif(phone, '') is not null;
create unique index if not exists profiles_google_subject_unique on public.profiles (google_subject) where google_subject is not null;
create unique index if not exists wallets_wallet_id_unique on public.wallets (wallet_id);
create unique index if not exists wallets_wallet_address_unique on public.wallets (wallet_address);
create index if not exists profiles_kyc_status_idx on public.profiles (kyc_status);
create index if not exists profiles_account_flags_idx on public.profiles (login_disabled, frozen_at);

alter table public.profiles alter column username set not null;
alter table public.wallets alter column wallet_id set not null;
alter table public.wallets alter column wallet_address set not null;

do $$
begin
  alter table public.transaction_ledger drop constraint if exists transaction_ledger_transaction_type_check;
  alter table public.transaction_ledger add constraint transaction_ledger_transaction_type_check
    check (transaction_type in (
      'purchase_credit', 'redeem_debit', 'balance_adjustment',
      'p2p_credit', 'p2p_debit', 'transfer_credit', 'transfer_debit',
      'coinbase_deposit'
    ));
exception when undefined_table then
  null;
end $$;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  counterparty_user_id uuid references auth.users(id) on delete set null,
  transaction_type text not null check (transaction_type in (
    'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'p2p_buy',
    'p2p_sell', 'purchase', 'redeem', 'admin_adjustment', 'coinbase_deposit'
  )),
  direction text not null check (direction in ('incoming', 'outgoing', 'internal')),
  arbr_amount numeric(18, 2) not null default 0,
  omr_amount numeric(14, 3) not null default 0,
  crypto_amount numeric(28, 12),
  crypto_currency text,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.kyc_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  country text not null,
  date_of_birth date not null,
  document_type text not null check (document_type in ('national_id', 'passport')),
  document_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'resubmission_requested')),
  rejection_reason text,
  admin_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  identifier text,
  ip_address inet,
  user_agent text,
  device_id text,
  status text not null check (status in ('success', 'failed', 'blocked', 'logout')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.freeze_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('freeze', 'unfreeze', 'disable_login', 'enable_login')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.verification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  verification_type text not null check (verification_type in ('phone', 'email', 'kyc', 'passkey')),
  status text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  device_name text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  identifier text not null,
  channel text not null check (channel in ('sms', 'email')),
  purpose text not null check (purpose in ('register', 'login', 'password_reset', 'phone_verify')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  ip_address inet,
  device_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  user_id uuid references auth.users(id) on delete cascade,
  ip_address inet,
  device_id text,
  identifier text,
  allowed boolean not null default true,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  identifier text not null,
  channel text not null check (channel in ('email', 'sms')),
  status text not null default 'requested' check (status in ('requested', 'code_sent', 'verified', 'completed', 'expired', 'failed')),
  ip_address inet,
  device_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  device_id text not null,
  user_agent text,
  first_ip inet,
  last_ip inet,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, device_id)
);

create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  amount_arbr numeric(18, 2) not null check (amount_arbr > 0),
  sender_wallet_id text not null,
  recipient_wallet_id text not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.p2p_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  amount_arbr numeric(18, 2) not null check (amount_arbr > 0),
  price_omr numeric(18, 9) not null check (price_omr > 0),
  remaining_arbr numeric(18, 2) not null,
  status text not null default 'active' check (status in ('active', 'frozen', 'cancelled', 'completed', 'disputed')),
  freeze_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.p2p_trades (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.p2p_orders(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  amount_arbr numeric(18, 2) not null check (amount_arbr > 0),
  price_omr numeric(18, 9) not null check (price_omr > 0),
  total_omr numeric(18, 3) not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'cancelled', 'disputed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.coinbase_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  charge_id text unique,
  hosted_url text,
  currency text not null check (currency in ('USDT', 'BTC', 'ETH')),
  crypto_amount numeric(28, 12),
  amount_omr numeric(14, 3),
  arbr_amount numeric(18, 2),
  status text not null default 'created' check (status in ('created', 'pending', 'confirmed', 'failed', 'refunded')),
  raw_event jsonb not null default '{}'::jsonb,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.p2p_orders drop constraint if exists p2p_orders_remaining_check;
alter table public.p2p_orders add constraint p2p_orders_remaining_check check (remaining_arbr >= 0 and remaining_arbr <= amount_arbr);

create index if not exists transactions_user_created_idx on public.transactions (user_id, created_at desc);
create index if not exists wallet_transfers_sender_idx on public.wallet_transfers (sender_id, created_at desc);
create index if not exists wallet_transfers_recipient_idx on public.wallet_transfers (recipient_id, created_at desc);
create index if not exists p2p_orders_status_side_idx on public.p2p_orders (status, side, created_at desc);
create index if not exists p2p_trades_order_idx on public.p2p_trades (order_id, created_at desc);
create index if not exists kyc_requests_user_status_idx on public.kyc_requests (user_id, status, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists login_logs_user_created_idx on public.login_logs (user_id, created_at desc);
create index if not exists rate_limit_logs_action_created_idx on public.rate_limit_logs (action, created_at desc);
create index if not exists otp_codes_identifier_idx on public.otp_codes (identifier, purpose, created_at desc);
create index if not exists coinbase_transactions_status_idx on public.coinbase_transactions (status, created_at desc);

create or replace function public.is_account_frozen(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and (p.login_disabled or p.frozen_at is not null)
  );
$$;

create or replace function public.is_verified_account(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and p.verification_status = 'verified' and p.kyc_status = 'approved'
  );
$$;

create or replace function public.enforce_action_rate_limit(
  p_action text,
  p_user_id uuid default auth.uid(),
  p_ip inet default null,
  p_device_id text default null,
  p_identifier text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval;
  v_limit int;
  v_count int;
begin
  case p_action
    when 'auth' then v_window := interval '1 minute'; v_limit := 5;
    when 'transfer' then v_window := interval '1 minute'; v_limit := 10;
    when 'otp' then v_window := interval '10 minutes'; v_limit := 3;
    when 'password_reset' then v_window := interval '1 hour'; v_limit := 3;
    when 'admin' then v_window := interval '1 minute'; v_limit := 20;
    else v_window := interval '1 minute'; v_limit := 30;
  end case;

  select count(*) into v_count
  from public.rate_limit_logs r
  where r.action = p_action
    and r.allowed
    and r.created_at > now() - v_window
    and (
      (p_user_id is not null and r.user_id = p_user_id)
      or (p_ip is not null and r.ip_address = p_ip)
      or (p_device_id is not null and r.device_id = p_device_id)
      or (p_identifier is not null and lower(r.identifier) = lower(p_identifier))
    );

  if v_count >= v_limit then
    insert into public.rate_limit_logs(action, user_id, ip_address, device_id, identifier, allowed, reason)
    values (p_action, p_user_id, p_ip, p_device_id, p_identifier, false, 'rate_limit_exceeded');
    return false;
  end if;

  insert into public.rate_limit_logs(action, user_id, ip_address, device_id, identifier, allowed)
  values (p_action, p_user_id, p_ip, p_device_id, p_identifier, true);
  return true;
end;
$$;

create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications(user_id, type, title, body, metadata)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_username text;
begin
  v_base_username := lower(regexp_replace(coalesce(nullif(new.raw_user_meta_data->>'username', ''), nullif(split_part(new.email, '@', 1), ''), 'user-' || left(new.id::text, 8)), '[^a-zA-Z0-9_]+', '_', 'g'));

  insert into public.profiles (
    id, email, full_name, phone, username, verification_status, kyc_status,
    role, google_subject, email_verified_at, phone_verified_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
    v_base_username || '_' || left(new.id::text, 4),
    'unverified',
    'pending',
    'user',
    new.raw_user_meta_data->>'provider_id',
    case when new.email_confirmed_at is not null then new.email_confirmed_at else null end,
    case when new.phone_confirmed_at is not null then new.phone_confirmed_at else null end
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    phone = coalesce(nullif(public.profiles.phone, ''), excluded.phone),
    email_verified_at = coalesce(public.profiles.email_verified_at, excluded.email_verified_at),
    phone_verified_at = coalesce(public.profiles.phone_verified_at, excluded.phone_verified_at);

  insert into public.wallets (user_id, wallet_id, wallet_address)
  values (
    new.id,
    'ARBR-' || upper(replace(left(new.id::text, 13), '-', '')),
    'ARBR-' || upper(replace(new.id::text, '-', ''))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.before_kyc_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> new.user_id then
    raise exception 'Cannot submit KYC for another user' using errcode = '42501';
  end if;
  if public.is_account_frozen(new.user_id) then
    raise exception 'Account is frozen' using errcode = '42501';
  end if;
  update public.profiles
  set kyc_status = 'submitted',
      verification_status = 'pending'
  where id = new.user_id;
  insert into public.verification_logs(user_id, verification_type, status, details)
  values (new.user_id, 'kyc', 'submitted', jsonb_build_object('kyc_request_id', new.id));
  return new;
end;
$$;

create or replace function public.after_kyc_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    update public.profiles
    set kyc_status = case
        when new.status = 'approved' then 'approved'
        when new.status = 'rejected' then 'rejected'
        else 'submitted'
      end,
      verification_status = case
        when new.status = 'approved' then 'verified'
        when new.status = 'rejected' then 'rejected'
        else 'pending'
      end
    where id = new.user_id;

    insert into public.verification_logs(user_id, admin_id, verification_type, status, details)
    values (new.user_id, auth.uid(), 'kyc', new.status, jsonb_build_object('kyc_request_id', new.id, 'reason', new.rejection_reason));

    perform public.create_notification(
      new.user_id,
      'kyc_' || new.status,
      case when new.status = 'approved' then 'KYC Approved' when new.status = 'rejected' then 'KYC Rejected' else 'KYC Update' end,
      case when new.status = 'approved' then 'Your account is now verified.' when new.status = 'rejected' then coalesce(new.rejection_reason, 'Your KYC request was rejected.') else 'Please resubmit your KYC documents.' end,
      jsonb_build_object('kyc_request_id', new.id)
    );
  end if;
  return new;
end;
$$;

create or replace function public.create_wallet_transfer(
  p_recipient text,
  p_amount_arbr numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_recipient uuid;
  v_sender_wallet text;
  v_recipient_wallet text;
  v_sender_balance numeric(18, 2);
  v_transfer_id uuid;
begin
  if v_sender is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_amount_arbr <= 0 then raise exception 'Invalid transfer amount' using errcode = '22023'; end if;
  if not public.enforce_action_rate_limit('transfer', v_sender, null, null, null) then
    raise exception 'Transfer rate limit exceeded' using errcode = 'P0001';
  end if;
  if public.is_account_frozen(v_sender) then raise exception 'Account is frozen' using errcode = '42501'; end if;
  if not public.is_verified_account(v_sender) then raise exception 'KYC verification required' using errcode = '42501'; end if;

  select p.id into v_recipient
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
  where lower(p.username::text) = lower(trim(p_recipient))
     or w.wallet_id = trim(p_recipient)
     or w.wallet_address = trim(p_recipient)
  limit 1;

  if v_recipient is null then raise exception 'Recipient not found' using errcode = 'P0002'; end if;
  if v_recipient = v_sender then raise exception 'Cannot transfer to yourself' using errcode = '22023'; end if;
  if public.is_account_frozen(v_recipient) then raise exception 'Recipient account is frozen' using errcode = '42501'; end if;

  select arbr_balance - locked_arbr, wallet_id into v_sender_balance, v_sender_wallet
  from public.wallets where user_id = v_sender for update;
  if v_sender_balance < p_amount_arbr then raise exception 'Insufficient ARBR balance' using errcode = 'P0001'; end if;
  select wallet_id into v_recipient_wallet from public.wallets where user_id = v_recipient for update;

  update public.wallets set arbr_balance = arbr_balance - p_amount_arbr, updated_at = now() where user_id = v_sender;
  update public.wallets set arbr_balance = arbr_balance + p_amount_arbr, updated_at = now() where user_id = v_recipient;

  insert into public.wallet_transfers(sender_id, recipient_id, amount_arbr, sender_wallet_id, recipient_wallet_id, status, note)
  values (v_sender, v_recipient, p_amount_arbr, v_sender_wallet, v_recipient_wallet, 'completed', p_note)
  returning id into v_transfer_id;

  insert into public.transactions(user_id, counterparty_user_id, transaction_type, direction, arbr_amount, status, reference, metadata)
  values
    (v_sender, v_recipient, 'transfer_out', 'outgoing', -p_amount_arbr, 'completed', v_transfer_id::text, jsonb_build_object('note', p_note)),
    (v_recipient, v_sender, 'transfer_in', 'incoming', p_amount_arbr, 'completed', v_transfer_id::text, jsonb_build_object('note', p_note));

  perform public.create_notification(v_sender, 'transfer_sent', 'Transfer Sent', 'Your ARBR transfer was completed.', jsonb_build_object('transfer_id', v_transfer_id, 'amount_arbr', p_amount_arbr));
  perform public.create_notification(v_recipient, 'transfer_received', 'Transfer Received', 'You received an ARBR transfer.', jsonb_build_object('transfer_id', v_transfer_id, 'amount_arbr', p_amount_arbr));

  return v_transfer_id;
end;
$$;

create or replace function public.create_p2p_order(
  p_side text,
  p_amount_arbr numeric,
  p_price_omr numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order_id uuid;
  v_available numeric(18, 2);
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if public.is_account_frozen(v_user) then raise exception 'Account is frozen' using errcode = '42501'; end if;
  if not public.is_verified_account(v_user) then raise exception 'KYC verification required' using errcode = '42501'; end if;
  if p_side not in ('buy', 'sell') or p_amount_arbr <= 0 or p_price_omr <= 0 then
    raise exception 'Invalid P2P order' using errcode = '22023';
  end if;
  if p_side = 'sell' then
    select arbr_balance - locked_arbr into v_available from public.wallets where user_id = v_user for update;
    if v_available < p_amount_arbr then raise exception 'Insufficient ARBR balance' using errcode = 'P0001'; end if;
    update public.wallets set locked_arbr = locked_arbr + p_amount_arbr, updated_at = now() where user_id = v_user;
  end if;
  insert into public.p2p_orders(user_id, side, amount_arbr, price_omr, remaining_arbr)
  values (v_user, p_side, p_amount_arbr, p_price_omr, p_amount_arbr)
  returning id into v_order_id;
  perform public.create_notification(v_user, 'p2p_order_created', 'P2P Order Created', 'Your P2P order is active.', jsonb_build_object('order_id', v_order_id));
  return v_order_id;
end;
$$;

create or replace function public.admin_set_user_freeze(
  p_user_id uuid,
  p_freeze boolean,
  p_disable_login boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  if not public.enforce_action_rate_limit('admin', auth.uid(), null, null, null) then raise exception 'Admin rate limit exceeded' using errcode = 'P0001'; end if;
  update public.profiles
  set frozen_at = case when p_freeze then now() else null end,
      freeze_reason = case when p_freeze then p_reason else null end,
      login_disabled = p_disable_login,
      account_status = case when p_freeze then 'under_review' when p_disable_login then 'disabled' else 'active' end
  where id = p_user_id;
  insert into public.freeze_logs(user_id, admin_id, action, reason)
  values (
    p_user_id,
    auth.uid(),
    case when p_freeze then 'freeze' when p_disable_login then 'disable_login' else 'unfreeze' end,
    p_reason
  );
  insert into public.admin_activity_logs(admin_id, action, target_type, target_id, details)
  values (auth.uid(), case when p_freeze then 'freeze_user' else 'unfreeze_user' end, 'user', p_user_id::text, jsonb_build_object('reason', p_reason, 'disable_login', p_disable_login));
end;
$$;

create or replace function public.admin_review_kyc_request(
  p_kyc_request_id uuid,
  p_status text,
  p_admin_notes text default null,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  if p_status not in ('approved', 'rejected', 'resubmission_requested') then raise exception 'Invalid KYC status' using errcode = '22023'; end if;
  update public.kyc_requests
  set status = p_status,
      admin_notes = p_admin_notes,
      rejection_reason = p_rejection_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_kyc_request_id;
  insert into public.admin_activity_logs(admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'review_kyc', 'kyc_request', p_kyc_request_id::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_update_p2p_order(
  p_order_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.p2p_orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  if p_status not in ('active', 'frozen', 'cancelled', 'completed', 'disputed') then raise exception 'Invalid order status' using errcode = '22023'; end if;
  select * into v_order from public.p2p_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order.side = 'sell' and v_order.status in ('active', 'frozen', 'disputed') and p_status = 'cancelled' then
    update public.wallets
    set locked_arbr = greatest(0, locked_arbr - v_order.remaining_arbr), updated_at = now()
    where user_id = v_order.user_id;
  end if;
  update public.p2p_orders set status = p_status, freeze_reason = p_reason, updated_at = now() where id = p_order_id;
  insert into public.admin_activity_logs(admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'update_p2p_order', 'p2p_order', p_order_id::text, jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

create or replace function public.platform_statistics()
returns table (
  users_count bigint,
  verified_users bigint,
  pending_kyc bigint,
  frozen_accounts bigint,
  transfers_count bigint,
  p2p_volume numeric,
  total_supply numeric,
  circulating_supply numeric,
  available_supply numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where verification_status = 'verified'),
    (select count(*) from public.kyc_requests where status = 'pending'),
    (select count(*) from public.profiles where frozen_at is not null or login_disabled),
    (select count(*) from public.wallet_transfers where status = 'completed'),
    coalesce((select sum(amount_arbr) from public.p2p_trades where status = 'completed'), 0),
    100000000::numeric,
    coalesce((select sum(arbr_balance) from public.wallets), 0),
    100000000::numeric - coalesce((select sum(arbr_balance) from public.wallets), 0);
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at before update on public.wallets for each row execute function public.set_updated_at();

drop trigger if exists kyc_requests_set_updated_at on public.kyc_requests;
create trigger kyc_requests_set_updated_at before update on public.kyc_requests for each row execute function public.set_updated_at();

drop trigger if exists kyc_requests_before_insert on public.kyc_requests;
create trigger kyc_requests_before_insert before insert on public.kyc_requests for each row execute function public.before_kyc_insert();

drop trigger if exists kyc_requests_after_update on public.kyc_requests;
create trigger kyc_requests_after_update after update of status on public.kyc_requests for each row execute function public.after_kyc_update();

drop trigger if exists p2p_orders_set_updated_at on public.p2p_orders;
create trigger p2p_orders_set_updated_at before update on public.p2p_orders for each row execute function public.set_updated_at();

drop trigger if exists coinbase_transactions_set_updated_at on public.coinbase_transactions;
create trigger coinbase_transactions_set_updated_at before update on public.coinbase_transactions for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.transactions enable row level security;
alter table public.wallet_transfers enable row level security;
alter table public.p2p_orders enable row level security;
alter table public.p2p_trades enable row level security;
alter table public.kyc_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.login_logs enable row level security;
alter table public.freeze_logs enable row level security;
alter table public.verification_logs enable row level security;
alter table public.passkeys enable row level security;
alter table public.otp_codes enable row level security;
alter table public.rate_limit_logs enable row level security;
alter table public.admin_activity_logs enable row level security;
alter table public.password_reset_requests enable row level security;
alter table public.user_devices enable row level security;
alter table public.coinbase_transactions enable row level security;

drop policy if exists "Public can resolve transfer recipients" on public.profiles;
create policy "Public can resolve transfer recipients" on public.profiles
for select to authenticated
using (true);

drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions" on public.transactions for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can read own wallet transfers" on public.wallet_transfers;
create policy "Users can read own wallet transfers" on public.wallet_transfers for select to authenticated
using (auth.uid() in (sender_id, recipient_id) or public.is_admin());

drop policy if exists "Users can read active p2p orders" on public.p2p_orders;
create policy "Users can read active p2p orders" on public.p2p_orders for select to authenticated
using (status in ('active', 'completed') or auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can create own p2p orders" on public.p2p_orders;
create policy "Users can create own p2p orders" on public.p2p_orders for insert to authenticated
with check (auth.uid() = user_id and status = 'active' and public.is_verified_account() and not public.is_account_frozen());

drop policy if exists "Admins can manage p2p orders" on public.p2p_orders;
create policy "Admins can manage p2p orders" on public.p2p_orders for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can read visible p2p trades" on public.p2p_trades;
create policy "Users can read visible p2p trades" on public.p2p_trades for select to authenticated
using (auth.uid() in (buyer_id, seller_id) or public.is_admin());

drop policy if exists "Users can read own kyc requests" on public.kyc_requests;
create policy "Users can read own kyc requests" on public.kyc_requests for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can submit own kyc requests" on public.kyc_requests;
create policy "Users can submit own kyc requests" on public.kyc_requests for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Admins can update kyc requests" on public.kyc_requests;
create policy "Admins can update kyc requests" on public.kyc_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications" on public.notifications for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read" on public.notifications for update to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can read own passkeys" on public.passkeys;
create policy "Users can read own passkeys" on public.passkeys for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can remove own passkeys" on public.passkeys;
create policy "Users can remove own passkeys" on public.passkeys for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own login logs" on public.login_logs;
create policy "Users can read own login logs" on public.login_logs for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins can read freeze logs" on public.freeze_logs;
create policy "Admins can read freeze logs" on public.freeze_logs for select to authenticated
using (public.is_admin());

drop policy if exists "Admins can read verification logs" on public.verification_logs;
create policy "Admins can read verification logs" on public.verification_logs for select to authenticated
using (public.is_admin() or auth.uid() = user_id);

drop policy if exists "Admins can read rate limit logs" on public.rate_limit_logs;
create policy "Admins can read rate limit logs" on public.rate_limit_logs for select to authenticated
using (public.is_admin());

drop policy if exists "Admins can read activity logs" on public.admin_activity_logs;
create policy "Admins can read activity logs" on public.admin_activity_logs for select to authenticated
using (public.is_admin());

drop policy if exists "Users can read own password reset logs" on public.password_reset_requests;
create policy "Users can read own password reset logs" on public.password_reset_requests for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can read own devices" on public.user_devices;
create policy "Users can read own devices" on public.user_devices for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can read own coinbase transactions" on public.coinbase_transactions;
create policy "Users can read own coinbase transactions" on public.coinbase_transactions for select to authenticated
using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Admins can manage coinbase transactions" on public.coinbase_transactions;
create policy "Admins can manage coinbase transactions" on public.coinbase_transactions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    drop policy if exists "Users can upload own kyc files" on storage.objects;
    create policy "Users can upload own kyc files" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "Users can read own kyc files" on storage.objects;
    create policy "Users can read own kyc files" on storage.objects
      for select to authenticated
      using (bucket_id = 'kyc-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
  end if;
end $$;

grant select on public.profiles to authenticated;
grant update (full_name, country, username) on public.profiles to authenticated;
grant select on public.wallets to authenticated;

grant select on public.transactions, public.wallet_transfers, public.p2p_orders, public.p2p_trades,
  public.kyc_requests, public.notifications, public.login_logs, public.freeze_logs,
  public.verification_logs, public.passkeys, public.password_reset_requests, public.user_devices,
  public.coinbase_transactions to authenticated;

grant insert on public.kyc_requests to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.passkeys to authenticated;
grant insert on public.p2p_orders to authenticated;

revoke all on function public.create_wallet_transfer(text, numeric, text) from public;
revoke all on function public.create_p2p_order(text, numeric, numeric) from public;
revoke all on function public.admin_set_user_freeze(uuid, boolean, boolean, text) from public;
revoke all on function public.admin_review_kyc_request(uuid, text, text, text) from public;
revoke all on function public.admin_update_p2p_order(uuid, text, text) from public;
grant execute on function public.create_wallet_transfer(text, numeric, text) to authenticated;
grant execute on function public.create_p2p_order(text, numeric, numeric) to authenticated;
grant execute on function public.admin_set_user_freeze(uuid, boolean, boolean, text) to authenticated;
grant execute on function public.admin_review_kyc_request(uuid, text, text, text) to authenticated;
grant execute on function public.admin_update_p2p_order(uuid, text, text) to authenticated;
grant execute on function public.platform_statistics() to anon, authenticated;
grant execute on function public.enforce_action_rate_limit(text, uuid, inet, text, text) to authenticated;

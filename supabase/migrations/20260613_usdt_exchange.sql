-- Migration: 20260613_usdt_exchange.sql
-- Description: Database tables, triggers, functions, and RLS policies for USDT Buy/Sell Exchange

-- 1. Create settings table for USDT Exchange
create table if not exists public.usdt_settings (
  id smallint primary key default 1 check (id = 1),
  buy_spread_percent numeric(5, 2) not null default 3.00,
  sell_spread_percent numeric(5, 2) not null default 3.00,
  price_lock_seconds integer not null default 60,
  min_transaction numeric(18, 2) not null default 10.00,
  max_transaction numeric(18, 2) not null default 10000.00,
  updated_at timestamptz not null default now()
);

-- Pre-populate default settings
insert into public.usdt_settings (id, buy_spread_percent, sell_spread_percent, price_lock_seconds, min_transaction, max_transaction)
values (1, 3.00, 3.00, 60, 10.00, 10000.00)
on conflict (id) do nothing;

-- 2. Add usdt_balance to wallets table
alter table public.wallets add column if not exists usdt_balance numeric(18, 2) not null default 0.00;

-- 3. Create USDT price history table
create table if not exists public.usdt_price_history (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  market_price_usd numeric(18, 6) not null default 1.000000,
  market_price_omr numeric(18, 6) not null,
  buy_price_omr numeric(18, 6) not null,
  sell_price_omr numeric(18, 6) not null,
  source text not null default 'coingecko'
);

-- 4. Create USDT orders table
create table if not exists public.usdt_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_type text not null check (order_type in ('buy', 'sell')),
  usdt_amount numeric(18, 2) not null check (usdt_amount > 0),
  market_price numeric(18, 6) not null,
  spread_percent numeric(5, 2) not null,
  final_price numeric(18, 6) not null, -- OMR per USDT
  final_payout_omr numeric(18, 3) not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Create USDT payment requests table (Proof of payment for BUY)
create table if not exists public.usdt_payment_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.usdt_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_omr numeric(18, 3) not null,
  usdt_amount numeric(18, 2) not null,
  payment_method text not null,
  payment_proof_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- 6. Create USDT withdrawal requests table (Selling USDT)
create table if not exists public.usdt_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.usdt_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  usdt_amount numeric(18, 2) not null,
  amount_omr numeric(18, 3) not null,
  wallet_address text not null,
  network text not null default 'TRC20',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

-- 7. Create USDT transaction logs table
create table if not exists public.usdt_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('buy_usdt', 'sell_usdt', 'deposit_usdt', 'withdraw_usdt', 'admin_adjustment')),
  amount numeric(18, 2) not null, -- Positive for credits, negative for debits
  currency text not null default 'USDT',
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  reference text,
  created_at timestamptz not null default now()
);

-- 8. Create USDT admin activity logs table
create table if not exists public.usdt_admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 9. Enable Row Level Security (RLS) on all new tables
alter table public.usdt_settings enable row level security;
alter table public.usdt_price_history enable row level security;
alter table public.usdt_orders enable row level security;
alter table public.usdt_payment_requests enable row level security;
alter table public.usdt_withdrawal_requests enable row level security;
alter table public.usdt_transactions enable row level security;
alter table public.usdt_admin_logs enable row level security;

-- 10. RLS Policies

-- usdt_settings: Anyone can read, only admin can write
create policy "Public can read usdt settings" on public.usdt_settings for select using (true);
create policy "Admins can update usdt settings" on public.usdt_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- usdt_price_history: Anyone can read
create policy "Public can read price history" on public.usdt_price_history for select using (true);

-- usdt_orders: Users read/write own; Admins read all
create policy "Users can view own usdt orders" on public.usdt_orders for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy "Users can insert own usdt orders" on public.usdt_orders for insert to authenticated
  with check (auth.uid() = user_id);

-- usdt_payment_requests: Users view own; Admins view all; Users insert own
create policy "Users can view own payment requests" on public.usdt_payment_requests for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy "Users can create own payment requests" on public.usdt_payment_requests for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Admins can update payment requests" on public.usdt_payment_requests for update to authenticated
  using (public.is_admin());

-- usdt_withdrawal_requests: Users view own; Admins view all; Users insert own
create policy "Users can view own withdrawal requests" on public.usdt_withdrawal_requests for select to authenticated
  using (auth.uid() = user_id or public.is_admin());
create policy "Users can create own withdrawal requests" on public.usdt_withdrawal_requests for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Admins can update withdrawal requests" on public.usdt_withdrawal_requests for update to authenticated
  using (public.is_admin());

-- usdt_transactions: Users view own; Admins view all
create policy "Users can view own usdt transactions" on public.usdt_transactions for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- usdt_admin_logs: Admin only
create policy "Admins can view admin logs" on public.usdt_admin_logs for select to authenticated
  using (public.is_admin());

-- 11. Database functions & procedures

-- Handle Sell order USDT balance lock
create or replace function public.lock_usdt_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(18, 2);
begin
  -- If it's a sell order, check if user has enough USDT and deduct it immediately (acts as a lock/escrow)
  if new.order_type = 'sell' and new.status = 'pending' then
    select usdt_balance into v_balance from public.wallets where user_id = new.user_id for update;
    if v_balance is null or v_balance < new.usdt_amount then
      raise exception 'Insufficient USDT balance to sell' using errcode = 'P0001';
    end if;
    
    update public.wallets
    set usdt_balance = usdt_balance - new.usdt_amount,
        updated_at = now()
    where user_id = new.user_id;
    
    -- Log transaction as pending withdrawal
    insert into public.usdt_transactions (user_id, type, amount, status, reference)
    values (new.user_id, 'withdraw_usdt', -new.usdt_amount, 'pending', new.id::text);
  end if;
  return new;
end;
$$;

create trigger usdt_orders_before_insert
before insert on public.usdt_orders
for each row execute function public.lock_usdt_balance();

-- Function for Admin approval of BUY payment requests
create or replace function public.admin_approve_usdt_buy(
  p_request_id uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.usdt_payment_requests%rowtype;
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Admin permissions required' using errcode = '42501';
  end if;

  select * into v_req from public.usdt_payment_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Payment request not found' using errcode = 'P0002';
  end if;
  if v_req.status != 'pending' then
    raise exception 'Request is already processed' using errcode = 'P0003';
  end if;

  -- 1. Update request status
  update public.usdt_payment_requests
  set status = 'approved',
      admin_notes = p_admin_notes,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id;

  -- 2. Update order status
  update public.usdt_orders
  set status = 'completed',
      updated_at = now()
  where id = v_req.order_id;

  -- 3. Credit USDT to user's wallet
  update public.wallets
  set usdt_balance = usdt_balance + v_req.usdt_amount,
      updated_at = now()
  where user_id = v_req.user_id;

  -- 4. Log completed transaction
  insert into public.usdt_transactions (user_id, type, amount, status, reference)
  values (v_req.user_id, 'buy_usdt', v_req.usdt_amount, 'completed', v_req.order_id::text);

  -- 5. Audit Log
  insert into public.usdt_admin_logs (admin_id, action, details)
  values (v_admin_id, 'approve_buy', jsonb_build_object('request_id', p_request_id, 'order_id', v_req.order_id, 'user_id', v_req.user_id, 'usdt_amount', v_req.usdt_amount));
end;
$$;

-- Function for Admin rejection of BUY payment requests
create or replace function public.admin_reject_usdt_buy(
  p_request_id uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.usdt_payment_requests%rowtype;
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Admin permissions required' using errcode = '42501';
  end if;

  select * into v_req from public.usdt_payment_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Payment request not found' using errcode = 'P0002';
  end if;
  if v_req.status != 'pending' then
    raise exception 'Request is already processed' using errcode = 'P0003';
  end if;

  -- 1. Update request status
  update public.usdt_payment_requests
  set status = 'rejected',
      admin_notes = p_admin_notes,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id;

  -- 2. Update order status to expired/cancelled
  update public.usdt_orders
  set status = 'cancelled',
      updated_at = now()
  where id = v_req.order_id;

  -- 3. Audit Log
  insert into public.usdt_admin_logs (admin_id, action, details)
  values (v_admin_id, 'reject_buy', jsonb_build_object('request_id', p_request_id, 'order_id', v_req.order_id, 'user_id', v_req.user_id));
end;
$$;

-- Function for Admin approval of SELL withdrawal requests
create or replace function public.admin_approve_usdt_sell(
  p_request_id uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.usdt_withdrawal_requests%rowtype;
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Admin permissions required' using errcode = '42501';
  end if;

  select * into v_req from public.usdt_withdrawal_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;
  if v_req.status != 'pending' then
    raise exception 'Request is already processed' using errcode = 'P0003';
  end if;

  -- 1. Update request status
  update public.usdt_withdrawal_requests
  set status = 'approved',
      admin_notes = p_admin_notes,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id;

  -- 2. Update order status to completed
  update public.usdt_orders
  set status = 'completed',
      updated_at = now()
  where id = v_req.order_id;

  -- 3. Update the transaction log status (which was created as pending when the order was locked)
  update public.usdt_transactions
  set status = 'completed'
  where reference = v_req.order_id::text;

  -- 4. Audit Log
  insert into public.usdt_admin_logs (admin_id, action, details)
  values (v_admin_id, 'approve_sell', jsonb_build_object('request_id', p_request_id, 'order_id', v_req.order_id, 'user_id', v_req.user_id, 'usdt_amount', v_req.usdt_amount));
end;
$$;

-- Function for Admin rejection of SELL withdrawal requests
create or replace function public.admin_reject_usdt_sell(
  p_request_id uuid,
  p_admin_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.usdt_withdrawal_requests%rowtype;
  v_admin_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Admin permissions required' using errcode = '42501';
  end if;

  select * into v_req from public.usdt_withdrawal_requests where id = p_request_id for update;
  if v_req.id is null then
    raise exception 'Withdrawal request not found' using errcode = 'P0002';
  end if;
  if v_req.status != 'pending' then
    raise exception 'Request is already processed' using errcode = 'P0003';
  end if;

  -- 1. Update request status
  update public.usdt_withdrawal_requests
  set status = 'rejected',
      admin_notes = p_admin_notes,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id;

  -- 2. Update order status to cancelled
  update public.usdt_orders
  set status = 'cancelled',
      updated_at = now()
  where id = v_req.order_id;

  -- 3. Refund user's locked USDT balance
  update public.wallets
  set usdt_balance = usdt_balance + v_req.usdt_amount,
      updated_at = now()
  where user_id = v_req.user_id;

  -- 4. Mark transaction log as failed/cancelled
  update public.usdt_transactions
  set status = 'cancelled'
  where reference = v_req.order_id::text;

  -- 5. Audit Log
  insert into public.usdt_admin_logs (admin_id, action, details)
  values (v_admin_id, 'reject_sell', jsonb_build_object('request_id', p_request_id, 'order_id', v_req.order_id, 'user_id', v_req.user_id, 'refund_amount', v_req.usdt_amount));
end;
$$;

-- Grant execution permissions
grant execute on function public.admin_approve_usdt_buy(uuid, text) to authenticated;
grant execute on function public.admin_reject_usdt_buy(uuid, text) to authenticated;
grant execute on function public.admin_approve_usdt_sell(uuid, text) to authenticated;
grant execute on function public.admin_reject_usdt_sell(uuid, text) to authenticated;

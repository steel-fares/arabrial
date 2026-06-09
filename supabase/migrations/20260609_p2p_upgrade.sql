-- Migration: 20260609_p2p_upgrade.sql

-- 1. Upgrade p2p_orders with extra Binance-style fields
alter table public.p2p_orders add column if not exists min_limit numeric(18, 2) default 0;
alter table public.p2p_orders add column if not exists payment_methods text[] default '{}'::text[];
alter table public.p2p_orders add column if not exists fiat_currency text default 'OMR';
alter table public.p2p_orders add column if not exists crypto_asset text default 'ARBR';
alter table public.p2p_orders add column if not exists merchant_only boolean default false;

-- 2. Upgrade p2p_trades with updated_at column
alter table public.p2p_trades add column if not exists updated_at timestamptz not null default now();

-- Drop and recreate the status constraint for p2p_trades
alter table public.p2p_trades drop constraint if exists p2p_trades_status_check;
alter table public.p2p_trades add constraint p2p_trades_status_check check (status in ('pending_payment', 'paid', 'completed', 'cancelled', 'disputed'));

-- Drop and recreate the status constraint for p2p_orders
alter table public.p2p_orders drop constraint if exists p2p_orders_status_check;
alter table public.p2p_orders add constraint p2p_orders_status_check check (status in ('active', 'frozen', 'cancelled', 'completed', 'disputed'));

-- 3. Create chat messages table for P2P trades
create table if not exists public.p2p_trade_messages (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.p2p_trades(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- Enable RLS for chat messages
alter table public.p2p_trade_messages enable row level security;

drop policy if exists "Users can read chat messages for their own trades" on public.p2p_trade_messages;
create policy "Users can read chat messages for their own trades" on public.p2p_trade_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.p2p_trades t
      where t.id = trade_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "Users can send chat messages for their own trades" on public.p2p_trade_messages;
create policy "Users can send chat messages for their own trades" on public.p2p_trade_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid() and
    exists (
      select 1 from public.p2p_trades t
      where t.id = trade_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid() or public.is_admin())
    )
  );

-- 4. Create disputes table for P2P trades
create table if not exists public.p2p_disputes (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.p2p_trades(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'cancelled')),
  ruling text check (ruling in ('release', 'refund', null)),
  admin_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Enable RLS for disputes
alter table public.p2p_disputes enable row level security;

drop policy if exists "Users can view disputes for their trades" on public.p2p_disputes;
create policy "Users can view disputes for their trades" on public.p2p_disputes
  for select to authenticated
  using (
    creator_id = auth.uid() or
    exists (
      select 1 from public.p2p_trades t
      where t.id = trade_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "Users can open disputes for their trades" on public.p2p_disputes;
create policy "Users can open disputes for their trades" on public.p2p_disputes
  for insert to authenticated
  with check (
    creator_id = auth.uid() and
    exists (
      select 1 from public.p2p_trades t
      where t.id = trade_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

drop policy if exists "Admins can update disputes" on public.p2p_disputes;
create policy "Admins can update disputes" on public.p2p_disputes
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5. Recreate create_p2p_order with the new parameters
create or replace function public.create_p2p_order(
  p_side text,
  p_amount_arbr numeric,
  p_price_omr numeric,
  p_min_limit numeric,
  p_payment_methods text[],
  p_fiat_currency text default 'OMR',
  p_crypto_asset text default 'ARBR',
  p_merchant_only boolean default false
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
  insert into public.p2p_orders(user_id, side, amount_arbr, price_omr, remaining_arbr, min_limit, payment_methods, fiat_currency, crypto_asset, merchant_only)
  values (v_user, p_side, p_amount_arbr, p_price_omr, p_amount_arbr, p_min_limit, p_payment_methods, p_fiat_currency, p_crypto_asset, p_merchant_only)
  returning id into v_order_id;
  perform public.create_notification(v_user, 'p2p_order_created', 'P2P Order Created', 'Your P2P order is active.', jsonb_build_object('order_id', v_order_id));
  return v_order_id;
end;
$$;

-- 6. Escrow and trade initiation function
create or replace function public.initiate_p2p_trade(
  p_order_id uuid,
  p_amount_arbr numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order public.p2p_orders%rowtype;
  v_trade_id uuid;
  v_available numeric(18, 2);
  v_total_omr numeric(18, 3);
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if public.is_account_frozen(v_user) then raise exception 'Account is frozen' using errcode = '42501'; end if;
  if not public.is_verified_account(v_user) then raise exception 'KYC verification required' using errcode = '42501'; end if;

  -- Lock order for update
  select * into v_order from public.p2p_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if v_order.status != 'active' then raise exception 'Order is no longer active' using errcode = 'P0003'; end if;
  if v_order.remaining_arbr < p_amount_arbr then raise exception 'Insufficient order capacity' using errcode = 'P0004'; end if;
  if v_order.user_id = v_user then raise exception 'Cannot trade with your own advertisement' using errcode = 'P0005'; end if;

  v_total_omr := round(p_amount_arbr * v_order.price_omr, 3);

  -- Escrow locking check based on side
  if v_order.side = 'sell' then
    -- Ad owner is selling (so they already locked it when creating the order).
    -- Taker is buying (auth.uid() is buyer, v_order.user_id is seller).
    insert into public.p2p_trades (order_id, buyer_id, seller_id, amount_arbr, price_omr, total_omr, status)
    values (p_order_id, v_user, v_order.user_id, p_amount_arbr, v_order.price_omr, v_total_omr, 'pending_payment')
    returning id into v_trade_id;

    -- Update remaining order amount
    update public.p2p_orders
    set remaining_arbr = remaining_arbr - p_amount_arbr,
        status = case when remaining_arbr - p_amount_arbr <= 0 then 'completed'::text else 'active'::text end,
        updated_at = now()
    where id = p_order_id;

  else
    -- Ad owner is buying.
    -- Taker is selling (auth.uid() is seller, v_order.user_id is buyer).
    -- Taker (seller) must lock their balance now!
    select arbr_balance - locked_arbr into v_available from public.wallets where user_id = v_user for update;
    if v_available < p_amount_arbr then raise exception 'Insufficient ARBR balance to sell' using errcode = 'P0001'; end if;
    
    update public.wallets
    set locked_arbr = locked_arbr + p_amount_arbr,
        updated_at = now()
    where user_id = v_user;

    insert into public.p2p_trades (order_id, buyer_id, seller_id, amount_arbr, price_omr, total_omr, status)
    values (p_order_id, v_order.user_id, v_user, p_amount_arbr, v_order.price_omr, v_total_omr, 'pending_payment')
    returning id into v_trade_id;

    -- Update remaining order amount
    update public.p2p_orders
    set remaining_arbr = remaining_arbr - p_amount_arbr,
        status = case when remaining_arbr - p_amount_arbr <= 0 then 'completed'::text else 'active'::text end,
        updated_at = now()
    where id = p_order_id;
  end if;

  -- Create system chat messages
  insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
  values (v_trade_id, v_user, 'Trade initiated. Escrow locked. Please proceed with payment.', true);

  -- Send notifications to both parties
  perform public.create_notification(v_order.user_id, 'p2p_trade_initiated', 'New P2P Trade', 'A trade has been initiated against your advertisement.', jsonb_build_object('trade_id', v_trade_id));
  perform public.create_notification(v_user, 'p2p_trade_initiated', 'P2P Trade Started', 'You have started a P2P trade.', jsonb_build_object('trade_id', v_trade_id));

  return v_trade_id;
end;
$$;

-- 7. Mark trade as paid
create or replace function public.mark_p2p_trade_paid(
  p_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.p2p_trades%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  
  select * into v_trade from public.p2p_trades where id = p_trade_id for update;
  if v_trade.id is null then raise exception 'Trade not found' using errcode = 'P0002'; end if;
  if v_trade.buyer_id != v_user then raise exception 'Only the buyer can mark the trade as paid' using errcode = 'P0005'; end if;
  if v_trade.status != 'pending_payment' then raise exception 'Trade is not in pending payment state' using errcode = 'P0003'; end if;

  update public.p2p_trades
  set status = 'paid',
      updated_at = now()
  where id = p_trade_id;

  insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
  values (p_trade_id, v_user, 'Buyer has marked the trade as PAID. Seller, please verify and release the assets.', true);

  perform public.create_notification(v_trade.seller_id, 'p2p_trade_paid', 'Trade Marked Paid', 'Buyer marked the trade as paid. Please check your account.', jsonb_build_object('trade_id', p_trade_id));
end;
$$;

-- 8. Release crypto to complete trade
create or replace function public.release_p2p_crypto(
  p_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.p2p_trades%rowtype;
  v_tx_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_trade from public.p2p_trades where id = p_trade_id for update;
  if v_trade.id is null then raise exception 'Trade not found' using errcode = 'P0002'; end if;
  if v_trade.seller_id != v_user then raise exception 'Only the seller can release crypto' using errcode = 'P0005'; end if;
  if v_trade.status != 'paid' then raise exception 'Trade must be paid before releasing' using errcode = 'P0003'; end if;

  -- 1. Deduct seller's locked balance
  update public.wallets
  set locked_arbr = locked_arbr - v_trade.amount_arbr,
      arbr_balance = arbr_balance - v_trade.amount_arbr,
      updated_at = now()
  where user_id = v_trade.seller_id;

  -- 2. Add buyer's balance
  insert into public.wallets (user_id, arbr_balance)
  values (v_trade.buyer_id, v_trade.amount_arbr)
  on conflict (user_id) do update set
    arbr_balance = public.wallets.arbr_balance + v_trade.amount_arbr,
    updated_at = now();

  -- 3. Log transactions
  insert into public.transactions (user_id, type, amount_arbr, details)
  values (
    v_trade.buyer_id, 
    'p2p_buy', 
    v_trade.amount_arbr, 
    jsonb_build_object('trade_id', p_trade_id, 'price_omr', v_trade.price_omr, 'total_omr', v_trade.total_omr, 'partner_id', v_trade.seller_id)
  );

  insert into public.transactions (user_id, type, amount_arbr, details)
  values (
    v_trade.seller_id, 
    'p2p_sell', 
    -v_trade.amount_arbr, 
    jsonb_build_object('trade_id', p_trade_id, 'price_omr', v_trade.price_omr, 'total_omr', v_trade.total_omr, 'partner_id', v_trade.buyer_id)
  );

  -- 4. Update trade status
  update public.p2p_trades
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_trade_id;

  insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
  values (p_trade_id, v_user, 'Seller released the crypto. Trade completed.', true);

  perform public.create_notification(v_trade.buyer_id, 'p2p_trade_completed', 'Crypto Released', 'Your P2P purchase is complete. Check your wallet balance.', jsonb_build_object('trade_id', p_trade_id));
  perform public.create_notification(v_trade.seller_id, 'p2p_trade_completed', 'Trade Completed', 'P2P sell order completed successfully.', jsonb_build_object('trade_id', p_trade_id));
end;
$$;

-- 9. Cancel trade
create or replace function public.cancel_p2p_trade(
  p_trade_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.p2p_trades%rowtype;
  v_order public.p2p_orders%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_trade from public.p2p_trades where id = p_trade_id for update;
  if v_trade.id is null then raise exception 'Trade not found' using errcode = 'P0002'; end if;
  if v_trade.buyer_id != v_user and v_trade.seller_id != v_user and not public.is_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if v_trade.status not in ('pending_payment', 'paid') then 
    raise exception 'Cannot cancel trade in its current state' using errcode = 'P0003'; 
  end if;
  
  if v_trade.status = 'paid' and not public.is_admin() then
    raise exception 'Paid trade can only be cancelled by an admin via dispute' using errcode = 'P0005';
  end if;

  -- Return assets to seller escrow or general balance depending on Ad side
  select * into v_order from public.p2p_orders where id = v_trade.order_id for update;
  
  if v_order.id is not null then
    update public.p2p_orders
    set remaining_arbr = remaining_arbr + v_trade.amount_arbr,
        status = 'active',
        updated_at = now()
    where id = v_trade.order_id;
  else
    update public.wallets
    set locked_arbr = locked_arbr - v_trade.amount_arbr,
        updated_at = now()
    where user_id = v_trade.seller_id;
  end if;

  if v_order.side = 'buy' then
    update public.wallets
    set locked_arbr = locked_arbr - v_trade.amount_arbr,
        updated_at = now()
    where user_id = v_trade.seller_id;
  end if;

  update public.p2p_trades
  set status = 'cancelled',
      completed_at = now(),
      updated_at = now()
  where id = p_trade_id;

  insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
  values (p_trade_id, v_user, 'Trade cancelled. Escrow returned.', true);

  perform public.create_notification(v_trade.buyer_id, 'p2p_trade_cancelled', 'Trade Cancelled', 'The P2P trade was cancelled.', jsonb_build_object('trade_id', p_trade_id));
  perform public.create_notification(v_trade.seller_id, 'p2p_trade_cancelled', 'Trade Cancelled', 'The P2P trade was cancelled.', jsonb_build_object('trade_id', p_trade_id));
end;
$$;

-- 10. Dispute trade
create or replace function public.dispute_p2p_trade(
  p_trade_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.p2p_trades%rowtype;
  v_dispute_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_trade from public.p2p_trades where id = p_trade_id for update;
  if v_trade.id is null then raise exception 'Trade not found' using errcode = 'P0002'; end if;
  if v_trade.buyer_id != v_user and v_trade.seller_id != v_user then 
    raise exception 'Access denied' using errcode = '42501'; 
  end if;
  if v_trade.status not in ('pending_payment', 'paid', 'disputed') then
    raise exception 'Cannot dispute trade in its current state' using errcode = 'P0003';
  end if;

  update public.p2p_trades
  set status = 'disputed',
      updated_at = now()
  where id = p_trade_id;

  insert into public.p2p_disputes (trade_id, creator_id, reason, status)
  values (p_trade_id, v_user, p_reason, 'pending')
  returning id into v_dispute_id;

  insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
  values (p_trade_id, v_user, 'Dispute opened. Status updated to IN_ARBITRATION. Admin will review the chat and proof of payment.', true);

  perform public.create_notification(v_trade.buyer_id, 'p2p_dispute_opened', 'Trade Disputed', 'A dispute has been opened for your trade.', jsonb_build_object('trade_id', p_trade_id, 'dispute_id', v_dispute_id));
  perform public.create_notification(v_trade.seller_id, 'p2p_dispute_opened', 'Trade Disputed', 'A dispute has been opened for your trade.', jsonb_build_object('trade_id', p_trade_id, 'dispute_id', v_dispute_id));

  return v_dispute_id;
end;
$$;

-- 11. Resolve dispute by Admin
create or replace function public.resolve_p2p_dispute(
  p_dispute_id uuid,
  p_ruling text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_dispute public.p2p_disputes%rowtype;
  v_trade public.p2p_trades%rowtype;
  v_order public.p2p_orders%rowtype;
begin
  if v_admin is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  if p_ruling not in ('release', 'refund') then raise exception 'Invalid ruling' using errcode = '22023'; end if;

  select * into v_dispute from public.p2p_disputes where id = p_dispute_id for update;
  if v_dispute.id is null then raise exception 'Dispute not found' using errcode = 'P0002'; end if;
  if v_dispute.status != 'pending' then raise exception 'Dispute already resolved' using errcode = 'P0003'; end if;

  select * into v_trade from public.p2p_trades where id = v_dispute.trade_id for update;
  select * into v_order from public.p2p_orders where id = v_trade.order_id for update;

  if p_ruling = 'release' then
    update public.wallets
    set locked_arbr = locked_arbr - v_trade.amount_arbr,
        arbr_balance = arbr_balance - v_trade.amount_arbr,
        updated_at = now()
    where user_id = v_trade.seller_id;

    insert into public.wallets (user_id, arbr_balance)
    values (v_trade.buyer_id, v_trade.amount_arbr)
    on conflict (user_id) do update set
      arbr_balance = public.wallets.arbr_balance + v_trade.amount_arbr,
      updated_at = now();

    insert into public.transactions (user_id, type, amount_arbr, details)
    values (v_trade.buyer_id, 'p2p_buy', v_trade.amount_arbr, jsonb_build_object('trade_id', v_trade.id, 'price_omr', v_trade.price_omr, 'arbitration', true));
    insert into public.transactions (user_id, type, amount_arbr, details)
    values (v_trade.seller_id, 'p2p_sell', -v_trade.amount_arbr, jsonb_build_object('trade_id', v_trade.id, 'price_omr', v_trade.price_omr, 'arbitration', true));

    update public.p2p_trades
    set status = 'completed',
        completed_at = now(),
        updated_at = now()
    where id = v_trade.id;

    insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
    values (v_trade.id, v_admin, 'Admin ruling: Escrow released to Buyer. Trade marked as COMPLETED.', true);

  else
    update public.wallets
    set locked_arbr = locked_arbr - v_trade.amount_arbr,
        updated_at = now()
    where user_id = v_trade.seller_id;

    if v_order.id is not null then
      update public.p2p_orders
      set remaining_arbr = remaining_arbr + v_trade.amount_arbr,
          status = 'active',
          updated_at = now()
      where id = v_trade.order_id;
    end if;

    update public.p2p_trades
    set status = 'cancelled',
        completed_at = now(),
        updated_at = now()
    where id = v_trade.id;

    insert into public.p2p_trade_messages (trade_id, sender_id, message, is_system)
    values (v_trade.id, v_admin, 'Admin ruling: Escrow refunded to Seller. Trade marked as CANCELLED.', true);
  end if;

  update public.p2p_disputes
  set status = 'resolved',
      ruling = p_ruling,
      admin_id = v_admin,
      resolved_at = now()
  where id = p_dispute_id;

  perform public.create_notification(v_trade.buyer_id, 'p2p_dispute_resolved', 'Dispute Resolved', 'The trade dispute has been resolved by an administrator.', jsonb_build_object('trade_id', v_trade.id));
  perform public.create_notification(v_trade.seller_id, 'p2p_dispute_resolved', 'Dispute Resolved', 'The trade dispute has been resolved by an administrator.', jsonb_build_object('trade_id', v_trade.id));
end;
$$;

-- 12. Grants
grant execute on function public.create_p2p_order(text, numeric, numeric, numeric, text[], text, text, boolean) to authenticated;
grant execute on function public.initiate_p2p_trade(uuid, numeric) to authenticated;
grant execute on function public.mark_p2p_trade_paid(uuid) to authenticated;
grant execute on function public.release_p2p_crypto(uuid) to authenticated;
grant execute on function public.cancel_p2p_trade(uuid) to authenticated;
grant execute on function public.dispute_p2p_trade(uuid, text) to authenticated;
grant execute on function public.resolve_p2p_dispute(uuid, text) to authenticated;

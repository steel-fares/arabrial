-- Migration: 20260608_dynamic_pricing.sql
-- Goal: Implement live dynamic pricing and secure backend price recalculations.

-- 1. Create price calculation function
create or replace function public.calculate_token_price(p_sold_tokens numeric)
returns jsonb
language plpgsql
immutable
security definer
as $$
declare
  v_milestone numeric;
  v_progress numeric;
  v_base_price_usd numeric;
  v_next_price_usd numeric;
  v_current_price_usd numeric;
  v_current_price_omr numeric;
begin
  v_milestone := floor(coalesce(p_sold_tokens, 0) / 1000000);
  v_progress := (coalesce(p_sold_tokens, 0) % 1000000) / 1000000;
  
  -- basePrice(milestone) = 0.10 * (1.1 ^ milestone)
  v_base_price_usd := 0.10 * power(1.1, v_milestone);
  v_next_price_usd := 0.10 * power(1.1, v_milestone + 1);
  
  -- smooth linear interpolation within the milestone
  v_current_price_usd := v_base_price_usd + v_progress * (v_next_price_usd - v_base_price_usd);
  
  -- fixed conversion 1 USD = 0.385 OMR
  v_current_price_omr := v_current_price_usd * 0.385;
  
  return jsonb_build_object(
    'milestone', v_milestone,
    'progress', v_progress,
    'price_usd', round(v_current_price_usd, 6),
    'price_omr', round(v_current_price_omr, 6)
  );
end;
$$;

-- 2. Create before-insert trigger function on purchase requests (security check)
create or replace function public.before_purchase_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sold_tokens numeric;
  v_price_omr numeric;
begin
  -- Force pending status on insertion for non-admins
  if not public.is_admin() then
    new.status := 'pending';
  end if;
  
  -- Fetch current sold tokens and calculate current OMR price
  select coalesce(sold_tokens, 0) into v_sold_tokens from public.platform_state where id = 1;
  v_price_omr := (public.calculate_token_price(v_sold_tokens)->>'price_omr')::numeric;
  
  -- Calculate and set the correct estimated_arbr securely in the backend
  new.estimated_arbr := round(new.amount_omr / v_price_omr, 2);
  
  return new;
end;
$$;

drop trigger if exists purchase_requests_before_insert on public.purchase_requests;
create trigger purchase_requests_before_insert
before insert on public.purchase_requests
for each row execute function public.before_purchase_request_insert();

-- 3. Update platform_statistics function to return current prices
drop function if exists public.platform_statistics();

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
  available_supply numeric,
  current_price_usd numeric,
  current_price_omr numeric
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
    100000000::numeric - coalesce((select sum(arbr_balance) from public.wallets), 0),
    (select (calculate_token_price(sold_tokens)->>'price_usd')::numeric from public.platform_state where id = 1),
    (select (calculate_token_price(sold_tokens)->>'price_omr')::numeric from public.platform_state where id = 1);
$$;

grant execute on function public.platform_statistics() to anon, authenticated;

-- 4. Enable Supabase Realtime on platform_state table
begin;
  do $$
  begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table public.platform_state;
    end if;
  exception
    when others then null;
  end $$;
commit;

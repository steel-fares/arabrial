-- Rollback for 20260603_arbr_missing_features.sql.
-- WARNING: this removes the new feature tables and additive columns only.
-- It does not delete existing purchase_requests, wallets, profiles, or legacy ledger rows.

drop trigger if exists kyc_requests_before_insert on public.kyc_requests;
drop trigger if exists kyc_requests_after_update on public.kyc_requests;
drop trigger if exists kyc_requests_set_updated_at on public.kyc_requests;
drop trigger if exists p2p_orders_set_updated_at on public.p2p_orders;
drop trigger if exists coinbase_transactions_set_updated_at on public.coinbase_transactions;

drop function if exists public.admin_update_p2p_order(uuid, text, text);
drop function if exists public.admin_review_kyc_request(uuid, text, text, text);
drop function if exists public.admin_set_user_freeze(uuid, boolean, boolean, text);
drop function if exists public.create_p2p_order(text, numeric, numeric);
drop function if exists public.create_wallet_transfer(text, numeric, text);
drop function if exists public.platform_statistics();
drop function if exists public.after_kyc_update();
drop function if exists public.before_kyc_insert();
drop function if exists public.create_notification(uuid, text, text, text, jsonb);
drop function if exists public.enforce_action_rate_limit(text, uuid, inet, text, text);
drop function if exists public.is_verified_account(uuid);
drop function if exists public.is_account_frozen(uuid);

drop table if exists public.coinbase_transactions cascade;
drop table if exists public.p2p_trades cascade;
drop table if exists public.p2p_orders cascade;
drop table if exists public.wallet_transfers cascade;
drop table if exists public.user_devices cascade;
drop table if exists public.password_reset_requests cascade;
drop table if exists public.admin_activity_logs cascade;
drop table if exists public.rate_limit_logs cascade;
drop table if exists public.otp_codes cascade;
drop table if exists public.passkeys cascade;
drop table if exists public.verification_logs cascade;
drop table if exists public.freeze_logs cascade;
drop table if exists public.login_logs cascade;
drop table if exists public.notifications cascade;
drop table if exists public.kyc_requests cascade;
drop table if exists public.transactions cascade;

drop index if exists profiles_username_unique;
drop index if exists profiles_phone_unique;
drop index if exists profiles_google_subject_unique;
drop index if exists wallets_wallet_id_unique;
drop index if exists wallets_wallet_address_unique;
drop index if exists profiles_kyc_status_idx;
drop index if exists profiles_account_flags_idx;

alter table if exists public.wallets drop column if exists circulating_arbr;
alter table if exists public.wallets drop column if exists wallet_address;
alter table if exists public.wallets drop column if exists wallet_id;

alter table if exists public.profiles drop column if exists last_login_ip;
alter table if exists public.profiles drop column if exists last_login_at;
alter table if exists public.profiles drop column if exists freeze_reason;
alter table if exists public.profiles drop column if exists frozen_at;
alter table if exists public.profiles drop column if exists login_disabled;
alter table if exists public.profiles drop column if exists google_subject;
alter table if exists public.profiles drop column if exists email_verified_at;
alter table if exists public.profiles drop column if exists phone_verified_at;
alter table if exists public.profiles drop column if exists username;

do $$
begin
  alter table public.transaction_ledger drop constraint if exists transaction_ledger_transaction_type_check;
  alter table public.transaction_ledger add constraint transaction_ledger_transaction_type_check
    check (transaction_type in ('purchase_credit', 'redeem_debit', 'balance_adjustment'));
exception when undefined_table then
  null;
end $$;

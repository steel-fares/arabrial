# ARBR Missing Features Implementation Report

Date: 2026-06-03

## Summary

Implemented local frontend pages, Supabase migrations, rollback SQL, and Edge Function templates for the requested ARBR platform expansion. Existing balances, wallet `user_id` rows, purchase requests, redeem requests, pilot deposits, and transaction ledger history are preserved. New behavior is additive.

Security-sensitive integrations that require provider secrets are routed through Supabase Edge Functions instead of browser code.

## Files Modified

- `admin.html`
- `assets/css/arbr.css`
- `assets/js/arbr.js`
- `assets/js/layout.js`
- `deposit.html`
- `index.html`
- `login.html`

## Files Created

- `assets/js/arbr-features.js`
- `forgot-password.html`
- `kyc.html`
- `transfer.html`
- `p2p.html`
- `price.html`
- `notifications.html`
- `passkeys.html`
- `supabase/migrations/20260603_arbr_missing_features.sql`
- `supabase/migrations/20260603_arbr_missing_features_rollback.sql`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/create-coinbase-charge/index.ts`
- `supabase/functions/coinbase-webhook/index.ts`
- `supabase/functions/otp-send/index.ts`
- `supabase/functions/otp-verify/index.ts`
- `supabase/functions/password-reset-request/index.ts`
- `supabase/functions/password-reset-confirm/index.ts`
- `supabase/functions/webauthn-options/index.ts`
- `supabase/functions/webauthn-verify/index.ts`

## Database Changes

Migration: `supabase/migrations/20260603_arbr_missing_features.sql`

Rollback: `supabase/migrations/20260603_arbr_missing_features_rollback.sql`

### New Tables

- `transactions`
- `kyc_requests`
- `notifications`
- `login_logs`
- `freeze_logs`
- `verification_logs`
- `passkeys`
- `otp_codes`
- `rate_limit_logs`
- `admin_activity_logs`
- `password_reset_requests`
- `user_devices`
- `wallet_transfers`
- `p2p_orders`
- `p2p_trades`
- `coinbase_transactions`

### Updated Tables

- `profiles`
- `wallets`
- `transaction_ledger`

### New Columns

`profiles`:

- `username`
- `phone_verified_at`
- `email_verified_at`
- `google_subject`
- `login_disabled`
- `frozen_at`
- `freeze_reason`
- `last_login_at`
- `last_login_ip`

`wallets`:

- `wallet_id`
- `wallet_address`
- `circulating_arbr`

`transaction_ledger`:

- Expanded allowed `transaction_type` values for transfers, P2P, and Coinbase deposits.

### Indexes

- Unique username, phone, Google subject, wallet ID, wallet address.
- KYC status, account flags.
- Transaction history, transfer history, P2P order/trade history.
- Notifications, login logs, rate limit logs, OTP lookup, Coinbase status.

### RLS Policies

Enabled and added RLS for all new tables. Users can read their own data. Admin users can review KYC, manage P2P orders, view logs, and manage Coinbase transaction records. Public/anon can call `platform_statistics()`.

### Triggers

- Updated-at triggers for profiles, wallets, KYC, P2P orders, Coinbase transactions.
- New auth user trigger creates profile and wallet with username/wallet IDs.
- KYC submit/update triggers update profile verification status and create notifications/logs.

### Functions

- `is_account_frozen`
- `is_verified_account`
- `enforce_action_rate_limit`
- `create_notification`
- `handle_new_user`
- `before_kyc_insert`
- `after_kyc_update`
- `create_wallet_transfer`
- `create_p2p_order`
- `admin_set_user_freeze`
- `admin_review_kyc_request`
- `admin_update_p2p_order`
- `platform_statistics`

## New APIs / Edge Functions

- `create-coinbase-charge`: creates Coinbase Commerce payment links.
- `coinbase-webhook`: verifies Coinbase webhook signatures, detects confirmed payments, credits ARBR, logs transactions, and notifies users.
- `otp-send`: creates OTP hashes and provider handoff point.
- `otp-verify`: verifies OTP codes and updates phone verification.
- `password-reset-request`: logs reset requests and creates reset OTP hashes.
- `password-reset-confirm`: verifies reset OTP and updates password via Supabase Admin.
- `webauthn-options`: returns WebAuthn challenge options.
- `webauthn-verify`: placeholder for production WebAuthn verification with `@simplewebauthn/server`.

## New Pages

- `forgot-password.html`
- `kyc.html`
- `transfer.html`
- `p2p.html`
- `price.html`
- `notifications.html`
- `passkeys.html`

## Security Changes

- Added database-level KYC gates for transfers and P2P order creation.
- Added account freeze/login disable checks.
- Added rate limit logs and enforcement RPC for auth, transfer, OTP, password reset, and admin actions.
- Added RLS for new data.
- Added admin activity logs.
- Added KYC storage bucket policies.
- Added internal notification persistence.
- Added unique phone/username/wallet identifiers.
- Avoided exposing Coinbase or provider secrets in static JS.

## Database Setup Guide

### Step 1: Run this SQL

Run the full migration file in Supabase SQL Editor:

```sql
-- Open and run:
-- supabase/migrations/20260603_arbr_missing_features.sql
```

Rollback if needed:

```sql
-- Open and run:
-- supabase/migrations/20260603_arbr_missing_features_rollback.sql
```

### Step 2: Add these environment variables

Set these as Supabase Edge Function secrets:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_ORIGIN=https://arab-rial.com
OTP_PEPPER=long-random-secret
COINBASE_COMMERCE_API_KEY=your-coinbase-commerce-api-key
COINBASE_WEBHOOK_SECRET=your-coinbase-webhook-shared-secret
WEBAUTHN_RP_ID=arab-rial.com
```

### Step 3: Configure authentication

- Enable Email auth in Supabase.
- Enable Phone auth/SMS provider in Supabase for OTP login and phone verification.
- Enable Google provider in Supabase Auth.
- Add redirect URLs:
  - `https://arab-rial.com/login.html`
  - `https://arab-rial.com/dashboard.html`
  - Local dev URL if testing locally.
- Keep password login enabled as fallback.

### Step 4: Configure payment gateway

- Create Coinbase Commerce API key.
- Deploy `create-coinbase-charge`.
- Deploy `coinbase-webhook`.
- In Coinbase Commerce, add webhook URL:
  - `https://YOUR_PROJECT.functions.supabase.co/coinbase-webhook`
- Add `COINBASE_WEBHOOK_SECRET` to Edge Function secrets.
- Test with a small payment and verify `coinbase_transactions`, `transactions`, `wallets`, and `notifications`.

### Step 5: Test database connection

Run:

```sql
select * from public.platform_statistics();
select id, username, verification_status from public.profiles limit 5;
select wallet_id, wallet_address, arbr_balance from public.wallets limit 5;
```

## Deployment Steps

1. Run the migration SQL in Supabase.
2. Configure Auth providers and redirect URLs.
3. Configure SMS/email OTP provider.
4. Configure Coinbase Commerce keys and webhook.
5. Deploy Supabase Edge Functions.
6. Upload the updated static files to the current hosting target.
7. Test auth, KYC, transfer, P2P, admin, notifications, price stats, and Coinbase deposit flow.

## Testing Checklist

- Register with email, username, phone, and strong password.
- Confirm duplicate username/phone/email are blocked.
- Login with email/password.
- Login/register with Google after Supabase provider is configured.
- Request password reset by email and phone.
- Confirm phone reset with OTP after provider is configured.
- Submit KYC document and selfie.
- Admin approves/rejects/requests KYC resubmission.
- Verified badge updates after KYC approval.
- Unverified user cannot deposit, withdraw, transfer, or create P2P order.
- Verified user can transfer by username.
- Verified user can transfer by wallet ID.
- Transfer history shows incoming/outgoing records.
- Create P2P buy and sell orders.
- Admin freezes/cancels/resolves P2P orders.
- Admin freezes/unfreezes users and disables login.
- Frozen users cannot use protected services.
- Homepage counters match `platform_statistics()`.
- Notifications appear for KYC and transfer events.
- Coinbase charge creates hosted payment URL.
- Coinbase confirmed webhook credits wallet and logs transaction.

## Verification Results

- Static file inventory verified with `git status --short`.
- New JS delimiter sanity check passed:
  - parentheses balanced
  - brackets balanced
  - braces balanced
- Node.js was not installed in this workspace, so `node --check` could not be run.
- Deno was not installed in this workspace, so Edge Function type checks could not be run.
- Browser automation plugin was present, but its required Node REPL control tool was not exposed in this session, so in-browser smoke testing could not be completed here.

## Manual Configuration Still Required

- Supabase Auth Google provider credentials.
- Supabase phone/SMS provider.
- Real email/SMS delivery inside `otp-send` and reset functions.
- Coinbase Commerce API key and webhook secret.
- Full WebAuthn server verification in `webauthn-verify` using a trusted WebAuthn library before enabling production passkey login.

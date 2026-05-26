# ARBR Supabase setup

## 1. Create the Supabase project

1. Open `https://supabase.com/dashboard`.
2. Create a new project.
3. Go to **SQL Editor**.
4. Paste and run `supabase/schema.sql`.
5. Re-run the same file after future schema changes. It is written to be safe for existing tables.

## 2. Configure Auth

1. Go to **Authentication > Providers**.
2. Enable **Email**.
3. If you want instant testing, temporarily disable email confirmation.
4. For production, keep email confirmation enabled.
5. Go to **Authentication > URL Configuration** and set:
   - Site URL: `https://arab-rial.com/`
   - Redirect URLs:
     - `https://arab-rial.com/`
     - `https://www.arab-rial.com/`
     - `https://steel-fares.github.io/arabrial/`

## 3. Security rules included

The latest `supabase/schema.sql` adds:

- locked phone updates after registration
- `verification_status`: `unverified`, `pending`, `verified`, `rejected`
- verified-only policies for membership deposits and redeem requests
- large purchase request verification checks
- admin-only status/balance changes through RLS and column grants
- `transaction_ledger` records for approved balance changes

Use only the public `anon` or `publishable` key in GitHub Pages. Never put the `service_role` key in the website.

## 4. Test

1. Open the page locally.
2. Create a test account.
3. Sign in.
4. Submit a purchase request with amount of at least `10 OMR`.
5. Confirm the row appears in **Table Editor > purchase_requests**.
6. Set `profiles.verification_status = verified` for the test user from Supabase Dashboard.
7. Test membership deposit and sell/redeem requests.

Current purchase requests use:

- `amount_omr`
- `estimated_arbr`
- `payment_method`
- `note`
- `status = pending`

Run the latest `supabase/schema.sql` before testing the live form.

## 5. GitHub Pages custom domain

The repository should include:

- `index.html`: the homepage GitHub Pages serves at `/`.
- `CNAME`: contains `arab-rial.com`.

In GitHub repository settings, go to **Settings > Pages** and set:

- Custom domain: `arab-rial.com`
- Enforce HTTPS: enabled after GitHub finishes issuing the certificate.

At your DNS provider, add these records for the root domain:

```txt
A  @  185.199.108.153
A  @  185.199.109.153
A  @  185.199.110.153
A  @  185.199.111.153
```

For `www`, add:

```txt
CNAME  www  steel-fares.github.io
```

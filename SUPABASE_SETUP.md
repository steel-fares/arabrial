# ARBR Supabase setup

## 1. Create the Supabase project

1. Open `https://supabase.com/dashboard`.
2. Create a new project.
3. Go to **SQL Editor**.
4. Paste and run `supabase/schema.sql`.
5. Paste and run `supabase/security-hardening.sql` (anon lockdown + profile protection).
6. Re-run the same files after future schema changes. They are written to be safe for existing tables.

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

- locked phone updates after registration (only `full_name` and `country` are client-editable)
- `verification_status`: `unverified`, `pending`, `verified`, `rejected`
- `profiles.role`: `user` or `admin` (admin is set only in the Dashboard, never from the website)
- `public.is_admin()` and RLS policies so admins can read all pending requests and user profiles
- `platform_state.sold_tokens` for sell-preview pricing (updated when purchases are approved)
- verified-only policies for membership deposits and redeem requests
- large purchase request verification checks (≥ 5000 OMR)
- admin-only status/balance changes through RLS and column grants
- `transaction_ledger` records for approved balance changes

Use only the public `anon` or `publishable` key in `assets/js/config.public.js`. Never put the `service_role` key in the website. Copy `assets/js/config.example.js` to `config.js` for local overrides (gitignored).

### Promote an admin user

In **SQL Editor** (service role), run once for your operator account:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

Re-run `supabase/schema.sql` if the `role` column or admin policies are missing.

## 4. Test

1. Open the page locally or on GitHub Pages.
2. Create a test account and confirm email if required.
3. Sign in.
4. Submit a purchase request with amount of at least **10 OMR**.
5. Confirm the row appears in **Table Editor > purchase_requests**.
6. Set `profiles.verification_status = verified` for the test user from Supabase Dashboard.
7. Test membership deposit and sell/redeem requests.
8. As admin, open the admin dashboard section and confirm pending rows load.

Purchase requests use:

- `amount_omr`
- `estimated_arbr`
- `payment_method`
- `note`
- `status = pending`

## 5. GitHub Pages custom domain

The repository should include:

- `index.html`: the homepage GitHub Pages serves at `/`.
- `logo.svg`: site logo and favicon.
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

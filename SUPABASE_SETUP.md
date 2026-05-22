# ARBR Supabase setup

## 1. Create the Supabase project

1. Open `https://supabase.com/dashboard`.
2. Create a new project.
3. Go to **SQL Editor**.
4. Paste and run `supabase/schema.sql`.

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

## 3. Connect the website

In `arbr-website.html`, replace:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY';
```

with the values from **Project Settings > API**.

Use only the public `anon` or `publishable` key. Never put the `service_role` key in a GitHub Pages website.

## 4. Test

1. Open the page locally.
2. Create a test account.
3. Sign in.
4. Submit a purchase request with amount between `$10` and `$5,000`.
5. Confirm the row appears in **Table Editor > purchase_requests**.

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

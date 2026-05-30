# Arab Rial — Deployment Checklist

## Pre-deploy

- [ ] Run `node scripts/build.mjs` to refresh asset versions in HTML
- [ ] Optional: `npm install && npm run build:min`
- [ ] Verify `assets/js/config.public.js` has correct Supabase **anon** URL/key
- [ ] Run `supabase/schema.sql` in Supabase SQL Editor (if not already)
- [ ] Run `supabase/security-hardening.sql` in Supabase SQL Editor
- [ ] Set admin: `update public.profiles set role = 'admin' where email = '...';`

## GitHub Pages

- [ ] Push to `main` on `steel-fares/arabrial`
- [ ] Settings → Pages → Source: `main` / root
- [ ] Custom domain `arab-rial.com` + DNS CNAME
- [ ] Confirm `CNAME` file present
- [ ] Confirm `.nojekyll` present (bypass Jekyll)

## Security headers (recommended)

GitHub Pages alone does not apply `_headers`. Either:

- [ ] Use **Cloudflare** (or Netlify) in front of the site and map `_headers`, **or**
- [ ] Rely on meta CSP already in HTML (weaker than HTTP headers)

## Post-deploy smoke tests

- [ ] Home loads, RTL, language toggle
- [ ] Login / signup
- [ ] Buy → redirect to login when logged out
- [ ] Buy request when logged in
- [ ] Deposit / sell (verified user)
- [ ] Dashboard balances
- [ ] Orders list
- [ ] Admin dashboard (admin account)
- [ ] `/robots.txt`, `/sitemap.xml`, `/manifest.json`
- [ ] Custom 404 (`/missing-page`)
- [ ] Hard refresh (Ctrl+F5) after deploy

## PWA

- [ ] Install prompt / Add to Home Screen (mobile)
- [ ] Offline page when network disabled (cached shell)

## Monitoring

- [ ] Supabase Auth rate limits enabled
- [ ] Supabase logs for failed RLS errors

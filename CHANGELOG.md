# Changelog — Arab Rial Production Hardening

All dates: 2026-05-30. Branch: `chore/production-hardening`. Backup: `backup/pre-hardening-2026-05-30`.

## Phase 1 — Security Hardening

- Added `_headers` with CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Added meta CSP and security meta tags on all pages (via build script).
- Moved Supabase anon config to `assets/js/config.public.js`; template in `config.example.js`.
- Added `assets/js/security.js`: sanitization, email/phone validation, login rate limit, submit throttling.
- Integrated security helpers into auth, buy, deposit, sell, settings flows in `arbr.js`.
- Added `supabase/security-hardening.sql`: anon revoke, deny policies, profile privilege protection trigger.
- Updated `.gitignore` for `config.js` and `node_modules`.

## Phase 2 — Performance Optimization

- Deferred all scripts; async Google Fonts loading; preload logo.
- Asset cache-busting query `?v=20260530.1` via `scripts/build.mjs`.
- `_headers` long-cache for static CSS/JS.
- Added `package.json` + optional minify build (`arbr.min.css/js`).
- Page loader overlay (reduces perceived wait during init).

## Phase 3 — SEO

- Added `robots.txt` and `sitemap.xml`.
- Per-page canonical, Open Graph, Twitter cards, keywords.
- Schema.org `WebSite` JSON-LD on home page.
- `admin.html` set to `noindex`.

## Phase 4 — User Experience

- Added `404.html`, `500.html`, `offline.html`.
- Inline form validation (email/tel blur) with `aria-invalid`.
- Global loading indicator (`#page-loader`).
- Admin dashboard retry button on load failure.
- ARIA label on mobile nav toggle; `:focus-visible` styles.

## Phase 5 — PWA

- Added `manifest.json`, `sw.js`, `assets/js/pwa-register.js`.
- Precache core shell; network-first for Supabase/CDN.

## Phase 6 — Admin Improvements

- Prevent concurrent admin dashboard loads.
- Session audit log for blocked admin actions (`sessionStorage`).
- Retry UI when admin queries fail.

## Phase 7 — Documentation

- `SECURITY_REPORT.md`
- `PERFORMANCE_REPORT.md`
- `SEO_REPORT.md`
- `DEPLOYMENT_CHECKLIST.md`
- This `CHANGELOG.md`

## Breaking Changes

None intended. Existing Supabase tables, auth, KYC, wallets, requests, and admin read-only UI unchanged.

## Deploy Notes

Run `node scripts/build.mjs` before each release. Apply `security-hardening.sql` on Supabase once.

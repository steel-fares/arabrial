# Arab Rial — Security Report

**Date:** 2026-05-30
**Scope:** Static site (`arab-rial.com`) + Supabase backend

## Summary

Production hardening adds defense-in-depth on the client, HTTP security headers (where supported), stricter RLS/grants audit SQL, and removal of inline secrets from `arbr.js`.

## Findings & Fixes

| Issue | Risk | Fix | Files |
|-------|------|-----|-------|
| Supabase keys embedded in `arbr.js` | Key rotation difficulty; accidental commit of wrong key type | Moved to `config.public.js` (anon only); `config.example.js` + gitignored `config.js` for overrides | `assets/js/config.public.js`, `assets/js/arbr.js`, `.gitignore` |
| No CSP / security headers | XSS, clickjacking, MIME sniffing | `_headers` (Cloudflare/Netlify) + meta CSP on all pages | `_headers`, `*.html` |
| No client login throttling | Brute-force attempts | `ARBRSecurity.checkLoginRateLimit` (5 / 15 min) | `assets/js/security.js`, `arbr.js` |
| Duplicate form submits | Double orders / deposits | `guardDuplicateSubmit` on login, signup, buy, pilot, redeem | `security.js`, `arbr.js` |
| User text not sanitized before DB | XSS / HTML injection in stored fields | `sanitizeInput` + `escapeHtml` hardening | `arbr.js`, `security.js` |
| Anon could theoretically access user tables if grants misconfigured | Data leak | `security-hardening.sql`: revoke anon, explicit deny policies, profile column protection trigger | `supabase/security-hardening.sql` |
| Admin approve/reject from browser | Privilege abuse | Enabled through admin-only Supabase RPC functions; direct table updates remain blocked for clients | `arbr.js`, `supabase/schema.sql`, `supabase/security-hardening.sql` |

## RLS Audit (tables)

| Table | RLS | Anon read | Anon write | User read | User write | Admin read |
|-------|-----|-----------|------------|-----------|------------|------------|
| `profiles` | ✅ | ❌ | ❌ | Own | `full_name`, `country` only | All (select) |
| `wallets` | ✅ | ❌ | ❌ | Own | ❌ (triggers only) | Via service role |
| `purchase_requests` | ✅ | ❌ | ❌ | Own | Insert pending only | All pending (select) |
| `pilot_deposits` | ✅ | ❌ | ❌ | Own | Insert verified only | All pending (select) |
| `redeem_requests` | ✅ | ❌ | ❌ | Own | Insert verified only | All (select) policy added |
| `platform_state` | ✅ | sold_tokens only | ❌ | ✅ | ❌ | ✅ |

**Action required:** Run `supabase/schema.sql` then `supabase/security-hardening.sql` in Supabase SQL Editor.

## RPC / Functions

| Function | Purpose | Exposure |
|----------|---------|----------|
| `is_admin()` | Admin checks in RLS | `authenticated` execute |
| `handle_new_user()` | Profile + wallet on signup | Trigger only |
| `apply_purchase_approval()` | Credit wallet on approval | Trigger only |
| `apply_redeem_approval()` | Debit wallet on approval | Trigger only |
| `protect_profile_sensitive_columns()` | Block role/KYC self-escalation | Trigger only |

## GitHub Pages Note

GitHub Pages does **not** serve custom `_headers`. Use Cloudflare in front of the domain, or rely on meta CSP (already added). See `DEPLOYMENT_CHECKLIST.md`.

## Residual Risk

- Anon key remains public (required for static Supabase client).
- Client rate limits can be bypassed; enforce Auth rate limits in Supabase Dashboard.
- Admin approvals require running the latest `supabase/security-hardening.sql` so the secure RPC functions and grants exist in Supabase.

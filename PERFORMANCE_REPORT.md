# Arab Rial — Performance Report

**Date:** 2026-05-30

## Changes

| Optimization | Impact | Files |
|--------------|--------|-------|
| External CSS/JS (already split) | Cacheable assets | `assets/css/arbr.css`, `assets/js/*.js` |
| `defer` on all scripts | Non-blocking parse | All `*.html` |
| Font CSS async (`media=print` onload) | Faster first paint | `*.html` |
| `preload` logo.svg | LCP hint | `*.html` |
| Cache-busting `?v=20260530.1` | Safe long cache at CDN | `*.html`, `assets/build/version.txt` |
| `_headers` immutable cache for CSS/JS | Repeat visit speed | `_headers` |
| Service worker precache | Offline shell | `sw.js` |
| Build script for minify (optional) | Smaller payloads | `package.json`, `scripts/build.mjs` |

## Build

```bash
npm install
node scripts/build.mjs          # patch HTML + version
node scripts/build.mjs --minify  # also writes arbr.min.css/js
```

## Lighthouse Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Performance | > 90 | Run on production URL after deploy; verify font/CDN latency |
| LCP | < 2.5s | Hero + logo preload |
| TBT | Low | Deferred JS |

## Not Changed (avoid regressions)

- Supabase realtime and API calls unchanged.
- Modal HTML still loaded via fetch with inline fallback.

## Recommendations

1. Put Cloudflare in front of `arab-rial.com` for `_headers` and Brotli.
2. Run `npm run build:min` in CI before deploy when npm is available.
3. Consider WebP coin/marketing images when raster assets are added (currently SVG logo).

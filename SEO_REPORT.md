# Arab Rial — SEO Report

**Date:** 2026-05-30

## Implemented

| Item | Status | Location |
|------|--------|----------|
| `robots.txt` | ✅ | `/robots.txt` |
| `sitemap.xml` | ✅ | `/sitemap.xml` |
| Meta description | ✅ | Per page `<meta name="description">` |
| Meta keywords | ✅ | All public pages |
| Canonical URLs | ✅ | `https://arab-rial.com/...` |
| Open Graph | ✅ | `og:title`, `og:description`, `og:url`, `og:image` |
| Twitter cards | ✅ | `summary_large_image` |
| Schema.org WebSite | ✅ | `index.html` JSON-LD |
| Admin noindex | ✅ | `admin.html` `robots: noindex` |

## Lighthouse SEO Target

**> 95** — Expected on production after deploy (valid canonical, meta, structured data, sitemap linked in robots).

## URLs in Sitemap

- `/`, `/index.html`, `/login.html`, `/buy.html`, `/deposit.html`, `/sell.html`, `/dashboard.html`, `/orders.html`

**Excluded:** `/admin.html` (noindex + disallowed in robots.txt)

## Future Improvements

- Add `Organization` / `FinancialProduct` schema when legal copy is finalized.
- Localized `hreflang` if English landing pages are added.

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const minify = process.argv.includes('--minify');
const version = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.1';

const SITE = 'https://arab-rial.com';
const CSP = "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; upgrade-insecure-requests";

const pages = {
  'index.html': { title: 'ARBR | العملة الرقمية الذكية', path: '/', desc: 'Arab Rial (ARBR) — منصة أصول رقمية عربية للمستثمرين والتجار المؤهلين.' },
  'login.html': { title: 'ARBR | تسجيل الدخول', path: '/login.html', desc: 'تسجيل الدخول وإنشاء حساب مستثمر Arab Rial (ARBR).' },
  'buy.html': { title: 'ARBR | شراء ARBR', path: '/buy.html', desc: 'اشترِ Arab Rial (ARBR) بسعر دخول مبكر وطرق دفع USDT أو Visa.' },
  'deposit.html': { title: 'ARBR | إيداع / تحويل', path: '/deposit.html', desc: 'إيداع عضوية ARBR وتحويلات المنصة.' },
  'sell.html': { title: 'ARBR | بيع / استرداد', path: '/sell.html', desc: 'طلب بيع أو استرداد رصيد ARBR.' },
  'dashboard.html': { title: 'ARBR | لوحة التحكم', path: '/dashboard.html', desc: 'لوحة المستثمر — الأرصدة والطلبات في Arab Rial.' },
  'orders.html': { title: 'ARBR | طلباتي', path: '/orders.html', desc: 'متابعة طلبات الشراء والإيداع والاسترداد.' },
  'admin.html': { title: 'ARBR | لوحة الإدارة', path: '/admin.html', desc: 'لوحة إدارة Arab Rial — مراجعة الطلبات المعلقة.', robots: 'noindex, nofollow' }
};

function extraHead(meta) {
  const url = SITE + meta.path;
  const robots = meta.robots || 'index, follow';
  return `<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<meta http-equiv="X-Content-Type-Options" content="nosniff" />
<meta name="referrer" content="strict-origin-when-cross-origin" />
<meta name="robots" content="${robots}" />
<meta name="keywords" content="Arab Rial, ARBR, عملة رقمية, عمان, OMR, USDT, منصة أصول رقمية" />
<meta name="author" content="ARBR Network" />
<link rel="canonical" href="${url}" />
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/logo.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="dns-prefetch" href="https://umxmwcwuwsvkvsbdhbdl.supabase.co" />
<meta property="og:site_name" content="Arab Rial (ARBR)" />
<meta property="og:locale" content="ar_OM" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${meta.title}" />
<meta property="og:description" content="${meta.desc}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SITE}/logo.svg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${meta.title}" />
<meta name="twitter:description" content="${meta.desc}" />
<meta name="twitter:image" content="${SITE}/logo.svg" />`;
}

const cssHref = minify ? `assets/css/arbr.min.css?v=${version}` : `assets/css/arbr.css?v=${version}`;
const jsHref = minify ? `assets/js/arbr.min.js` : `assets/js/arbr.js`;

const fontBlock = `<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Tajawal:wght@300;400;500;700;800&display=swap" rel="stylesheet" media="print" onload="this.media='all'" />
<noscript><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Tajawal:wght@300;400;500;700;800&display=swap" rel="stylesheet" /></noscript>
<link rel="stylesheet" href="${cssHref}" />
<link rel="preload" href="logo.svg" as="image" type="image/svg+xml" />`;

const scriptsBlock = `<div id="page-loader" class="page-loader" aria-hidden="true" role="status">
  <div class="page-loader-spinner"></div>
  <span class="sr-only">جاري التحميل…</span>
</div>
<script src="assets/js/config.public.js?v=${version}" defer></script>
<script src="assets/js/security.js?v=${version}" defer></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer crossorigin="anonymous"></script>
<script src="assets/js/layout.js?v=${version}" defer></script>
<script src="${jsHref}?v=${version}" defer></script>
<script src="assets/js/pwa-register.js?v=${version}" defer></script>`;

for (const [file, meta] of Object.entries(pages)) {
  const fp = path.join(root, file);
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp, 'utf8');

  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      /<meta name="theme-color" content="#060910" \/>/,
      `<meta name="theme-color" content="#060910" />\n${extraHead(meta)}`
    );
  }

  html = html.replace(
    /<link href="https:\/\/fonts\.googleapis\.com[^"]+" rel="stylesheet">\s*<link rel="stylesheet" href="assets\/css\/arbr[^"]*"[^/]*\/>/,
    fontBlock
  );

  html = html.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>\s*<script src="assets\/js\/layout\.js"><\/script>\s*<script src="assets\/js\/arbr\.js"><\/script>/,
    scriptsBlock
  );

  if (file === 'index.html' && !html.includes('application/ld+json')) {
    const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Arab Rial (ARBR)","alternateName":"ARBR","url":"${SITE}","description":"${meta.desc.replace(/"/g, '\\"')}","inLanguage":["ar","en"]}</script>\n`;
    html = html.replace('</head>', ld + '</head>');
  }

  fs.writeFileSync(fp, html);
}

fs.mkdirSync(path.join(root, 'assets', 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'build', 'version.txt'), version);

if (minify) {
  const CleanCSS = (await import('clean-css')).default;
  const { minify: minifyJs } = await import('terser');
  const cssIn = fs.readFileSync(path.join(root, 'assets/css/arbr.css'), 'utf8');
  fs.writeFileSync(path.join(root, 'assets/css/arbr.min.css'), new CleanCSS().minify(cssIn).styles);
  const jsIn = fs.readFileSync(path.join(root, 'assets/js/arbr.js'), 'utf8');
  const out = await minifyJs(jsIn, { compress: true, mangle: false });
  fs.writeFileSync(path.join(root, 'assets/js/arbr.min.js'), out.code);
}

console.log('Build OK — version', version, minify ? '(minified)' : '');

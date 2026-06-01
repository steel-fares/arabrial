(function () {
  const page = document.body.dataset.page || 'home';
  const host = document.getElementById('site-nav');
  if (!host) return;

  const links = [
    { href: 'index.html', page: 'home', i18n: 'navHome' },
    { href: 'buy.html', page: 'buy', i18n: 'navBuy' },
    { href: 'orders.html', page: 'orders', i18n: 'myOrdersMenu' },
    { href: 'wallet.html', page: 'wallet', i18n: 'navWallet' }
  ];

  const navLinks = links.map(link => `
    <li><a href="${link.href}" class="${page === link.page ? 'active' : ''}" data-i18n="${link.i18n}">${link.i18n}</a></li>
  `).join('');

  host.outerHTML = `
<nav>
  <div class="nav-start">
    <a class="logo" href="index.html">
      <div class="logo-mark"><img src="logo-aa.png" alt="Arab Rial ARBR logo" width="46" height="46" /></div>
      <div class="logo-text"><b>ARBR</b><small data-i18n="logoSub">The Digital Asset</small></div>
    </a>
    <button class="nav-toggle" type="button" id="navToggle" aria-expanded="false" aria-controls="navLinks" title="Menu">☰</button>
  </div>
  <ul class="nav-links" id="navLinks">
    ${navLinks}
    <li class="admin-nav-item" style="display:none"><a href="admin.html" data-i18n="navAdmin">الإدارة</a></li>
  </ul>
  <div class="nav-actions">
    <button class="lang-btn" type="button" data-lang-toggle>English</button>
    <button class="admin-notify" type="button" id="adminNotificationBadge">
      <span class="admin-notify-count" id="adminNotificationCount">0</span>
      <span id="adminNotificationText">0</span>
    </button>
    <a class="phone-icon-link" href="support.html" aria-label="Support" title="Support">☎</a>
    <a class="btn-primary" id="headerLoginBtn" href="login.html" data-auth-guest data-i18n="login">تسجيل الدخول</a>
    <div class="user-menu-wrap" id="userMenuWrap">
      <button class="user-box" id="userBox" type="button">
        <span class="user-avatar">AR</span>
        <span>
          <strong id="navUserName" data-i18n="hello">مرحبًا</strong>
          <small id="navUserBalance">الرصيد: 0 ARBR</small>
        </span>
      </button>
      <div class="user-menu" id="userMenu">
        <a class="menu-item" href="dashboard.html"><span data-i18n="dashboardMenu">لوحة التحكم</span><span>↙</span></a>
        <a class="menu-item" href="orders.html"><span data-i18n="myOrdersMenu">طلباتي</span><span>↙</span></a>
        <a class="menu-item" href="wallet.html"><span data-i18n="navWallet">المحفظة</span><span>↙</span></a>
        <button class="menu-item" type="button" id="openSettingsBtn"><span data-i18n="settings">الإعدادات</span><span>⚙</span></button>
        <button class="menu-item danger" type="button" id="logoutBtn"><span data-i18n="logout">تسجيل الخروج</span><span>×</span></button>
      </div>
    </div>
  </div>
</nav>`;

  const footer = document.querySelector('footer');
  if (footer) {
    footer.innerHTML = `
      <div class="footer-logo">ARBR</div>
      <div class="footer-subtitle">THE DIGITAL ASSET</div>
      <div class="footer-links" aria-label="Legal and support links">
        <a href="wallet.html" data-i18n="navWallet">المحفظة</a>
        <a href="how-it-works.html" data-i18n="footerHowItWorks">كيف يعمل ريال عربي؟</a>
        <a href="terms.html" data-i18n="footerTerms">الشروط والأحكام</a>
        <a href="privacy.html" data-i18n="footerPrivacy">سياسة الخصوصية</a>
        <a href="refund-policy.html" data-i18n="footerRefund">سياسة الاسترداد</a>
        <a href="kyc-policy.html" data-i18n="footerKyc">سياسة التحقق KYC</a>
        <a href="support.html" data-i18n="footerSupport">الدعم والتواصل</a>
      </div>
      <p class="footer-notice">
        <span lang="ar" dir="rtl">تنبيه: سعر ARBR متغير وقد يرتفع أو ينخفض. ARBR ليس عملة رسمية ولا يضمن الربح أو الاسترداد.</span>
        <span lang="en" dir="ltr">Notice: ARBR price may move up or down. ARBR is not an official currency and does not guarantee profit or redemption.</span>
      </p>
      <div>© 2026 ARBR Network.</div>
    `;
  }

  document.querySelectorAll('.menu-item[href]').forEach(item => {
    item.addEventListener('click', () => document.getElementById('userMenu')?.classList.remove('open'));
  });
})();



(function () {
  const page = document.body.dataset.page || 'home';
  const host = document.getElementById('site-nav');
  if (!host) return;

  const links = [
    { href: 'index.html', page: 'home', i18n: 'navHome' },
    { href: 'buy.html', page: 'buy', i18n: 'navBuy' },
    { href: 'deposit.html', page: 'deposit', i18n: 'navDeposit' },
    { href: 'sell.html', page: 'sell', i18n: 'navSell' },
    { href: 'dashboard.html', page: 'dashboard', i18n: 'dashboardMenu' },
    { href: 'orders.html', page: 'orders', i18n: 'myOrdersMenu' }
  ];

  const navLinks = links.map(link => `
    <li><a href="${link.href}" class="${page === link.page ? 'active' : ''}" data-i18n="${link.i18n}">${link.i18n}</a></li>
  `).join('');

  host.outerHTML = `
<nav>
  <div class="nav-start">
    <a class="logo" href="index.html">
      <div class="logo-mark"><img src="logo.svg" alt="Arab Rial ARBR logo" width="46" height="46" /></div>
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
    <a class="btn-primary" id="headerLoginBtn" href="login.html" data-i18n="login">تسجيل الدخول</a>
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
        <button class="menu-item" type="button" id="openSettingsBtn"><span data-i18n="settings">الإعدادات</span><span>⚙</span></button>
        <button class="menu-item danger" type="button" id="logoutBtn"><span data-i18n="logout">تسجيل الخروج</span><span>×</span></button>
      </div>
    </div>
  </div>
</nav>`;

  document.querySelectorAll('.menu-item[href]').forEach(item => {
    item.addEventListener('click', () => document.getElementById('userMenu')?.classList.remove('open'));
  });
})();

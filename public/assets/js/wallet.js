(function () {
  const DEFAULT_PRICE = 0.0385;

  const labels = {
    ar: {
      buy: 'شراء',
      sell: 'بيع',
      redeem: 'استرداد',
      adjustment: 'تسوية',
      approved: 'مكتمل',
      completed: 'مكتمل',
      pending: 'معلق',
      rejected: 'مرفوض',
      loading: 'جار تحميل المعاملات...',
      empty: 'لا توجد معاملات حتى الآن.',
      sample: 'بيانات تجريبية لحين توفر بيانات مباشرة.',
      title: 'المحفظة',
      subtitle: 'محفظتك الشخصية ونظرة عامة على السوق',
      warning: 'تنبيه: سعر ARBR متغير وقد يرتفع أو ينخفض. ARBR ليس عملة رسمية ولا يضمن الربح أو الاسترداد.',
      currentBalance: 'الرصيد الحالي',
      totalPurchased: 'إجمالي المشتريات',
      totalSold: 'إجمالي البيع / الاسترداد',
      totalSpent: 'إجمالي المدفوع بالريال العماني',
      currentPrice: 'السعر الحالي',
      priceChange: 'نسبة التغير (24 ساعة)',
      allTransactions: 'في جميع المعاملات',
      priceChart: 'منحنى السعر',
      priceChartSub: 'سعر ARBR مقابل الريال العماني',
      balanceChart: 'حركة الرصيد / المعروض',
      balanceChartSub: 'إجمالي رصيدك من ARBR عبر الوقت',
      transactions: 'سجل المعاملات',
      date: 'التاريخ',
      type: 'النوع',
      arbrAmount: 'كمية ARBR',
      omrAmount: 'المبلغ OMR',
      status: 'الحالة',
      reference: 'الرقم المرجعي',
      notes: 'ملاحظات',
      lastUpdate: 'آخر تحديث للسعر',
      marketNotes: 'ملاحظات السوق',
      showMarket: 'عرض ملخص السوق ←',
      readyInvest: 'جاهز للاستثمار؟',
      buyCtaText: 'اشتر ARBR الآن وكن جزءا من مستقبل ريال عربي.',
      riskStatement: 'عرض بيان المخاطر',
      riskText: 'اكتشف المعلومات الرئيسية قبل الاستثمار.'
    },
    en: {
      buy: 'Buy',
      sell: 'Sell',
      redeem: 'Redeem',
      adjustment: 'Adjustment',
      approved: 'Completed',
      completed: 'Completed',
      pending: 'Pending',
      rejected: 'Rejected',
      loading: 'Loading transactions...',
      empty: 'No transactions yet.',
      sample: 'Sample data shown until live data is available.',
      title: 'Wallet',
      subtitle: 'Your personal wallet and market overview',
      warning: 'Notice: ARBR price may move up or down. ARBR is not an official currency and does not guarantee profit or redemption.',
      currentBalance: 'Current Balance',
      totalPurchased: 'Total Purchased',
      totalSold: 'Total Sold / Redeemed',
      totalSpent: 'Total OMR Spent',
      currentPrice: 'Current Price',
      priceChange: 'Price Change (24h)',
      allTransactions: 'Across all transactions',
      priceChart: 'Price Chart',
      priceChartSub: 'ARBR price against OMR',
      balanceChart: 'Balance / Supply Movement',
      balanceChartSub: 'Your ARBR balance over time',
      transactions: 'Transaction History',
      date: 'Date',
      type: 'Type',
      arbrAmount: 'ARBR Amount',
      omrAmount: 'OMR Amount',
      status: 'Status',
      reference: 'Reference',
      notes: 'Notes',
      lastUpdate: 'Last Price Update',
      marketNotes: 'Market Notes',
      showMarket: 'Show market summary →',
      readyInvest: 'Ready to invest?',
      buyCtaText: 'Buy ARBR now and join the future of Arab Rial.',
      riskStatement: 'View Risk Statement',
      riskText: 'Discover key information before investing.'
    }
  };

  const sampleTransactions = [
    { date: '2025-05-17T10:45:00Z', type: 'buy', arbr: 20000, omr: 20, status: 'approved', ref: 'ARBR-250517-0012', note: 'شراء عبر البطاقة' },
    { date: '2025-05-16T15:22:00Z', type: 'sell', arbr: 15000, omr: 15.23, status: 'approved', ref: 'ARBR-250516-0009', note: 'بيع جزئي' },
    { date: '2025-05-15T11:05:00Z', type: 'buy', arbr: 30000, omr: 29.7, status: 'approved', ref: 'ARBR-250515-0008', note: 'تحويل بنكي' },
    { date: '2025-05-14T08:14:00Z', type: 'redeem', arbr: 10069.25, omr: 10.15, status: 'approved', ref: 'ARBR-250514-0006', note: 'استرداد إلى البنك' },
    { date: '2025-05-13T14:33:00Z', type: 'buy', arbr: 25000, omr: 24.75, status: 'approved', ref: 'ARBR-250513-0004', note: 'بطاقة مصرفية' },
    { date: '2025-05-12T09:17:00Z', type: 'sell', arbr: 20000, omr: 20.3, status: 'pending', ref: 'ARBR-250512-0003', note: 'قيد المعالجة' },
    { date: '2025-05-11T06:40:00Z', type: 'buy', arbr: 15000, omr: 14.85, status: 'approved', ref: 'ARBR-250511-0001', note: 'تحويل فوري' }
  ];

  function lang() {
    return document.body.classList.contains('lang-en') ? 'en' : 'ar';
  }

  function tr(key) {
    return labels[lang()][key] || labels.ar[key] || key;
  }

  function fmt(value, digits = 2) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function dateFmt(value) {
    const date = new Date(value);
    return date.toLocaleDateString(lang() === 'ar' ? 'ar-OM' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function applyWalletLanguage() {
    document.querySelectorAll('[data-i18n-wallet]').forEach(el => {
      const key = el.dataset.i18nWallet;
      if (labels[lang()][key]) el.textContent = labels[lang()][key];
    });
  }

  function samplePriceHistory() {
    const base = [0.00362, 0.00368, 0.00371, 0.00376, 0.00382, 0.00379, 0.00385, 0.00381, 0.00387, 0.00384, 0.00390, 0.00394, 0.00389, 0.00385];
    return base.map((price, index) => ({
      date: new Date(Date.now() - (base.length - index - 1) * 86400000).toISOString(),
      price
    }));
  }

  function sampleBalanceHistory(transactions) {
    let balance = 110000;
    return transactions.slice().reverse().map(item => {
      if (item.type === 'buy') balance += item.arbr;
      if (item.type !== 'buy') balance -= item.arbr;
      return { date: item.date, value: Math.max(0, balance), type: item.type };
    });
  }

  function balanceHistoryFromData(wallet, ledgerRows, transactionRows) {
    const sourceRows = (ledgerRows?.length ? ledgerRows : transactionRows || [])
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!sourceRows.length) {
      return [{
        date: new Date().toISOString(),
        value: Number(wallet?.arbr_balance || 0),
        type: 'buy'
      }];
    }
    let running = 0;
    return sourceRows.map(row => {
      running += row.type === 'buy' ? row.arbr : -row.arbr;
      return {
        date: row.date,
        value: Math.max(0, running),
        type: row.type
      };
    });
  }

  async function queryMaybe(client, table, columns, build) {
    try {
      let q = client.from(table).select(columns);
      if (build) q = build(q);
      const { data, error } = await q;
      if (error) return null;
      return data || [];
    } catch (_) {
      return null;
    }
  }

  async function getClient() {
    if (window.ARBR_SUPABASE_CLIENT) return window.ARBR_SUPABASE_CLIENT;
    if (!window.supabase) return null;
    const config = window.ARBR_PUBLIC_CONFIG;
    if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
      console.warn("Supabase configuration is not loaded.");
      return null;
    }
    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  function requestRef(prefix, id, date) {
    const d = new Date(date || Date.now());
    const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${String(id || '').slice(0, 4).toUpperCase() || '0001'}`;
  }

  function normalizeTransactions(purchases, redeems, ledger) {
    const rows = [];
    (purchases || []).forEach(item => rows.push({
      date: item.created_at,
      type: 'buy',
      arbr: Number(item.estimated_arbr || 0),
      omr: Number(item.amount_omr || item.amount_usd || 0),
      status: item.status || 'pending',
      ref: item.payment_reference || requestRef('ARBR', item.id, item.created_at),
      note: item.note || item.payment_method || '-'
    }));
    (redeems || []).forEach(item => rows.push({
      date: item.created_at,
      type: item.transaction_type === 'redeem_debit' ? 'redeem' : 'sell',
      arbr: Number(item.amount_arbr || Math.abs(item.arbr_amount || 0)),
      omr: Number(item.estimated_final_omr || item.omr_amount || 0),
      status: item.status || 'pending',
      ref: requestRef('ARBR-R', item.id || item.source_id, item.created_at),
      note: item.note || '-'
    }));
    (ledger || []).forEach(item => rows.push({
      date: item.created_at,
      type: item.transaction_type === 'purchase_credit' ? 'buy' : item.transaction_type === 'redeem_debit' ? 'redeem' : 'adjustment',
      arbr: Math.abs(Number(item.arbr_amount || 0)),
      omr: Math.abs(Number(item.omr_amount || 0)),
      status: 'completed',
      ref: requestRef('LEDGER', item.id, item.created_at),
      note: item.note || '-'
    }));
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function calcSummary(wallet, purchases, redeems, rows, priceHistory, marketSnapshot) {
    const approvedPurchases = (purchases || []).filter(x => ['approved', 'completed'].includes(x.status));
    const approvedRedeems = (redeems || []).filter(x => ['approved', 'completed'].includes(x.status));
    const purchased = approvedPurchases.reduce((sum, x) => sum + Number(x.estimated_arbr || 0), 0);
    const sold = approvedRedeems.reduce((sum, x) => sum + Number(x.amount_arbr || 0), 0);
    const spent = approvedPurchases.reduce((sum, x) => sum + Number(x.amount_omr || x.amount_usd || 0), 0);
    const balance = Number(wallet?.arbr_balance || 0) || rows.reduce((sum, x) => sum + (x.type === 'buy' ? x.arbr : -x.arbr), 0);
    const history = priceHistory.length ? priceHistory : samplePriceHistory();
    const last = Number(window.ARBR_CURRENT_PRICE_OMR || marketSnapshot?.current_price_omr || history[history.length - 1]?.price || DEFAULT_PRICE);
    const prev = Number(history[history.length - 2]?.price || last);
    const change = prev ? ((last - prev) / prev) * 100 : 0;
    return { balance, purchased, sold, spent, price: last, change, prevPrice: prev };
  }

  function renderSummary(summary) {
    setText('walletBalance', `${fmt(summary.balance)} ARBR`);
    setText('walletBalanceOmr', `≈ ${fmt(summary.balance * summary.price, 2)} OMR`);
    setText('walletPurchased', `${fmt(summary.purchased)} ARBR`);
    setText('walletPurchasedOmr', `≈ ${fmt(summary.purchased * summary.price, 2)} OMR`);
    setText('walletSold', `${fmt(summary.sold)} ARBR`);
    setText('walletSoldOmr', `≈ ${fmt(summary.sold * summary.price, 2)} OMR`);
    setText('walletSpent', `${fmt(summary.spent, 2)} OMR`);
    setText('walletPrice', `1 ARBR = ${summary.price.toFixed(6)} OMR`);
    setText('walletPriceSub', `≈ ${summary.price.toFixed(6)} OMR لكل ARBR`);
    const up = summary.change >= 0;
    const changeEl = document.getElementById('walletChange');
    const diff = summary.price - summary.prevPrice;
    if (changeEl) {
      changeEl.textContent = `${up ? '+' : ''}${summary.change.toFixed(2)}%`;
      changeEl.style.color = up ? '#1fae5f' : '#ef4444';
    }
    setText('walletChangeOmr', `${up ? '▲ +' : '▼ '}${diff.toFixed(6)} OMR`);
    setText('lastPriceUpdate', `1 ARBR = ${summary.price.toFixed(6)} OMR`);
  }

  function renderTransactions(rows) {
    const tbody = document.getElementById('walletTransactions');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7">${tr('empty')}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.slice(0, 7).map(row => `
      <tr>
        <td>${dateFmt(row.date)}<br><small>${new Date(row.date).toLocaleTimeString(lang() === 'ar' ? 'ar-OM' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</small></td>
        <td><span class="wallet-type ${row.type}">${tr(row.type) || row.type}</span></td>
        <td>${fmt(row.arbr)}</td>
        <td>${fmt(row.omr, 2)}</td>
        <td><span class="wallet-status ${row.status}">${tr(row.status) || row.status}</span></td>
        <td>${escapeHtml(row.ref)}</td>
        <td>${escapeHtml(row.note) || '-'}</td>
      </tr>
    `).join('');
  }

  function drawChart(svgId, points, options = {}) {
    const svg = document.getElementById(svgId);
    if (!svg || !points.length) return;
    const width = 720;
    const height = 310;
    const pad = { top: 24, right: 26, bottom: 46, left: 58 };
    const values = points.map(p => Number(p.value ?? p.price ?? 0));
    const min = Math.min(...values) * 0.96;
    const max = Math.max(...values) * 1.04 || 1;
    const x = i => pad.left + (i / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
    const y = v => height - pad.bottom - ((v - min) / Math.max(0.000001, max - min)) * (height - pad.top - pad.bottom);
    const path = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
    const area = `${path} L ${x(points.length - 1)} ${height - pad.bottom} L ${pad.left} ${height - pad.bottom} Z`;
    const color = options.color || '#F0BE55';
    const fill = options.fill || 'rgba(27,98,232,.14)';
    const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) / 4) * i);
    const labelStep = Math.max(1, Math.ceil(points.length / 6));
    const gridColor = options.gridColor || 'rgba(255,255,255,.12)';
    const labelColor = options.labelColor || '#9aa3b5';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="${svgId}Fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${fill}" stop-opacity="1"/>
          <stop offset="1" stop-color="${fill}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${ticks.map(t => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}" stroke="${gridColor}" stroke-dasharray="4 5"/><text x="${pad.left - 12}" y="${y(t) + 4}" fill="${labelColor}" font-size="11" text-anchor="end">${options.money ? t.toFixed(6) : Math.round(t / 1000) + 'K'}</text>`).join('')}
      <path d="${area}" fill="url(#${svgId}Fill)"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(values[i])}" r="4" fill="#fff" stroke="${p.type && p.type !== 'buy' ? '#ef4444' : color}" stroke-width="3"/>`).join('')}
      ${points.map((p, i) => (i % labelStep === 0 || i === points.length - 1) ? `<text x="${x(i)}" y="${height - 16}" fill="${labelColor}" font-size="11" text-anchor="middle">${dateFmt(p.date).replace('2025', '').trim()}</text>` : '').join('')}
    `;
  }

  async function loadWallet() {
    applyWalletLanguage();
    const client = await getClient();
    if (!client) {
      const priceHistory = samplePriceHistory();
      const rows = sampleTransactions;
      const summary = calcSummary(null, [], [], rows, priceHistory, null);
      renderSummary(summary);
      renderTransactions(rows);
      drawChart('priceChart', priceHistory, { color: '#F0BE55', fill: 'rgba(240,190,85,.20)', money: true });
      drawChart('balanceChart', sampleBalanceHistory(rows), { color: '#20bfa3', fill: 'rgba(32,191,163,.18)' });
      setText('marketNotes', tr('sample'));
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      window.location.href = `login.html?next=${encodeURIComponent('wallet.html')}`;
      return;
    }

    const [walletData, purchases, redeems, ledger, priceRows, snapshots] = await Promise.all([
      queryMaybe(client, 'wallets', '*', q => q.eq('user_id', user.id).maybeSingle()),
      queryMaybe(client, 'purchase_requests', '*', q => q.eq('user_id', user.id).order('created_at', { ascending: false })),
      queryMaybe(client, 'redeem_requests', '*', q => q.eq('user_id', user.id).order('created_at', { ascending: false })),
      queryMaybe(client, 'transaction_ledger', '*', q => q.eq('user_id', user.id).order('created_at', { ascending: false })),
      queryMaybe(client, 'price_history', 'recorded_at,price_omr', q => q.order('recorded_at', { ascending: true }).limit(60)),
      queryMaybe(client, 'market_snapshots', '*', q => q.order('created_at', { ascending: false }).limit(1))
    ]);

    const livePriceHistory = (priceRows || []).map(row => ({ date: row.recorded_at, price: Number(row.price_omr || DEFAULT_PRICE) }));
    if (livePriceHistory.length > 0 && window.ARBR_CURRENT_PRICE_OMR) {
      livePriceHistory.push({ date: new Date().toISOString(), price: window.ARBR_CURRENT_PRICE_OMR });
    }
    const rows = normalizeTransactions(purchases || [], redeems || [], []);
    const ledgerRows = normalizeTransactions([], [], ledger || []);
    const displayRows = rows;
    const market = snapshots?.[0] || null;
    const summary = calcSummary(walletData, purchases || [], redeems || [], displayRows, livePriceHistory, market);
    const balanceHistory = balanceHistoryFromData(walletData, ledgerRows, rows);

    renderSummary(summary);
    renderTransactions(displayRows);
    drawChart('priceChart', livePriceHistory.length ? livePriceHistory : samplePriceHistory(), { color: '#F0BE55', fill: 'rgba(240,190,85,.20)', money: true });
    drawChart('balanceChart', balanceHistory, { color: '#20bfa3', fill: 'rgba(32,191,163,.18)' });
    setText('lastPriceUpdateTime', market?.created_at ? `${dateFmt(market.created_at)} (${market.update_interval || '60 دقيقة'})` : new Date().toLocaleString(lang() === 'ar' ? 'ar-OM' : 'en-GB'));
    setText('marketNotes', market?.notes || 'يشهد سوق ARBR نشاطا إيجابيا خلال الأيام الأخيرة مدفوعا بزيادة الطلب وثقة المستثمرين.');
  }

  window.ARBR_LOAD_WALLET = loadWallet;

  document.addEventListener('DOMContentLoaded', () => {
    loadWallet();
    document.querySelectorAll('[data-lang-toggle]').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(loadWallet, 60));
    });
  });
})();

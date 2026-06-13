'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CreditCard, ArrowDownRight, ArrowUpRight, Shield, Activity, RefreshCw } from 'lucide-react';

interface Wallet {
  arbr_balance: number;
  usdt_balance: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  created_at: string;
}

interface PricePoint {
  recorded_at: string;
  buy_price_omr: number;
  sell_price_omr: number;
}

export default function WalletPage() {
  const [user, setUser] = useState<any>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [livePrices, setLivePrices] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        window.location.href = '/login.html?next=wallet';
        return;
      }
      setUser(session.user);
      await Promise.all([
        loadWallet(session.user.id),
        loadTransactions(session.user.id),
        loadPriceHistory(),
        fetchLivePrices()
      ]);
      setLoading(false);
    }
    init();

    // Set up real-time listener for wallet balance changes
    const walletChannel = supabase
      .channel('wallet_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets' },
        (payload: any) => {
          if (payload.new) {
            setWallet({
              arbr_balance: Number(payload.new.arbr_balance || 0),
              usdt_balance: Number(payload.new.usdt_balance || 0)
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
    };
  }, []);

  async function loadWallet(userId: string) {
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      setWallet({
        arbr_balance: Number(data.arbr_balance || 0),
        usdt_balance: Number(data.usdt_balance || 0)
      });
    }
  }

  async function loadTransactions(userId: string) {
    // Load USDT transaction records
    const { data: usdtTx } = await supabase
      .from('usdt_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Load ARBR transactions (from legacy transaction_ledger if exists)
    const { data: arbrTx } = await supabase
      .from('transaction_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const combined: Transaction[] = [];

    if (usdtTx) {
      usdtTx.forEach((tx: any) => {
        combined.push({
          id: tx.id,
          type: tx.type,
          amount: Number(tx.amount),
          currency: tx.currency || 'USDT',
          status: tx.status,
          reference: tx.reference ? `#REF-${tx.reference.slice(-6).toUpperCase()}` : '-',
          created_at: tx.created_at
        });
      });
    }

    if (arbrTx) {
      arbrTx.forEach((tx: any) => {
        combined.push({
          id: tx.id,
          type: tx.transaction_type,
          amount: Number(tx.arbr_amount),
          currency: 'ARBR',
          status: 'completed',
          reference: tx.source_id ? `#REF-${tx.source_id.slice(-6).toUpperCase()}` : '-',
          created_at: tx.created_at
        });
      });
    }

    // Sort by date descending
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setTransactions(combined.slice(0, 15));
  }

  async function loadPriceHistory() {
    const { data } = await supabase
      .from('usdt_price_history')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(30);

    if (data && data.length > 0) {
      // Reverse to chronological order for charts
      const sorted = [...data].reverse().map((p: any) => ({
        date: new Date(p.recorded_at).toLocaleDateString('ar-OM', { day: 'numeric', month: 'short' }),
        market: Number(p.market_price_omr),
        buy: Number(p.buy_price_omr),
        sell: Number(p.sell_price_omr)
      }));
      setPrices(sorted);
    }
  }

  async function fetchLivePrices() {
    try {
      const res = await fetch('/api/usdt-price');
      if (res.ok) {
        const data = await res.json();
        setLivePrices(data);
      }
    } catch (e) {
      console.error('Error fetching live pricing details:', e);
    }
  }

  if (loading) {
    return (
      <main className="wallet-main" style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }}>
        <div className="admin-state-card admin-loading">جارٍ تحميل بيانات المحفظة والسوق...</div>
      </main>
    );
  }

  const arbrBalance = wallet?.arbr_balance || 0;
  const usdtBalance = wallet?.usdt_balance || 0;
  const usdtValueOmr = usdtBalance * (livePrices?.sell_price_omr || 0.385);
  const arbrValueOmr = arbrBalance * 0.0385; // Hardcoded founding OMR rate
  const totalBalanceOmr = arbrValueOmr + usdtValueOmr;

  const translationMap: { [key: string]: string } = {
    buy_usdt: 'شراء USDT',
    sell_usdt: 'بيع USDT',
    withdraw_usdt: 'سحب USDT',
    deposit_usdt: 'إيداع USDT',
    admin_adjustment: 'تعديل إداري',
    purchase_credit: 'شراء ARBR',
    redeem_debit: 'استرداد ARBR'
  };

  const statusMap: { [key: string]: string } = {
    completed: 'مكتمل',
    pending: 'تحت المراجعة',
    failed: 'فشل',
    cancelled: 'ملغي'
  };

  return (
    <main className="wallet-main app-page">
      {/* Wallet Hero section */}
      <section className="wallet-hero">
        <div className="wallet-hero-art" aria-hidden="true">
          <div className="wallet-coin coin-a">USDT</div>
          <div className="wallet-coin coin-b">ARBR</div>
          <div className="wallet-coin coin-c">OMR</div>
          <div className="wallet-graphic"><img src="/logo-aa.png" alt="" /></div>
        </div>
        <div className="wallet-hero-copy">
          <h1>المحفظة الرقمية</h1>
          <p>أرصدتك والتبادل الفوري في شبكة ARBR</p>
        </div>
      </section>

      {/* Security alert banner */}
      <section className="wallet-alert">
        <span className="wallet-alert-icon">!</span>
        <span>تنبيه: أسعار التبادل تخضع لمتغيرات السوق والأسعار المعروضة مؤمنة بنظام الإغلاق المؤقت.</span>
      </section>

      {/* Metrics Row */}
      <section className="wallet-summary-grid">
        <article className="wallet-metric">
          <div className="wallet-metric-icon blue"><CreditCard size={20} /></div>
          <small>إجمالي القيمة التقديرية</small>
          <b>{totalBalanceOmr.toFixed(3)} OMR</b>
          <span>≈ {(totalBalanceOmr / 0.385).toFixed(2)} USDT</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon green">🪙</div>
          <small>رصيد Arab Rial (ARBR)</small>
          <b>{arbrBalance.toLocaleString()} ARBR</b>
          <span>≈ {arbrValueOmr.toFixed(3)} OMR</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon green">💵</div>
          <small>رصيد Tether (USDT)</small>
          <b>{usdtBalance.toLocaleString()} USDT</b>
          <span>≈ {usdtValueOmr.toFixed(3)} OMR</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon blue"><ArrowUpRight size={20} /></div>
          <small>سعر شراء USDT المباشر</small>
          <b>1 USDT = {livePrices?.buy_price_omr?.toFixed(4) || '0.3965'} OMR</b>
          <span>شامل الهامش (+{livePrices?.buy_spread_percent || '3'}%)</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon red"><ArrowDownRight size={20} /></div>
          <small>سعر بيع USDT المباشر</small>
          <b>1 USDT = {livePrices?.sell_price_omr?.toFixed(4) || '0.3734'} OMR</b>
          <span>شامل الهامش (-{livePrices?.sell_spread_percent || '3'}%)</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon blue"><Activity size={20} /></div>
          <small>تحديث السوق المباشر</small>
          <b style={{ fontSize: '15px' }}><RefreshCw size={13} style={{ display: 'inline', marginInlineEnd: 4 }} /> {livePrices?.source === 'coingecko' ? 'CoinGecko Live' : 'قاعدة البيانات'}</b>
          <span>توقيت: {livePrices ? new Date(livePrices.timestamp).toLocaleTimeString() : '--:--'}</span>
        </article>
      </section>

      {/* Main Content Grid */}
      <section className="wallet-content-grid">
        <article className="wallet-panel">
          <div className="wallet-panel-head">
            <div>
              <h2>منحنى أسعار السوق</h2>
              <p>سعر صرف USDT مقابل الريال العماني (شامل هوامش الشراء والبيع)</p>
            </div>
          </div>
          <div style={{ width: '100%', height: 260, marginTop: 15 }}>
            {prices.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={prices}>
                  <XAxis dataKey="date" stroke="#4a5a7a" tickLine={false} />
                  <YAxis stroke="#4a5a7a" domain={['auto', 'auto']} tickLine={false} tickFormatter={(val) => val.toFixed(3)} />
                  <Tooltip contentStyle={{ background: '#0d1220', border: '1px solid #1a2540', color: '#cdd6f0' }} />
                  <Line type="monotone" dataKey="buy" stroke="#c9a84c" strokeWidth={2.5} name="شراء OMR" dot={false} />
                  <Line type="monotone" dataKey="sell" stroke="#f43f5e" strokeWidth={2} name="بيع OMR" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
                لا توجد بيانات تاريخية كافية حالياً
              </div>
            )}
          </div>
          <div className="chart-legend" style={{ marginTop: 12 }}>
            <span className="up" style={{ backgroundColor: '#c9a84c' }}></span> سعر الشراء بالريال العماني
            <span className="down" style={{ backgroundColor: '#f43f5e', marginInlineStart: 16 }}></span> سعر البيع بالريال العماني
          </div>
        </article>

        {/* Action / Swap panel */}
        <article className="wallet-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h2>بوابة تبادل USDT الفورية</h2>
            <p style={{ marginBottom: 15 }}>تداول وقم بتعبئة محفظتك أو سحب الرصيد مباشرة بالريال العماني.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--muted)', fontSize: '13px' }}>رصيد المحفظة المتوفر</span>
                  <span style={{ color: 'var(--gold-light)', fontWeight: 'bold' }}>{usdtBalance.toFixed(2)} USDT</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  الحد الأدنى للصفقة: {livePrices?.min_transaction || '10'} USDT | الحد الأقصى: {livePrices?.max_transaction || '10,000'} USDT
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <a 
              className="wallet-cta-btn" 
              href="/exchange?mode=buy"
              style={{ flex: 1, textAlign: 'center', background: 'linear-gradient(135deg, #c9a84c, #a8893d)', color: '#060910', padding: 14 }}
            >
              شراء USDT الفوري 
            </a>
            <a 
              className="wallet-cta-btn outline" 
              href="/exchange?mode=sell"
              style={{ flex: 1, textAlign: 'center', border: '1px solid var(--gold-light)', color: 'var(--gold-light)', padding: 14 }}
            >
              بيع USDT الفوري
            </a>
          </div>
        </article>
      </section>

      {/* Transaction History Section */}
      <section className="wallet-lower-grid" style={{ gridTemplateColumns: '1fr' }}>
        <article className="wallet-panel wallet-table-panel">
          <div className="wallet-table-toolbar">
            <h2>سجل معاملات المحفظة الفورية <span className="wallet-table-icon">▤</span></h2>
          </div>
          <div className="wallet-table-wrap">
            <table className="wallet-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>القيمة</th>
                  <th>العملة</th>
                  <th>الحالة</th>
                  <th>الرقم المرجعي</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.created_at).toLocaleDateString('ar-OM')}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {translationMap[tx.type] || tx.type}
                        </span>
                      </td>
                      <td style={{ direction: 'ltr', textAlign: 'right', fontWeight: 'bold', color: tx.amount < 0 ? '#f43f5e' : '#10b981' }}>
                        {tx.amount < 0 ? '' : '+'}{tx.amount.toLocaleString()}
                      </td>
                      <td>{tx.currency}</td>
                      <td>
                        <span className={`status-pill ${tx.status === 'completed' ? 'approved' : tx.status === 'pending' ? 'pending' : 'rejected'}`}>
                          {statusMap[tx.status] || tx.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{tx.reference}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>
                      لا توجد أي معاملات مسجلة في محفظتك حتى الآن.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {/* Compliance / Trust Strip */}
      <section className="wallet-trust-strip">
        <div>
          <b>أمان معزز ونظام مشفر</b>
          <span>جميع صفقات USDT محمية بمطابقة يدوية للتأكيد</span>
        </div>
        <div>
          <b>تحديثات لحظية دقيقة</b>
          <span>سحب وعرض بيانات CoinGecko بشكل آلي ومستمر</span>
        </div>
        <div>
          <b>تنفيذ سريع</b>
          <span>مراجعة إيداعاتك وسحوباتك خلال ساعات العمل الفورية</span>
        </div>
      </section>
    </main>
  );
}

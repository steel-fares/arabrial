'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Settings, Landmark, ShieldCheck, Check, X, LogOut, FileText, Activity } from 'lucide-react';

interface Setting {
  buy_spread_percent: number;
  sell_spread_percent: number;
  price_lock_seconds: number;
  min_transaction: number;
  max_transaction: number;
}

export default function AdminExchangePage() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'settings' | 'users' | 'history'>('pending');

  // Database lists
  const [pendingBuys, setPendingBuys] = useState<any[]>([]);
  const [pendingSells, setPendingSells] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [completedOrders, setCompletedOrders] = useState<any[]>([]);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  
  // Settings Form State
  const [settings, setSettings] = useState<Setting | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Modal/Action state
  const [actionNotes, setActionNotes] = useState<string>('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuthAndLoad() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        window.location.href = '/login.html?next=admin/exchange';
        return;
      }

      // Query profiles role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!profile || profile.role !== 'admin') {
        // Redirect non-admins to dashboard
        window.location.href = '/dashboard.html';
        return;
      }

      setIsAdmin(true);

      await Promise.all([
        loadSettings(),
        loadPendingRequests(),
        loadUsersData(),
        loadCompletedOrders(),
        loadPriceHistory()
      ]);

      setLoading(false);
    }
    checkAuthAndLoad();
  }, []);

  async function loadSettings() {
    const { data } = await supabase
      .from('usdt_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (data) {
      setSettings({
        buy_spread_percent: Number(data.buy_spread_percent),
        sell_spread_percent: Number(data.sell_spread_percent),
        price_lock_seconds: Number(data.price_lock_seconds),
        min_transaction: Number(data.min_transaction),
        max_transaction: Number(data.max_transaction)
      });
    }
  }

  async function loadPendingRequests() {
    // Load pending buy requests (with user details)
    const { data: buys } = await supabase
      .from('usdt_payment_requests')
      .select('*, profiles(email, full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    // Load pending sell requests (with user details)
    const { data: sells } = await supabase
      .from('usdt_withdrawal_requests')
      .select('*, profiles(email, full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (buys) setPendingBuys(buys);
    if (sells) setPendingSells(sells);
  }

  async function loadUsersData() {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*, wallets(*)');
    if (profiles) {
      setUsers(profiles);
    }
  }

  async function loadCompletedOrders() {
    const { data } = await supabase
      .from('usdt_orders')
      .select('*, profiles(email, full_name)')
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    if (data) {
      setCompletedOrders(data);
    }
  }

  async function loadPriceHistory() {
    const { data } = await supabase
      .from('usdt_price_history')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(20);
    if (data) {
      setPriceHistory(data);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);

    const { error } = await supabase
      .from('usdt_settings')
      .update({
        buy_spread_percent: settings.buy_spread_percent,
        sell_spread_percent: settings.sell_spread_percent,
        price_lock_seconds: settings.price_lock_seconds,
        min_transaction: settings.min_transaction,
        max_transaction: settings.max_transaction,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) {
      alert('فشل حفظ الإعدادات: ' + error.message);
    } else {
      alert('تم حفظ إعدادات التبادل بنجاح!');
    }
    setSavingSettings(false);
  }

  async function handleApproveBuy(requestId: string) {
    if (!window.confirm('هل أنت متأكد من تأكيد إيداع المبلغ المالي وإضافة رصيد USDT للمستخدم؟')) return;
    setProcessingId(requestId);

    const { error } = await supabase.rpc('admin_approve_usdt_buy', {
      p_request_id: requestId,
      p_admin_notes: actionNotes
    });

    if (error) {
      alert('خطأ في الموافقة: ' + error.message);
    } else {
      setActionNotes('');
      await loadPendingRequests();
      await loadUsersData();
      await loadCompletedOrders();
      alert('تم تأكيد الطلب وإضافة الرصيد للمستخدم بنجاح!');
    }
    setProcessingId(null);
  }

  async function handleRejectBuy(requestId: string) {
    if (!window.confirm('هل أنت متأكد من رفض الطلب وإلغائه؟')) return;
    setProcessingId(requestId);

    const { error } = await supabase.rpc('admin_reject_usdt_buy', {
      p_request_id: requestId,
      p_admin_notes: actionNotes
    });

    if (error) {
      alert('خطأ في الإلغاء: ' + error.message);
    } else {
      setActionNotes('');
      await loadPendingRequests();
      alert('تم رفض الطلب بنجاح.');
    }
    setProcessingId(null);
  }

  async function handleApproveSell(requestId: string) {
    if (!window.confirm('هل أنت متأكد من الموافقة وتأكيد تسليم المبلغ المالي OMR للمستخدم؟')) return;
    setProcessingId(requestId);

    const { error } = await supabase.rpc('admin_approve_usdt_sell', {
      p_request_id: requestId,
      p_admin_notes: actionNotes
    });

    if (error) {
      alert('خطأ في الموافقة: ' + error.message);
    } else {
      setActionNotes('');
      await loadPendingRequests();
      await loadUsersData();
      await loadCompletedOrders();
      alert('تم تأكيد تسليم المبلغ للمستخدم بنجاح!');
    }
    setProcessingId(null);
  }

  async function handleRejectSell(requestId: string) {
    if (!window.confirm('هل أنت متأكد من رفض الطلب وإعادة رصيد USDT المقفل لمحفظة المستخدم؟')) return;
    setProcessingId(requestId);

    const { error } = await supabase.rpc('admin_reject_usdt_sell', {
      p_request_id: requestId,
      p_admin_notes: actionNotes
    });

    if (error) {
      alert('خطأ في الرفض: ' + error.message);
    } else {
      setActionNotes('');
      await loadPendingRequests();
      await loadUsersData();
      alert('تم رفض طلب السحب وإعادة الرصيد للمستخدم بنجاح.');
    }
    setProcessingId(null);
  }

  // Profit calculations
  // Spread Revenue = usdt_amount * market_price * (spread / 100)
  const totalVolumeUsdt = completedOrders.reduce((sum, ord) => sum + Number(ord.usdt_amount), 0);
  const totalSpreadOmr = completedOrders.reduce((sum, ord) => {
    const revenue = Number(ord.usdt_amount) * Number(ord.market_price) * (Number(ord.spread_percent) / 100);
    return sum + revenue;
  }, 0);

  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  const dailySpreadOmr = completedOrders.filter(ord => new Date(ord.created_at) >= startOfToday).reduce((sum, ord) => {
    const revenue = Number(ord.usdt_amount) * Number(ord.market_price) * (Number(ord.spread_percent) / 100);
    return sum + revenue;
  }, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0,0,0,0);
  const monthlySpreadOmr = completedOrders.filter(ord => new Date(ord.created_at) >= startOfMonth).reduce((sum, ord) => {
    const revenue = Number(ord.usdt_amount) * Number(ord.market_price) * (Number(ord.spread_percent) / 100);
    return sum + revenue;
  }, 0);

  const activeUsersCount = new Set(completedOrders.map(ord => ord.user_id)).size;

  if (loading) {
    return (
      <main className="wallet-main" style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }}>
        <div className="admin-state-card admin-loading">تحميل لوحة التحكم الإدارية وأدوات التبادل...</div>
      </main>
    );
  }

  // Pre-formatting chart data for revenue visualization
  const revenueChartData = [...completedOrders].reverse().map(ord => ({
    date: new Date(ord.created_at).toLocaleDateString('ar-OM', { day: 'numeric', month: 'short' }),
    spreadRevenue: Number((Number(ord.usdt_amount) * Number(ord.market_price) * (Number(ord.spread_percent) / 100)).toFixed(3)),
    volume: Number(ord.usdt_amount)
  }));

  return (
    <main className="wallet-main app-page">
      <section className="wallet-hero" style={{ background: 'linear-gradient(135deg, #0d1220, #060910)' }}>
        <div className="wallet-hero-copy">
          <h1 style={{ color: 'var(--gold-light)' }}>لوحة تحكم إدارية</h1>
          <p>إدارة طلبات التبادل، الهوامش، والتحليلات المالية لـ USDT</p>
        </div>
      </section>

      {/* Analytics widgets grid */}
      <section className="wallet-summary-grid">
        <article className="wallet-metric">
          <div className="wallet-metric-icon green"><TrendingUp size={20} /></div>
          <small>أرباح الهوامش اليومية</small>
          <b>{dailySpreadOmr.toFixed(3)} OMR</b>
          <span>من التحويلات الفورية اليوم</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon green"><TrendingUp size={20} /></div>
          <small>أرباح الهوامش الشهرية</small>
          <b>{monthlySpreadOmr.toFixed(3)} OMR</b>
          <span>إجمالي أرباح هذا الشهر</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon blue"><Landmark size={20} /></div>
          <small>إجمالي أرباح الهوامش المجمعة</small>
          <b>{totalSpreadOmr.toFixed(3)} OMR</b>
          <span>منذ بدء تفعيل نظام USDT</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon blue"><Activity size={20} /></div>
          <small>إجمالي حجم التداول بالمنصة</small>
          <b>{totalVolumeUsdt.toLocaleString()} USDT</b>
          <span>تبادلات الشراء والبيع المكتملة</span>
        </article>

        <article className="wallet-metric">
          <div className="wallet-metric-icon blue"><Users size={20} /></div>
          <small>المتداولون النشطون</small>
          <b>{activeUsersCount} عميل</b>
          <span>أتموا صفقات تبادل بنجاح</span>
        </article>
      </section>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button 
          onClick={() => setActiveTab('pending')}
          className={`orders-tab ${activeTab === 'pending' ? 'active' : ''}`}
          style={{ padding: 14, background: 'transparent', border: 'none' }}
        >
          الطلبات المعلقة ({pendingBuys.length + pendingSells.length})
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`orders-tab ${activeTab === 'settings' ? 'active' : ''}`}
          style={{ padding: 14, background: 'transparent', border: 'none' }}
        >
          إعدادات الهوامش والعمولات
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={`orders-tab ${activeTab === 'users' ? 'active' : ''}`}
          style={{ padding: 14, background: 'transparent', border: 'none' }}
        >
          أرصدة وحسابات العملاء
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`orders-tab ${activeTab === 'history' ? 'active' : ''}`}
          style={{ padding: 14, background: 'transparent', border: 'none' }}
        >
          تاريخ التداولات والأسعار
        </button>
      </div>

      {/* TAB 1: PENDING REQUESTS */}
      {activeTab === 'pending' && (
        <section className="wallet-content-grid" style={{ gridTemplateColumns: '1fr' }}>
          {/* Pending Buys */}
          <article className="wallet-panel">
            <h2 style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between' }}>
              <span>طلبات شراء USDT المعلقة (تأكيد الإيداع)</span>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>تحديث تلقائي فوري</span>
            </h2>
            
            <div className="wallet-table-wrap">
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>العميل</th>
                    <th>مبلغ الدفع OMR</th>
                    <th>المستحق للمستخدم</th>
                    <th>طريقة الدفع/المرجع</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingBuys.length > 0 ? (
                    pendingBuys.map((req) => (
                      <tr key={req.id}>
                        <td>{new Date(req.created_at).toLocaleString('ar-OM')}</td>
                        <td>
                          <div><strong>{req.profiles?.full_name}</strong></div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{req.profiles?.email}</div>
                        </td>
                        <td style={{ fontWeight: 'bold', color: 'var(--gold-light)' }}>{Number(req.amount_omr).toFixed(3)} OMR</td>
                        <td style={{ fontWeight: 'bold', color: '#10b981' }}>{Number(req.usdt_amount).toFixed(2)} USDT</td>
                        <td>
                          <div>{req.payment_method}</div>
                          <div style={{ fontSize: '11px', color: 'var(--gold-light)' }}>المرجع: {req.payment_proof_url}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input 
                              placeholder="ملاحظات..."
                              style={{ width: 140, padding: 6, fontSize: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}
                              onChange={(e) => setActionNotes(e.target.value)}
                            />
                            <button 
                              className="btn-primary"
                              disabled={processingId === req.id}
                              onClick={() => handleApproveBuy(req.id)}
                              style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', background: '#10b981', color: '#fff' }}
                            >
                              <Check size={14} style={{ marginInlineEnd: 4 }} /> قبول
                            </button>
                            <button 
                              className="btn-primary"
                              disabled={processingId === req.id}
                              onClick={() => handleRejectBuy(req.id)}
                              style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', background: '#f43f5e', color: '#fff' }}
                            >
                              <X size={14} style={{ marginInlineEnd: 4 }} /> رفض
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                        لا توجد طلبات إيداع وشراء معلقة حالياً.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Pending Sells */}
          <article className="wallet-panel" style={{ marginTop: 24 }}>
            <h2 style={{ marginBottom: 15 }}>طلبات بيع وسحب USDT المعلقة (تأكيد تحويل OMR النقدي)</h2>
            <div className="wallet-table-wrap">
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>العميل</th>
                    <th>قيمة السحب المستلمة</th>
                    <th>المطلوب دفعه للمستخدم</th>
                    <th>الحساب البنكي للتسليم</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSells.length > 0 ? (
                    pendingSells.map((req) => (
                      <tr key={req.id}>
                        <td>{new Date(req.created_at).toLocaleString('ar-OM')}</td>
                        <td>
                          <div><strong>{req.profiles?.full_name}</strong></div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{req.profiles?.email}</div>
                        </td>
                        <td style={{ fontWeight: 'bold', color: '#f43f5e' }}>{Number(req.usdt_amount).toFixed(2)} USDT</td>
                        <td style={{ fontWeight: 'bold', color: 'var(--gold-light)' }}>{Number(req.amount_omr).toFixed(3)} OMR</td>
                        <td style={{ maxWidth: '200px', fontSize: '12px' }}>
                          <span style={{ display: 'block', wordBreak: 'break-all' }}>{req.wallet_address}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input 
                              placeholder="ملاحظات..."
                              style={{ width: 140, padding: 6, fontSize: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}
                              onChange={(e) => setActionNotes(e.target.value)}
                            />
                            <button 
                              className="btn-primary"
                              disabled={processingId === req.id}
                              onClick={() => handleApproveSell(req.id)}
                              style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', background: '#10b981', color: '#fff' }}
                            >
                              <Check size={14} style={{ marginInlineEnd: 4 }} /> أكمل الدفع
                            </button>
                            <button 
                              className="btn-primary"
                              disabled={processingId === req.id}
                              onClick={() => handleRejectSell(req.id)}
                              style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', background: '#f43f5e', color: '#fff' }}
                            >
                              <X size={14} style={{ marginInlineEnd: 4 }} /> رفض وإرجاع
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                        لا توجد طلبات سحب وبيع معلقة حالياً.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {/* TAB 2: SETTINGS MANAGEMENT */}
      {activeTab === 'settings' && settings && (
        <section className="wallet-content-grid" style={{ gridTemplateColumns: '1fr' }}>
          <article className="wallet-panel" style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <h2>إدارة عمولات وهوامش التبادل</h2>
            <p style={{ marginBottom: 20 }}>تؤثر هذه القيم مباشرة وبشكل فوري على أسعار البيع والشراء المعروضة للعملاء.</p>

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="fgroup">
                <label>هامش الشراء (Buy Spread) %</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.buy_spread_percent}
                  onChange={(e) => setSettings({ ...settings, buy_spread_percent: Number(e.target.value) })}
                />
                <small style={{ color: 'var(--muted)' }}>سعر الشراء للعميل = سعر السوق المباشر + هامش الشراء</small>
              </div>

              <div className="fgroup">
                <label>هامش البيع (Sell Spread) %</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={settings.sell_spread_percent}
                  onChange={(e) => setSettings({ ...settings, sell_spread_percent: Number(e.target.value) })}
                />
                <small style={{ color: 'var(--muted)' }}>سعر البيع للعميل = سعر السوق المباشر - هامش البيع</small>
              </div>

              <div className="fgroup">
                <label>مدة قفل السعر المؤقت (ثوانٍ)</label>
                <input 
                  type="number" 
                  value={settings.price_lock_seconds}
                  onChange={(e) => setSettings({ ...settings, price_lock_seconds: Number(e.target.value) })}
                />
                <small style={{ color: 'var(--muted)' }}>المدة الزمنية الممنوحة للعميل لإكمال المعاملة بالسعر المغلق قبل تجديده</small>
              </div>

              <div className="fgroup">
                <label>الحد الأدنى للصفقة الواحدة (USDT)</label>
                <input 
                  type="number" 
                  value={settings.min_transaction}
                  onChange={(e) => setSettings({ ...settings, min_transaction: Number(e.target.value) })}
                />
              </div>

              <div className="fgroup">
                <label>الحد الأقصى للصفقة الواحدة (USDT)</label>
                <input 
                  type="number" 
                  value={settings.max_transaction}
                  onChange={(e) => setSettings({ ...settings, max_transaction: Number(e.target.value) })}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ marginTop: 10, padding: 14 }}
                disabled={savingSettings}
              >
                {savingSettings ? 'جاري الحفظ...' : 'حفظ التعديلات وتطبيقها فورا'}
              </button>
            </form>
          </article>
        </section>
      )}

      {/* TAB 3: USER ACCOUNTS AND WALLETS */}
      {activeTab === 'users' && (
        <section className="wallet-content-grid" style={{ gridTemplateColumns: '1fr' }}>
          <article className="wallet-panel">
            <h2>محافظ وأرصدة حسابات العملاء المسجلين</h2>
            <div className="wallet-table-wrap">
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th>حالة الحساب</th>
                    <th>رصيد ARBR</th>
                    <th>رصيد USDT</th>
                    <th>المجموع التقديري بالريال</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? (
                    users.map((u) => {
                      const arbr = Number(u.wallets?.arbr_balance || 0);
                      const usdt = Number(u.wallets?.usdt_balance || 0);
                      const estimatedOmr = (arbr * 0.0385) + (usdt * 0.385);
                      return (
                        <tr key={u.id}>
                          <td>
                            <div><strong>{u.full_name || 'مستخدم بلا اسم'}</strong></div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{u.email}</div>
                          </td>
                          <td>
                            <span className={`status-pill ${u.account_status === 'active' ? 'approved' : 'rejected'}`}>
                              {u.account_status === 'active' ? 'نشط' : 'معطل'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 'bold' }}>{arbr.toLocaleString()} ARBR</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--gold-light)' }}>{usdt.toLocaleString()} USDT</td>
                          <td style={{ fontWeight: 'bold', color: 'var(--gold-soft)' }}>{estimatedOmr.toFixed(3)} OMR</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                        لا توجد حسابات مسجلة بالمنصة حالياً.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {/* TAB 4: STATISTICS & LOG HISTORY */}
      {activeTab === 'history' && (
        <section className="wallet-content-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Price History Line Graph */}
          <article className="wallet-panel">
            <h2>أرباح وعائدات الهوامش اليومية</h2>
            <p style={{ marginBottom: 15 }}>حجم العائدات بالريال العماني مقترنا بحجم المعاملات المكتملة</p>
            
            <div style={{ width: '100%', height: 240 }}>
              {revenueChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChartData}>
                    <XAxis dataKey="date" stroke="#4a5a7a" tickLine={false} />
                    <YAxis stroke="#4a5a7a" tickLine={false} />
                    <Tooltip contentStyle={{ background: '#0d1220', border: '1px solid #1a2540', color: '#cdd6f0' }} />
                    <Line type="monotone" dataKey="spreadRevenue" stroke="#10b981" strokeWidth={2.5} name="العائد بالريال OMR" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
                  لا تتوفر صفقات مكتملة لعرض تحليلات الأرباح حالياً
                </div>
              )}
            </div>
          </article>

          {/* Historical rates table */}
          <article className="wallet-panel">
            <h2>أرشيف تحديثات الأسعار الفورية</h2>
            <div className="wallet-table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
              <table className="wallet-table">
                <thead>
                  <tr>
                    <th>تاريخ التسجيل</th>
                    <th>سعر السوق (USD)</th>
                    <th>سعر الشراء (OMR)</th>
                    <th>سعر البيع (OMR)</th>
                    <th>المصدر</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: '11px' }}>{new Date(p.recorded_at).toLocaleTimeString('ar-OM')}</td>
                      <td>${Number(p.market_price_usd).toFixed(4)}</td>
                      <td style={{ color: '#10b981', fontWeight: 'bold' }}>{Number(p.buy_price_omr).toFixed(4)}</td>
                      <td style={{ color: '#f43f5e', fontWeight: 'bold' }}>{Number(p.sell_price_omr).toFixed(4)}</td>
                      <td style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

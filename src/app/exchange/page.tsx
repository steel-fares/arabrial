'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Shield, ArrowRightLeft, CreditCard, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

export default function ExchangePage() {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [usdtAmount, setUsdtAmount] = useState<number>(100);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [livePrices, setLivePrices] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [paymentMethod, setPaymentMethod] = useState('حوالة بنكية محلية (Local Bank Transfer)');
  const [paymentProof, setPaymentProof] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [accountName, setAccountName] = useState('');

  // Result state
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. URL Mode check
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const urlMode = searchParams.get('mode');
      if (urlMode === 'buy' || urlMode === 'sell') {
        setMode(urlMode);
      }
    }
  }, []);

  // 2. Fetch prices and start timer
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        window.location.href = '/login.html?next=exchange';
        return;
      }
      
      // Load user wallet USDT balance
      const { data: wal } = await supabase
        .from('wallets')
        .select('usdt_balance')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (wal) {
        setWalletBalance(Number(wal.usdt_balance || 0));
      }

      await loadPrices();
      setLoading(false);
    }
    init();

    return () => stopTimer();
  }, [mode]);

  // 3. Countdown timer handler
  useEffect(() => {
    if (timeLeft <= 0) {
      stopTimer();
      return;
    }
    
    timerRef.current = setTimeout(() => {
      setTimeLeft(t => t - 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft]);

  async function loadPrices() {
    try {
      const res = await fetch('/api/usdt-price');
      if (res.ok) {
        const data = await res.json();
        setLivePrices(data);
        setTimeLeft(data.price_lock_seconds || 60);
      }
    } catch (e) {
      console.error('Failed to load prices:', e);
    }
  }

  function startTimer(seconds: number) {
    stopTimer();
    setTimeLeft(seconds);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function handleRequote() {
    setLoading(true);
    await loadPrices();
    setLoading(false);
  }

  const currentPrice = mode === 'buy' ? livePrices?.buy_price_omr : livePrices?.sell_price_omr;
  const rawTotalOmr = usdtAmount * (currentPrice || 0.385);
  const totalOmr = Number(rawTotalOmr.toFixed(3));

  // Validations
  const minTx = livePrices?.min_transaction || 10;
  const maxTx = livePrices?.max_transaction || 10000;
  const isAmountValid = usdtAmount >= minTx && usdtAmount <= maxTx;
  const hasSufficientBalance = mode === 'buy' || walletBalance >= usdtAmount;

  async function handleGoToStep2() {
    if (!isAmountValid) return;
    if (!hasSufficientBalance) return;
    setStep(2);
  }

  async function handleSubmitOrder() {
    if (timeLeft <= 0) return;
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const orderPayload = {
        user_id: session.user.id,
        order_type: mode,
        usdt_amount: usdtAmount,
        market_price: livePrices.market_price_omr,
        spread_percent: mode === 'buy' ? livePrices.buy_spread_percent : livePrices.sell_spread_percent,
        final_price: currentPrice,
        final_payout_omr: totalOmr,
        status: 'pending',
        expires_at: new Date(Date.now() + timeLeft * 1000).toISOString()
      };

      // 1. Create Order
      const { data: order, error: orderError } = await supabase
        .from('usdt_orders')
        .insert(orderPayload)
        .select('*')
        .single();

      if (orderError) throw orderError;

      // 2. Submit payment or withdrawal request
      if (mode === 'buy') {
        const { error: payError } = await supabase
          .from('usdt_payment_requests')
          .insert({
            order_id: order.id,
            user_id: session.user.id,
            amount_omr: totalOmr,
            usdt_amount: usdtAmount,
            payment_method: paymentMethod,
            payment_proof_url: paymentProof || 'Local Bank Transfer Reference'
          });

        if (payError) throw payError;
      } else {
        const { error: withdrawError } = await supabase
          .from('usdt_withdrawal_requests')
          .insert({
            order_id: order.id,
            user_id: session.user.id,
            usdt_amount: usdtAmount,
            amount_omr: totalOmr,
            wallet_address: `${bankName} | IBAN: ${bankIban} | Name: ${accountName}`
          });

        if (withdrawError) throw withdrawError;
      }

      setCreatedOrder(order);
      setStep(3);
      stopTimer();
    } catch (e: any) {
      alert('حدث خطأ أثناء تسجيل طلب التبادل: ' + (e.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="wallet-main" style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }}>
        <div className="admin-state-card admin-loading">تحميل حاسبة التبادل وأسعار الصرف...</div>
      </main>
    );
  }

  return (
    <main className="page-main app-page">
      <section className="sec" style={{ paddingTop: '40px', maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 className="sec-title" style={{ marginBottom: '8px' }}>
            {mode === 'buy' ? 'شراء USDT' : 'بيع USDT'} <span>فوري</span>
          </h2>
          <p className="sec-desc">تبادل الأصول الرقمية بالريال العماني مع نظام حماية السعر المؤقت</p>
        </div>

        {/* Wizard Header Progress */}
        <div className="buy-wizard-header" style={{ marginBottom: '24px' }}>
          <div className="buy-steps-container" style={{ maxWidth: '480px' }}>
            <div className={`buy-step-item ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`}>
              <div className="buy-step-circle">1</div>
              <div className="buy-step-label">أدخل الكمية</div>
            </div>
            <div className={`buy-step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`}>
              <div className="buy-step-circle">2</div>
              <div className="buy-step-label">تأكيد الدفع</div>
            </div>
            <div className={`buy-step-item ${step === 3 ? 'completed' : ''}`}>
              <div className="buy-step-circle">3</div>
              <div className="buy-step-label">اكتمال الطلب</div>
            </div>
          </div>
        </div>

        {/* Price Lock Bar */}
        {step < 3 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            background: timeLeft > 0 ? 'rgba(201,168,76,0.06)' : 'rgba(244,63,94,0.08)',
            border: `1px solid ${timeLeft > 0 ? 'var(--gold-light)' : '#f43f5e'}`,
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {timeLeft > 0 ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--gold-light)', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
                  <span style={{ fontSize: '13px', color: 'var(--light)' }}>السعر مقفل حالياً للمطابقة الفورية</span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} color="#f43f5e" />
                  <span style={{ fontSize: '13px', color: '#f43f5e', fontWeight: 'bold' }}>انتهت صلاحية السعر المالي المقفل</span>
                </>
              )}
            </div>

            {timeLeft > 0 ? (
              <span style={{ fontWeight: 'bold', color: 'var(--gold-light)' }}>
                {timeLeft} ثانية متبقية
              </span>
            ) : (
              <button 
                className="btn-primary" 
                style={{ padding: '6px 12px', fontSize: '12px', boxShadow: 'none' }}
                onClick={handleRequote}
              >
                تحديث السعر
              </button>
            )}
          </div>
        )}

        {/* STEP 1: CALCULATE AMOUNT */}
        {step === 1 && (
          <div className="panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <button 
                onClick={() => setMode('buy')}
                className={`orders-tab ${mode === 'buy' ? 'active' : ''}`}
                style={{ flex: 1, padding: 10, border: 'none', background: 'transparent' }}
              >
                شراء USDT بالريال
              </button>
              <button 
                onClick={() => setMode('sell')}
                className={`orders-tab ${mode === 'sell' ? 'active' : ''}`}
                style={{ flex: 1, padding: 10, border: 'none', background: 'transparent' }}
              >
                بيع USDT بالريال
              </button>
            </div>

            <div className="fgroup">
              <label>الكمية بـ Tether (USDT)</label>
              <div className="buy-input-wrapper">
                <input 
                  type="number" 
                  value={usdtAmount} 
                  onChange={(e) => setUsdtAmount(Number(e.target.value))}
                  className="buy-input-field" 
                  min={minTx}
                  max={maxTx}
                />
                <span className="buy-input-currency-label">USDT</span>
              </div>
            </div>

            {mode === 'sell' && (
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '-8px', marginBottom: '14px' }}>
                رصيدك المتوفر: <strong style={{ color: 'var(--gold-light)' }}>{walletBalance.toLocaleString()} USDT</strong>
              </div>
            )}

            {/* Calculations Box */}
            <div style={{ 
              background: 'rgba(0,0,0,0.15)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px', 
              padding: '16px',
              marginBottom: '24px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', paddingBottom: '8px', borderBottom: '1px dashed var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>سعر الصرف (شامل الهامش)</span>
                <strong style={{ color: 'var(--light)' }}>1 USDT = {currentPrice?.toFixed(6)} OMR</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>الكمية المراد {mode === 'buy' ? 'شراؤها' : 'بيعها'}</span>
                <strong style={{ color: 'var(--light)' }}>{usdtAmount.toLocaleString()} USDT</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', paddingTop: '10px' }}>
                <span style={{ color: 'var(--gold-light)', fontWeight: 'bold' }}>{mode === 'buy' ? 'إجمالي المبلغ المطلوب دفعه' : 'المبلغ المتوقع استلامه'}</span>
                <strong style={{ color: 'var(--gold-light)', fontSize: '20px', fontWeight: '900' }}>{totalOmr.toLocaleString()} OMR</strong>
              </div>
            </div>

            {/* Error notifications */}
            {!isAmountValid && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f43f5e', fontSize: '13px', marginBottom: '15px' }}>
                <AlertCircle size={16} />
                <span>الكمية يجب أن تكون بين {minTx} و {maxTx} USDT للعملية الواحدة.</span>
              </div>
            )}

            {!hasSufficientBalance && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f43f5e', fontSize: '13px', marginBottom: '15px' }}>
                <AlertCircle size={16} />
                <span>رصيدك الحالي غير كافٍ لإتمام عملية البيع المقترحة.</span>
              </div>
            )}

            <button 
              className="btn-primary" 
              style={{ width: '100%', padding: '14px', fontSize: '15px' }}
              disabled={!isAmountValid || !hasSufficientBalance || timeLeft <= 0}
              onClick={handleGoToStep2}
            >
              المتابعة ومراجعة الطلب →
            </button>
          </div>
        )}

        {/* STEP 2: PAYMENT OR PAYOUT INFO */}
        {step === 2 && (
          <div className="panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '17px', marginBottom: '18px' }}>
              {mode === 'buy' ? 'تعليمات إيداع ودفع OMR' : 'تفاصيل استلام الأرباح النقدية OMR'}
            </h3>

            {mode === 'buy' ? (
              <>
                <div style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px', 
                  padding: '16px',
                  marginBottom: '20px',
                  fontSize: '13.5px',
                  lineHeight: '1.7'
                }}>
                  <p style={{ color: 'var(--gold-light)', fontWeight: 'bold', marginBottom: '8px' }}>حساب التحويل البنكي للمنصة:</p>
                  <div><strong>اسم البنك:</strong> بنك مسقط (Bank Muscat)</div>
                  <div><strong>اسم الحساب:</strong> ARBR Exchange</div>
                  <div><strong>رقم الحساب:</strong> 0300-123456-084</div>
                  <div><strong>رقم الايبان (IBAN):</strong> OM93 BMSC 0000 0003 0012 3456 084</div>
                  <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px', color: 'var(--muted)' }}>
                    الرجاء تحويل المبلغ المالي الدقيق (<strong style={{ color: 'var(--light)' }}>{totalOmr} OMR</strong>) ثم كتابة الرقم المرجعي للتحويل بالأسفل للتأكيد الفوري.
                  </div>
                </div>

                <div className="fgroup">
                  <label>طريقة التحويل المستخدمة</label>
                  <select 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ WebkitAppearance: 'listbox' }}
                  >
                    <option>حوالة بنكية محلية (Local Bank Transfer)</option>
                    <option>إيداع نقدي فوري بالصراف الآلي</option>
                  </select>
                </div>

                <div className="fgroup">
                  <label>الرقم المرجعي للتحويل المالي</label>
                  <input 
                    placeholder="رقم التحويل أو مرجع المعاملة البنكية"
                    value={paymentProof}
                    onChange={(e) => setPaymentProof(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '12px', 
                  padding: '16px',
                  marginBottom: '20px',
                  fontSize: '13.5px',
                  color: 'var(--muted)'
                }}>
                  عند إرسال هذا الطلب، سيتم خصم وقفل <strong style={{ color: 'var(--light)' }}>{usdtAmount} USDT</strong> من محفظتك مباشرة. ستقوم الإدارة بمراجعة الحساب وتأكيد إيداع المبلغ المالي (<strong style={{ color: 'var(--light)' }}>{totalOmr} OMR</strong>) إلى حسابك البنكي المكتوب بالأسفل.
                </div>

                <div className="fgroup">
                  <label>اسم البنك الخاص بك</label>
                  <input 
                    placeholder="مثال: بنك مسقط"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>

                <div className="fgroup">
                  <label>رقم الحساب أو الآيبان (IBAN)</label>
                  <input 
                    placeholder="OM..."
                    value={bankIban}
                    onChange={(e) => setBankIban(e.target.value)}
                  />
                </div>

                <div className="fgroup">
                  <label>الاسم الكامل لصاحب الحساب البنكي</label>
                  <input 
                    placeholder="اكتب الاسم كما هو مسجل بالبنك"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn-wizard-back" 
                style={{ flex: 1, border: '1px solid var(--border)', background: 'transparent' }}
                onClick={() => setStep(1)}
              >
                رجوع وتعديل
              </button>
              
              <button 
                className="btn-primary" 
                style={{ flex: 2, padding: '12px' }}
                disabled={submitting || timeLeft <= 0}
                onClick={handleSubmitOrder}
              >
                {submitting ? 'جاري إرسال الطلب...' : '🪙 تأكيد وإرسال الطلب'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS OVERLAY */}
        {step === 3 && (
          <div className="panel success-card" style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div className="success-icon-wrap" style={{ display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={40} color="var(--green)" />
            </div>

            <h3 style={{ color: 'var(--green)', fontSize: '22px', marginBottom: '12px' }}>تم إرسال الطلب بنجاح!</h3>
            <p style={{ color: 'var(--light)', fontSize: '14px', lineHeight: '1.8', marginBottom: '24px' }}>
              لقد سجلنا طلب التبادل الخاص بك. ستقوم الإدارة بمطابقة المعاملة المالية يدوياً وإيداع الأرصدة إلى حسابك بمجرد التحقق.
            </p>

            <div style={{ 
              background: 'rgba(0, 0, 0, 0.2)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px', 
              padding: '16px', 
              marginBottom: '24px',
              textAlign: 'right',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>رقم الطلب (Order ID):</span>
                <strong style={{ color: 'var(--gold-light)', fontFamily: 'monospace' }}>
                  #ORD-{createdOrder?.id?.slice(-6).toUpperCase()}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>نوع المعاملة:</span>
                <strong style={{ color: 'var(--light)' }}>{mode === 'buy' ? 'شراء USDT' : 'بيع USDT'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>القيمة الإجمالية:</span>
                <strong style={{ color: 'var(--gold-light)' }}>{totalOmr} OMR</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--muted)' }}>الحالة:</span>
                <span className="status-pill pending">قيد المراجعة والتحقق</span>
              </div>
            </div>

            <button 
              className="btn-primary" 
              style={{ width: '100%', padding: '12px' }}
              onClick={() => window.location.href = '/wallet'}
            >
              الذهاب إلى محفظتي الرقمية
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

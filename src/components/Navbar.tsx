'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Profile {
  full_name: string;
  email: string;
  role: string;
}

interface Wallet {
  arbr_balance: number;
  usdt_balance: number;
}

export default function Navbar() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Get current session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setCurrentUser(data.session.user);
        loadUserData(data.session.user.id);
      }
    });

    // 2. Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        loadUserData(session.user.id);
      } else {
        setCurrentUser(null);
        setProfile(null);
        setWallet(null);
      }
    });

    // 3. Handle click outside menu
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  async function loadUserData(userId: string) {
    // Load profile
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (prof) setProfile(prof);

    // Load wallet
    const { data: wal } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (wal) setWallet(wal);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
  }

  const displayName = profile?.full_name || currentUser?.email || 'مستخدم ARBR';
  const arbrBalance = wallet?.arbr_balance || 0;
  const usdtBalance = wallet?.usdt_balance || 0;

  return (
    <nav className="nav-container">
      <div className="nav-start">
        <a className="logo" href="/index.html">
          <div className="logo-mark">
            <img src="/logo-aa.png" alt="Arab Rial ARBR logo" width="46" height="46" />
          </div>
          <div className="logo-text">
            <b>ARBR</b>
            <small>The Digital Asset</small>
          </div>
        </a>
        <button 
          className="nav-toggle" 
          type="button" 
          onClick={() => setNavOpen(!navOpen)}
          aria-expanded={navOpen}
        >
          ☰
        </button>
      </div>

      <ul className={`nav-links ${navOpen ? 'open' : ''}`} id="navLinks">
        <li><a href="/index.html">الرئيسية</a></li>
        <li><a href="/buy.html">شراء ARBR</a></li>
        <li><a href="/wallet">المحفظة</a></li>
        <li><a href="/p2p.html">P2P</a></li>
        <li><a href="/orders.html">طلباتي</a></li>
        {profile?.role === 'admin' && (
          <li><a href="/admin/exchange" className="admin-nav-link" style={{ color: 'var(--gold-light)' }}>إدارة المنصة</a></li>
        )}
      </ul>

      <div className="nav-actions">
        <button className="lang-btn" type="button">English</button>
        
        <a className="phone-icon-link" href="/support.html" aria-label="Support" title="Support">☎</a>

        {!currentUser ? (
          <a className="btn-primary" id="headerLoginBtn" href="/login.html">تسجيل الدخول</a>
        ) : (
          <div className="user-menu-wrap" ref={menuRef}>
            <button 
              className="user-box" 
              type="button" 
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="user-avatar">AR</span>
              <span>
                <strong>مرحباً، {displayName.split(' ')[0]}</strong>
                <small>رصيدك: {arbrBalance.toLocaleString()} ARBR | {usdtBalance.toLocaleString()} USDT</small>
              </span>
            </button>

            {menuOpen && (
              <div className="user-menu open" id="userMenu">
                <a className="menu-item" href="/dashboard.html">
                  <span>لوحة التحكم</span><span>↙</span>
                </a>
                <a className="menu-item" href="/orders.html">
                  <span>طلباتي</span><span>↙</span>
                </a>
                <a className="menu-item" href="/wallet">
                  <span>المحفظة</span><span>↙</span>
                </a>
                <a className="menu-item" href="/p2p.html">
                  <span>P2P</span><span>↙</span>
                </a>
                <a className="menu-item" href="/kyc.html">
                  <span>KYC</span><span>↙</span>
                </a>
                <button className="menu-item danger" type="button" onClick={handleLogout}>
                  <span>تسجيل الخروج</span><span>×</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

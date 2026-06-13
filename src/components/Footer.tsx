'use client';

import React from 'react';

export default function Footer() {
  return (
    <footer>
      <div className="footer-logo">ARBR</div>
      <div className="footer-subtitle">THE DIGITAL ASSET</div>
      <div className="footer-links" aria-label="Legal and support links">
        <a href="/wallet">المحفظة</a>
        <a href="/how-it-works.html">كيف يعمل ريال عربي؟</a>
        <a href="/terms.html">الشروط والأحكام</a>
        <a href="/privacy.html">سياسة الخصوصية</a>
        <a href="/refund-policy.html">سياسة الاسترداد</a>
        <a href="/kyc-policy.html">سياسة التحقق KYC</a>
        <a href="/support.html">الدعم والتواصل</a>
      </div>
      <p className="footer-notice">
        <span lang="ar" dir="rtl">تنبيه: سعر ARBR متغير وقد يرتفع أو ينخفض. ARBR ليس عملة رسمية ولا يضمن الربح أو الاسترداد.</span>
        <span lang="en" dir="ltr">Notice: ARBR price may move up or down. ARBR is not an official currency and does not guarantee profit or redemption.</span>
      </p>
      <div>© 2026 ARBR Network. All Rights Reserved.</div>
    </footer>
  );
}

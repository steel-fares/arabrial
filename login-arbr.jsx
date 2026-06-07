import { useState } from "react";

const ARBR_GOLD = "#c9a84c";
const ARBR_GOLD_DIM = "#a8893d";
const ARBR_BG = "#060910";
const ARBR_CARD = "#0d1220";
const ARBR_BORDER = "#1a2540";
const ARBR_MUTED = "#4a5a7a";
const ARBR_TEXT = "#cdd6f0";

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .arbr-root {
    min-height: 100vh;
    background: ${ARBR_BG};
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Inter', sans-serif;
    color: ${ARBR_TEXT};
    position: relative;
    overflow: hidden;
    padding: 24px 16px;
  }

  /* Background grid + glow */
  .arbr-root::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(201,168,76,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(201,168,76,0.04) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    z-index: 0;
  }
  .arbr-root::after {
    content: '';
    position: fixed;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 600px;
    background: radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .arbr-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 420px;
    background: ${ARBR_CARD};
    border: 1px solid ${ARBR_BORDER};
    border-radius: 16px;
    padding: 40px 36px;
    box-shadow: 0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.06);
    animation: cardIn 0.5s cubic-bezier(.22,1,.36,1);
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Logo */
  .arbr-logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
    justify-content: center;
  }
  .arbr-logo img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
  .arbr-logo-text {
    font-family: 'Cinzel', serif;
    font-size: 20px;
    font-weight: 700;
    color: ${ARBR_GOLD};
    letter-spacing: 2px;
  }
  .arbr-logo-sub {
    font-size: 10px;
    color: ${ARBR_MUTED};
    letter-spacing: 1px;
    text-align: center;
    text-transform: uppercase;
    margin-top: 2px;
  }

  /* Divider */
  .arbr-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, ${ARBR_BORDER}, transparent);
    margin: 0 -36px 28px;
  }

  /* Tab switcher */
  .arbr-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: rgba(255,255,255,0.03);
    border: 1px solid ${ARBR_BORDER};
    border-radius: 10px;
    padding: 3px;
    margin-bottom: 28px;
    gap: 2px;
  }
  .arbr-tab {
    padding: 9px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${ARBR_MUTED};
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 0.3px;
  }
  .arbr-tab.active {
    background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08));
    color: ${ARBR_GOLD};
    border: 1px solid rgba(201,168,76,0.2);
    font-weight: 600;
  }
  .arbr-tab:hover:not(.active) {
    color: ${ARBR_TEXT};
    background: rgba(255,255,255,0.04);
  }

  /* Method switcher (Login sub-tabs) */
  .arbr-method-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 22px;
  }
  .arbr-method-btn {
    flex: 1;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid ${ARBR_BORDER};
    background: transparent;
    color: ${ARBR_MUTED};
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .arbr-method-btn.active {
    border-color: rgba(201,168,76,0.35);
    color: ${ARBR_GOLD};
    background: rgba(201,168,76,0.06);
  }
  .arbr-method-btn:hover:not(.active) {
    border-color: #2a3a5a;
    color: ${ARBR_TEXT};
  }

  /* Form fields */
  .arbr-field {
    margin-bottom: 14px;
  }
  .arbr-label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: ${ARBR_MUTED};
    margin-bottom: 6px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .arbr-input {
    width: 100%;
    padding: 11px 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid ${ARBR_BORDER};
    border-radius: 9px;
    color: ${ARBR_TEXT};
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .arbr-input:focus {
    border-color: rgba(201,168,76,0.45);
    box-shadow: 0 0 0 3px rgba(201,168,76,0.08);
  }
  .arbr-input::placeholder { color: ${ARBR_MUTED}; opacity: 0.7; }

  .arbr-input-group {
    display: flex;
    gap: 8px;
  }
  .arbr-input-group .arbr-input { flex: 1; }

  /* Password hint */
  .arbr-hint {
    font-size: 11px;
    color: ${ARBR_MUTED};
    margin-top: 5px;
    line-height: 1.4;
  }

  /* Forgot */
  .arbr-forgot {
    display: block;
    text-align: right;
    font-size: 12px;
    color: ${ARBR_MUTED};
    text-decoration: none;
    margin-top: -6px;
    margin-bottom: 18px;
    transition: color 0.2s;
  }
  .arbr-forgot:hover { color: ${ARBR_GOLD}; }

  /* Primary button */
  .arbr-btn-primary {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #c9a84c, #a8893d);
    color: #060910;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
    box-shadow: 0 4px 20px rgba(201,168,76,0.25);
    margin-bottom: 14px;
  }
  .arbr-btn-primary:hover {
    opacity: 0.92;
    transform: translateY(-1px);
    box-shadow: 0 6px 28px rgba(201,168,76,0.35);
  }
  .arbr-btn-primary:active { transform: translateY(0); }

  /* Secondary button (OTP send) */
  .arbr-btn-secondary {
    padding: 11px 16px;
    border-radius: 9px;
    border: 1px solid rgba(201,168,76,0.3);
    background: rgba(201,168,76,0.08);
    color: ${ARBR_GOLD};
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }
  .arbr-btn-secondary:hover {
    background: rgba(201,168,76,0.15);
    border-color: rgba(201,168,76,0.5);
  }
  .arbr-btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Separator */
  .arbr-sep {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 2px 0 14px;
    font-size: 11px;
    color: ${ARBR_MUTED};
  }
  .arbr-sep::before, .arbr-sep::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${ARBR_BORDER};
  }

  /* Google button */
  .arbr-btn-google {
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    border: 1px solid ${ARBR_BORDER};
    background: rgba(255,255,255,0.03);
    color: ${ARBR_TEXT};
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .arbr-btn-google:hover {
    background: rgba(255,255,255,0.06);
    border-color: #2a3a5a;
  }

  /* Footer */
  .arbr-footer {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid ${ARBR_BORDER};
    text-align: center;
    font-size: 11px;
    color: ${ARBR_MUTED};
    letter-spacing: 0.3px;
  }
  .arbr-footer strong {
    font-family: 'Cinzel', serif;
    color: rgba(201,168,76,0.5);
    font-size: 12px;
    letter-spacing: 2px;
  }

  /* Info box */
  .arbr-info {
    background: rgba(201,168,76,0.05);
    border: 1px solid rgba(201,168,76,0.15);
    border-radius: 9px;
    padding: 10px 14px;
    font-size: 12px;
    color: rgba(201,168,76,0.8);
    margin-bottom: 16px;
    line-height: 1.5;
  }

  /* OTP boxes */
  .arbr-otp-row {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  .arbr-otp-input {
    flex: 1;
    padding: 14px 6px;
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    background: rgba(255,255,255,0.03);
    border: 1px solid ${ARBR_BORDER};
    border-radius: 9px;
    color: ${ARBR_GOLD};
    font-family: 'Inter', sans-serif;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .arbr-otp-input:focus {
    border-color: rgba(201,168,76,0.45);
    box-shadow: 0 0 0 3px rgba(201,168,76,0.08);
  }

  /* Fade animation */
  .fade-in {
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Select */
  .arbr-select {
    width: 100%;
    padding: 11px 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid ${ARBR_BORDER};
    border-radius: 9px;
    color: ${ARBR_TEXT};
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    outline: none;
    appearance: none;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .arbr-select:focus {
    border-color: rgba(201,168,76,0.45);
    box-shadow: 0 0 0 3px rgba(201,168,76,0.08);
  }
`;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const MailIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);

const PhoneIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1 19.79 19.79 0 0 1 1.58 4.49 2 2 0 0 1 3.56 2.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.02-.9a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

export default function ARBRLogin() {
  const [tab, setTab] = useState("login"); // login | register
  const [loginMethod, setLoginMethod] = useState("email"); // email | phone
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const startCountdown = () => {
    setOtpSent(true);
    setCountdown(60);
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const handleOtpChange = (i, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="arbr-root">
        <div className="arbr-card">
          {/* Logo */}
          <div className="arbr-logo">
            <img src="https://arab-rial.com/logo-aa.png" alt="ARBR" onError={e => e.target.style.display='none'} />
            <div>
              <div className="arbr-logo-text">ARBR</div>
              <div className="arbr-logo-sub">Account Portal</div>
            </div>
          </div>

          <div className="arbr-divider" />

          {/* Tab switcher */}
          <div className="arbr-tabs">
            <button className={`arbr-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>
              Login
            </button>
            <button className={`arbr-tab ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")}>
              Create Account
            </button>
          </div>

          {/* ─── LOGIN ─── */}
          {tab === "login" && (
            <div className="fade-in">
              {/* Method switcher */}
              <div className="arbr-method-tabs">
                <button
                  className={`arbr-method-btn ${loginMethod === "email" ? "active" : ""}`}
                  onClick={() => { setLoginMethod("email"); setOtpSent(false); }}
                >
                  <MailIcon /> Email & Password
                </button>
                <button
                  className={`arbr-method-btn ${loginMethod === "phone" ? "active" : ""}`}
                  onClick={() => { setLoginMethod("phone"); setOtpSent(false); }}
                >
                  <PhoneIcon /> Phone OTP
                </button>
              </div>

              {/* Email/Password form */}
              {loginMethod === "email" && (
                <div className="fade-in">
                  <div className="arbr-field">
                    <label className="arbr-label">Email</label>
                    <input className="arbr-input" type="email" placeholder="you@example.com" />
                  </div>
                  <div className="arbr-field">
                    <label className="arbr-label">Password</label>
                    <input className="arbr-input" type="password" placeholder="••••••••" />
                  </div>
                  <a href="https://arab-rial.com/forgot-password.html" className="arbr-forgot">Forgot password?</a>
                  <button className="arbr-btn-primary">Login</button>
                  <div className="arbr-sep">or</div>
                  <button className="arbr-btn-google">
                    <GoogleIcon /> Continue with Google
                  </button>
                </div>
              )}

              {/* Phone OTP form */}
              {loginMethod === "phone" && (
                <div className="fade-in">
                  {!otpSent ? (
                    <>
                      <div className="arbr-info">
                        Enter your registered phone number to receive a one-time verification code.
                      </div>
                      <div className="arbr-field">
                        <label className="arbr-label">Phone Number</label>
                        <div className="arbr-input-group">
                          <input className="arbr-input" type="tel" placeholder="+968 XXXX XXXX" style={{ flex: 1 }} />
                          <button className="arbr-btn-secondary" onClick={startCountdown}>
                            Send OTP
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="arbr-info">
                        Enter the 6-digit code sent to your phone.
                      </div>
                      <div className="arbr-otp-row">
                        {otp.map((v, i) => (
                          <input
                            key={i}
                            id={`otp-${i}`}
                            className="arbr-otp-input"
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={v}
                            onChange={e => handleOtpChange(i, e.target.value)}
                          />
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                        <span style={{ fontSize: 12, color: ARBR_MUTED }}>
                          {countdown > 0 ? `Resend in ${countdown}s` : ""}
                        </span>
                        <button
                          className="arbr-btn-secondary"
                          style={{ padding: "6px 14px", fontSize: 12 }}
                          disabled={countdown > 0}
                          onClick={startCountdown}
                        >
                          Resend
                        </button>
                      </div>
                      <button className="arbr-btn-primary">Verify & Login</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── REGISTER ─── */}
          {tab === "register" && (
            <div className="fade-in">
              <div className="arbr-field">
                <label className="arbr-label">Full Name</label>
                <input className="arbr-input" type="text" placeholder="Your full name" />
              </div>
              <div className="arbr-field">
                <label className="arbr-label">Username</label>
                <input className="arbr-input" type="text" placeholder="@username" />
              </div>
              <div className="arbr-field">
                <label className="arbr-label">Phone Number</label>
                <input className="arbr-input" type="tel" placeholder="+968 XXXX XXXX" />
              </div>
              <div className="arbr-field">
                <label className="arbr-label">Email</label>
                <input className="arbr-input" type="email" placeholder="you@example.com" />
              </div>
              <div className="arbr-field">
                <label className="arbr-label">Password</label>
                <input className="arbr-input" type="password" placeholder="••••••••" />
                <p className="arbr-hint">Use uppercase, lowercase, number, and symbol.</p>
              </div>
              <button className="arbr-btn-primary" style={{ marginTop: 6 }}>Create Account</button>
              <div className="arbr-sep">or</div>
              <button className="arbr-btn-google">
                <GoogleIcon /> Register with Google
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="arbr-footer">
            <strong>ARBR</strong><br />
            THE DIGITAL ASSET<br />
            <span style={{ fontSize: 10, marginTop: 4, display: "block" }}>© 2026 ARBR Network</span>
          </div>
        </div>
      </div>
    </>
  );
}

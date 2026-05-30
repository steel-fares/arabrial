/**
 * Client-side security helpers (defense in depth; not a substitute for Supabase RLS).
 */
(function (global) {
  const loginAttempts = new Map();
  const submitLocks = new Map();
  const throttleMap = new Map();

  const LOGIN_MAX_ATTEMPTS = 5;
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const DEFAULT_SUBMIT_COOLDOWN_MS = 4000;
  const DEFAULT_THROTTLE_MS = 800;

  function now() {
    return Date.now();
  }

  function sanitizeText(input, maxLen = 500) {
    let s = String(input ?? '')
      .replace(/[\0-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/<[^>]*>/g, '')
      .trim();
    if (maxLen > 0 && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
  }

  function isValidPhone(phone) {
    const p = String(phone || '').trim();
    return p.length >= 8 && p.length <= 20 && /^[+]?[\d\s()-]+$/.test(p);
  }

  function loginKey(email) {
    return String(email || '').trim().toLowerCase();
  }

  function checkLoginRateLimit(email) {
    const key = loginKey(email);
    const entry = loginAttempts.get(key);
    const t = now();
    if (!entry || t - entry.firstAt > LOGIN_WINDOW_MS) {
      return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS };
    }
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (t - entry.firstAt)) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS - entry.count };
  }

  function recordLoginFailure(email) {
    const key = loginKey(email);
    const t = now();
    const entry = loginAttempts.get(key);
    if (!entry || t - entry.firstAt > LOGIN_WINDOW_MS) {
      loginAttempts.set(key, { count: 1, firstAt: t });
      return;
    }
    entry.count += 1;
  }

  function clearLoginAttempts(email) {
    loginAttempts.delete(loginKey(email));
  }

  function guardDuplicateSubmit(actionKey, cooldownMs = DEFAULT_SUBMIT_COOLDOWN_MS) {
    const key = String(actionKey || 'default');
    const locked = submitLocks.get(key);
    if (locked && now() - locked < cooldownMs) {
      return false;
    }
    submitLocks.set(key, now());
    return true;
  }

  function throttle(actionKey, minIntervalMs = DEFAULT_THROTTLE_MS) {
    const key = String(actionKey || 'default');
    const last = throttleMap.get(key) || 0;
    const t = now();
    if (t - last < minIntervalMs) return false;
    throttleMap.set(key, t);
    return true;
  }

  function releaseSubmitLock(actionKey) {
    submitLocks.delete(String(actionKey || 'default'));
  }

  global.ARBRSecurity = {
    sanitizeText,
    isValidEmail,
    isValidPhone,
    checkLoginRateLimit,
    recordLoginFailure,
    clearLoginAttempts,
    guardDuplicateSubmit,
    releaseSubmitLock,
    throttle
  };
})(typeof window !== 'undefined' ? window : globalThis);

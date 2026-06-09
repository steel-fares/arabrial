(function () {
  const client = () => window.ARBR_SUPABASE_CLIENT || null;
  const page = document.body.dataset.page || "";
  const priceOmr = 0.0385;
  const totalSupply = 100000000;

  function $id(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  const ipGeoCache = {};
  async function getIpGeo(ip, isAr = false) {
    if (!ip || ip === "-" || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return isAr ? 'شبكة محلية' : 'Local / Intranet';
    }
    if (ipGeoCache[ip]) return ipGeoCache[ip];
    try {
      const res = await fetch(`https://freeipapi.com/api/json/${ip}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.countryName) {
        const country = data.countryName;
        const city = data.cityName || '';
        const locationStr = city ? `${city}, ${country}` : country;
        ipGeoCache[ip] = locationStr;
        return locationStr;
      }
    } catch (e) {
      // Ignore
    }
    return isAr ? 'موقع غير معروف' : 'Unknown Location';
  }
  function toast(message, type = "success") {
    if (typeof showToast === "function") showToast(message, type);
    else console.log(message);
  }
  function fmt(value, suffix = "") {
    return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}${suffix ? " " + suffix : ""}`;
  }
  function busy(btn, on, text) {
    if (!btn) return;
    if (typeof setBusy === "function") setBusy(btn, on, text);
    else {
      btn.disabled = on;
      if (text) btn.textContent = text;
    }
  }
  function deviceId() {
    const key = "arbr_device_id";
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
    }
    return value;
  }
  async function sessionUser() {
    const sb = client();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.user || null;
  }
  async function requireUser(next = location.pathname.split("/").pop()) {
    const user = await sessionUser();
    if (!user) location.href = `login.html?next=${encodeURIComponent(next)}`;
    return user;
  }
  async function currentProfile() {
    const sb = client();
    const user = await sessionUser();
    if (!sb || !user) return null;
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    return data;
  }
  function verificationBadge(profile) {
    const verified = profile?.verification_status === "verified";
    return `<span class="verification-badge ${verified ? "verified" : "unverified"}">${verified ? "Verified Account" : "Unverified Account"}</span>`;
  }
  async function invoke(name, body) {
    const sb = client();
    const { data, error } = await sb.functions.invoke(name, {
      body,
      headers: { "x-device-id": deviceId() },
    });
    if (error) throw error;
    return data;
  }

  function passwordScore(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }

  async function usernameAvailable(username) {
    if (!username || username.length < 3) return false;
    const { data, error } = await client().from("profiles").select("id").eq("username", username).maybeSingle();
    return !error && !data;
  }

  function bindLoginFeatures() {
    if (page !== "login") return;
    const pass = $id("sPass");
    pass?.addEventListener("input", () => {
      const score = passwordScore(pass.value);
      const bar = $id("passwordStrengthBar");
      const label = $id("passwordStrengthLabel");
      if (bar) bar.style.width = `${Math.min(100, score * 20)}%`;
      if (label) label.textContent = ["Very weak", "Weak", "Fair", "Good", "Strong"][Math.max(0, score - 1)] || "Very weak";
    });

    $id("googleLoginBtn")?.addEventListener("click", async () => {
      try {
        await client().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${location.origin}${location.pathname.replace("login.html", "dashboard.html")}` },
        });
      } catch (error) {
        toast(`Google login failed: ${error.message}`, "error");
      }
    });
    $id("googleSignupBtn")?.addEventListener("click", () => $id("googleLoginBtn")?.click());

    $id("sendPhoneOtpBtn")?.addEventListener("click", async () => {
      const phone = ($id("phoneOtpInput")?.value || $id("sPhone")?.value || "").trim();
      if (!phone) return toast("Enter phone number first.", "warning");
      const btn = $id("sendPhoneOtpBtn");
      busy(btn, true, "Sending...");
      try {
        await client().auth.signInWithOtp({ phone });
        await invoke("otp-send", { identifier: phone, channel: "sms", purpose: "phone_verify" }).catch(() => null);
        toast("OTP sent.");
        document.dispatchEvent(new CustomEvent("phone-otp-sent", { detail: { phone } }));
      } catch (error) {
        toast(`OTP failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    $id("verifyPhoneOtpBtn")?.addEventListener("click", async () => {
      const phone = ($id("phoneOtpInput")?.value || $id("sPhone")?.value || "").trim();
      const token = ($id("phoneOtpCode")?.value || "").trim();
      if (!phone || !token) return toast("Enter phone and OTP code.", "warning");
      const btn = $id("verifyPhoneOtpBtn");
      busy(btn, true, "Verifying...");
      try {
        const { error } = await client().auth.verifyOtp({ phone, token, type: "sms" });
        if (error) throw error;
        await invoke("otp-verify", { identifier: phone, code: token, purpose: "phone_verify" }).catch(() => null);
        await client().rpc("log_login_attempt", { p_identifier: phone, p_status: "success", p_device_id: deviceId() }).catch(() => null);
        toast("Phone verified.");
        setTimeout(() => location.href = "dashboard.html", 500);
      } catch (error) {
        await client().rpc("log_login_attempt", { p_identifier: phone, p_status: "failed", p_device_id: deviceId(), p_reason: error.message }).catch(() => null);
        toast(`OTP verify failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    const signupBtn = $id("doSignup");
    if (signupBtn) signupBtn.onclick = async () => {
      const fullName = ($id("sName")?.value || "").trim();
      const username = ($id("sUsername")?.value || "").trim().toLowerCase();
      const phone = ($id("sPhone")?.value || "").trim();
      const email = ($id("sEmail")?.value || "").trim();
      const password = $id("sPass")?.value || "";
      if (!fullName || !username || !phone || !email || !password) return toast("Complete all registration fields.", "warning");
      if (!/^[a-z0-9_]{3,24}$/.test(username)) return toast("Username must be 3-24 letters, numbers, or underscores.", "warning");
      if (passwordScore(password) < 4) return toast("Use a stronger password.", "warning");
      busy(signupBtn, true, "Creating...");
      try {
        if (!(await usernameAvailable(username))) throw new Error("Username is already taken.");
        const { data: phoneTaken } = await client().from("profiles").select("id").eq("phone", phone).maybeSingle();
        if (phoneTaken) throw new Error("Phone number is already registered.");
        const { error } = await client().auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/dashboard.html`,
            data: { full_name: fullName, username, phone },
          },
        });
        if (error) throw error;
        await invoke("otp-send", { identifier: phone, channel: "sms", purpose: "phone_verify" }).catch(() => null);
        toast("Account created. Verify your email and phone to unlock all features.");
      } catch (error) {
        toast(`Signup failed: ${error.message}`, "error");
      } finally {
        busy(signupBtn, false);
      }
    };

    const loginBtn = $id("doLogin");
    if (loginBtn) loginBtn.onclick = async () => {
      const email = ($id("loginEmail")?.value || "").trim();
      const password = $id("loginPass")?.value || "";
      if (!email || !password) return toast("Enter email and password.", "warning");
      busy(loginBtn, true, "Logging in...");
      try {
        const { error } = await client().auth.signInWithPassword({ email, password });
        if (error) throw error;
        const profile = await currentProfile();
        if (profile?.login_disabled || profile?.frozen_at) {
          await client().auth.signOut();
          const blockReason = profile.freeze_reason || "Account is frozen or login is disabled.";
          await client().rpc("log_login_attempt", { p_identifier: email, p_status: "blocked", p_device_id: deviceId(), p_reason: blockReason }).catch(() => null);
          throw new Error(blockReason);
        }
        await client().rpc("log_login_attempt", { p_identifier: email, p_status: "success", p_device_id: deviceId() }).catch(() => null);
        location.href = new URLSearchParams(location.search).get("next") || "dashboard.html";
      } catch (error) {
        await client().rpc("log_login_attempt", { p_identifier: email, p_status: "failed", p_device_id: deviceId(), p_reason: error.message }).catch(() => null);
        toast(`Login failed: ${error.message}`, "error");
      } finally {
        busy(loginBtn, false);
      }
    };

    $id("doPasskeyLogin")?.addEventListener("click", async () => {
      if (!window.PublicKeyCredential) return toast("This browser does not support passkeys.", "error");
      const btn = $id("doPasskeyLogin");
      busy(btn, true, "Verifying...");
      try {
        const options = await invoke("webauthn-options", { mode: "login" });
        const assertionResponse = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
        const verified = await invoke("webauthn-verify", {
          mode: "login",
          responseJSON: assertionResponse,
        });
        if (!verified?.ok || !verified?.action_link) throw new Error(verified?.message || "Passkey authentication failed.");
        
        toast("Verified successfully! Logging in...");
        await client().rpc("log_login_attempt", { p_identifier: "passkey_login", p_status: "success", p_device_id: deviceId() }).catch(() => null);
        
        setTimeout(() => {
          location.href = verified.action_link;
        }, 500);
      } catch (error) {
        await client().rpc("log_login_attempt", { p_identifier: "passkey_login", p_status: "failed", p_device_id: deviceId(), p_reason: error.message }).catch(() => null);
        toast(`Passkey login failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
  }

  function bindForgotPassword() {
    if (page !== "forgot-password") return;
    $id("passwordResetForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const identifier = ($id("resetIdentifier")?.value || "").trim();
      const btn = $id("requestResetBtn");
      if (!identifier) return toast("Enter email or phone number.", "warning");
      busy(btn, true, "Sending...");
      try {
        await invoke("password-reset-request", { identifier }).catch(() => null);
        if (identifier.includes("@")) {
          const { error } = await client().auth.resetPasswordForEmail(identifier, {
            redirectTo: `${location.origin}/login.html`,
          });
          if (error) throw error;
        } else {
          await client().auth.signInWithOtp({ phone: identifier });
        }
        toast("Reset instructions sent if the account exists.");
      } catch (error) {
        toast(`Password reset failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
    $id("confirmResetBtn")?.addEventListener("click", async () => {
      const identifier = ($id("resetIdentifier")?.value || "").trim();
      const code = ($id("resetCode")?.value || "").trim();
      const newPassword = $id("newPassword")?.value || "";
      if (!identifier || !code || newPassword.length < 8) return toast("Enter identifier, code, and a new password.", "warning");
      const btn = $id("confirmResetBtn");
      busy(btn, true, "Resetting...");
      try {
        await invoke("password-reset-confirm", { identifier, code, new_password: newPassword });
        toast("Password reset completed.");
        setTimeout(() => location.href = "login.html", 700);
      } catch (error) {
        toast(`Password reset failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
  }

  async function bindKyc() {
    if (page !== "kyc") return;
    const user = await requireUser("kyc.html");
    if (!user) return;
    const profile = await currentProfile();
    $id("kycBadge").innerHTML = verificationBadge(profile);
    const { data: existing } = await client().from("kyc_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
    $id("kycHistory").innerHTML = (existing || []).length ? existing.map((row) => `
      <div class="order-row"><div><b>${esc(row.full_name)}</b><small>${esc(row.country)} · ${esc(row.document_type)}</small></div><span class="status-pill ${row.status}">${esc(row.status)}</span></div>
    `).join("") : `<div class="empty-orders">No KYC requests yet.</div>`;

    $id("kycForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const doc = $id("kycDocument")?.files?.[0];
      const selfie = $id("kycSelfie")?.files?.[0];
      if (!doc || !selfie) return toast("Upload both document and selfie.", "warning");
      const btn = $id("submitKycBtn");
      busy(btn, true, "Submitting...");
      try {
        const base = `${user.id}/${Date.now()}`;
        const docPath = `${base}-document-${doc.name}`;
        const selfiePath = `${base}-selfie-${selfie.name}`;
        let upload = await client().storage.from("kyc-documents").upload(docPath, doc, { upsert: false });
        if (upload.error) throw upload.error;
        upload = await client().storage.from("kyc-documents").upload(selfiePath, selfie, { upsert: false });
        if (upload.error) throw upload.error;
        const { error } = await client().from("kyc_requests").insert({
          user_id: user.id,
          full_name: $id("kycFullName").value.trim(),
          country: $id("kycCountry").value.trim(),
          date_of_birth: $id("kycDob").value,
          document_type: $id("kycDocType").value,
          document_path: docPath,
          selfie_path: selfiePath,
          status: "pending",
        });
        if (error) throw error;
        toast("KYC submitted for review.");
        setTimeout(() => location.reload(), 600);
      } catch (error) {
        toast(`KYC failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
  }

  async function bindTransfers() {
    if (page !== "transfer") return;
    const user = await requireUser("transfer.html");
    if (!user) return;
    const profile = await currentProfile();
    $id("transferKycBadge").innerHTML = verificationBadge(profile);

    async function lookup() {
      const value = ($id("recipientLookup")?.value || "").trim();
      if (!value) return;
      const { data, error } = await client().rpc("resolve_transfer_recipient", { identifier: value });
      if (error) {
        $id("recipientPreview").innerHTML = `<div class="service-locked">${esc(error.message || "Recipient lookup failed.")}</div>`;
        return;
      }
      const recipient = Array.isArray(data) ? data[0] : data;
      $id("recipientPreview").innerHTML = recipient ? `
        <div class="detail-item"><small>Username</small><b>${esc(recipient.username)}</b></div>
        <div class="detail-item"><small>Name</small><b>${esc(recipient.display_name || "-")}</b></div>
        <div class="detail-item"><small>Verification</small><b>${recipient.is_verified ? "Verified Account" : esc(recipient.verification_status)}</b></div>
        <div class="detail-item"><small>Wallet ID</small><b>${esc(recipient.wallet_id || "-")}</b></div>
      ` : `<div class="service-locked">Recipient not found.</div>`;
    }
    $id("lookupRecipientBtn")?.addEventListener("click", lookup);
    $id("transferForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const btn = $id("sendTransferBtn");
      busy(btn, true, "Sending...");
      try {
        const { data, error } = await client().rpc("create_wallet_transfer", {
          p_recipient: $id("recipientLookup").value.trim(),
          p_amount_arbr: Number($id("transferAmount").value),
          p_note: $id("transferNote").value.trim(),
        });
        if (error) throw error;
        toast(`Transfer completed: ${data}`);
        setTimeout(() => location.reload(), 700);
      } catch (error) {
        toast(`Transfer failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
    const { data: history } = await client().from("wallet_transfers").select("*").or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(30);
    $id("transferHistory").innerHTML = (history || []).length ? `
      <div class="mini-table-wrap"><table class="mini-table"><thead><tr><th>Type</th><th>Amount</th><th>Wallet</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${history.map((row) => `<tr><td>${row.sender_id === user.id ? "Outgoing" : "Incoming"}</td><td>${fmt(row.amount_arbr, "ARBR")}</td><td>${esc(row.sender_id === user.id ? row.recipient_wallet_id : row.sender_wallet_id)}</td><td>${esc(row.status)}</td><td>${new Date(row.created_at).toLocaleString()}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty-orders">No transfer history yet.</div>`;
  }

  async function bindP2P() {
    if (page !== "p2p") return;
    await requireUser("p2p.html");
    async function loadOrders() {
      const { data } = await client().from("p2p_orders").select("*").order("created_at", { ascending: false }).limit(50);
      const orders = data || [];
      const userIds = [...new Set(orders.map((o) => o.user_id).filter(Boolean))];
      const profiles = userIds.length ? await client().from("profiles").select("id,username,verification_status").in("id", userIds) : { data: [] };
      const profileMap = Object.fromEntries((profiles.data || []).map((p) => [p.id, p]));
      $id("p2pOrders").innerHTML = orders.length ? `
        <div class="mini-table-wrap"><table class="mini-table"><thead><tr><th>Side</th><th>User</th><th>Amount</th><th>Price</th><th>Status</th><th>Trades</th></tr></thead><tbody>
        ${orders.map((o) => `<tr><td>${esc(o.side)}</td><td>${esc(profileMap[o.user_id]?.username || "-")} ${profileMap[o.user_id]?.verification_status === "verified" ? "✓" : ""}</td><td>${fmt(o.remaining_arbr, "ARBR")}</td><td>${Number(o.price_omr).toFixed(6)} OMR</td><td>${esc(o.status)}</td><td>${fmt(Number(o.amount_arbr || 0) - Number(o.remaining_arbr || 0))}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty-orders">No active P2P orders.</div>`;
    }
    $id("p2pOrderForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const btn = $id("createP2POrderBtn");
      busy(btn, true, "Creating...");
      try {
        const { error } = await client().rpc("create_p2p_order", {
          p_side: $id("p2pSide").value,
          p_amount_arbr: Number($id("p2pAmount").value),
          p_price_omr: Number($id("p2pPrice").value),
        });
        if (error) throw error;
        toast("P2P order created.");
        await loadOrders();
      } catch (error) {
        toast(`P2P order failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
    await loadOrders();
  }

  async function bindPricePage() {
    if (page !== "price") return;
    const sb = client();
    const [stats, prices] = await Promise.all([
      sb.rpc("platform_statistics").catch(() => ({ data: null })),
      sb.from("price_history").select("recorded_at,price_omr").order("recorded_at", { ascending: true }).limit(30).catch(() => ({ data: [] })),
    ]);
    const s = stats.data?.[0] || { total_supply: totalSupply, circulating_supply: 0, available_supply: totalSupply, p2p_volume: 0 };
    const currentLivePrice = Number(s.current_price_omr || window.ARBR_CURRENT_PRICE_OMR || priceOmr);
    const rows = prices.data?.length ? [...prices.data] : [
      { recorded_at: new Date(Date.now() - 86400000).toISOString(), price_omr: currentLivePrice * 0.98 }
    ];
    rows.push({ recorded_at: new Date().toISOString(), price_omr: currentLivePrice });
    const current = Number(rows.at(-1).price_omr);
    const prev = Number(rows.at(-2)?.price_omr || current);
    const daily = prev ? ((current - prev) / prev) * 100 : 0;
    const first = Number(rows[0].price_omr);
    const weekly = first ? ((current - first) / first) * 100 : 0;
    $id("priceStats").innerHTML = [
      ["Current Price", `1 ARBR = ${current.toFixed(6)} OMR`],
      ["Previous Price", `${prev.toFixed(6)} OMR`],
      ["Daily Change", `${daily.toFixed(2)}%`],
      ["Weekly Change", `${weekly.toFixed(2)}%`],
      ["Trading Volume", fmt(s.p2p_volume, "ARBR")],
      ["Available Supply", fmt(s.available_supply, "ARBR")],
    ].map(([k, v]) => `<div class="dash-stat feature"><small>${k}</small><b>${v}</b></div>`).join("");
    const max = Math.max(...rows.map((r) => Number(r.price_omr)));
    const min = Math.min(...rows.map((r) => Number(r.price_omr)));
    const points = rows.map((r, i) => {
      const x = 40 + i * (640 / Math.max(1, rows.length - 1));
      const y = 260 - ((Number(r.price_omr) - min) / Math.max(0.0000001, max - min)) * 200;
      return `${x},${y}`;
    }).join(" ");
    $id("priceChartSvg").innerHTML = `<polyline points="${points}" fill="none" stroke="#F0BE55" stroke-width="4" stroke-linecap="round"/><text x="40" y="292" fill="#7A8BA5">Supply ${fmt(s.circulating_supply)} / ${fmt(s.total_supply)}</text>`;
  }

  async function bindNotifications() {
    if (page !== "notifications") return;
    const user = await requireUser("notifications.html");
    if (!user) return;
    const { data } = await client().from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    $id("notificationsList").innerHTML = (data || []).length ? data.map((n) => `
      <div class="order-row"><div><b>${esc(n.title)}</b><small>${esc(n.body)} · ${new Date(n.created_at).toLocaleString()}</small></div><span class="status-pill ${n.read_at ? "approved" : "pending"}">${n.read_at ? "Read" : "New"}</span></div>
    `).join("") : `<div class="empty-orders">No notifications yet.</div>`;
    $id("markNotificationsRead")?.addEventListener("click", async () => {
      await client().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      location.reload();
    });
  }

  async function bindCoinbaseDeposit() {
    if (page !== "deposit" || !$id("coinbaseDepositForm")) return;
    await requireUser("deposit.html");
    $id("coinbaseDepositForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const btn = $id("createCoinbaseChargeBtn");
      busy(btn, true, "Creating...");
      try {
        const data = await invoke("create-coinbase-charge", {
          amount_omr: Number($id("coinbaseAmount").value),
          currency: $id("coinbaseCurrency").value,
        });
        if (!data?.hosted_url) throw new Error("No payment URL returned.");
        location.href = data.hosted_url;
      } catch (error) {
        toast(`Coinbase payment failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
  }

  async function bindPasskeys() {
    if (page !== "passkeys") return;
    const user = await requireUser("passkeys.html");
    if (!user) return;
    async function load() {
      const { data } = await client().from("passkeys").select("id,device_name,last_used_at,created_at").eq("user_id", user.id).order("created_at", { ascending: false });
      $id("passkeysList").innerHTML = (data || []).length ? (data || []).map((key) => `
        <div class="order-row"><div><b>${esc(key.device_name || "Passkey")}</b><small>Created ${new Date(key.created_at).toLocaleString()}${key.last_used_at ? ` · Last used ${new Date(key.last_used_at).toLocaleString()}` : ""}</small></div><button class="small-btn" data-remove-passkey="${key.id}">Remove</button></div>
      `).join("") : `<div class="empty-orders">No passkeys registered.</div>`;
      document.querySelectorAll("[data-remove-passkey]").forEach((btn) => btn.addEventListener("click", async () => {
        await client().from("passkeys").delete().eq("id", btn.dataset.removePasskey);
        toast("Passkey removed.");
        await load();
      }));
    }
    $id("registerPasskeyBtn")?.addEventListener("click", async () => {
      if (!window.PublicKeyCredential) return toast("This browser does not support passkeys.", "error");
      const btn = $id("registerPasskeyBtn");
      busy(btn, true, "Preparing...");
      try {
        const options = await invoke("webauthn-options", { mode: "registration" });
        const attestationResponse = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
        const verified = await invoke("webauthn-verify", {
          mode: "registration",
          responseJSON: attestationResponse,
          device_name: $id("passkeyDeviceName").value.trim() || "Passkey",
        });
        if (!verified?.ok) throw new Error(verified?.message || "Passkey server verification failed.");
        toast("Passkey registered successfully!");
        await load();
      } catch (error) {
        toast(`Passkey registration failed: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });
    await load();
  }

  async function bindHomeStats() {
    if (page !== "home") return;
    const sb = client();
    if (!sb || !$id("homeUsersCount")) return;
    try {
      const { data, error } = await sb.rpc("platform_statistics");
      if (error) throw error;
      const stats = data?.[0] || {};
      $id("homeUsersCount").textContent = fmt(stats.users_count || 0);
      $id("homeTransfersCount").textContent = fmt(stats.transfers_count || 0);
      $id("homeP2PVolume").textContent = fmt(stats.p2p_volume || 0, "ARBR");
      $id("homeTotalSupply").textContent = fmt(stats.total_supply || totalSupply, "ARBR");
      $id("homeAvailableSupply").textContent = fmt(stats.available_supply || 0, "ARBR");
    } catch (_) {
      $id("homeUsersCount").textContent = "0";
      $id("homeTransfersCount").textContent = "0";
      $id("homeP2PVolume").textContent = "0 ARBR";
      $id("homeTotalSupply").textContent = fmt(totalSupply, "ARBR");
      $id("homeAvailableSupply").textContent = "0 ARBR";
    }
  }

  async function bindAdminFeatures() {
    if (page !== "admin") return;
    const profile = await currentProfile();
    if (profile?.role !== "admin") return;

    // Inject custom logins modal for admin
    const sharedModals = $id("shared-modals");
    if (sharedModals && !$id("userLoginsModal")) {
      const modalDiv = document.createElement("div");
      modalDiv.innerHTML = `
        <div class="modal" id="userLoginsModal">
          <div class="modal-card modal-wide" style="width: min(720px, 96vw); max-height: 90vh; overflow-y: auto;">
            <button class="modal-close" id="closeUserLogins">×</button>
            <h3 style="color:var(--gold-light);margin-bottom:16px" id="userLoginsTitle">تفاصيل الدخول والأجهزة</h3>
            
            <div style="margin-bottom: 24px;">
              <h4 style="color:var(--gold-soft);margin-bottom:10px;font-size:15px;text-align:right;">الأجهزة المسجلة (Devices)</h4>
              <div id="userDevicesList" style="display:grid;grid-template-columns:1fr;gap:10px;direction:ltr;">
                <div class="admin-state-card">Loading devices...</div>
              </div>
            </div>

            <div>
              <h4 style="color:var(--gold-soft);margin-bottom:10px;font-size:15px;text-align:right;">سجل محاولات الدخول (Login Logs)</h4>
              <div id="userLoginsList" style="max-height: 300px; overflow-y: auto;">
                <div class="admin-state-card">Loading logins...</div>
              </div>
            </div>
          </div>
        </div>
      `;
      sharedModals.appendChild(modalDiv.firstElementChild);
      
      $id("closeUserLogins")?.addEventListener("click", () => {
        $id("userLoginsModal").classList.remove("open");
      });
    }

    const [users, wallets, kyc, orders, stats] = await Promise.all([
      client().from("profiles").select("*").order("created_at", { ascending: false }).limit(100),
      client().from("wallets").select("user_id,wallet_id,arbr_balance"),
      client().from("kyc_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(50),
      client().from("p2p_orders").select("*").in("status", ["active", "frozen", "disputed"]).order("created_at", { ascending: false }).limit(50),
      client().rpc("platform_statistics"),
    ]);
    const walletMap = Object.fromEntries((wallets.data || []).map((w) => [w.user_id, w]));
    const s = stats.data?.[0] || {};
    if ($id("adminUserStats")) $id("adminUserStats").innerHTML = [
      ["Total Users", s.users_count],
      ["Verified Users", s.verified_users],
      ["Pending KYC", s.pending_kyc],
      ["Frozen Accounts", s.frozen_accounts],
    ].map(([k, v]) => `<div class="admin-summary-card"><small>${k}</small><b>${v || 0}</b></div>`).join("");
    
    if ($id("adminUsersTable")) $id("adminUsersTable").innerHTML = `
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>ID</th><th>Username</th><th>Wallet</th><th>Phone</th><th>Email</th><th>Balance</th><th>KYC</th><th>Created</th><th>Actions</th></tr></thead><tbody>
      ${(users.data || []).map((u) => {
        const kycBtn = u.kyc_status === 'approved' 
          ? `<button class="small-btn" style="border-color:#ef4444;color:#fca5a5" data-kyc-toggle="rejected" data-user-id="${u.id}">Reject KYC</button>`
          : `<button class="small-btn" style="border-color:#22c55e;color:#86efac" data-kyc-toggle="approved" data-user-id="${u.id}">Approve KYC</button>`;
        return `<tr>
          <td>${esc(String(u.id).slice(0, 8))}</td>
          <td>${esc(u.username)}</td>
          <td>${esc(walletMap[u.id]?.wallet_id || "-")}</td>
          <td>${esc(u.phone)}</td>
          <td>${esc(u.email)}</td>
          <td>${fmt(walletMap[u.id]?.arbr_balance, "ARBR")}</td>
          <td>${esc(u.kyc_status)}</td>
          <td>${new Date(u.created_at).toLocaleDateString()}</td>
          <td>
            <button class="small-btn" data-reset-user="${esc(u.email || u.phone)}">Reset Password</button>
            <button class="small-btn" data-disable-user="${u.id}">Disable Login</button>
            <button class="small-btn" data-freeze-user="${u.id}">Freeze</button>
            <button class="small-btn" data-unfreeze-user="${u.id}">Unfreeze</button>
            ${kycBtn}
            <button class="small-btn" data-view-logins="${u.id}" data-username="${esc(u.username)}">Logins</button>
          </td>
        </tr>`;
      }).join("")}
      </tbody></table></div>`;

    document.querySelectorAll("[data-reset-user]").forEach((btn) => btn.addEventListener("click", async () => {
      await invoke("password-reset-request", { identifier: btn.dataset.resetUser });
      toast("Password reset request logged and sent if provider is configured.");
    }));
    document.querySelectorAll("[data-disable-user]").forEach((btn) => btn.addEventListener("click", async () => {
      const reason = prompt("Disable login reason") || "Admin disabled login";
      await client().rpc("admin_set_user_freeze", { p_user_id: btn.dataset.disableUser, p_freeze: false, p_disable_login: true, p_reason: reason });
      location.reload();
    }));
    document.querySelectorAll("[data-freeze-user]").forEach((btn) => btn.addEventListener("click", async () => {
      const reason = prompt("Freeze reason") || "Admin freeze";
      await client().rpc("admin_set_user_freeze", { p_user_id: btn.dataset.freezeUser, p_freeze: true, p_disable_login: true, p_reason: reason });
      location.reload();
    }));
    document.querySelectorAll("[data-unfreeze-user]").forEach((btn) => btn.addEventListener("click", async () => {
      await client().rpc("admin_set_user_freeze", { p_user_id: btn.dataset.unfreezeUser, p_freeze: false, p_disable_login: false, p_reason: null });
      location.reload();
    }));

    // KYC toggling click event binding
    document.querySelectorAll("[data-kyc-toggle]").forEach((btn) => btn.addEventListener("click", async () => {
      const userId = btn.dataset.userId;
      const status = btn.dataset.kycToggle;
      const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
      const confirmMsg = status === "approved"
        ? (isAr ? "هل أنت متأكد من توثيق حساب هذا المستخدم؟" : "Are you sure you want to verify this user's KYC?")
        : (isAr ? "هل أنت متأكد من إلغاء توثيق حساب هذا المستخدم؟" : "Are you sure you want to reject/unverify this user's KYC?");
      if (!confirm(confirmMsg)) return;
      
      busy(btn, true, "Processing...");
      try {
        const { error } = await client().rpc("admin_set_user_kyc", { p_user_id: userId, p_status: status });
        if (error) throw error;
        toast(isAr ? "تم تحديث حالة التحقق بنجاح." : "KYC status updated successfully.");
        setTimeout(() => location.reload(), 800);
      } catch (error) {
        toast(`Error: ${error.message}`, "error");
      } finally {
        busy(btn, false);
      }
    }));

    // Logins details click event binding
    document.querySelectorAll("[data-view-logins]").forEach((btn) => btn.addEventListener("click", async () => {
      const userId = btn.dataset.viewLogins;
      const username = btn.dataset.username;
      const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
      
      $id("userLoginsTitle").textContent = isAr 
        ? `أجهزة وسجل دخول الحساب: ${username}`
        : `Devices & Login History for: ${username}`;
        
      $id("userDevicesList").innerHTML = `<div class="admin-state-card">${isAr ? 'جار تحميل الأجهزة...' : 'Loading devices...'}</div>`;
      $id("userLoginsList").innerHTML = `<div class="admin-state-card">${isAr ? 'جار تحميل سجل الدخول...' : 'Loading logins...'}</div>`;
      
      $id("userLoginsModal").classList.add("open");
      
      try {
        const [devicesRes, loginsRes] = await Promise.all([
          client().from("user_devices").select("*").eq("user_id", userId).order("last_seen_at", { ascending: false }),
          client().from("login_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
        ]);
        
        if (devicesRes.error) throw devicesRes.error;
        if (loginsRes.error) throw loginsRes.error;
        
        const devices = devicesRes.data || [];
        const logins = loginsRes.data || [];
        
        // Render devices
        if (devices.length === 0) {
          $id("userDevicesList").innerHTML = `<div class="admin-state-card">${isAr ? 'لا توجد أجهزة مسجلة.' : 'No registered devices.'}</div>`;
        } else {
          $id("userDevicesList").innerHTML = devices.map(d => {
            const ip = d.last_ip || d.first_ip || '-';
            return `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 12px; border-radius: 12px; display:flex; justify-content:space-between; align-items:center; gap: 15px;">
              <div style="text-align: right; flex-grow: 1; min-width: 0;">
                <strong style="color:var(--text); font-size:14px; display:block;">ID: ${esc(d.device_id.slice(0, 8))}...</strong>
                <div style="color:var(--muted); font-size:12px; margin-top:4px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(d.user_agent)}">${esc(d.user_agent || 'Unknown Agent')}</div>
              </div>
              <div style="text-align:left; font-size:12px; flex-shrink: 0;">
                <div style="color:var(--gold-light); font-weight: bold;">
                  IP: ${esc(ip)}
                  <span class="ip-geo-badge" data-ip="${esc(ip)}" style="font-size:10px; color:#4a5a7a; margin-inline-start:4px; font-weight:normal;">(${isAr ? 'جاري جلب الموقع...' : 'Loading location...'})</span>
                </div>
                <div style="color:var(--muted); margin-top:2px;">${new Date(d.last_seen_at).toLocaleString(isAr ? 'ar' : 'en-US')}</div>
              </div>
            </div>
            `;
          }).join('');
        }
        
        // Render logins
        if (logins.length === 0) {
          $id("userLoginsList").innerHTML = `<div class="admin-state-card">${isAr ? 'لا يوجد سجل دخول.' : 'No login logs found.'}</div>`;
        } else {
          $id("userLoginsList").innerHTML = `
            <div class="admin-table-wrap">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>${isAr ? 'عنوان IP' : 'IP Address'}</th>
                    <th>${isAr ? 'الحالة' : 'Status'}</th>
                    <th>${isAr ? 'السبب / المتصفح' : 'Reason / Agent'}</th>
                    <th>${isAr ? 'التاريخ والوقت' : 'Date & Time'}</th>
                  </tr>
                </thead>
                <tbody>
                  ${logins.map(l => {
                    const isSuccess = l.status === 'success';
                    const statusColor = isSuccess ? 'var(--green)' : '#ef4444';
                    const displayStatus = isSuccess ? (isAr ? 'نجاح' : 'success') : (isAr ? 'فشل' : l.status);
                    const ip = l.ip_address || '-';
                    return `
                      <tr>
                        <td>
                          <strong>${esc(ip)}</strong>
                          <div class="ip-geo-badge" data-ip="${esc(ip)}" style="font-size:10px; color:#4a5a7a; font-weight:normal;">(${isAr ? 'جاري جلب الموقع...' : 'Loading location...'})</div>
                        </td>
                        <td><span style="color: ${statusColor}; font-weight: bold;">${esc(displayStatus)}</span></td>
                        <td>
                          <small style="color: var(--muted); display: block; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(l.reason || l.user_agent || '')}">
                            ${esc(l.reason || l.user_agent || '-')}
                          </small>
                        </td>
                        <td><small>${new Date(l.created_at).toLocaleString(isAr ? 'ar' : 'en-US')}</small></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }

        // Resolve IP locations progressively
        const geoBadges = document.querySelectorAll(".ip-geo-badge");
        const uniqueIps = Array.from(new Set(Array.from(geoBadges).map(b => b.dataset.ip).filter(ip => ip && ip !== '-')));
        
        uniqueIps.forEach(async (ip) => {
          const geo = await getIpGeo(ip, isAr);
          document.querySelectorAll(`.ip-geo-badge[data-ip="${ip}"]`).forEach(badge => {
            badge.textContent = `(${geo})`;
            badge.style.color = 'var(--gold-light)';
          });
        });
      } catch (error) {
        $id("userDevicesList").innerHTML = `<div class="admin-state-card" style="color:#ef4444;">Error: ${esc(error.message)}</div>`;
        $id("userLoginsList").innerHTML = `<div class="admin-state-card" style="color:#ef4444;">Error: ${esc(error.message)}</div>`;
      }
    }));

    if ($id("adminKycTable")) $id("adminKycTable").innerHTML = (kyc.data || []).length ? (kyc.data || []).map((k) => `
      <div class="order-row"><div><b>${esc(k.full_name)}</b><small>${esc(k.country)} · ${esc(k.document_type)}</small></div><div><button class="small-btn" data-kyc-action="approved" data-kyc-id="${k.id}">Approve</button><button class="small-btn" data-kyc-action="rejected" data-kyc-id="${k.id}">Reject</button><button class="small-btn" data-kyc-action="resubmission_requested" data-kyc-id="${k.id}">Resubmit</button></div></div>
    `).join("") : `<div class="empty-orders">No pending KYC requests.</div>`;
    document.querySelectorAll("[data-kyc-action]").forEach((btn) => btn.addEventListener("click", async () => {
      await client().rpc("admin_review_kyc_request", { p_kyc_request_id: btn.dataset.kycId, p_status: btn.dataset.kycAction, p_admin_notes: null, p_rejection_reason: btn.dataset.kycAction === "approved" ? null : "Admin review required" });
      location.reload();
    }));
    if ($id("adminP2PTable")) $id("adminP2PTable").innerHTML = (orders.data || []).length ? (orders.data || []).map((o) => `
      <div class="order-row"><div><b>${esc(o.side)} · ${fmt(o.remaining_arbr, "ARBR")}</b><small>${Number(o.price_omr).toFixed(6)} OMR · ${esc(o.status)}</small></div><div><button class="small-btn" data-p2p-status="frozen" data-p2p-id="${o.id}">Freeze</button><button class="small-btn" data-p2p-status="cancelled" data-p2p-id="${o.id}">Cancel</button><button class="small-btn" data-p2p-status="completed" data-p2p-id="${o.id}">Resolve</button></div></div>
    `).join("") : `<div class="empty-orders">No active P2P orders.</div>`;
    document.querySelectorAll("[data-p2p-status]").forEach((btn) => btn.addEventListener("click", async () => {
      await client().rpc("admin_update_p2p_order", { p_order_id: btn.dataset.p2pId, p_status: btn.dataset.p2pStatus, p_reason: "Admin action" });
      location.reload();
    }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindLoginFeatures();
    bindForgotPassword();
    bindKyc();
    bindTransfers();
    bindP2P();
    bindPricePage();
    bindNotifications();
    bindCoinbaseDeposit();
    bindPasskeys();
    bindHomeStats();
    bindAdminFeatures();
  });
})();

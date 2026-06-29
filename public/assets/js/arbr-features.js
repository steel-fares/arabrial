(function () {
  const client = () => window.ARBR_SUPABASE_CLIENT || null;
  const page = document.body.dataset.page || "";
  const priceOmr = 0.0385;
  const totalSupply = 100000000;

  function $id(id) { return document.getElementById(id); }
  const sanitizeInput = window.sanitizeInput || ((val) => typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : val);
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
      const phone = sanitizeInput($id("phoneOtpInput")?.value || $id("sPhone")?.value || "");
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
      const phone = sanitizeInput($id("phoneOtpInput")?.value || $id("sPhone")?.value || "");
      const token = sanitizeInput($id("phoneOtpCode")?.value || "");
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
      const fullName = sanitizeInput($id("sName")?.value || "");
      const username = sanitizeInput($id("sUsername")?.value || "").toLowerCase();
      const phone = sanitizeInput($id("sPhone")?.value || "");
      const email = sanitizeInput($id("sEmail")?.value || "");
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
      const email = sanitizeInput($id("loginEmail")?.value || "");
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
    if (page === "forgot-password") {
      $id("passwordResetForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const identifier = sanitizeInput($id("resetIdentifier")?.value || "");
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
          // Redirect to the verification/confirmation page
          setTimeout(() => {
            location.href = `forgot-password-verify.html?identifier=${encodeURIComponent(identifier)}`;
          }, 1000);
        } catch (error) {
          toast(`Password reset failed: ${error.message}`, "error");
        } finally {
          busy(btn, false);
        }
      });
    }

    if (page === "forgot-password-verify") {
      // Get identifier from query parameters
      const params = new URLSearchParams(location.search);
      const identifier = sanitizeInput(params.get("identifier") || "");
      if (identifier) {
        // Display the identifier on the page
        const identifierDisplay = $id("identifierDisplay");
        if (identifierDisplay) {
          identifierDisplay.textContent = identifier;
        }
        
        // Show specific check your email/phone message based on identifier type
        const verifyMessage = $id("verifyMessage");
        if (verifyMessage) {
          const isEmail = identifier.includes("@");
          const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
          if (isEmail) {
            verifyMessage.textContent = isAr 
              ? "يرجى التحقق من بريدك الإلكتروني للحصول على رمز التأكيد." 
              : "Please check your email for the confirmation code.";
          } else {
            verifyMessage.textContent = isAr 
              ? "يرجى التحقق من هاتفك للحصول على رمز التأكيد." 
              : "Please check your phone for the confirmation code.";
          }
        }
      }

      // Handle OTP boxes navigation
      const otpInputs = document.querySelectorAll('.arbr-otp-input');
      const resetCode = $id("resetCode");
      
      if (otpInputs.length > 0) {
        otpInputs[0].focus();
        otpInputs.forEach((input, index) => {
          input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (!/^\d?$/.test(val)) {
              e.target.value = '';
              return;
            }
            if (val && index < 5) {
              otpInputs[index + 1].focus();
            }
            updateCodeValue();
          });

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
              if (!input.value && index > 0) {
                otpInputs[index - 1].value = '';
                otpInputs[index - 1].focus();
              } else {
                input.value = '';
              }
              updateCodeValue();
              e.preventDefault();
            }
          });

          // Handle paste
          input.addEventListener('paste', (e) => {
            const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
            if (/^\d{6}$/.test(pasteData)) {
              otpInputs.forEach((inp, idx) => {
                inp.value = pasteData[idx];
              });
              if (resetCode) resetCode.value = pasteData;
              otpInputs[5].focus();
              e.preventDefault();
            }
          });
        });

        function updateCodeValue() {
          let code = '';
          otpInputs.forEach(inp => {
            code += inp.value;
          });
          if (resetCode) resetCode.value = code;
        }
      }

      $id("confirmResetBtn")?.addEventListener("click", async () => {
        const code = sanitizeInput($id("resetCode")?.value || "");
        const newPassword = $id("newPassword")?.value || "";
        if (!identifier || !code || newPassword.length < 8) {
          const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
          return toast(
            isAr ? "يرجى إدخال الرمز المكون من 6 أرقام وكلمة مرور جديدة (8 أحرف على الأقل)." : "Enter the 6-digit code and a new password (min 8 characters).",
            "warning"
          );
        }
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
          full_name: sanitizeInput($id("kycFullName").value),
          country: sanitizeInput($id("kycCountry").value),
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
      const value = sanitizeInput($id("recipientLookup")?.value || "");
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
          p_recipient: sanitizeInput($id("recipientLookup").value),
          p_amount_arbr: Number($id("transferAmount").value),
          p_note: sanitizeInput($id("transferNote").value),
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
    const user = await requireUser("p2p.html");
    if (!user) return;
    const profile = await currentProfile();

    let currentActiveTradeId = null;
    let currentSelectedOrder = null;
    let activeTab = "buy"; // buy = takers want to buy (view sell ads), sell = takers want to sell (view buy ads)
    let tradeRoomInterval = null;
    let appealTimerInterval = null;

    // UI elements
    const p2pNavBuy = $id("p2pNavBuy");
    const p2pNavSell = $id("p2pNavSell");
    const filterAmount = $id("filterAmount");
    const filterFiat = $id("filterFiat");
    const filterPayment = $id("filterPayment");
    const filterMerchant = $id("filterMerchant");
    const p2pAdsList = $id("p2pAdsList");

    const p2pDashboardView = $id("p2pDashboardView");
    const p2pTradeRoomView = $id("p2pTradeRoomView");

    // Modal elements
    const createAdModal = $id("createAdModal");
    const openCreateAdBtn = $id("openCreateAdBtn");
    const closeCreateAdModal = $id("closeCreateAdModal");
    const createAdForm = $id("createAdForm");

    const initiateTradeModal = $id("initiateTradeModal");
    const closeInitiateTradeModal = $id("closeInitiateTradeModal");
    const initiateTradeForm = $id("initiateTradeForm");
    const tradeModalAmount = $id("tradeModalAmount");

    const myTradesModal = $id("myTradesModal");
    const viewMyTradesBtn = $id("viewMyTradesBtn");
    const closeMyTradesModal = $id("closeMyTradesModal");
    const myTradesListBody = $id("myTradesListBody");

    // Switch between Buy and Sell tabs
    p2pNavBuy.addEventListener("click", () => {
      activeTab = "buy";
      p2pNavBuy.classList.add("active-buy");
      p2pNavSell.classList.remove("active-sell");
      loadAds();
    });

    p2pNavSell.addEventListener("click", () => {
      activeTab = "sell";
      p2pNavSell.classList.add("active-sell");
      p2pNavBuy.classList.remove("active-buy");
      loadAds();
    });

    // Handle filters change
    [filterAmount, filterFiat, filterPayment, filterMerchant].forEach(el => {
      if (el) el.addEventListener("change", loadAds);
      if (el && el.tagName === "INPUT") el.addEventListener("input", loadAds);
    });

    // Create Advertisement Modal handlers
    const btnSell = $id("btnSell");
    const btnBuy = $id("btnBuy");
    const adSideInput = $id("adSide");
    const adFiatCurrency = $id("adFiatCurrency");
    const adMarketPriceText = $id("adMarketPriceText");
    const adPriceInput = $id("adPrice");

    function setAdSide(side) {
      if (side === "sell") {
        btnSell?.classList.add("sell");
        btnSell?.classList.remove("buy");
        btnBuy?.classList.add("buy");
        btnBuy?.classList.remove("sell");
        adSideInput.value = "sell";
      } else {
        btnBuy?.classList.add("sell");
        btnBuy?.classList.remove("buy");
        btnSell?.classList.add("buy");
        btnSell?.classList.remove("sell");
        adSideInput.value = "buy";
      }
      validateAdForm();
    }

    btnSell?.addEventListener("click", () => setAdSide("sell"));
    btnBuy?.addEventListener("click", () => setAdSide("buy"));

    function updateFiatConfig() {
      const fiat = adFiatCurrency.value;
      const curr = ARBR_CONFIG.supportedCurrencies.find(c => c.code === fiat) || { omrPerCurrency: 1 };
      const omrRate = curr.omrPerCurrency || 1;
      
      const baseMarketPriceOmr = 0.0385;
      const convertedMarketPrice = baseMarketPriceOmr / omrRate;
      
      adMarketPriceText.textContent = `${convertedMarketPrice.toFixed(4)} ${fiat}`;
      
      // Update badges
      document.querySelectorAll(".ad-fiat-badge").forEach(el => el.textContent = fiat);
      document.querySelectorAll(".ad-fiat-label").forEach(el => el.textContent = fiat);
      
      adPriceInput.placeholder = convertedMarketPrice.toFixed(4);
      
      validateAdForm();
    }

    adFiatCurrency?.addEventListener("change", updateFiatConfig);

    function validateAdForm() {
      const fiat = adFiatCurrency.value;
      const curr = ARBR_CONFIG.supportedCurrencies.find(c => c.code === fiat) || { omrPerCurrency: 1 };
      const omrRate = curr.omrPerCurrency || 1;
      const baseMarketPriceOmr = 0.0385;
      const convertedMarketPrice = baseMarketPriceOmr / omrRate;

      const price = Number($id("adPrice").value) || 0;
      const amount = Number($id("adAmount").value) || 0;
      const minLimit = Number($id("adMinLimit").value) || 0;
      const maxLimit = Number($id("adMaxLimit").value) || 0;

      // Price Diff Calculation
      const priceDiffEl = $id("priceDiff");
      if (price > 0) {
        const diff = ((price - convertedMarketPrice) / convertedMarketPrice * 100).toFixed(1);
        const sign = diff > 0 ? "+" : "";
        priceDiffEl.style.color = diff > 0 ? "#c9a84c" : "#1D9E75";
        const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
        priceDiffEl.textContent = isAr 
          ? `${sign}${diff}% عن سعر السوق` 
          : `${sign}${diff}% from market price`;
      } else {
        priceDiffEl.textContent = "";
      }

      // Total Calculation
      const total = price * amount;
      const adSummaryTotalText = $id("adSummaryTotalText");
      if (total > 0) {
        adSummaryTotalText.textContent = `${total.toFixed(3)} ${fiat}`;
      } else {
        adSummaryTotalText.textContent = `—`;
      }

      // Live warning validations
      const warnBox = $id("adWarnBox");
      const warnText = $id("adWarnText");
      let warning = "";

      const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';

      if (maxLimit > 0 && total > 0 && maxLimit > total) {
        warning = isAr
          ? "الحد الأقصى للصفقة أكبر من القيمة الكلية للإعلان. يُرجى المراجعة."
          : "Maximum trade limit is greater than the total value of the ad.";
      } else if (minLimit > 0 && maxLimit > 0 && minLimit > maxLimit) {
        warning = isAr
          ? "الحد الأدنى للصفقة لا يمكن أن يكون أكبر من الحد الأقصى للصفقة."
          : "Minimum trade limit cannot be greater than the maximum trade limit.";
      } else if (minLimit > 0 && total > 0 && minLimit > total) {
        warning = isAr
          ? "الحد الأدنى للصفقة أكبر من القيمة الكلية للإعلان."
          : "Minimum trade limit is greater than the total value of the ad.";
      }

      if (warning) {
        warnBox.style.display = "flex";
        warnText.textContent = warning;
      } else {
        warnBox.style.display = "none";
        warnText.textContent = "";
      }
    }

    [$id("adPrice"), $id("adAmount"), $id("adMinLimit"), $id("adMaxLimit")].forEach(el => {
      el?.addEventListener("input", validateAdForm);
    });

    document.querySelectorAll("#adPaymentMethodsGrid .pay-option").forEach(opt => {
      opt.addEventListener("click", () => {
        opt.classList.toggle("selected");
        validateAdForm();
      });
    });

    async function resetAdModalState() {
      createAdForm.reset();
      setAdSide("sell");
      updateFiatConfig();
      
      document.querySelectorAll("#adPaymentMethodsGrid .pay-option").forEach(opt => {
        if (opt.dataset.value === "Bank Muscat") {
          opt.classList.add("selected");
        } else {
          opt.classList.remove("selected");
        }
      });
      
      const balanceTextEl = $id("adAvailableBalanceText");
      balanceTextEl.textContent = "جاري التحميل...";
      try {
        const { data: wallet } = await client().from("wallets").select("arbr_balance, locked_arbr").eq("user_id", user.id).maybeSingle();
        const available = wallet ? (Number(wallet.arbr_balance) - Number(wallet.locked_arbr)) : 0;
        balanceTextEl.textContent = `${fmt(available)} ARBR`;
      } catch (err) {
        balanceTextEl.textContent = "0 ARBR";
      }

      const btn = $id("btnSubmitAd");
      btn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> تأكيد ونشر الإعلان`;
      btn.style.background = "#c9a84c";
      btn.style.color = "#060910";
      btn.disabled = false;
      
      $id("adWarnBox").style.display = "none";
      $id("priceDiff").textContent = "";
      $id("adSummaryTotalText").textContent = "—";
    }

    openCreateAdBtn?.addEventListener("click", () => {
      const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
      if (!profile || profile.verification_status !== "verified" || profile.kyc_status !== "approved") {
        return toast(
          isAr 
            ? "عذراً، يجب إكمال التحقق من الهوية (KYC) وتوثيق الحساب لنشر إعلانات التداول." 
            : "Sorry, you must complete identity verification (KYC) and verify your account to publish trading ads.", 
          "warning"
        );
      }
      createAdModal.classList.add("open");
      resetAdModalState();
    });
    closeCreateAdModal?.addEventListener("click", () => createAdModal.classList.remove("open"));

    createAdForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
      
      const side = adSideInput.value;
      const amount = Number($id("adAmount").value);
      const price = Number($id("adPrice").value);
      const minLimit = Number($id("adMinLimit").value);
      const maxLimit = Number($id("adMaxLimit").value);
      const fiat = adFiatCurrency.value;
      const crypto = $id("adCryptoAsset").value;

      // Validate payment methods selection
      const paymentMethods = [];
      document.querySelectorAll("#adPaymentMethodsGrid .pay-option.selected").forEach(opt => {
        paymentMethods.push(opt.dataset.value);
      });

      if (paymentMethods.length === 0) {
        return toast(
          isAr ? "الرجاء اختيار طريقة دفع واحدة على الأقل." : "Please select at least one payment method.",
          "warning"
        );
      }

      // Validate limits
      const total = price * amount;
      if (maxLimit > total || minLimit > maxLimit || minLimit > total) {
        return toast(
          isAr ? "يرجى مراجعة حدود الصفقة المدخلة للتأكد من صحتها." : "Please review the trade limits for correctness.",
          "warning"
        );
      }

      const btn = $id("btnSubmitAd");
      busy(btn, true, isAr ? "جاري النشر..." : "Publishing...");
      try {
        const { error } = await client().rpc("create_p2p_order", {
          p_side: side,
          p_amount_arbr: amount,
          p_price_omr: price,
          p_min_limit: minLimit,
          p_payment_methods: paymentMethods,
          p_fiat_currency: fiat,
          p_crypto_asset: crypto,
          p_merchant_only: false
        });
        if (error) throw error;
        
        // Success state
        btn.innerHTML = `<i class="ti ti-check-circle" aria-hidden="true"></i> ${isAr ? 'تم نشر الإعلان بنجاح!' : 'Ad published successfully!'}`;
        btn.style.background = "#1D9E75";
        btn.style.color = "#fff";
        btn.disabled = true;
        
        toast(isAr ? "تم نشر إعلان التداول بنجاح!" : "Trading ad published successfully!");
        setTimeout(() => {
          createAdModal.classList.remove("open");
          loadAds();
        }, 1500);
      } catch (err) {
        toast(`${isAr ? 'فشل النشر' : 'Publish failed'}: ${err.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    // Load advertisements from Supabase
    async function loadAds() {
      p2pAdsList.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--muted)">جاري تحميل الإعلانات...</td></tr>`;
      try {
        const amt = Number(filterAmount.value) || 0;
        const fiat = filterFiat.value;
        const payMethod = filterPayment.value;
        const merchOnly = filterMerchant.checked;

        // Fetch active ads corresponding to the current tab
        // Tab [BUY] -> we view SELL advertisements
        // Tab [SELL] -> we view BUY advertisements
        let selectStr = "*, profiles(username, verification_status)";
        if (merchOnly) {
          selectStr = "*, profiles!inner(username, verification_status)";
        }

        let query = client()
          .from("p2p_orders")
          .select(selectStr)
          .eq("status", "active")
          .eq("side", activeTab === "buy" ? "sell" : "buy")
          .eq("fiat_currency", fiat);

        if (merchOnly) {
          query = query.eq("profiles.verification_status", "verified");
        }

        const { data, error } = await query.order("price_omr", { ascending: activeTab === "buy" });
        if (error) throw error;

        let filtered = data || [];

        // Apply local filtering for min_limit and payment_method if specified
        if (amt > 0) {
          filtered = filtered.filter(o => o.min_limit <= amt && (o.remaining_arbr * o.price_omr) >= amt);
        }
        if (payMethod !== "ALL") {
          filtered = filtered.filter(o => {
            if (!o.payment_methods) return false;
            if (o.payment_methods.includes(payMethod)) return true;
            if (payMethod === "Bank Transfer") {
              return o.payment_methods.includes("Bank Muscat") || 
                     o.payment_methods.includes("Bank Dhofar") ||
                     o.payment_methods.includes("Bank Transfer");
            }
            return false;
          });
        }

        if (filtered.length === 0) {
          p2pAdsList.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--muted)">لا توجد إعلانات تداول مطابقة لخيارات البحث الحالية.</td></tr>`;
          return;
        }

        p2pAdsList.innerHTML = filtered.map(o => {
          const u = o.profiles || {};
          const isMerchant = u.verification_status === "verified";
          const minMaxLimit = `${o.min_limit} - ${(o.remaining_arbr * o.price_omr).toFixed(2)} ${o.fiat_currency}`;
          const payBadges = (o.payment_methods || []).map(p => {
            const cls = p.toLowerCase().includes("stc") ? "payment-stc" :
                        p.toLowerCase().includes("vodafone") ? "payment-vodafone" :
                        p.toLowerCase().includes("ooredoo") ? "payment-ooredoo" : "payment-bank";
            return `<span class="p2p-payment-tag ${cls}">${esc(p)}</span>`;
          }).join("");

          const actionBtnText = activeTab === "buy" ? `شراء ${o.crypto_asset}` : `بيع ${o.crypto_asset}`;
          const actionBtnClass = activeTab === "buy" ? "btn-primary" : "btn-secondary";
          const actionBtnStyle = activeTab === "buy" ? "background:#22c55e; border-color:#22c55e;" : "background:#ef4444; border-color:#ef4444; color:white;";

          return `
            <tr>
              <td>
                <strong>${esc(u.username || "Unknown")}</strong>
                ${isMerchant ? `<span class="p2p-merchant-badge">تاجر معتمد</span>` : ""}
              </td>
              <td class="p2p-price-col">${Number(o.price_omr).toFixed(4)} <small style="font-size:12px; color:var(--muted)">${esc(o.fiat_currency)}</small></td>
              <td>
                <div><small style="color:var(--muted)">المتاح:</small> <strong>${fmt(o.remaining_arbr)} ${esc(o.crypto_asset)}</strong></div>
                <div style="margin-top:4px;"><small style="color:var(--muted)">الحدود:</small> <span style="font-size:12.5px">${minMaxLimit}</span></div>
              </td>
              <td>${payBadges}</td>
              <td style="text-align:center;">
                <button class="${actionBtnClass} small-btn" style="padding:10px 18px; font-weight:700; ${actionBtnStyle}" data-trade-order-id="${o.id}">
                  ${actionBtnText}
                </button>
              </td>
            </tr>
          `;
        }).join("");

        // Bind clicks on trade action buttons
        document.querySelectorAll("[data-trade-order-id]").forEach(btn => {
          btn.addEventListener("click", () => {
            const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';
            if (!profile || profile.verification_status !== "verified" || profile.kyc_status !== "approved") {
              return toast(
                isAr 
                  ? "عذراً، يجب إكمال التحقق من الهوية (KYC) وتوثيق الحساب لبدء التداول P2P." 
                  : "Sorry, you must complete identity verification (KYC) and verify your account to initiate a P2P trade.", 
                "warning"
              );
            }
            const orderId = btn.dataset.tradeOrderId;
            const order = filtered.find(o => o.id === orderId);
            if (order) openInitiateTrade(order);
          });
        });

      } catch (err) {
        p2pAdsList.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:#ef4444">فشل تحميل الإعلانات: ${esc(err.message)}</td></tr>`;
      }
    }

    // Initiate Trade Modal setup
    function openInitiateTrade(order) {
      currentSelectedOrder = order;
      $id("tradeModalOrderId").value = order.id;
      $id("tradeModalTitle").textContent = activeTab === "buy" ? `شراء ${order.crypto_asset}` : `بيع ${order.crypto_asset}`;
      $id("tradeModalPrice").textContent = `${Number(order.price_omr).toFixed(4)} ${order.fiat_currency}`;
      $id("tradeModalAvailable").textContent = `${fmt(order.remaining_arbr)} ${order.crypto_asset}`;
      $id("tradeModalLimits").textContent = `${order.min_limit} - ${(order.amount_arbr * order.price_omr).toFixed(2)} ${order.fiat_currency}`;
      $id("tradeModalPayment").textContent = (order.payment_methods || []).join(" / ");
      
      $id("tradeModalInputLabel").textContent = activeTab === "buy" 
        ? `الكمية التي ترغب بشرائها (${order.crypto_asset})` 
        : `الكمية التي ترغب ببيعها (${order.crypto_asset})`;

      tradeModalAmount.value = "";
      $id("tradeModalCalculation").textContent = `0.00 ${order.fiat_currency}`;

      // Live calculation updates
      tradeModalAmount.oninput = () => {
        const amt = Number(tradeModalAmount.value) || 0;
        const total = amt * order.price_omr;
        $id("tradeModalCalculation").textContent = `${total.toFixed(2)} ${order.fiat_currency}`;
      };

      initiateTradeModal.classList.add("open");
    }

    closeInitiateTradeModal?.addEventListener("click", () => initiateTradeModal.classList.remove("open"));

    initiateTradeForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentSelectedOrder) return;
      const orderId = $id("tradeModalOrderId").value;
      const amount = Number(tradeModalAmount.value);
      if (amount <= 0) return toast("الرجاء إدخال كمية صحيحة.", "warning");

      const isAr = (typeof currentLang !== 'undefined' ? currentLang : (localStorage.getItem('arbr_lang') || 'ar')) === 'ar';

      // 1. Check if amount exceeds available capacity
      if (amount > currentSelectedOrder.remaining_arbr) {
        return toast(
          isAr 
            ? `الكمية المدخلة تتجاوز المتاح في الإعلان (${fmt(currentSelectedOrder.remaining_arbr)} ARBR).`
            : `Amount exceeds the available advertisement capacity (${fmt(currentSelectedOrder.remaining_arbr)} ARBR).`,
          "warning"
        );
      }

      // 2. Check if total fiat amount is below min_limit
      const totalFiat = amount * currentSelectedOrder.price_omr;
      if (totalFiat < currentSelectedOrder.min_limit) {
        return toast(
          isAr
            ? `قيمة الصفقة أقل من الحد الأدنى المسموح به (${currentSelectedOrder.min_limit} ${currentSelectedOrder.fiat_currency}).`
            : `Trade value is below the minimum limit (${currentSelectedOrder.min_limit} ${currentSelectedOrder.fiat_currency}).`,
          "warning"
        );
      }
      
      // 3. Check if seller (taker on buy ad) has enough balance
      if (currentSelectedOrder.side === "buy") {
        // Taker is seller. They must have enough balance.
        try {
          const { data: wallet } = await client().from("wallets").select("arbr_balance, locked_arbr").eq("user_id", user.id).maybeSingle();
          const available = wallet ? (Number(wallet.arbr_balance) - Number(wallet.locked_arbr)) : 0;
          if (available < amount) {
            return toast(
              isAr
                ? `رصيدك غير كافي لإتمام هذه الصفقة. الرصيد المتاح: ${fmt(available)} ARBR.`
                : `Insufficient balance to complete this trade. Available: ${fmt(available)} ARBR.`,
              "warning"
            );
          }
        } catch (err) {
          // Ignore and let DB handle it if wallet check fails
        }
      }

      const btn = $id("btnConfirmTrade");
      busy(btn, true, "جاري بدء الصفقة...");
      try {
        const { data: tradeId, error } = await client().rpc("initiate_p2p_trade", {
          p_order_id: orderId,
          p_amount_arbr: amount
        });
        if (error) throw error;
        toast("تم بدء الصفقة بنجاح وقفل الضمان!");
        initiateTradeModal.classList.remove("open");
        initiateTradeForm.reset();
        loadTradeRoom(tradeId);
      } catch (err) {
        toast(`فشل بدء الصفقة: ${err.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    // View My Active Trades Modal
    viewMyTradesBtn?.addEventListener("click", async () => {
      myTradesListBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted)">جاري تحميل الصفحات...</td></tr>`;
      myTradesModal.classList.add("open");
      try {
        const { data: trades, error } = await client()
          .from("p2p_trades")
          .select("*")
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!trades || trades.length === 0) {
          myTradesListBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted)">لا توجد معاملات نشطة.</td></tr>`;
          return;
        }

        myTradesListBody.innerHTML = trades.map(t => {
          const sideText = t.buyer_id === user.id ? "شراء" : "بيع";
          const statusClass = `state-${t.status}`;
          return `
            <tr>
              <td>
                <strong>#${t.id.slice(0, 8)}...</strong>
                <div style="font-size:11px; color:var(--muted); margin-top:2px;">${sideText}</div>
              </td>
              <td>${fmt(t.amount_arbr)} ARBR</td>
              <td>${t.total_omr} OMR</td>
              <td><span class="trade-state-pill ${statusClass}">${esc(t.status)}</span></td>
              <td>
                <button class="small-btn btn-primary" data-room-trade-id="${t.id}" style="padding:6px 12px;">دخول الغرفة</button>
              </td>
            </tr>
          `;
        }).join("");

        document.querySelectorAll("[data-room-trade-id]").forEach(btn => {
          btn.addEventListener("click", () => {
            const tId = btn.dataset.roomTradeId;
            myTradesModal.classList.remove("open");
            loadTradeRoom(tId);
          });
        });

      } catch (err) {
        myTradesListBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#ef4444">خطأ في التحميل: ${esc(err.message)}</td></tr>`;
      }
    });

    closeMyTradesModal?.addEventListener("click", () => myTradesModal.classList.remove("open"));

    // Back to P2P button handler
    $id("backToP2PBtn")?.addEventListener("click", () => {
      currentActiveTradeId = null;
      clearInterval(tradeRoomInterval);
      clearInterval(appealTimerInterval);
      p2pTradeRoomView.classList.add("hidden");
      p2pDashboardView.classList.remove("hidden");
      loadAds();
    });

    // Load Trade Room Room View
    async function loadTradeRoom(tradeId) {
      p2pDashboardView.classList.add("hidden");
      p2pTradeRoomView.classList.remove("hidden");
      currentActiveTradeId = tradeId;
      
      $id("tradeRoomId").textContent = `#${tradeId.slice(0, 8)}...`;
      $id("tradeChatBox").innerHTML = `<div class="chat-msg system">جاري تحميل رسائل المحادثة...</div>`;

      await refreshTradeRoomData(tradeId);
      startTradeRoomPolling(tradeId);
    }

    // Refresh trade detail, chat messages, appeal timers
    async function refreshTradeRoomData(tradeId) {
      if (currentActiveTradeId !== tradeId) return;
      try {
        const { data: trade, error } = await client()
          .from("p2p_trades")
          .select("*")
          .eq("id", tradeId)
          .maybeSingle();

        if (error) throw error;
        if (!trade) return;

        // Fetch partner details & profiles
        const partnerId = trade.buyer_id === user.id ? trade.seller_id : trade.buyer_id;
        const [partnerRes, orderRes, chatRes, profileRes] = await Promise.all([
          client().from("profiles").select("username").eq("id", partnerId).maybeSingle(),
          client().from("p2p_orders").select("*").eq("id", trade.order_id).maybeSingle(),
          client().from("p2p_trade_messages").select("*").eq("trade_id", tradeId).order("created_at", { ascending: true }),
          client().from("profiles").select("role").eq("id", user.id).maybeSingle(),
        ]);

        const partnerUser = partnerRes.data?.username || "Unknown";
        const orderData = orderRes.data || {};
        const messages = chatRes.data || [];
        const isBuyer = trade.buyer_id === user.id;
        const isAdmin = profileRes.data?.role === "admin";

        // Render trade values
        $id("tradeRoomStatus").className = `trade-state-pill state-${trade.status}`;
        $id("tradeRoomStatus").textContent = trade.status;
        $id("tradeRoomSide").textContent = isBuyer ? "شراء (BUY)" : "بيع (SELL)";
        $id("tradeRoomPartner").textContent = partnerUser;
        $id("tradeRoomAmount").textContent = `${fmt(trade.amount_arbr)} ARBR`;
        $id("tradeRoomPrice").textContent = `${Number(trade.price_omr).toFixed(4)} OMR`;
        $id("tradeRoomTotal").textContent = `${trade.total_omr} OMR`;

        // Instructions text based on state and role
        let instructions = "";
        if (trade.status === "pending_payment") {
          instructions = isBuyer 
            ? `أنت تشتري ARBR. الرجاء تحويل مبلغ <strong>${trade.total_omr} OMR</strong> إلى البائع باستخدام أحد طرق الدفع المتاحة: <strong>${(orderData.payment_methods || []).join(", ")}</strong> ثم اضغط على زر "لقد قمت بالدفع المالي".`
            : `أنت تبيع ARBR. الضمان معلق ومقفل الآن. الرجاء انتظار تحويل المشتري مبلغ <strong>${trade.total_omr} OMR</strong> وتأكيده للدفع.`;
        } else if (trade.status === "paid") {
          instructions = isBuyer
            ? `لقد قمت بتأكيد الدفع. الرجاء انتظار قيام البائع بتحرير عملات الـ ARBR لك من محفظة الضمان.`
            : `قام المشتري بتأكيد تحويل الأموال. يرجى التحقق من حسابك فوراً. بعد استلامك للمبلغ، اضغط على زر "تحرير عملات الضمان" لإرسال الـ ARBR للمشتري.`;
        } else if (trade.status === "disputed") {
          instructions = `الصفقة حالياً تحت التحكيم والإدارة تراجع تفاصيل المعاملة. يرجى تزويد الإدارة بإثباتات التحويل والدفع في المحادثة المباشرة أدناه.`;
        } else if (trade.status === "completed") {
          instructions = `تم تحرير العملات واكتملت المعاملة بنجاح! شكراً لك لاستخدام P2P.`;
        } else if (trade.status === "cancelled") {
          instructions = `تم إلغاء هذه المعاملة بنجاح وإرجاع عملات الضمان.`;
        }
        $id("tradeInstructionText").innerHTML = instructions;

        // Render Action Buttons
        $id("btnMarkPaid").style.display = (isBuyer && trade.status === "pending_payment") ? "block" : "none";
        $id("btnReleaseCrypto").style.display = (!isBuyer && trade.status === "paid") ? "block" : "none";
        $id("btnCancelTrade").style.display = (isBuyer && trade.status === "pending_payment") ? "block" : "none";
        $id("btnDisputeTrade").style.display = (trade.status === "paid" || trade.status === "pending_payment") ? "block" : "none";

        // Admin Ruling Actions Section
        $id("adminRulingSection").style.display = (isAdmin && trade.status === "disputed") ? "block" : "none";

        // Payment Proof Upload/Preview Section Display logic
        const proofUrl = trade.payment_proof_url || orderData.payment_proof_url;
        const canUpload = isBuyer && ["pending_payment", "paid", "disputed"].includes(trade.status);
        
        if (canUpload || proofUrl) {
          $id("paymentProofSection").style.display = "block";
          
          // Show input and upload button only if the user is the buyer and trade is active
          if (canUpload) {
            $id("p2pPaymentProofInput").style.display = "block";
            $id("btnUploadProof").style.display = "block";
            // Clear upload status if not loading
            const statusText = $id("proofUploadStatus").textContent || "";
            if (!statusText.includes("جاري")) {
              $id("proofUploadStatus").textContent = "";
            }
          } else {
            $id("p2pPaymentProofInput").style.display = "none";
            $id("btnUploadProof").style.display = "none";
            $id("proofUploadStatus").textContent = "";
          }

          // Show preview link if proof url exists
          if (proofUrl) {
            $id("proofPreviewLink").style.display = "block";
            $id("proofLink").href = proofUrl;
          } else {
            $id("proofPreviewLink").style.display = "none";
            $id("proofLink").href = "#";
          }

          // Set dynamic label text for clarity
          const label = $id("paymentProofSection").querySelector("label");
          if (label) {
            label.textContent = canUpload ? "تحميل إثبات الدفع (Payment Proof)" : "إثبات الدفع (Payment Proof)";
          }
        } else {
          $id("paymentProofSection").style.display = "none";
        }

        // Countdown Timer Logic for disputes
        if (trade.status === "paid") {
          $id("appealTimerContainer").style.display = "block";
          const payTime = new Date(trade.updated_at).getTime();
          const expireTime = payTime + 15 * 60 * 1000;
          
          clearInterval(appealTimerInterval);
          appealTimerInterval = setInterval(() => {
            const now = Date.now();
            const diff = expireTime - now;
            if (diff <= 0) {
              clearInterval(appealTimerInterval);
              $id("appealTimerValue").textContent = "متاح للتحكيم الفوري";
            } else {
              const mins = Math.floor(diff / 60000);
              const secs = Math.floor((diff % 60000) / 1000);
              $id("appealTimerValue").textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
            }
          }, 1000);
        } else {
          $id("appealTimerContainer").style.display = "none";
          clearInterval(appealTimerInterval);
        }

        // Render chat messages
        const chatBox = $id("tradeChatBox");
        const wasScrolledToBottom = chatBox.scrollHeight - chatBox.clientHeight <= chatBox.scrollTop + 50;

        if (messages.length === 0) {
          chatBox.innerHTML = `<div class="chat-msg system">بدأت المحادثة الآمنة. أرسل رسالة للطرف الآخر للاتفاق على الدفع المباشر.</div>`;
        } else {
          chatBox.innerHTML = messages.map(msg => {
            if (msg.is_system) {
              return `<div class="chat-msg system">${esc(msg.message)}</div>`;
            }
            const cls = msg.sender_id === user.id ? "me" : "partner";
            return `<div class="chat-msg ${cls}">${esc(msg.message)}</div>`;
          }).join("");
        }

        if (wasScrolledToBottom || messages.length <= 1) {
          chatBox.scrollTop = chatBox.scrollHeight;
        }

      } catch (err) {
        console.error("Error refreshing trade room data: ", err);
      }
    }

    // Polling setup for active trade room
    function startTradeRoomPolling(tradeId) {
      clearInterval(tradeRoomInterval);
      tradeRoomInterval = setInterval(async () => {
        if (currentActiveTradeId !== tradeId) return clearInterval(tradeRoomInterval);
        await refreshTradeRoomData(tradeId);
      }, 3000);
    }

    // Submit new chat message
    $id("tradeChatForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const tradeId = currentActiveTradeId;
      const msgText = sanitizeInput($id("tradeChatInput").value);
      if (!tradeId || !msgText) return;

      const input = $id("tradeChatInput");
      input.value = "";
      try {
        const { error } = await client().from("p2p_trade_messages").insert({
          trade_id: tradeId,
          sender_id: user.id,
          message: msgText
        });
        if (error) throw error;
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`تعذر إرسال الرسالة: ${err.message}`, "error");
      }
    });

    // Mark trade as paid action
    $id("btnMarkPaid")?.addEventListener("click", async () => {
      const tradeId = currentActiveTradeId;
      if (!tradeId) return;
      if (!confirm("هل أنت متأكد أنك قمت بتحويل كامل المبلغ المطلوب للبائع؟")) return;

      const btn = $id("btnMarkPaid");
      busy(btn, true, "جاري الإرسال...");
      try {
        const { error } = await client().rpc("mark_p2p_trade_paid", { p_trade_id: tradeId });
        if (error) throw error;
        toast("تم تأكيد دفع الأموال للبائع بنجاح.");
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`خطأ: ${err.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    // Release crypto action
    $id("btnReleaseCrypto")?.addEventListener("click", async () => {
      const tradeId = currentActiveTradeId;
      if (!tradeId) return;
      if (!confirm("تحذير: لا تقم بتحرير العملات إلا بعد التأكد 100% من استلام المبلغ في حسابك البنكي أو محفظتك. لا يمكن استرجاع العملات بعد تحريرها. هل ترغب بالتحرير الفوري؟")) return;

      const btn = $id("btnReleaseCrypto");
      busy(btn, true, "جاري تحرير العملات...");
      try {
        const { error } = await client().rpc("release_p2p_crypto", { p_trade_id: tradeId });
        if (error) throw error;
        toast("تم تحرير عملات الـ ARBR وإرسالها للمشتري بنجاح!");
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`خطأ في تحرير العملات: ${err.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    // Cancel trade action
    $id("btnCancelTrade")?.addEventListener("click", async () => {
      const tradeId = currentActiveTradeId;
      if (!tradeId) return;
      if (!confirm("هل أنت متأكد من إلغاء هذه الصفقة؟ سيتم إرجاع العملات للضمان.")) return;

      const btn = $id("btnCancelTrade");
      busy(btn, true, "جاري الإلغاء...");
      try {
        const { error } = await client().rpc("cancel_p2p_trade", { p_trade_id: tradeId });
        if (error) throw error;
        toast("تم إلغاء الصفقة بنجاح.");
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`خطأ: ${err.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    // Dispute trade action
    $id("btnDisputeTrade")?.addEventListener("click", async () => {
      const tradeId = currentActiveTradeId;
      if (!tradeId) return;
      const reason = prompt("الرجاء كتابة سبب طلب التحكيم والمشكلة بالتفصيل للإدارة:");
      if (!reason) return;

      const btn = $id("btnDisputeTrade");
      busy(btn, true, "جاري فتح شكوى...");
      try {
        const { error } = await client().rpc("dispute_p2p_trade", { p_trade_id: tradeId, p_reason: reason });
        if (error) throw error;
        toast("تم تقديم طلب التحكيم بنجاح. سيقوم الإداري بمراجعة المحادثة.");
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`خطأ: ${err.message}`, "error");
      } finally {
        busy(btn, false);
      }
    });

    // Admin Ruling Actions click bindings
    $id("btnAdminRelease")?.addEventListener("click", async () => {
      const tradeId = currentActiveTradeId;
      if (!tradeId) return;
      if (!confirm("إجراء إداري: هل أنت متأكد من تحرير هذه العملات للمشتري مباشرة؟")) return;

      try {
        // Fetch dispute ID for this trade
        const { data: disputes } = await client().from("p2p_disputes").select("id").eq("trade_id", tradeId).eq("status", "pending").limit(1);
        if (!disputes || disputes.length === 0) return toast("لم يتم العثور على نزاع نشط.", "error");
        
        const { error } = await client().rpc("resolve_p2p_dispute", { p_dispute_id: disputes[0].id, p_ruling: "release" });
        if (error) throw error;
        toast("تم تحرير العملات للمشتري بنجاح بواسطة الإدارة.");
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`خطأ إداري: ${err.message}`, "error");
      }
    });

    $id("btnAdminRefund")?.addEventListener("click", async () => {
      const tradeId = currentActiveTradeId;
      if (!tradeId) return;
      if (!confirm("إجراء إداري: هل أنت متأكد من إرجاع هذه العملات للبائع؟")) return;

      try {
        const { data: disputes } = await client().from("p2p_disputes").select("id").eq("trade_id", tradeId).eq("status", "pending").limit(1);
        if (!disputes || disputes.length === 0) return toast("لم يتم العثور على نزاع نشط.", "error");

        const { error } = await client().rpc("resolve_p2p_dispute", { p_dispute_id: disputes[0].id, p_ruling: "refund" });
        if (error) throw error;
        toast("تم إلغاء الصفقة وإرجاع العملات للبائع بنجاح.");
        await refreshTradeRoomData(tradeId);
      } catch (err) {
        toast(`خطأ إداري: ${err.message}`, "error");
      }
    });

    // Event listener for uploading payment proof
    $id("btnUploadProof")?.addEventListener("click", async () => {
      const fileInput = $id("p2pPaymentProofInput");
      const file = fileInput?.files?.[0];
      const statusDiv = $id("proofUploadStatus");
      const btn = $id("btnUploadProof");

      if (!file) {
        toast("الرجاء اختيار ملف صورة أولاً", "error");
        if (statusDiv) statusDiv.textContent = "الرجاء اختيار ملف صورة أولاً";
        return;
      }

      // Check user session
      const { data: { session }, error: sessionErr } = await client().auth.getSession();
      if (sessionErr || !session) {
        toast("يجب عليك تسجيل الدخول لرفع الملفات", "error");
        if (statusDiv) statusDiv.textContent = "يجب عليك تسجيل الدخول لرفع الملفات";
        return;
      }

      // Show loading state
      busy(btn, true, "جاري الرفع...");
      if (statusDiv) {
        statusDiv.textContent = "جاري رفع إثبات الدفع...";
        statusDiv.style.color = "var(--muted)";
      }

      try {
        const formData = new FormData();
        formData.append("file", file);

        // Upload using POST to the Supabase Edge Function
        const uploadUrl = "https://umxmwcwuwsvkvsbdhbdl.supabase.co/functions/v1/upload-p2p-image";
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`
          },
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || `Failed to upload (status ${response.status})`);
        }

        const result = await response.json();
        const proofUrl = result.url;

        if (!proofUrl) {
          throw new Error("لم يتم إرجاع رابط الصورة من خادم الرفع");
        }

        // Save URL to Supabase p2p_orders table
        const tradeId = currentActiveTradeId;
        if (!tradeId) {
          throw new Error("الصفقة الحالية غير صالحة");
        }

        // We fetch the trade again to get the latest trade and order_id
        const { data: trade, error: tradeErr } = await client()
          .from("p2p_trades")
          .select("order_id")
          .eq("id", tradeId)
          .maybeSingle();

        if (tradeErr || !trade) {
          throw new Error(tradeErr?.message || "تعذر العثور على الصفقة لتحديث الإثبات");
        }

        // Update the order with payment_proof_url
        const { error: updateOrderErr } = await client()
          .from("p2p_orders")
          .update({ payment_proof_url: proofUrl })
          .eq("id", trade.order_id);

        if (updateOrderErr) {
          throw new Error(updateOrderErr.message);
        }

        // Also update p2p_trades.payment_proof_url for redundancy/RLS ease
        await client()
          .from("p2p_trades")
          .update({ payment_proof_url: proofUrl })
          .eq("id", tradeId);

        // Insert system/chat message indicating the proof was uploaded
        await client().from("p2p_trade_messages").insert({
          trade_id: tradeId,
          sender_id: session.user.id,
          message: "💡 قام المشتري برفع إثبات الدفع.",
          is_system: true
        });

        toast("تم رفع إثبات الدفع وحفظه بنجاح!", "success");
        if (statusDiv) {
          statusDiv.textContent = "تم الرفع بنجاح!";
          statusDiv.style.color = "var(--green)";
        }
        
        // Clear input file selection
        fileInput.value = "";

        // Refresh trade details
        await refreshTradeRoomData(tradeId);

      } catch (err) {
        console.error("Upload payment proof error:", err);
        toast(`فشل رفع إثبات الدفع: ${err.message}`, "error");
        if (statusDiv) {
          statusDiv.textContent = `خطأ: ${err.message}`;
          statusDiv.style.color = "#ef4444";
        }
      } finally {
        busy(btn, false);
      }
    });

    // Load advertisements on initial display
    await loadAds();
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

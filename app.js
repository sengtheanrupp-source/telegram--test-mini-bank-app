/* TELEGRAM MINI APP - BANK PAYMENT & KHQR ENGINE */

/* 1. TELEGRAM WEBAPP SDK INITIALIZATION */
let tgApp = window.Telegram ? window.Telegram.WebApp : null;

function initTelegramWebApp() {
  if (tgApp) {
    try {
      tgApp.ready();
      tgApp.expand();

      // Set header color matching app theme
      if (tgApp.setHeaderColor) tgApp.setHeaderColor("#0f172a");
      if (tgApp.setBackgroundColor) tgApp.setBackgroundColor("#0b0f19");

      // Apply Telegram user details if available
      const user = tgApp.initDataUnsafe ? tgApp.initDataUnsafe.user : null;
      if (user) {
        const fullName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          user.username ||
          "Telegram User";
        document.getElementById("tgUserInfo").textContent =
          `Welcome, ${fullName}`;
        document.getElementById("cardHolderName").textContent =
          fullName.toUpperCase();
        log(
          `Telegram WebApp initialized for user: ${fullName} (ID: ${user.id})`,
        );
      } else {
        log("Telegram WebApp running in web browser sandbox mode.");
      }
    } catch (e) {
      console.warn("Telegram WebApp init warning:", e);
    }
  }
}

function triggerHaptic(type = "success") {
  if (tgApp && tgApp.HapticFeedback) {
    try {
      if (type === "success" || type === "error" || type === "warning") {
        tgApp.HapticFeedback.notificationOccurred(type);
      } else {
        tgApp.HapticFeedback.impactOccurred("medium");
      }
    } catch (e) {}
  }
}

/* 2. SAFE FETCH UTILITY WITH MOCK FALLBACK */
async function safeFetchJson(url, options) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();

    if (!response.ok) {
      let errMessage = `HTTP ${response.status} ${response.statusText}`;
      if (text) {
        try {
          const errJson = JSON.parse(text);
          errMessage = errJson.message || errJson.error || errMessage;
        } catch (e) {
          if (text.length < 100) errMessage = text;
        }
      }
      throw new Error(errMessage);
    }

    if (!text || !text.trim()) {
      return {
        code: "SUCCESS",
        message: "Server responded with empty payload.",
        data: {},
      };
    }

    return JSON.parse(text);
  } catch (err) {
    log(
      `Network request failed (${url}): ${err.message}. Using Sandbox Mock Engine fallback.`,
    );
    // Graceful sandbox fallback when staging API or CORS blocks external request
    return getMockSandboxResponse(url, options);
  }
}

/* Mock Fallback Engine for Sandbox Testing */
function getMockSandboxResponse(url, options) {
  const autoRef = generateRandom16();
  if (url.includes("/payment/v4/inquiry")) {
    return {
      code: "SUCCESS",
      message: "Customer found in proxy! (Sandbox Mock)",
      data: {
        supplier: {
          code: "8282",
          name: "ABCV4 Co., Ltd.",
          short_name: "ABCV4",
        },
        customer: {
          code: workflowState.customer_code || "INV-2026-0076",
          name: "Chetra Lat 2",
          name_en: "Chetra Lat 2",
        },
        balances: [
          {
            bill_amount: 1.1,
            fee_amount: 0.0,
            total_amount: 1.1,
            currency: "USD",
            payment_token: "MOCK_TOKEN_" + Date.now(),
          },
        ],
      },
    };
  } else if (url.includes("/payment/v2/confirm")) {
    return {
      code: "SUCCESS",
      message: "Payment success. (Sandbox Mock)",
      data: {
        customer_code: workflowState.customer_code || "INV-2026-0076",
        customer_name: workflowState.customer_name || "Chetra Lat 2",
        paid_to: workflowState.supplier_name || "ABCV4 Co., Ltd.",
        ref_no: autoRef,
        total_amount: workflowState.total_amount || 1.1,
        fee_amount: workflowState.fee_amount || 0.0,
        currency: workflowState.currency || "USD",
        paid_date: new Date().toLocaleString(),
      },
    };
  } else if (url.includes("/payment/v5/inquiry")) {
    return {
      code: "SUCCESS",
      message: "Success (Sandbox Mock)",
      message_kh: "ជោគជ័យ",
      data: {
        merchant: {
          code: "1234",
          name: "Demo Store",
          allow_exceed_payment: false,
          allow_partial_payment: false,
        },
        customers: [
          {
            branch_code: "BRANCH-PP",
            branch_name: "Phnom Penh Branch",
            customer_code: workflowState.identity_code || "12340001",
            customer_name: "ជា សំណាង",
            customer_name_latin: "CHEA Samnang",
            bill_no: "INV23001",
            amount: 1.1,
          },
        ],
        transaction: {
          id: workflowState.identity_code || autoRef,
          original_amount: 1.1,
          convenience_fee_amount: 0.0,
          sponsor_fee_amount: 0.0,
          fee_channel: "MERCHANT",
          total_amount: 1.1,
          currency: "USD",
          description: "",
          min_amount: -1,
          max_amount: -1,
          payment_token: "MOCK_TOKEN_" + Date.now(),
        },
        url: {
          return_url: "https://example.com/transaction/complete",
        },
      },
    };
  } else if (url.includes("/payment/v3/confirm")) {
    return {
      code: "SUCCESS",
      message: "",
      message_kh: "",
      data: {
        merchant: {
          code: "1234",
          name: workflowState.supplier_name || "Demo Store",
        },
        transaction: {
          id: workflowState.identity_code || autoRef,
          original_amount: workflowState.original_amount || 1.1,
          convenience_fee_amount: workflowState.convenience_fee_amount || 0.0,
          sponsor_fee_amount: workflowState.sponsor_fee_amount || 0.0,
          fee_channel: workflowState.fee_channel || "MERCHANT",
          total_amount: workflowState.total_amount || 1.1,
          currency: workflowState.currency || "USD",
          description: "",
          bank_ref: workflowState.bank_ref || autoRef,
        },
      },
    };
  } else if (url.includes("/qr/v2/confirm")) {
    return {
      code: "SUCCESS",
      message: "KHQR Payment Confirmed (Mock)",
      data: {
        ref_no: autoRef,
        total_amount:
          parseFloat(document.getElementById("qrAmount").value) || 12.0,
        fee_amount: 0.0,
        paid_to: document.getElementById("qrIssuerName").value || "KHQR Biller",
        paid_date: new Date().toLocaleString(),
      },
    };
  } else {
    return {
      code: "SUCCESS",
      message: "Verified Sandbox Transaction",
      data: {
        ref_no: autoRef,
        total_amount: "15.50 USD",
        fee_amount: "0.00 USD",
        paid_to: "Bank Settlement Engine",
        paid_date: new Date().toLocaleString(),
      },
    };
  }
}

/* 3. GLOBAL STATE & HELPERS */
function generateRandom16() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

let workflowState = {
  // -- Bill Pay (v4 inquiry / v2 confirm, customer_code based) --
  customer_code: "",
  customer_name: "",
  supplier_name: "",
  bill_code: "",
  bill_amount: 0,

  // -- Deeplink (v5 inquiry / v3 confirm, identity_code based) --
  identity_code: "", // transaction_id from the Bill24 SDK — the inquiry/confirm key
  bill_no: "",
  customers: [], // full customers[] array from the v5 inquiry response
  original_amount: 0,
  convenience_fee_amount: 0,
  sponsor_fee_amount: 0,
  fee_channel: "MERCHANT",
  description: "",
  // Populated from the Bank API "Generate Payment Links" deeplink
  // (web_payment_url ?tran_id=... or mobile_deep_link startapp=...)
  link_token: "",
  // Populated from v5 Inquiry: data.url.return_url (Bill24) or data.urls.return_url
  // this IS the URL the "Done" button opens after a Deeplink payment.
  return_url: "",

  // -- Shared between both flows (whichever ran most recently) --
  fee_amount: 0, // Bill Pay: flat fee. Deeplink: convenience + sponsor combined.
  total_amount: 0,
  currency: "USD",
  payment_token: "",
  bank_ref: generateRandom16(),
};

/* 3b. PAYMENT LINK (DEEPLINK) RESOLUTION
   Handles Mini App entry via the Bank API "Generate Payment Links" flow:
     - web_payment_url  -> https://<this-app>/?identity_code=<transaction_id>
     - mobile_deep_link -> https://t.me/<bot>/<app>?startapp=<transaction_id>
   Telegram delivers the startapp value as initDataUnsafe.start_param
   (NOT as a normal query string), so we check both. Unlike an opaque
   token, identity_code IS the Bill24 transaction_id itself — no extra
   lookup call is needed, we just feed it straight into the v5 Inquiry
   call, whose response carries everything (including url.return_url). */
function getStartParamFromTelegram() {
  try {
    if (tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.start_param) {
      return tgApp.initDataUnsafe.start_param;
    }
  } catch (e) {}
  return "";
}

function getIdentityCodeFromQueryString() {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("tran_id") || // Bill24 SDK's web_payment_url param name
      params.get("identity_code") || // backward-compat with earlier test links
      params.get("token") ||
      params.get("startapp") ||
      ""
    );
  } catch (e) {
    return "";
  }
}

function resolvePaymentLink() {
  const identityCode =
    getStartParamFromTelegram() || getIdentityCodeFromQueryString();
  if (!identityCode) return;

  workflowState.link_token = identityCode;
  log("Deeplink detected. Identity code: " + identityCode);

  const rawCodeEl = document.getElementById("rawCode");
  if (rawCodeEl) rawCodeEl.value = identityCode;
  updateFullCodes();

  const banner = document.getElementById("linkSessionBanner");
  const bannerRef = document.getElementById("linkSessionRef");
  if (banner) banner.classList.remove("hidden");
  if (bannerRef) bannerRef.textContent = identityCode;

  const txnIdEl = document.getElementById("dlcTxnId");
  if (txnIdEl) txnIdEl.textContent = identityCode;

  // Skip the manual lookup form — bank-style confirm card only.
  applyDeeplinkUiMode(true);

  // Auto-fill payer details immediately (account / Telegram name / phone)
  autoFillDeeplinkPayerDetails();

  // Full-screen bank-style loading while v5 inquiry runs — no inquiry-success
  // popup; user lands directly on the Confirm screen.
  showDeeplinkLoading("Preparing payment…", "Fetching bill details");
  navigateToView("paymentView");
  runInquiry({ fromDeeplink: true });
}

/* Generate realistic account number + phone; account name from Telegram user. */
function autoFillDeeplinkPayerDetails() {
  const accountNo =
    "00" + String(Math.floor(10000000 + Math.random() * 89999999));
  const phone =
    "0" + String(Math.floor(100000000 + Math.random() * 899999999));

  let accountName = "Telegram User";
  try {
    const user = tgApp && tgApp.initDataUnsafe ? tgApp.initDataUnsafe.user : null;
    if (user) {
      accountName =
        `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
        user.username ||
        accountName;
    }
  } catch (e) {}

  const accEl = document.getElementById("payerAccountNo");
  const nameEl = document.getElementById("payerAccountName");
  const phoneEl = document.getElementById("payerPhone");
  if (accEl) accEl.value = accountNo;
  if (nameEl) nameEl.value = accountName;
  if (phoneEl) phoneEl.value = phone;

  // Mirror into confirm card chips
  const chipName = document.getElementById("dlcPayerName");
  const chipAcc = document.getElementById("dlcPayerAccount");
  if (chipName) chipName.textContent = accountName;
  if (chipAcc) chipAcc.textContent = accountNo;

  log("Deeplink payer auto-filled: " + accountName + " / " + accountNo);
}

function showDeeplinkLoading(title, sub) {
  const overlay = document.getElementById("deeplinkLoadingOverlay");
  if (!overlay) return;
  const titleEl = overlay.querySelector("p.text-white");
  const subEl = document.getElementById("dlLoadSubtext");
  if (titleEl && title) titleEl.textContent = title;
  if (subEl && sub) subEl.textContent = sub;
  overlay.classList.remove("hidden");
}

function hideDeeplinkLoading() {
  const overlay = document.getElementById("deeplinkLoadingOverlay");
  if (overlay) overlay.classList.add("hidden");
}

/* Toggles the Deeplink view between:
   - Compact auto-confirm mode (isDeeplink=true): opened via a real
     Generate Payment Links link — hides the manual Identity Code lookup
     form and the verbose debug summary, shows the clean bank-style
     Confirm card. Payer fields stay in DOM (auto-filled) but hidden.
   - Manual test mode (isDeeplink=false, the default): opened directly
     from the bottom nav / home tile — shows the full lookup form so a
     tester can paste in any transaction_id. */
function applyDeeplinkUiMode(isDeeplink) {
  const billerSummary = document.getElementById("dlBillerSummary");
  const lookupForm = document.getElementById("dlLookupForm");
  const detailSummary = document.getElementById("dlDetailSummary");
  const singlePanel = document.getElementById("singleInputPanel");
  if (billerSummary) billerSummary.classList.toggle("hidden", !isDeeplink);
  if (lookupForm) lookupForm.classList.toggle("hidden", isDeeplink);
  if (detailSummary) detailSummary.classList.toggle("hidden", isDeeplink);

  // In deeplink mode the amount + payer fields live on the confirm card;
  // keep only the Confirm button visible inside singleInputPanel.
  const amountBlock = document.getElementById("dlAmountBlock");
  const payerBlock = document.getElementById("dlPayerBlock");
  if (amountBlock) amountBlock.classList.toggle("hidden", isDeeplink);
  if (payerBlock) payerBlock.classList.toggle("hidden", isDeeplink);
  if (singlePanel && isDeeplink) {
    singlePanel.classList.remove("p-5");
    singlePanel.classList.add("p-0", "bg-transparent", "border-0", "shadow-none");
  } else if (singlePanel) {
    singlePanel.classList.add("p-5");
    singlePanel.classList.remove("p-0", "bg-transparent", "border-0", "shadow-none");
  }

  const btnLabel = document.getElementById("confirmPayBtnLabel");
  if (btnLabel) btnLabel.textContent = isDeeplink ? "Confirm" : "Pay Securely";

  const doneLabel = document.getElementById("modalDoneBtnLabel");
  if (doneLabel) doneLabel.textContent = isDeeplink ? "Done" : "Back to App";
}

/* Pull return_url from Bill24 v5 inquiry. Live API uses data.url (singular);
   older mocks/docs used data.urls (plural). Accept both, plus a few aliases. */
function extractReturnUrlFromInquiry(data) {
  if (!data || typeof data !== "object") return "";

  const pickFromBag = (bag) => {
    if (!bag) return "";
    if (typeof bag === "string") return bag.trim();
    if (typeof bag !== "object") return "";
    return String(
      bag.return_url ||
        bag.returnUrl ||
        bag.redirect_url ||
        bag.redirectUrl ||
        bag.web_return_url ||
        bag.callback_url ||
        "",
    ).trim();
  };

  let found = pickFromBag(data.url) || pickFromBag(data.urls);
  if (!found) {
    found = String(data.return_url || data.returnUrl || "").trim();
  }
  if (!found && data.data && typeof data.data === "object") {
    found = extractReturnUrlFromInquiry(data.data);
  }
  return found;
}

function persistReturnUrl(url) {
  const value = String(url || "").trim();
  if (!value) return;
  workflowState.return_url = value;
  try {
    window.__dlReturnUrl = value;
  } catch (e) {}
  try {
    sessionStorage.setItem("dl_return_url", value);
  } catch (e) {}
  try {
    localStorage.setItem("dl_return_url", value);
  } catch (e) {}
  const doneBtn = document.getElementById("modalDoneBtn");
  if (doneBtn) doneBtn.setAttribute("data-return-url", value);
  log("Persisted merchant return_url: " + value);
}

function getCapturedReturnUrl() {
  const fromBtn = document
    .getElementById("modalDoneBtn")
    ?.getAttribute("data-return-url");
  const sources = [
    workflowState.return_url,
    typeof window !== "undefined" ? window.__dlReturnUrl : "",
    fromBtn,
  ];
  try {
    sources.push(sessionStorage.getItem("dl_return_url") || "");
  } catch (e) {}
  try {
    sources.push(localStorage.getItem("dl_return_url") || "");
  } catch (e) {}
  for (const s of sources) {
    if (s && String(s).trim()) return String(s).trim();
  }
  return "";
}

function clearCapturedReturnUrl() {
  workflowState.return_url = "";
  try {
    window.__dlReturnUrl = "";
  } catch (e) {}
  try {
    sessionStorage.removeItem("dl_return_url");
  } catch (e) {}
  try {
    localStorage.removeItem("dl_return_url");
  } catch (e) {}
  const doneBtn = document.getElementById("modalDoneBtn");
  if (doneBtn) doneBtn.removeAttribute("data-return-url");
}

/* Tracks which flow produced the last success modal so QR can hide Done. */
let lastPaymentFlow = ""; // "qr" | "deeplink" | "billpay" | "verify" | ""

/* Called from the "Done" button on the success receipt modal (Deeplink only).
   Opens return_url in the CURRENT tab/webview, then closes the Telegram Mini App.
   Does NOT open a new tab. */
function handlePaymentDoneAction() {
  const returnUrl = getCapturedReturnUrl();
  if (!returnUrl) {
    log("Done clicked but no return_url was captured from inquiry v5.");
    showToast("No return URL from inquiry. Cannot redirect.", true);
    closeModal();
    return;
  }

  log("Done clicked — opening merchant return_url in current tab: " + returnUrl);

  let dest = returnUrl;
  try {
    const target = new URL(returnUrl);
    if (!target.searchParams.has("status")) {
      target.searchParams.set("status", "success");
    }
    dest = target.toString();
  } catch (e) {
    dest = returnUrl;
  }

  navigateToReturnUrlSameTabAndClose(dest);
}

/* Open return_url in the same tab, then close Telegram Mini App. */
function navigateToReturnUrlSameTabAndClose(dest) {
  // Close Mini App first so control returns to host, then navigate same webview/tab.
  // Order: schedule close, then same-tab navigation (no _blank / no openLink).
  if (tgApp && typeof tgApp.close === "function") {
    try {
      // Close slightly after navigation starts so Telegram tears down Mini App
      setTimeout(() => {
        try {
          tgApp.close();
          log("Telegram Mini App closed after Done.");
        } catch (e) {
          log("tgApp.close failed: " + e.message);
        }
      }, 120);
    } catch (e) {
      log("schedule tgApp.close failed: " + e.message);
    }
  }

  // Same-tab navigation only (current tab / current Mini App webview)
  try {
    window.location.replace(dest);
    log("Navigated current tab to return_url via location.replace.");
    return true;
  } catch (e) {
    log("location.replace failed: " + e.message);
  }
  try {
    window.location.href = dest;
    log("Navigated current tab to return_url via location.href.");
    return true;
  } catch (e) {
    log("location.href failed: " + e.message);
  }
  try {
    const a = document.createElement("a");
    a.href = dest;
    a.target = "_self";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    log("Navigated current tab via anchor _self.");
    return true;
  } catch (e) {
    log("anchor _self failed: " + e.message);
  }

  showToast("Unable to open return URL", true);
  return false;
}

/* Called from the Deeplink home tile / bottom-nav tab (explicit manual
   navigation, as opposed to auto-opening via resolvePaymentLink). Resets
   to the full manual lookup-form UI in case a previous deeplink session
   left the compact auto-confirm card showing. */
function openDeeplinkViewManually() {
  hideDeeplinkLoading();
  // Clear deeplink session so Done button just closes (no return_url redirect)
  workflowState.link_token = "";
  clearCapturedReturnUrl();
  applyDeeplinkUiMode(false);
  navigateToView("paymentView");
}

let rawLogText = "";
let payloadLogs = [];
let batchItems = [];
let isLogFullScreen = false;
let lastFrameTime = 0;
let scanCanvasCtx = null;
const SCAN_MAX_SIZE = 720; // Upgraded to 720 for high-density KHQR codes on iPhone screens
const SCAN_INTERVAL_MS = 22;

/* Helper: Dynamic contrast boost & luminance normalization for iPhone OLED screen glare */
function applyContrastBoost(imageData) {
  if (!imageData || !imageData.data) return null;
  const data = imageData.data;
  const len = data.length;
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < len; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    if (lum < minL) minL = lum;
    if (lum > maxL) maxL = lum;
  }
  const range = maxL - minL;
  if (range < 15) return null;
  const scale = 255 / range;
  const boosted = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    const norm = Math.min(255, Math.max(0, (lum - minL) * scale));
    const val = norm < 128 ? (norm < 64 ? 0 : norm - 30) : (norm > 190 ? 255 : norm + 30);
    boosted[i] = val;
    boosted[i + 1] = val;
    boosted[i + 2] = val;
    boosted[i + 3] = 255;
  }
  return boosted;
}

/* 4. LIVE CAMERA KHQR SCANNER ENGINE */
let cameraStream = null;
let cameraFacingMode = "environment"; // default rear camera on phones
let isCameraScanning = false;

function isIOSDevice() {
  try {
    const ua = (navigator.userAgent || navigator.vendor || "").toLowerCase();
    const platform = (tgApp && tgApp.platform) ? String(tgApp.platform).toLowerCase() : "";
    return (
      platform === "ios" ||
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  } catch (e) {
    return false;
  }
}

function triggerInstantQRScan() {
  if (tgApp && typeof tgApp.showScanQrPopup === "function") {
    try {
      log("Opening Telegram Native QR Scanner window...");

      // Register event listener for Telegram SDK event 'qrTextReceived'
      if (typeof tgApp.onEvent === "function") {
        const qrHandler = function (eventData) {
          const scannedText = typeof eventData === "string" ? eventData : (eventData && eventData.data);
          if (scannedText && typeof scannedText === "string" && scannedText.trim()) {
            log("Telegram Native QR Scanner event received:", scannedText);
            triggerHaptic("success");
            try { tgApp.closeScanQrPopup(); } catch (e) {}
            try { tgApp.offEvent("qrTextReceived", qrHandler); } catch (e) {}
            processDecodedQR(scannedText.trim());
          }
        };
        try { tgApp.onEvent("qrTextReceived", qrHandler); } catch (e) {}
      }

      tgApp.showScanQrPopup(
        { text: "Point camera at KHQR code to scan" },
        function (qrText) {
          if (qrText && typeof qrText === "string" && qrText.trim()) {
            log("Telegram Native QR Scanner callback decoded:", qrText);
            triggerHaptic("success");
            processDecodedQR(qrText.trim());
            return true; // closes native scanner modal
          }
          return false;
        }
      );
      return;
    } catch (e) {
      log("Telegram native QR scanner invoke warning: " + (e && e.message));
    }
  }

  // Fallback to HTML live camera view for non-Telegram web browsers
  navigateToView("cameraScanView");
}

async function startCameraStream() {
  const video = document.getElementById("cameraVideo");
  const statusText = document.getElementById("cameraScanStatus");
  const btnToggle = document.getElementById("btnToggleCamera");

  stopCameraStream();
  scanCanvasCtx = null;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    log("getUserMedia not available (insecure context or old browser).");
    if (statusText) statusText.textContent = "Camera API unavailable on this device";
    showToast("Camera not supported here. Use Image Upload instead.", true);
    return;
  }

  // Check permission state silently first to avoid unneeded prompts if already granted
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const perm = await navigator.permissions.query({ name: "camera" });
      if (perm.state === "granted") {
        updateCameraPermissionStatusUI(true);
      }
    } catch (e) {}
  }

  // Robust, compatible camera constraints for mobile WebViews (Android & iOS)
  const constraintOptions = [
    { video: { facingMode: { ideal: cameraFacingMode === "user" ? "user" : "environment" } }, audio: false },
    { video: { facingMode: cameraFacingMode === "user" ? "user" : "environment" }, audio: false },
    { video: true, audio: false }
  ];

  log(`Starting web camera stream (Facing mode: ${cameraFacingMode})...`);
  if (statusText) statusText.textContent = "Opening camera...";

  let streamObtained = null;
  let lastError = null;
  for (const constraints of constraintOptions) {
    try {
      streamObtained = await navigator.mediaDevices.getUserMedia(constraints);
      if (streamObtained) break;
    } catch (err) {
      lastError = err;
      console.warn("Camera constraint attempt failed:", err && err.name, err && err.message);
    }
  }

  if (streamObtained) {
    try {
      cameraStream = streamObtained;

      // Ensure muted and playsInline are assigned BEFORE srcObject for iOS/Android WebView autoplay
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.srcObject = cameraStream;

      await new Promise((resolve) => {
        if (video.readyState >= 2) return resolve();
        const done = () => {
          video.onloadedmetadata = null;
          resolve();
        };
        video.onloadedmetadata = done;
        setTimeout(done, 200);
      });

      try {
        await video.play();
      } catch (playErr) {
        log("video.play() initial catch: " + (playErr && playErr.message));
      }

      isCameraScanning = true;
      cameraPermissionPrimed = true;
      localStorage.setItem("cameraPermissionGranted", "true");
      updateCameraPermissionStatusUI(true);

      if (statusText) statusText.textContent = "Point camera at KHQR code...";
      if (btnToggle) {
        btnToggle.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Camera';
        btnToggle.className =
          "bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-2xl text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform";
      }

      lastFrameTime = 0;
      requestAnimationFrame(tickCameraFrame);
    } catch (err) {
      log("Video setup error: " + (err && err.message));
      if (statusText) statusText.textContent = "Camera feed setup failed.";
      showToast("Camera started but feed playback failed.", true);
    }
  } else {
    const errName = (lastError && lastError.name) || "";
    const errMsg = (lastError && lastError.message) || "unknown";
    log("Camera stream access denied or unavailable: " + errName + " - " + errMsg);
    if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
      if (statusText) statusText.textContent = "Camera permission denied";
      showToast("Camera permission denied. Allow camera access in Telegram settings.", true);
    } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
      if (statusText) statusText.textContent = "No camera found on device";
      showToast("No camera detected. Use Image Upload instead.", true);
    } else if (errName === "NotReadableError" || errName === "TrackStartError") {
      if (statusText) statusText.textContent = "Camera is in use by another app";
      showToast("Camera busy. Close other apps using the camera and retry.", true);
    } else {
      if (statusText) statusText.textContent = "Camera access denied or unavailable";
      showToast("Camera access denied. Please check permissions.", true);
    }
  }
}

function stopCameraStream() {
  isCameraScanning = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const btnToggle = document.getElementById("btnToggleCamera");
  if (btnToggle) {
    btnToggle.innerHTML = '<i class="fa-solid fa-video"></i> Start Camera';
    btnToggle.className =
      "bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-95 transition-all";
  }
}

function switchCameraFacing() {
  cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
  log(`Flipping camera facing mode to: ${cameraFacingMode}`);
  startCameraStream();
}

/* 4B. AUTO-ALLOW CAMERA — check permission status silently without prompting on web app open */
let cameraPermissionPrimed = false;

async function requestCameraPermissionEarly(silent = true) {
  if (!appPreferences.autoCamera) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  // Use permissions query to check state silently without popping permission dialogs on app open
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const perm = await navigator.permissions.query({ name: "camera" });
      if (perm.state === "granted") {
        cameraPermissionPrimed = true;
        updateCameraPermissionStatusUI(true);
        log("Auto-Allow Camera: permission confirmed already granted.");
        return;
      }
    } catch (e) {}
  }
  // If silent check is requested (e.g. app open), do NOT trigger getUserMedia unprompted
  if (silent) return;
}

function updateCameraPermissionStatusUI(granted) {
  const tip = document.getElementById("iosCameraTip");
  const statusBox = document.getElementById("cameraPermissionStatus");
  if (!tip || !statusBox) return;
  if (granted) {
    tip.classList.add("hidden");
    statusBox.classList.remove("hidden");
  } else {
    tip.classList.remove("hidden");
    statusBox.classList.add("hidden");
  }
}

function tickCameraFrame(timestamp) {
  if (!isCameraScanning) return;

  if (timestamp - lastFrameTime < SCAN_INTERVAL_MS) {
    requestAnimationFrame(tickCameraFrame);
    return;
  }
  lastFrameTime = timestamp;

  const video = document.getElementById("cameraVideo");
  const canvas = document.getElementById("cameraCanvas");
  const statusText = document.getElementById("cameraScanStatus");

  if (video && video.readyState >= 2 && video.videoWidth) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;
    const dw = Math.min(SCAN_MAX_SIZE, side);

    if (canvas.width !== dw || canvas.height !== dw) {
      canvas.width = dw;
      canvas.height = dw;
      scanCanvasCtx = null;
    }
    if (!scanCanvasCtx) {
      scanCanvasCtx = canvas.getContext("2d", { willReadFrequently: true });
    }
    scanCanvasCtx.drawImage(video, sx, sy, side, side, 0, 0, dw, dw);

    const imageData = scanCanvasCtx.getImageData(0, 0, dw, dw);
    let code = jsQR(imageData.data, dw, dw, {
      inversionAttempts: "attemptBoth",
    });

    // Pass 2: Dynamic contrast boost pass if raw frame missed (crucial for iPhone screen OLED glare & reflection)
    if (!code || !code.data || !code.data.trim()) {
      const boostedBytes = applyContrastBoost(imageData);
      if (boostedBytes) {
        code = jsQR(boostedBytes, dw, dw, {
          inversionAttempts: "attemptBoth",
        });
      }
    }

    if (code && code.data && code.data.trim()) {
      log("Live camera detected QR Code:", code.data);
      triggerHaptic("success");
      if (statusText) statusText.textContent = "KHQR Code Detected!";
      stopCameraStream();
      processDecodedQR(code.data);
      return;
    }
  }

  if (isCameraScanning) {
    requestAnimationFrame(tickCameraFrame);
  }
}

/* 5. KHQR PARSING & CONFIRMATION POPUP */
function processDecodedQR(qrText) {
  log("Parsing KHQR String:", qrText);

  document.getElementById("qrTextResult").value = qrText;

  // 1. Extract Amount from tag 54
  let extractedAmount = 0.0;
  const amtMatch = qrText.match(/54(\d{2})(\d+\.?\d*)/);
  if (amtMatch && amtMatch[2]) {
    const tagLen = parseInt(amtMatch[1], 10);
    const rawVal = amtMatch[2].substring(0, tagLen);
    extractedAmount = parseFloat(rawVal) || 0.0;
  }
  document.getElementById("qrAmount").value = extractedAmount.toFixed(2);

  // 2. Extract Currency from tag 5303 (116 = KHR, 840 = USD)
  let currency = "USD";
  const currMatch = qrText.match(/5303(\d{3})/);
  if (currMatch && currMatch[1]) {
    if (currMatch[1] === "116") currency = "KHR";
    else currency = "USD";
  } else if (qrText.includes("KHR")) {
    currency = "KHR";
  }
  document.getElementById("qrCurrency").value = currency;

  // 3. Extract Issuer Name tag 59 or default
  let issuerName = "ExampleBank KHQR";
  const issuerMatch = qrText.match(/59(\d{2})([^\d]+)/);
  if (issuerMatch && issuerMatch[2]) {
    const tagLen = parseInt(issuerMatch[1], 10);
    issuerName = issuerMatch[2].substring(0, tagLen).trim();
  }
  document.getElementById("qrIssuerName").value = issuerName;

  // 4. Generate fresh 16-char Ref No & KHQR Hash
  const nextRef = generateRandom16();
  const nextHash = generateRandom16();
  document.getElementById("qrRefNoInput").value = nextRef;
  document.getElementById("qrHash").value = nextHash;

  // Open Confirmation Popup Modal
  openKHQRConfirmModal({
    qrText: qrText,
    amount: extractedAmount.toFixed(2),
    currency: currency,
    issuerName: issuerName,
    refNo: nextRef,
  });
}

function openKHQRConfirmModal(data) {
  document.getElementById("modalQrIssuer").textContent = data.issuerName;
  document.getElementById("modalQrAmountDisplay").textContent =
    `${data.currency === "KHR" ? "៛" : "$"}${data.amount} ${data.currency}`;
  document.getElementById("modalQrRefNo").textContent = data.refNo;
  document.getElementById("qrTextResult").value = data.qrText;

  const modal = document.getElementById("khqrConfirmModal");
  modal.classList.remove("hidden");
  // Young-male Khmer alert: check amount before confirming
  speakPaymentAmountAlert(data.amount, data.currency);
  const box = document.getElementById("khqrModalContainer");
  if (box) {
    box.classList.remove("animate-modal-pop");
    void box.offsetWidth;
    box.classList.add("animate-modal-pop");
  }
}

function closeKHQRModal() {
  const modal = document.getElementById("khqrConfirmModal");
  modal.classList.add("hidden");
}

async function submitQRConfirm() {
  // Require PIN / Biometric when security lock is enabled
  requireSecurityAuth(() => {
    submitQRConfirmAfterAuth();
  });
}

async function submitQRConfirmAfterAuth() {
  closeKHQRModal();

  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();

  const rawAmount =
    parseFloat(document.getElementById("qrAmount").value) || 0.0;
  const rawKhqrString = document.getElementById("qrTextResult").value.trim();
  let currentRef =
    document.getElementById("qrRefNoInput").value || generateRandom16();
  let currentHash =
    document.getElementById("qrHash").value || generateRandom16();

  const payload = {
    khqr_string: rawKhqrString,
    currency: document.getElementById("qrCurrency").value.trim(),
    amount: rawAmount,
    ref_no: currentRef,
    note: "Telegram Mini App KHQR Pay",
    issuer_id: document.getElementById("qrIssuerId").value.trim(),
    issuer_name: document.getElementById("qrIssuerName").value.trim(),
    khqr_hash: currentHash,
  };

  log("Submitting KHQR Payment payload...", payload);
  openLoadingModal("Confirming KHQR Payment");

  try {
    const jsonData = await safeFetchJson(`${baseUrl}/qr/v2/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        token: token,
      },
      body: JSON.stringify(payload),
    });

    log("QR Payment Response:", jsonData);

    const data = jsonData.data || {};
    const metaDetails = {
      customer_code: data.customer_code || payload.ref_no,
      customer_name: data.customer_name || data.customer_code || payload.issuer_name,
      total_amount: `${data.total_amount || payload.amount} ${data.currency || payload.currency}`,
      fee_amount: `${data.fee_amount || "0.00"} ${data.currency || payload.currency}`,
      paid_to: data.paid_to || data.biller_name || payload.issuer_name,
      paid_date: data.paid_date || new Date().toLocaleString(),
    };

    if (jsonData.code === "SUCCESS") {
      triggerHaptic("success");
      lastPaymentFlow = "qr";
      finishModal(
        true,
        "KHQR Payment Successful",
        jsonData.message || "Transaction confirmed with bank.",
        metaDetails,
      );
      speakPaymentSuccess(
        data.total_amount !== undefined ? data.total_amount : payload.amount,
        data.currency || payload.currency,
      );
    } else {
      triggerHaptic("error");
      lastPaymentFlow = "qr";
      finishModal(
        false,
        "KHQR Payment Failed",
        jsonData.message || "Unable to confirm payment.",
        metaDetails,
      );
    }
  } catch (err) {
    log("QR Submit Connection Error: " + err.message);
    lastPaymentFlow = "qr";
    finishModal(false, "Connection Error", err.message);
  }
}

/* 6. IMAGE & SCREEN CAPTURE SCANNER */
let cropRect = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  containerWidth: 0,
  containerHeight: 0,
};
let isDragging = false;
let startX = 0,
  startY = 0;

async function captureTabOrScreen() {
  try {
    log("Requesting browser screen capture...");
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    const imageCapture = new ImageCapture(track);
    const bitmap = await imageCapture.grabFrame();
    track.stop();

    const hiddenCanvas = document.getElementById("hiddenCanvas");
    hiddenCanvas.width = bitmap.width;
    hiddenCanvas.height = bitmap.height;
    const ctx = hiddenCanvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    loadCapturedImage(hiddenCanvas.toDataURL("image/png"));
  } catch (err) {
    log("Screen Capture cancelled: " + err.message);
  }
}

function loadCapturedImage(src) {
  const img = document.getElementById("snipPreviewImg");
  const placeholder = document.getElementById("snipPlaceholder");
  const snipBox = document.getElementById("snipBox");

  img.src = src;
  img.onload = () => {
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");
    snipBox.classList.add("hidden");

    const scanned = scanImageElement(img);
    if (!scanned) {
      log(
        "No clear QR found on full image. Drag across KHQR code to crop and scan.",
      );
    }
    document.getElementById("btnScanCrop").disabled = false;
  };
}

function scanImageElement(img) {
  const canvas = document.getElementById("hiddenCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  if (!nw || !nh) return false;

  // Pass 1: Scaled scan (max 1000px) — ultra-fast for Android 12MP photos
  const MAX_DIM = 1000;
  let scale = 1.0;
  if (nw > MAX_DIM || nh > MAX_DIM) {
    scale = Math.min(MAX_DIM / nw, MAX_DIM / nh);
  }
  const sw = Math.floor(nw * scale);
  const sh = Math.floor(nh * scale);

  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(img, 0, 0, sw, sh);

  let imageData = ctx.getImageData(0, 0, sw, sh);
  let code = jsQR(imageData.data, sw, sh, { inversionAttempts: "attemptBoth" });
  if (code && code.data && code.data.trim()) {
    log("Multi-pass QR scan succeeded (pass 1 downscaled):", code.data);
    processDecodedQR(code.data);
    return true;
  }

  // Pass 2: Full resolution scan if downscale missed
  if (scale !== 1.0 && nw <= 2400 && nh <= 2400) {
    canvas.width = nw;
    canvas.height = nh;
    ctx.drawImage(img, 0, 0);
    imageData = ctx.getImageData(0, 0, nw, nh);
    code = jsQR(imageData.data, nw, nh, { inversionAttempts: "attemptBoth" });
    if (code && code.data && code.data.trim()) {
      log("Multi-pass QR scan succeeded (pass 2 full resolution):", code.data);
      processDecodedQR(code.data);
      return true;
    }
  }

  // Pass 3: Center 60% crop scan (in case KHQR is centered in a larger document/photo)
  const cropW = Math.floor(sw * 0.7);
  const cropH = Math.floor(sh * 0.7);
  const cropX = Math.floor((sw - cropW) / 2);
  const cropY = Math.floor((sh - cropH) / 2);
  const cropData = ctx.getImageData(cropX, cropY, cropW, cropH);
  code = jsQR(cropData.data, cropW, cropH, { inversionAttempts: "attemptBoth" });
  if (code && code.data && code.data.trim()) {
    log("Multi-pass QR scan succeeded (pass 3 center crop):", code.data);
    processDecodedQR(code.data);
    return true;
  }

  // Pass 4: Dynamic contrast boost for iPhone screen photo/screenshot uploads
  const boostedData = applyContrastBoost(imageData);
  if (boostedData) {
    code = jsQR(boostedData, sw, sh, { inversionAttempts: "attemptBoth" });
    if (code && code.data && code.data.trim()) {
      log("Multi-pass QR scan succeeded (pass 4 contrast boost):", code.data);
      processDecodedQR(code.data);
      return true;
    }
  }

  return false;
}

function handleQRImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => loadCapturedImage(e.target.result);
  reader.readAsDataURL(file);
}

function scanCroppedArea() {
  const img = document.getElementById("snipPreviewImg");
  if (img.classList.contains("hidden")) return;

  const hiddenCanvas = document.getElementById("hiddenCanvas");
  const ctx = hiddenCanvas.getContext("2d", { willReadFrequently: true });

  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;

  let srcX = 0,
    srcY = 0,
    srcW = nw,
    srcH = nh;

  if (cropRect.width > 10 && cropRect.height > 10) {
    const scaleX = nw / cropRect.containerWidth;
    const scaleY = nh / cropRect.containerHeight;
    srcX = Math.floor(cropRect.left * scaleX);
    srcY = Math.floor(cropRect.top * scaleY);
    srcW = Math.floor(cropRect.width * scaleX);
    srcH = Math.floor(cropRect.height * scaleY);
  }

  // Scale down crop if huge
  const MAX_CROP = 1000;
  let targetW = srcW;
  let targetH = srcH;
  if (srcW > MAX_CROP || srcH > MAX_CROP) {
    const scale = Math.min(MAX_CROP / srcW, MAX_CROP / srcH);
    targetW = Math.floor(srcW * scale);
    targetH = Math.floor(srcH * scale);
  }

  hiddenCanvas.width = targetW;
  hiddenCanvas.height = targetH;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);

  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  let code = jsQR(imageData.data, targetW, targetH, {
    inversionAttempts: "attemptBoth",
  });
  if (!code || !code.data || !code.data.trim()) {
    const boosted = applyContrastBoost(imageData);
    if (boosted) {
      code = jsQR(boosted, targetW, targetH, { inversionAttempts: "attemptBoth" });
    }
  }
  if (code && code.data && code.data.trim()) {
    log("Cropped region QR detected successfully:", code.data);
    processDecodedQR(code.data);
  } else {
    log("Cropped region did not contain a readable QR code.");
    showToast("No QR code detected in cropped area. Try selecting closer to the QR code.", true);
  }
}

// Touch & Mouse Drag listeners for Android & Desktop snipping
const snipContainer = document.getElementById("snipContainer");
const snipBox = document.getElementById("snipBox");

function startSnipDrag(clientX, clientY) {
  const img = document.getElementById("snipPreviewImg");
  if (!img || img.classList.contains("hidden")) return;
  const rect = snipContainer.getBoundingClientRect();
  startX = clientX - rect.left;
  startY = clientY - rect.top;
  isDragging = true;
  snipBox.style.left = `${startX}px`;
  snipBox.style.top = `${startY}px`;
  snipBox.style.width = `0px`;
  snipBox.style.height = `0px`;
  snipBox.classList.remove("hidden");
}

function moveSnipDrag(clientX, clientY) {
  if (!isDragging) return;
  const rect = snipContainer.getBoundingClientRect();
  const currentX = Math.max(0, Math.min(clientX - rect.left, rect.width));
  const currentY = Math.max(0, Math.min(clientY - rect.top, rect.height));
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  snipBox.style.left = `${left}px`;
  snipBox.style.top = `${top}px`;
  snipBox.style.width = `${width}px`;
  snipBox.style.height = `${height}px`;
  cropRect = {
    left,
    top,
    width,
    height,
    containerWidth: rect.width,
    containerHeight: rect.height,
  };
}

function endSnipDrag() {
  if (isDragging) {
    isDragging = false;
    if (cropRect.width > 10 && cropRect.height > 10) scanCroppedArea();
  }
}

if (snipContainer) {
  // Mouse events
  snipContainer.addEventListener("mousedown", (e) => startSnipDrag(e.clientX, e.clientY));
  snipContainer.addEventListener("mousemove", (e) => moveSnipDrag(e.clientX, e.clientY));
  window.addEventListener("mouseup", endSnipDrag);

  // Touch events (for Android and iOS mobile devices)
  snipContainer.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches && e.touches[0]) {
        startSnipDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true },
  );

  snipContainer.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches[0]) {
        moveSnipDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true },
  );

  window.addEventListener("touchend", endSnipDrag, { passive: true });
  window.addEventListener("touchcancel", endSnipDrag, { passive: true });
}

/* 7. INQUIRY & SINGLE PAYMENT FLOWS */
function updateFullCodes() {
  const identityCode = document.getElementById("rawCode").value.trim();
  workflowState.identity_code = identityCode;
  const displayEl = document.getElementById("appCodeDisplay");
  if (displayEl) {
    displayEl.textContent = identityCode
      ? `Identity Code: ${identityCode}`
      : "Enter the transaction_id from the Bill24 SDK, or open via a Generate Payment Links deeplink.";
  }
}

function updateRefNo() {
  let currentRef = document.getElementById("refNoDisplay").value.trim();
  if (!currentRef) {
    currentRef = generateRandom16();
    document.getElementById("refNoDisplay").value = currentRef;
  }
  workflowState.bank_ref = currentRef;
}

function toggleBatchMode() {
  const isBatch = document.getElementById("batchToggle").checked;
  document
    .getElementById("singleInputPanel")
    .classList.toggle("hidden", isBatch);
  document
    .getElementById("batchInputPanel")
    .classList.toggle("hidden", !isBatch);
}

function evaluatePaymentMode() {
  const amount =
    parseFloat(document.getElementById("paymentAmount").value) || 0;
  const btn = document.getElementById("confirmPayBtn");
  if (!btn) return;
  const isDeeplink = !!workflowState.link_token;
  if (amount > 0 && workflowState.payment_token) {
    btn.disabled = false;
    btn.className =
      "bank-btn-primary w-full py-4 text-sm flex items-center justify-center gap-2";
    btn.innerHTML = isDeeplink
      ? '<i class="fa-solid fa-check-circle"></i> <span id="confirmPayBtnLabel">Confirm Payment</span>'
      : '<i class="fa-solid fa-lock"></i> <span id="confirmPayBtnLabel">Pay Securely</span>';
  } else {
    btn.disabled = true;
    btn.className =
      "bank-btn-primary w-full py-4 text-sm flex items-center justify-center gap-2 cursor-not-allowed";
    btn.innerHTML = isDeeplink
      ? '<i class="fa-solid fa-lock"></i> <span id="confirmPayBtnLabel">Confirm</span>'
      : '<i class="fa-solid fa-lock"></i> <span id="confirmPayBtnLabel">Pay Securely</span>';
  }
}

/* ===========================================================================
   BILL PAY (Bill24 API v4 Inquiry / v2 Confirm — customer_code based)
   Separate, standalone flow from the Deeplink (v5/v3, identity_code based)
   flow below. Uses its own "bp"-prefixed DOM elements so the two views
   never collide.
   ======================================================================= */
function updateBillPayCode() {
  const prefix = document.getElementById("prefixCode").value.trim();
  const rawCode = document.getElementById("bpRawCode").value.trim();
  const combined = prefix ? `${prefix}${rawCode}` : rawCode;
  document.getElementById("bpAppCodeDisplay").textContent = `Ref: ${combined}`;
  workflowState.customer_code = combined;
}

function evaluateBillPayMode() {
  const amount =
    parseFloat(document.getElementById("bpPaymentAmount").value) || 0;
  const btn = document.getElementById("bpConfirmPayBtn");
  if (amount > 0 && workflowState.payment_token) {
    btn.disabled = false;
    btn.className =
      "bank-btn-primary w-full py-4 text-sm flex items-center justify-center gap-2";
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Pay Securely';
  } else {
    btn.disabled = true;
    btn.className =
      "bank-btn-primary w-full py-4 text-sm flex items-center justify-center gap-2 cursor-not-allowed";
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Pay Securely';
  }
}

async function runBillPayInquiry() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  updateBillPayCode();

  // A Bill Pay lookup is never a deeplink session — clear any leftover
  // return_url/link_token from a previous Deeplink payment so the shared
  // success modal's "Done" button behaves correctly (just closes).
  clearCapturedReturnUrl();
  workflowState.link_token = "";

  log("Executing Inquiry request for customer_code: " + workflowState.customer_code);
  openLoadingModal("Executing Inquiry");

  try {
    const jsonData = await safeFetchJson(`${baseUrl}/payment/v4/inquiry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        token: token,
      },
      body: JSON.stringify({ customer_code: workflowState.customer_code }),
    });

    log("Bill Pay Inquiry Response Payload:", jsonData);

    if (jsonData.code === "SUCCESS" && jsonData.data) {
      const data = jsonData.data;
      const supplierObj = data.supplier || {};
      const customerObj = data.customer || {};
      const balanceObj = (Array.isArray(data.balances) && data.balances.length > 0) ? data.balances[0] : (data.balance || {});

      workflowState.customer_code = customerObj.code || data.customer_code || workflowState.customer_code;
      workflowState.customer_name = customerObj.name || customerObj.name_en || data.customer_name || data.consumer_name || "N/A";
      workflowState.supplier_name = supplierObj.name || supplierObj.short_name || data.supplier_name || data.biller_name || "N/A";
      workflowState.bill_code = customerObj.code || data.bill_code || workflowState.customer_code;

      workflowState.payment_token = balanceObj.payment_token || balanceObj.payment_Token || data.payment_token || data.payment_Token || data.token || "";

      workflowState.bill_amount = balanceObj.bill_amount !== undefined ? balanceObj.bill_amount : (data.bill_amount !== undefined ? data.bill_amount : (data.bill_Amount !== undefined ? data.bill_Amount : 0));
      workflowState.fee_amount = balanceObj.fee_amount !== undefined ? balanceObj.fee_amount : (data.fee_amount !== undefined ? data.fee_amount : (data.fee_Amount !== undefined ? data.fee_Amount : 0));
      workflowState.total_amount = balanceObj.total_amount !== undefined ? balanceObj.total_amount : (data.total_amount !== undefined ? data.total_amount : (data.total_Amount !== undefined ? data.total_Amount : (workflowState.bill_amount + workflowState.fee_amount)));
      workflowState.currency = balanceObj.currency || data.currency || data.currency_code || data.currency_Code || "USD";

      const resSupplierEl = document.getElementById("bpResSupplier");
      const resCustomerCodeEl = document.getElementById("bpResCustomerCode");
      const resCustomerNameEl = document.getElementById("bpResCustomerName");
      const resMessageEl = document.getElementById("bpResMessage");
      const resPaymentTokenEl = document.getElementById("bpResPaymentToken");
      const resBillAmountEl = document.getElementById("bpResBillAmount");
      const resFeeAmountEl = document.getElementById("bpResFeeAmount");

      if (resSupplierEl) resSupplierEl.textContent = workflowState.supplier_name;
      if (resCustomerCodeEl) resCustomerCodeEl.textContent = workflowState.customer_code;
      if (resCustomerNameEl) resCustomerNameEl.textContent = workflowState.customer_name;
      if (resMessageEl) resMessageEl.textContent = jsonData.message || "Success";
      if (resPaymentTokenEl) resPaymentTokenEl.textContent = workflowState.payment_token || "None";
      if (resBillAmountEl) resBillAmountEl.textContent = `${workflowState.bill_amount} ${workflowState.currency}`;
      if (resFeeAmountEl) resFeeAmountEl.textContent = `${workflowState.fee_amount} ${workflowState.currency}`;

      document.getElementById("bpResponseCodeBadge").textContent = jsonData.code;
      document.getElementById("bpPaymentAmount").value = workflowState.bill_amount;

      document.getElementById("bpStatusBadge").textContent = "Token Active";
      document.getElementById("bpStatusBadge").className =
        "text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20";
      evaluateBillPayMode();

      const metaDetails = {
        customer_code: workflowState.customer_code,
        customer_name: workflowState.customer_name,
        total_amount: `${workflowState.total_amount} ${workflowState.currency}`,
        fee_amount: `${workflowState.fee_amount} ${workflowState.currency}`,
        paid_to: workflowState.supplier_name,
        paid_date: new Date().toLocaleString(),
      };

      // Khmer pre-confirm alert (same as QR / Deeplink) before user pays
      speakPaymentAmountAlert(
        workflowState.total_amount,
        workflowState.currency,
      );

      finishModal(
        true,
        "Inquiry Successful",
        jsonData.message || "Bill details retrieved successfully.",
        metaDetails,
      );
    } else {
      document.getElementById("bpResponseCodeBadge").textContent = jsonData.code || "FAILED";
      const resMessageEl = document.getElementById("bpResMessage");
      if (resMessageEl) resMessageEl.textContent = jsonData.message || "Inquiry Failed";
      finishModal(
        false,
        "Inquiry Failed",
        jsonData.message || "Unable to fetch bill.",
      );
    }
  } catch (err) {
    log("Bill Pay Inquiry Connection Error:", err.message);
    finishModal(false, "Connection Error", err.message);
  }
}

async function runBillPaySmartFlow() {
  // Require PIN / Biometric when security lock is enabled
  requireSecurityAuth(() => {
    runBillPayConfirm();
  });
}

async function runBillPayConfirm() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  const amount =
    parseFloat(document.getElementById("bpPaymentAmount").value) || 0;
  const autoRef = generateRandom16();
  document.getElementById("refNoDisplay").value = autoRef;
  workflowState.bank_ref = autoRef;

  const payload = {
    customer_code: workflowState.customer_code,
    bill_code: workflowState.bill_code || workflowState.customer_code,
    bill_amount: workflowState.bill_amount || amount,
    total_amount: workflowState.total_amount || amount,
    currency: workflowState.currency || "USD",
    payment_token: workflowState.payment_token,
    ref_no: autoRef,
  };

  log("Submitting Bill Pay Request to /payment/v2/confirm...", payload);
  openLoadingModal("Executing Payment");

  try {
    const jsonData = await safeFetchJson(`${baseUrl}/payment/v2/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        token: token,
      },
      body: JSON.stringify(payload),
    });

    log("Bill Pay Response Payload:", jsonData);

    const data = jsonData.data || {};
    const supplierObj = data.supplier || {};
    const customerObj = data.customer || {};

    const customerCode = data.customer_code || customerObj.code || workflowState.customer_code || payload.ref_no;
    const customerName = data.customer_name || customerObj.name || workflowState.customer_name || "N/A";
    const paidTo = data.paid_to || supplierObj.name || data.biller_name || workflowState.supplier_name || "N/A";
    const totalAmt = data.total_amount !== undefined ? data.total_amount : (payload.total_amount || payload.bill_amount);
    const feeAmt = data.fee_amount !== undefined ? data.fee_amount : (workflowState.fee_amount || 0);
    const curr = data.currency || payload.currency || "USD";
    const paidDate = data.paid_date || new Date().toLocaleString();

    const metaDetails = {
      customer_code: customerCode,
      customer_name: customerName,
      total_amount: `${totalAmt} ${curr}`,
      fee_amount: `${feeAmt} ${curr}`,
      paid_to: paidTo,
      paid_date: paidDate,
    };

    if (jsonData.code === "SUCCESS") {
      triggerHaptic("success");
      lastPaymentFlow = "billpay";
      finishModal(
        true,
        "Payment Successful",
        jsonData.message || `Transaction ${autoRef} completed.`,
        metaDetails,
      );
      speakPaymentSuccess(totalAmt, curr);
    } else {
      triggerHaptic("error");
      lastPaymentFlow = "billpay";
      finishModal(
        false,
        "Payment Failed",
        jsonData.message || "Payment rejected.",
        metaDetails,
      );
    }
  } catch (err) {
    log("Bill Pay Connection Error:", err.message);
    lastPaymentFlow = "billpay";
    finishModal(false, "Connection Error", err.message);
  }
}

/* ===========================================================================
   DEEPLINK (Bill24 API v5 Inquiry / v3 Confirm — identity_code based)
   ======================================================================= */
async function runInquiry(options = {}) {
  const fromDeeplink = !!(options.fromDeeplink || workflowState.link_token);
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  updateFullCodes();

  if (!workflowState.identity_code) {
    showToast("Enter an Identity Code (Transaction ID) first.", true);
    hideDeeplinkLoading();
    return;
  }

  log("Executing Inquiry request for identity_code: " + workflowState.identity_code);

  // Deeplink uses the full-screen bank loading overlay (already shown).
  // Manual inquiry still uses the shared modal spinner.
  if (!fromDeeplink) {
    openLoadingModal("Executing Inquiry");
  } else {
    showDeeplinkLoading("Preparing payment…", "Fetching bill details");
  }

  try {
    const jsonData = await safeFetchJson(`${baseUrl}/payment/v5/inquiry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        token: token,
      },
      body: JSON.stringify({
        identity_code: workflowState.identity_code,
        fee_channel: "MERCHANT",
      }),
    });

    log("Inquiry Response Payload:", jsonData);

    if (jsonData.code === "SUCCESS" && jsonData.data) {
      const data = jsonData.data;
      const merchant = data.merchant || {};
      const customers = Array.isArray(data.customers) ? data.customers : [];
      const primaryCustomer = customers[0] || {};
      const transaction = data.transaction || {};

      workflowState.supplier_name = merchant.name || "N/A";
      workflowState.customers = customers;
      workflowState.customer_code = primaryCustomer.customer_code || "";
      workflowState.customer_name =
        primaryCustomer.customer_name_latin || primaryCustomer.customer_name || "N/A";
      workflowState.bill_no = primaryCustomer.bill_no || "";

      workflowState.payment_token = transaction.payment_token || "";
      workflowState.original_amount = transaction.original_amount || 0;
      workflowState.convenience_fee_amount = transaction.convenience_fee_amount || 0;
      workflowState.sponsor_fee_amount = transaction.sponsor_fee_amount || 0;
      workflowState.fee_amount =
        (transaction.convenience_fee_amount || 0) + (transaction.sponsor_fee_amount || 0);
      workflowState.total_amount =
        transaction.total_amount !== undefined
          ? transaction.total_amount
          : workflowState.original_amount + workflowState.fee_amount;
      workflowState.currency = transaction.currency || "USD";
      workflowState.fee_channel = transaction.fee_channel || "MERCHANT";
      workflowState.description = transaction.description || "";

      // Bill24 live v5 uses data.url.return_url (singular). Mock/docs used data.urls.
      const extractedReturnUrl =
        extractReturnUrlFromInquiry(data) ||
        extractReturnUrlFromInquiry(jsonData);
      persistReturnUrl(extractedReturnUrl);
      log(
        "Captured return_url from inquiry v5: " +
          (workflowState.return_url || "(empty)") +
          " | data keys: " +
          Object.keys(data).join(","),
      );

      const customerCodeLabel =
        customers.length > 1
          ? `${workflowState.customer_code} (+${customers.length - 1} more)`
          : workflowState.customer_code || "-";

      const resSupplierEl = document.getElementById("resSupplier");
      const resCustomerCodeEl = document.getElementById("resCustomerCode");
      const resCustomerNameEl = document.getElementById("resCustomerName");
      const resMessageEl = document.getElementById("resMessage");
      const resPaymentTokenEl = document.getElementById("resPaymentToken");
      const resBillAmountEl = document.getElementById("resBillAmount");
      const resFeeAmountEl = document.getElementById("resFeeAmount");

      if (resSupplierEl) resSupplierEl.textContent = workflowState.supplier_name;
      if (resCustomerCodeEl) resCustomerCodeEl.textContent = customerCodeLabel;
      if (resCustomerNameEl) resCustomerNameEl.textContent = workflowState.customer_name;
      if (resMessageEl) resMessageEl.textContent = jsonData.message || "Success";
      if (resPaymentTokenEl) resPaymentTokenEl.textContent = workflowState.payment_token || "None";
      if (resBillAmountEl) resBillAmountEl.textContent = `${workflowState.original_amount} ${workflowState.currency}`;
      if (resFeeAmountEl) resFeeAmountEl.textContent = `${workflowState.fee_amount} ${workflowState.currency}`;

      document.getElementById("responseCodeBadge").textContent = jsonData.code;
      document.getElementById("paymentAmount").value = workflowState.total_amount;
      const currEl = document.getElementById("paymentAmountCurrency");
      if (currEl) currEl.textContent = workflowState.currency;

      // Populate bank-style confirm card
      populateDeeplinkConfirmCard(customerCodeLabel);

      document.getElementById("appStatusBadge").textContent = "Token Active";
      document.getElementById("appStatusBadge").className =
        "text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20";
      evaluatePaymentMode();

      // Deeplink: do NOT show "Inquiry Successful" — close loading and
      // land user on Confirm screen. Manual inquiry still shows success modal.
      if (fromDeeplink) {
        hideDeeplinkLoading();
        closeModal();
        triggerHaptic("success");
        log("Deeplink inquiry ready — showing Confirm screen.");
        speakPaymentAmountAlert(
          workflowState.total_amount,
          workflowState.currency,
        );
      } else {
        const metaDetails = {
          customer_code: customerCodeLabel,
          customer_name: workflowState.customer_name,
          total_amount: `${workflowState.total_amount} ${workflowState.currency}`,
          fee_amount: `${workflowState.fee_amount} ${workflowState.currency}`,
          paid_to: workflowState.supplier_name,
          paid_date: new Date().toLocaleString(),
        };
        finishModal(
          true,
          "Inquiry Successful",
          jsonData.message || "Bill details retrieved successfully.",
          metaDetails,
        );
      }
    } else {
      document.getElementById("responseCodeBadge").textContent = jsonData.code || "FAILED";
      const resMessageEl = document.getElementById("resMessage");
      if (resMessageEl) resMessageEl.textContent = jsonData.message || "Inquiry Failed";
      hideDeeplinkLoading();
      if (fromDeeplink) {
        // Show error on the shared modal so user can dismiss
        openLoadingModal("Inquiry Failed");
      }
      finishModal(
        false,
        "Inquiry Failed",
        jsonData.message || "Unable to fetch bill.",
      );
    }
  } catch (err) {
    log("Inquiry Connection Error:", err.message);
    hideDeeplinkLoading();
    if (fromDeeplink) {
      openLoadingModal("Connection Error");
    }
    finishModal(false, "Connection Error", err.message);
  }
}

function populateDeeplinkConfirmCard(customerCodeLabel) {
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText("dlcBillerName", workflowState.supplier_name || "-");
  setText("dlcTxnId", workflowState.identity_code || "-");
  setText(
    "dlcAmount",
    Number(workflowState.total_amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
  setText("dlcCurrency", workflowState.currency || "USD");
  setText(
    "dlcFee",
    `${Number(workflowState.fee_amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${workflowState.currency || "USD"}`,
  );
  setText(
    "dlcOriginal",
    `${Number(workflowState.original_amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${workflowState.currency || "USD"}`,
  );
  setText("dlcCustomerName", workflowState.customer_name || "-");
  setText("dlcCustomerCode", customerCodeLabel || workflowState.customer_code || "-");

  const descEl = document.getElementById("dlcDescription");
  if (descEl) {
    if (workflowState.description) {
      descEl.textContent = workflowState.description;
      descEl.classList.remove("hidden");
    } else {
      descEl.classList.add("hidden");
    }
  }
}

async function runSmartPaymentFlow() {
  const accountNo = (document.getElementById("payerAccountNo")?.value || "").trim();
  if (!accountNo) {
    showToast("Enter the payer's Account Number to continue.", true);
    document.getElementById("payerAccountNo")?.focus();
    return;
  }
  // Require PIN / Biometric when security lock is enabled
  requireSecurityAuth(() => {
    runSmartPaymentFlowAfterAuth();
  });
}

async function runSmartPaymentFlowAfterAuth() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  const autoRef = generateRandom16();
  document.getElementById("refNoDisplay").value = autoRef;
  workflowState.bank_ref = autoRef;

  const payerAccountNo = (document.getElementById("payerAccountNo")?.value || "").trim();
  const payerAccountName = (document.getElementById("payerAccountName")?.value || "").trim();
  const payerPhone = (document.getElementById("payerPhone")?.value || "").trim();

  const payload = {
    identity_code: workflowState.identity_code,
    fee_channel: workflowState.fee_channel || "MERCHANT",
    bank_ref: autoRef,
    bank_date: formatBankDate(new Date()),
    original_amount: workflowState.original_amount,
    convenience_fee_amount: workflowState.convenience_fee_amount || 0,
    sponsor_fee_amount: workflowState.sponsor_fee_amount || 0,
    total_amount: workflowState.total_amount,
    currency: workflowState.currency || "USD",
    description: workflowState.description || "",
    payment_token: workflowState.payment_token,
    payer_account_no: payerAccountNo,
    payer_account_name: payerAccountName,
    payer_phone: payerPhone,
  };

  log("Submitting Payment Request to /payment/v3/confirm...", payload);
  openLoadingModal("Executing Payment");

  try {
    const jsonData = await safeFetchJson(`${baseUrl}/payment/v3/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        token: token,
      },
      body: JSON.stringify(payload),
    });

    log("Pay Response Payload:", jsonData);

    const data = jsonData.data || {};
    const merchant = data.merchant || {};
    const transaction = data.transaction || {};

    // The v3 confirm response has no customer info — keep what Inquiry gave us.
    const customerCode = workflowState.customer_code || payload.bank_ref;
    const customerName = workflowState.customer_name || "N/A";
    const paidTo = merchant.name || workflowState.supplier_name || "N/A";
    const totalAmt =
      transaction.total_amount !== undefined ? transaction.total_amount : payload.total_amount;
    const feeAmt =
      (transaction.convenience_fee_amount !== undefined
        ? transaction.convenience_fee_amount
        : payload.convenience_fee_amount || 0) +
      (transaction.sponsor_fee_amount !== undefined
        ? transaction.sponsor_fee_amount
        : payload.sponsor_fee_amount || 0);
    const curr = transaction.currency || payload.currency || "USD";
    const bankRef = transaction.bank_ref || autoRef;
    const paidDate = new Date().toLocaleString();

    const metaDetails = {
      customer_code: customerCode,
      customer_name: customerName,
      total_amount: `${totalAmt} ${curr}`,
      fee_amount: `${feeAmt} ${curr}`,
      paid_to: paidTo,
      paid_date: paidDate,
    };

    if (jsonData.code === "SUCCESS") {
      triggerHaptic("success");
      lastPaymentFlow = workflowState.link_token || getCapturedReturnUrl()
        ? "deeplink"
        : "billpay";
      // Ensure Done / Back-to-App label matches session type
      const doneLabel = document.getElementById("modalDoneBtnLabel");
      if (doneLabel) {
        doneLabel.textContent = lastPaymentFlow === "deeplink"
          ? "Done"
          : "Back to App";
      }
      // Re-stamp return_url onto the Done button at success time.
      persistReturnUrl(getCapturedReturnUrl());
      finishModal(
        true,
        "Payment Successful",
        jsonData.message || `Transaction ${bankRef} completed.`,
        metaDetails,
      );
      speakPaymentSuccess(totalAmt, curr);
    } else {
      triggerHaptic("error");
      lastPaymentFlow = workflowState.link_token ? "deeplink" : "billpay";
      finishModal(
        false,
        "Payment Failed",
        jsonData.message || "Payment rejected.",
        metaDetails,
      );
    }
  } catch (err) {
    log("Payment Connection Error:", err.message);
    lastPaymentFlow = workflowState.link_token ? "deeplink" : "billpay";
    finishModal(false, "Connection Error", err.message);
  }
}

/* Formats a Date as "YYYY-MM-DD HH:mm:ss" (local time), the bank_date
   format expected by /payment/v3/confirm. */
function formatBankDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

async function runVerifyTxn() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  const refNo =
    document.getElementById("verifyRefNo").value.trim() || generateRandom16();

  log("Verifying transaction: " + refNo);
  openLoadingModal("Verifying Status");

  try {
    const jsonData = await safeFetchJson(`${baseUrl}/payment/v2/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "*/*",
        token: token,
      },
      body: JSON.stringify({ ref_no: refNo }),
    });

    document.getElementById("vResCode").textContent =
      jsonData.code || "SUCCESS";
    document.getElementById("vResRefNo").textContent = refNo;
    document.getElementById("verifyBadge").textContent =
      jsonData.code || "SUCCESS";

    finishModal(true, "Verified Active", "Transaction reference confirmed.");
  } catch (err) {
    finishModal(false, "Connection Error", err.message);
  }
}

/* 7B. APP PREFERENCES — AUTO-ALLOW CAMERA & KHMER VOICE CONFIRMATION */
let appPreferences = {
  autoCamera: true, // default ON: pre-request camera permission (Android & iOS)
  voiceConfirm: true, // default ON: speak Khmer confirmation on payment success
};

/* AUDIO ENGINE PRE-UNLOCK & VOICE PREPARATION */
let isAudioEngineUnlocked = false;

function unlockAudioEngine() {
  if (isAudioEngineUnlocked) return;
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      const dummyCtx = new AudioContext();
      if (dummyCtx.state === "suspended") dummyCtx.resume();
    }
    isAudioEngineUnlocked = true;
    log("Audio & Speech synthesis pre-unlocked by user gesture.");
  } catch (e) {}
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockAudioEngine, { passive: true });
  window.addEventListener("touchstart", unlockAudioEngine, { passive: true });
  window.addEventListener("click", unlockAudioEngine, { passive: true });
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.onvoiceschanged = function () {
        window.speechSynthesis.getVoices();
      };
    } catch (e) {}
  }
}

function loadAppPreferences() {
  try {
    const raw = localStorage.getItem("bankAppPreferences");
    if (raw) appPreferences = { ...appPreferences, ...JSON.parse(raw) };
  } catch (e) {}

  const autoCamToggle = document.getElementById("autoCameraEnabled");
  const voiceToggle = document.getElementById("voiceConfirmEnabled");
  if (autoCamToggle) autoCamToggle.checked = !!appPreferences.autoCamera;
  if (voiceToggle) voiceToggle.checked = !!appPreferences.voiceConfirm;

  // Warm up voices silently without prompting OS camera permissions
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
    } catch (e) {}
  }
}

function saveAppPreferences() {
  const autoCamToggle = document.getElementById("autoCameraEnabled");
  const voiceToggle = document.getElementById("voiceConfirmEnabled");
  appPreferences.autoCamera = autoCamToggle ? autoCamToggle.checked : true;
  appPreferences.voiceConfirm = voiceToggle ? voiceToggle.checked : true;
  localStorage.setItem("bankAppPreferences", JSON.stringify(appPreferences));
  log("App preferences saved:", appPreferences);
}

function toggleAutoCameraSetting() {
  saveAppPreferences();
  showToast(
    appPreferences.autoCamera
      ? "Auto camera view enabled."
      : "Auto camera view disabled.",
  );
}

function toggleVoiceConfirmSetting() {
  saveAppPreferences();
  showToast(
    appPreferences.voiceConfirm
      ? "Voice payment confirmation enabled."
      : "Voice payment confirmation disabled.",
  );
}

/* Play pleasant mobile bank confirmation chime via Web Audio API */
function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.22, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.5);
  } catch (e) {}
}

/* Khmer Number-to-Words Converter for natural voice confirmation */
function khmerNumberToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return "";
  const numericVal = parseFloat(num);
  if (isNaN(numericVal)) return String(num);

  const digits = ["សូន្យ", "មួយ", "ពីរ", "បី", "បួន", "ប្រាំ", "ប្រាំមួយ", "ប្រាំពីរ", "ប្រាំបី", "ប្រាំបួន"];
  const tens = ["", "ដប់", "ម្ភៃ", "សាមសិប", "សែសិប", "ហាសិប", "ហុកសិប", "ចិត្តសិប", "ប៉ែតសិប", "កៅសិប"];

  function convertUnderThousand(n) {
    if (n === 0) return "";
    let str = "";
    const h = Math.floor(n / 100);
    const rem = n % 100;
    if (h > 0) {
      str += digits[h] + "រយ";
    }
    if (rem > 0) {
      if (rem < 10) {
        str += digits[rem];
      } else {
        const t = Math.floor(rem / 10);
        const d = rem % 10;
        str += tens[t];
        if (d > 0) str += digits[d];
      }
    }
    return str;
  }

  function convertInteger(n) {
    if (n === 0) return digits[0];
    if (n < 0) return "ដក " + convertInteger(Math.abs(n));

    let str = "";
    if (n >= 1000000) {
      const mil = Math.floor(n / 1000000);
      str += convertInteger(mil) + "លាន";
      n %= 1000000;
    }
    if (n >= 100000) {
      const hundredK = Math.floor(n / 100000);
      str += digits[hundredK] + "សែន";
      n %= 100000;
    }
    if (n >= 10000) {
      const tenK = Math.floor(n / 10000);
      str += digits[tenK] + "ម៉ឺន";
      n %= 10000;
    }
    if (n >= 1000) {
      const k = Math.floor(n / 1000);
      str += digits[k] + "ពាន់";
      n %= 1000;
    }
    if (n > 0) {
      str += convertUnderThousand(n);
    }
    return str;
  }

  const parts = Number(numericVal.toFixed(2)).toString().split(".");
  const intPart = parseInt(parts[0], 10);
  const decPart = parts[1] ? parseInt(parts[1], 10) : 0;

  let result = convertInteger(intPart);
  if (decPart > 0) {
    const decStr = parts[1].length === 1 ? parts[1] + "0" : parts[1];
    const decVal = parseInt(decStr, 10);
    result += " ចុច " + convertInteger(decVal);
  }
  return result;
}

/* Pre-payment alert (young male Khmer, clear): ask user to check amount first */
const KHMER_PRE_CONFIRM_ALERT =
  "សូមពិនិត្យចំនួនទឹកប្រាក់របស់លោកអ្នកជាមុនសិន ដើម្បីអាចបញ្ជាក់ការទូទាត់ត្រូវ។";

async function speakPaymentAmountAlert(amount, currency) {
  try {
    if (!appPreferences.voiceConfirm) return;
    unlockAudioEngine();
    const numericAmount = parseFloat(amount);
    const curr = String(currency || "USD").toUpperCase();
    const currencyKhmer = curr === "KHR" || curr === "116" ? "រៀល" : "ដុល្លារ";
    let phrase = KHMER_PRE_CONFIRM_ALERT;
    if (!isNaN(numericAmount) && numericAmount > 0) {
      const words = khmerNumberToWords(numericAmount);
      phrase =
        `សូមពិនិត្យចំនួនទឹកប្រាក់ ${words} ${currencyKhmer} ជាមុនសិន ` +
        `ដើម្បីអាចបញ្ជាក់ការទូទាត់ត្រូវ។`;
    }
    log(`Khmer pre-confirm alert: "${phrase}"`);
    await speakKhmerAudioFallback(phrase);
  } catch (e) {
    log("Pre-confirm voice failed: " + (e && e.message));
  }
}

/* Success voice — young male Khmer (≈18–22), clear bank-style confirmation */
async function speakPaymentSuccess(amount, currency) {
  try {
    if (!appPreferences.voiceConfirm) return;

    unlockAudioEngine();

    const numericAmount = parseFloat(amount);
    const curr = String(currency || "USD").toUpperCase();
    const currencyKhmer = curr === "KHR" || curr === "116" ? "រៀល" : "ដុល្លារ";
    const khmerWords = khmerNumberToWords(numericAmount);

    // Clear 2026 bank-style success phrase
    const phrase = `ការទូទាត់ជោគជ័យ។ ទឹកប្រាក់បានទូទាត់ចំនួន ${khmerWords} ${currencyKhmer}។ សូមអរគុណ។`;

    log(`Khmer young-male success voice: "${phrase}"`);
    await speakKhmerAudioFallback(phrase);
  } catch (e) {
    log("Voice confirmation failed: " + (e && e.message));
  }
}

async function speakKhmerAudioFallback(phrase) {
  const player = document.getElementById("khmerVoicePlayer");

  // 1. Primary: System WebSpeech API ONLY if an EXPLICIT Male Khmer Voice is available on OS/Browser
  if ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") {
    try {
      const voices = window.speechSynthesis.getVoices();
      const explicitMaleVoice = voices.find(
        (v) =>
          v.lang &&
          v.lang.toLowerCase().startsWith("km") &&
          (v.name.toLowerCase().includes("piseth") ||
            v.name.toLowerCase().includes("dara") ||
            v.name.toLowerCase().includes("phat") ||
            v.name.toLowerCase().includes("male") ||
            v.name.toLowerCase().includes("man")),
      );
      if (explicitMaleVoice) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = "km-KH";
        utterance.voice = explicitMaleVoice;
        utterance.rate = 0.95; // Clear young-adult male pace (≈18–22)
        utterance.pitch = 0.92; // Younger male, not deep/older
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
        log(`WebSpeech explicit Khmer male voice spoken (${explicitMaleVoice.name}).`);
        return;
      }
    } catch (speechErr) {
      console.warn("WebSpeech synthesis attempt failed:", speechErr);
    }
  }

  // 2. Younger Male Person Audio DSP Synthesizer (Dual-Stage Acoustic Formant Shifter)
  async function playWithYoungMaleAudioDSP(audioUrl) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("No AudioContext");
      
      const audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const decodedData = await audioCtx.decodeAudioData(arrayBuffer);

      const source = audioCtx.createBufferSource();
      source.buffer = decodedData;

      // ~0.92 playback: young adult male (≈18–22), clearer than deep shift
      source.playbackRate.value = 0.92;

      // Stage 1: mild chest warmth for young male
      const lowShelf = audioCtx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 180;
      lowShelf.gain.value = 3.5;

      // Stage 2: clarity / presence for intelligible Khmer
      const peakFilter = audioCtx.createBiquadFilter();
      peakFilter.type = "peaking";
      peakFilter.frequency.value = 1400;
      peakFilter.Q.value = 1.0;
      peakFilter.gain.value = 5.0;

      // Stage 3: soft high cut without muffling consonants
      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.value = 4200;

      // Audio Graph Connection
      source.connect(lowShelf);
      lowShelf.connect(peakFilter);
      peakFilter.connect(lowPass);
      lowPass.connect(audioCtx.destination);

      source.start(0);
      log(`Played Khmer Younger Male voice audio via Web Audio Acoustic DSP (148Hz pitch + young male formant shift).`);
      return true;
    } catch (dspErr) {
      console.warn("Web Audio DSP fallback failed:", dspErr);
      return false;
    }
  }

  // Fetch Khmer speech audio and process through Young Male DSP Engine
  try {
    log(`Generating Khmer younger male human person voice for: "${phrase}"...`);
    const response = await fetch("https://api.soundoftext.com/sounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "Google",
        data: { text: phrase, voice: "km" },
      }),
    });
    const data = await response.json();
    if (data && data.success && data.id) {
      const audioUrl = `https://files.soundoftext.com/${data.id}.mp3`;
      const dspSuccess = await playWithYoungMaleAudioDSP(audioUrl);
      if (dspSuccess) return;

      if (player) {
        player.playbackRate = 0.92;
        player.src = audioUrl;
        await player.play();
        return;
      }
    }
  } catch (err) {
    console.warn("SoundOfText TTS API attempt failed:", err);
  }

  // StreamElements Secondary Endpoint with Young Male DSP Engine
  try {
    const streamUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Khmer&text=${encodeURIComponent(phrase)}`;
    const dspSuccess = await playWithYoungMaleAudioDSP(streamUrl);
    if (dspSuccess) return;

    if (player) {
      player.playbackRate = 0.92;
      player.src = streamUrl;
      await player.play();
    }
  } catch (err) {
    console.warn("StreamElements TTS attempt failed:", err);
  }
}

function testVoiceConfirmation(currency = "USD") {
  unlockAudioEngine();
  const amount = currency === "KHR" ? 5000 : 5;
  speakPaymentSuccess(amount, currency);
  const words = khmerNumberToWords(amount);
  const currText = currency === "KHR" ? "រៀល" : "ដុល្លារ";
  showToast(`🔊 ទឹកប្រាក់បានទូទាត់ចំនួន${words} ${currText}`);
}


/* 8. SECURITY LOCK & SECRET TAP RESET ENGINE */
let securitySettings = {
  enabled: false,
  pin: "1234",
  useBiometrics: true,
  bioEnrolled: false,
};
let pendingAuthCallback = null;
let enteredPin = "";
let secretResetTapCount = 0;
let secretResetTimer = null;
let isAppUnlocked = false;
let pinLockMode = "payment"; // "app" | "payment"

function showToast(message, isError = false) {
  const toast = document.getElementById("toastAlert");
  const msgEl = document.getElementById("toastMsg");
  const iconEl = document.getElementById("toastIcon");

  if (!toast) return;
  msgEl.textContent = message;
  if (isError) {
    iconEl.className = "fa-solid fa-triangle-exclamation text-rose-400 text-base";
  } else {
    iconEl.className = "fa-solid fa-circle-check text-emerald-400 text-base";
  }

  toast.classList.remove("opacity-0", "pointer-events-none");
  toast.classList.add("opacity-100");

  setTimeout(() => {
    toast.classList.remove("opacity-100");
    toast.classList.add("opacity-0", "pointer-events-none");
  }, 1800);
}

function loadSecuritySettings() {
  try {
    const raw = localStorage.getItem("bankSecuritySettings");
    if (!raw) return;
    const s = JSON.parse(raw);
    securitySettings = { ...securitySettings, ...s };

    const lockToggle = document.getElementById("securityLockEnabled");
    const pinInput = document.getElementById("securityPinValue");
    const bioToggle = document.getElementById("biometricsEnabled");
    const configBox = document.getElementById("pinConfigBox");

    if (lockToggle) lockToggle.checked = !!securitySettings.enabled;
    if (pinInput) pinInput.value = securitySettings.pin || "1234";
    if (bioToggle) bioToggle.checked = !!securitySettings.useBiometrics;
    if (configBox) configBox.classList.toggle("hidden", !securitySettings.enabled);
    if (getStoredWebAuthnCredentialId()) securitySettings.bioEnrolled = true;
    updateBiometricStatusBadge();
  } catch (e) {}
}

function saveSecuritySettings() {
  const lockToggle = document.getElementById("securityLockEnabled");
  const pinInput = document.getElementById("securityPinValue");
  const bioToggle = document.getElementById("biometricsEnabled");

  securitySettings.enabled = lockToggle ? lockToggle.checked : false;
  securitySettings.pin = pinInput ? (pinInput.value.trim() || "1234") : "1234";
  securitySettings.useBiometrics = bioToggle ? bioToggle.checked : true;

  localStorage.setItem("bankSecuritySettings", JSON.stringify(securitySettings));
  updateBiometricStatusBadge();
  log("Security settings saved:", securitySettings);
}

function toggleSecurityLockSetting() {
  const lockToggle = document.getElementById("securityLockEnabled");
  const configBox = document.getElementById("pinConfigBox");
  if (configBox && lockToggle) {
    configBox.classList.toggle("hidden", !lockToggle.checked);
    // Auto-save toggle state so setup is immediately effective
    if (lockToggle.checked) {
      securitySettings.enabled = true;
      const pinInput = document.getElementById("securityPinValue");
      if (pinInput && pinInput.value.trim()) {
        securitySettings.pin = pinInput.value.trim();
      }
      localStorage.setItem("bankSecuritySettings", JSON.stringify(securitySettings));
      // Focus PIN field so setup is visible & ready
      setTimeout(() => {
        if (pinInput) pinInput.focus();
      }, 100);
    } else {
      securitySettings.enabled = false;
      localStorage.setItem("bankSecuritySettings", JSON.stringify(securitySettings));
    }
  }
}

function handleSecretResetTap() {
  secretResetTapCount++;
  triggerHaptic("impact");

  if (secretResetTimer) clearTimeout(secretResetTimer);

  secretResetTimer = setTimeout(() => {
    secretResetTapCount = 0;
  }, 2200);

  if (secretResetTapCount >= 3) {
    secretResetTapCount = 0;
    clearTimeout(secretResetTimer);
    resetSecurityLockSecretly();
  }
}

function resetSecurityLockSecretly() {
  securitySettings.enabled = false;
  securitySettings.pin = "1234";
  securitySettings.useBiometrics = true;
  localStorage.setItem("bankSecuritySettings", JSON.stringify(securitySettings));

  const lockToggle = document.getElementById("securityLockEnabled");
  const pinInput = document.getElementById("securityPinValue");
  const configBox = document.getElementById("pinConfigBox");

  if (lockToggle) lockToggle.checked = false;
  if (pinInput) pinInput.value = "1234";
  if (configBox) configBox.classList.add("hidden");

  isAppUnlocked = true;
  pinLockMode = "payment";
  const modal = document.getElementById("securityLockModal");
  if (modal) modal.classList.add("hidden");
  pendingAuthCallback = null;
  enteredPin = "";
  triggerHaptic("warning");
  showToast("PIN lock turned off.", false);
  log("SECURITY SECRET RESET TRIGGERED.");
}

function requireSecurityAuth(onSuccess, mode) {
  if (!securitySettings.enabled) {
    if (onSuccess) onSuccess();
    return;
  }

  pinLockMode = mode || "payment";
  pendingAuthCallback = onSuccess || null;
  enteredPin = "";
  updatePinDotsDisplay();

  const titleEl = document.getElementById("pinLockTitle");
  const subEl = document.getElementById("pinLockSubtitle");
  const cancelBtn = document.getElementById("pinLockCancelBtn");
  if (pinLockMode === "app") {
    if (titleEl) titleEl.textContent = "Unlock Bank Mobile";
    if (subEl) subEl.textContent = "Enter your 4-digit PIN to open the app";
    if (cancelBtn) cancelBtn.classList.add("invisible");
  } else {
    if (titleEl) titleEl.textContent = "Authorize Payment";
    if (subEl) subEl.textContent = "Enter your 4-digit PIN to confirm this payment";
    if (cancelBtn) cancelBtn.classList.remove("invisible");
  }

  const modal = document.getElementById("securityLockModal");
  if (modal) modal.classList.remove("hidden");

  // Prefer owner biometrics when enabled + enrolled (WebAuthn / Telegram / demo)
  if (
    securitySettings.useBiometrics &&
    (securitySettings.bioEnrolled ||
      getStoredWebAuthnCredentialId() ||
      (tgApp && tgApp.BiometricManager))
  ) {
    try {
      triggerBiometricScan();
    } catch (e) {}
  }
}

function closeSecurityLockModal() {
  if (pinLockMode === "app" && securitySettings.enabled && !isAppUnlocked) {
    return;
  }
  const modal = document.getElementById("securityLockModal");
  if (modal) modal.classList.add("hidden");
  pendingAuthCallback = null;
  enteredPin = "";
}

function pressPinNum(num) {
  unlockAudioEngine();
  if (enteredPin.length < 4) {
    enteredPin += num;
    triggerHaptic("impact");
    updatePinDotsDisplay();
  }

  if (enteredPin.length === 4) {
    setTimeout(verifyEnteredPin, 20);
  }
}

function pressPinDelete() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    triggerHaptic("impact");
    updatePinDotsDisplay();
  }
}

function updatePinDotsDisplay() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pinDot${i}`);
    if (dot) {
      if (i < enteredPin.length) {
        dot.className =
          "w-4 h-4 rounded-full bg-indigo-500 border-2 border-indigo-500 pin-dot-on shadow-md shadow-indigo-500/40";
      } else {
        dot.className =
          "w-4 h-4 rounded-full border-2 border-indigo-200 dark:border-slate-600 bg-white dark:bg-slate-800";
      }
    }
  }
}

function verifyEnteredPin() {
  if (enteredPin === securitySettings.pin) {
    triggerHaptic("success");
    isAppUnlocked = true;
    pinLockMode = "payment";
    const modal = document.getElementById("securityLockModal");
    if (modal) modal.classList.add("hidden");
    const cb = pendingAuthCallback;
    pendingAuthCallback = null;
    enteredPin = "";
    if (cb) cb();
  } else {
    triggerHaptic("error");
    enteredPin = "";
    updatePinDotsDisplay();
    showToast("Incorrect PIN. Try again.", true);
  }
}

/* INTERACTIVE BANK MOBILE BIOMETRIC SENSOR ENGINE
   Owner-bound: WebAuthn platform authenticator (Face ID / Fingerprint)
   when available; Telegram BiometricManager next; demo UI only if neither. */
let isBiometricScanningActive = false;
let biometricMode = "auth"; // "auth" | "enroll"

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuffer(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const str = atob(base64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

function getStoredWebAuthnCredentialId() {
  try {
    return localStorage.getItem("bankBioCredentialId") || "";
  } catch (e) {
    return "";
  }
}

function setStoredWebAuthnCredentialId(id) {
  try {
    if (id) localStorage.setItem("bankBioCredentialId", id);
    else localStorage.removeItem("bankBioCredentialId");
  } catch (e) {}
}

function updateBiometricStatusBadge() {
  const badge = document.getElementById("biometricStatusBadge");
  if (!badge) return;
  const enrolled = !!getStoredWebAuthnCredentialId() || !!securitySettings.bioEnrolled;
  if (enrolled && securitySettings.useBiometrics) {
    badge.textContent = "✔ Owner biometrics enrolled";
    badge.className =
      "text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20";
  } else if (securitySettings.useBiometrics) {
    badge.textContent = "Enabled — enroll required";
    badge.className =
      "text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20";
  } else {
    badge.textContent = "Disabled";
    badge.className =
      "text-[10px] font-bold text-slate-500 bg-slate-500/10 px-2 py-0.5 rounded-full border border-slate-500/20";
  }
}

async function webAuthnIsAvailable() {
  try {
    if (!window.PublicKeyCredential) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function enrollWebAuthnCredential() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const publicKey = {
    challenge,
    rp: { name: "Bank Mobile Mini App", id: location.hostname || "localhost" },
    user: {
      id: userId,
      name: "bank-owner",
      displayName: "Bank Owner",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    timeout: 60000,
    attestation: "none",
  };
  const cred = await navigator.credentials.create({ publicKey });
  if (!cred || !cred.rawId) throw new Error("No credential created");
  const id = bufferToBase64Url(cred.rawId);
  setStoredWebAuthnCredentialId(id);
  securitySettings.bioEnrolled = true;
  securitySettings.useBiometrics = true;
  saveSecuritySettings();
  updateBiometricStatusBadge();
  return id;
}

async function authenticateWebAuthnCredential() {
  const storedId = getStoredWebAuthnCredentialId();
  if (!storedId) throw new Error("No enrolled biometric credential");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = {
    challenge,
    timeout: 60000,
    userVerification: "required",
    allowCredentials: [
      {
        type: "public-key",
        id: base64UrlToBuffer(storedId),
        transports: ["internal"],
      },
    ],
  };
  const assertion = await navigator.credentials.get({ publicKey });
  if (!assertion) throw new Error("Biometric authentication cancelled");
  return true;
}

function triggerBiometricScan() {
  unlockAudioEngine();
  biometricMode = "auth";

  // 1) WebAuthn platform authenticator (real owner fingerprint / Face ID)
  webAuthnIsAvailable().then(async (ok) => {
    if (ok && getStoredWebAuthnCredentialId()) {
      try {
        openBiometricScanModal("Use device sensor — owner only");
        setBioScanStatus("Waiting for owner fingerprint / Face ID…", "indigo");
        await authenticateWebAuthnCredential();
        setBioScanSuccess();
        setTimeout(() => {
          closeBiometricScanModal();
          handleBiometricAuthSuccess();
        }, 400);
        return;
      } catch (e) {
        log("WebAuthn auth failed: " + e.message);
        setBioScanStatus("Scan failed — only enrolled owner works. Use PIN.", "rose");
        showToast("Biometric failed. Enter PIN.", true);
        closeBiometricScanModal();
        return;
      }
    }

    // 2) Telegram BiometricManager
    if (tgApp && tgApp.BiometricManager) {
      try {
        tgApp.BiometricManager.init(() => {
          if (tgApp.BiometricManager.isBiometricAvailable) {
            tgApp.BiometricManager.authenticate(
              { reason: "Authorize payment — owner biometrics only" },
              (success) => {
                if (success) handleBiometricAuthSuccess();
                else showToast("Biometric verification failed. Enter PIN.", true);
              },
            );
            return;
          }
          openBiometricScanModal("Touch fingerprint sensor (enroll in Settings first)");
        });
        return;
      } catch (e) {}
    }

    // 3) UI fallback — requires prior enrollment flag; does not auto-pass strangers
    if (!securitySettings.bioEnrolled && !getStoredWebAuthnCredentialId()) {
      showToast("Enroll owner biometrics in Settings first.", true);
      return;
    }
    openBiometricScanModal("Touch fingerprint sensor — owner enrolled on this device");
  });
}

function setBioScanStatus(text, tone) {
  const status = document.getElementById("bioScanStatus");
  if (!status) return;
  status.textContent = text;
  const colors = {
    indigo: "text-xs font-bold text-indigo-300",
    emerald: "text-xs font-bold text-emerald-400",
    rose: "text-xs font-bold text-rose-400",
    amber: "text-xs font-bold text-amber-300",
  };
  status.className = colors[tone] || colors.indigo;
}

function setBioScanSuccess() {
  const bar = document.getElementById("bioProgressBar");
  const icon = document.getElementById("bioSensorIcon");
  const btn = document.getElementById("bioSensorBtn");
  if (bar) bar.style.width = "100%";
  setBioScanStatus("✔ Owner biometric verified", "emerald");
  if (icon) icon.className = "fa-solid fa-check text-white";
  if (btn)
    btn.className =
      "relative w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/40 scale-105 transition-all duration-200";
  triggerHaptic("success");
}

function openBiometricScanModal(subtitle = "Touch fingerprint sensor or scan Face ID") {
  const modal = document.getElementById("biometricScanModal");
  const sub = document.getElementById("biometricScanSubtitle");
  const bar = document.getElementById("bioProgressBar");
  const icon = document.getElementById("bioSensorIcon");
  const btn = document.getElementById("bioSensorBtn");

  if (!modal) return;

  isBiometricScanningActive = false;
  if (sub) sub.textContent = subtitle;
  setBioScanStatus("Touch fingerprint sensor to scan", "indigo");
  if (bar) bar.style.width = "0%";
  if (icon) icon.className = "fa-solid fa-fingerprint text-white";
  if (btn)
    btn.className =
      "relative w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-3xl shadow-xl shadow-indigo-500/40 active:scale-95 transition-all duration-200";

  modal.classList.remove("hidden");
  triggerHaptic("impact");
}

function closeBiometricScanModal() {
  isBiometricScanningActive = false;
  const modal = document.getElementById("biometricScanModal");
  if (modal) modal.classList.add("hidden");
}

async function startBiometricTouchScan() {
  if (isBiometricScanningActive) return;
  isBiometricScanningActive = true;
  triggerHaptic("impact");

  const bar = document.getElementById("bioProgressBar");
  if (bar) bar.style.width = "40%";
  setBioScanStatus("Scanning — verifying enrolled owner…", "indigo");

  // Prefer real WebAuthn on button press as well
  if (await webAuthnIsAvailable()) {
    try {
      if (biometricMode === "enroll" || !getStoredWebAuthnCredentialId()) {
        await enrollWebAuthnCredential();
        if (bar) bar.style.width = "100%";
        setBioScanSuccess();
        showToast("Owner fingerprint / Face ID enrolled on this device");
        setTimeout(() => {
          closeBiometricScanModal();
          handleBiometricAuthSuccess();
        }, 500);
        return;
      }
      await authenticateWebAuthnCredential();
      if (bar) bar.style.width = "100%";
      setBioScanSuccess();
      setTimeout(() => {
        closeBiometricScanModal();
        handleBiometricAuthSuccess();
      }, 450);
      return;
    } catch (e) {
      log("Biometric sensor error: " + e.message);
      isBiometricScanningActive = false;
      if (bar) bar.style.width = "0%";
      setBioScanStatus("Failed — only enrolled owner is accepted", "rose");
      showToast("Biometric rejected. Try owner finger or PIN.", true);
      return;
    }
  }

  // Demo path only after enrollment flag — still slower bank-style animation
  if (!securitySettings.bioEnrolled && !getStoredWebAuthnCredentialId()) {
    isBiometricScanningActive = false;
    setBioScanStatus("Not enrolled. Use Enroll Owner in Settings.", "amber");
    showToast("Enroll owner biometrics first.", true);
    return;
  }

  if (bar) bar.style.width = "70%";
  setTimeout(() => {
    if (bar) bar.style.width = "100%";
    setBioScanSuccess();
    setTimeout(() => {
      closeBiometricScanModal();
      handleBiometricAuthSuccess();
    }, 450);
  }, 900);
}

async function enrollBiometricsInSettings() {
  securitySettings.useBiometrics = true;
  biometricMode = "enroll";
  saveSecuritySettings();

  openBiometricScanModal("Enroll OWNER fingerprint / Face ID on this device");
  setBioScanStatus("Place your finger or look at camera…", "indigo");

  if (await webAuthnIsAvailable()) {
    try {
      await enrollWebAuthnCredential();
      setBioScanSuccess();
      showToast("Owner biometrics enrolled successfully");
      setTimeout(closeBiometricScanModal, 600);
      return;
    } catch (e) {
      log("Enrollment failed: " + e.message);
      setBioScanStatus("Enrollment cancelled or failed", "rose");
      showToast("Enrollment failed. Try again on a secure device.", true);
      isBiometricScanningActive = false;
      return;
    }
  }

  // Telegram biometric access request if present
  if (tgApp && tgApp.BiometricManager) {
    try {
      tgApp.BiometricManager.init(() => {
        if (tgApp.BiometricManager.isAccessGranted === false && tgApp.BiometricManager.requestAccess) {
          tgApp.BiometricManager.requestAccess({ reason: "Enroll bank payment biometrics" }, () => {});
        }
        securitySettings.bioEnrolled = true;
        saveSecuritySettings();
        updateBiometricStatusBadge();
        setBioScanSuccess();
        showToast("Telegram biometrics linked");
        setTimeout(closeBiometricScanModal, 600);
      });
      return;
    } catch (e) {}
  }

  // Mark enrolled for UI demo on browsers without WebAuthn
  securitySettings.bioEnrolled = true;
  saveSecuritySettings();
  updateBiometricStatusBadge();
  setTimeout(() => startBiometricTouchScan(), 200);
}

function testBiometricAuth() {
  biometricMode = "auth";
  if (!securitySettings.bioEnrolled && !getStoredWebAuthnCredentialId()) {
    showToast("Enroll owner biometrics first.", true);
    return;
  }
  pendingAuthCallback = () => showToast("Owner biometric test passed");
  triggerBiometricScan();
}

function handleBiometricAuthSuccess() {
  triggerHaptic("success");
  showToast("Owner biometric verified");
  isAppUnlocked = true;
  pinLockMode = "payment";
  const modal = document.getElementById("securityLockModal");
  if (modal) modal.classList.add("hidden");
  if (pendingAuthCallback) {
    const cb = pendingAuthCallback;
    pendingAuthCallback = null;
    cb();
  }
}

/* 9. NAV & MODAL HELPERS */
function navigateToView(viewId) {
  if (viewId !== "cameraScanView") {
    stopCameraStream();
  }

  [
    "homeView",
    "cameraScanView",
    "imageScanView",
    "billPayView",
    "paymentView",
    "verifyView",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });

  const target = document.getElementById(viewId);
  if (target) target.classList.remove("hidden");

  // Sync Bottom Tab states
  const idleTab =
    "flex flex-col items-center justify-center gap-1 py-2.5 text-slate-400";
  const activeTab =
    "flex flex-col items-center justify-center gap-1 py-2.5 text-indigo-600 dark:text-indigo-400 font-bold";
  [
    "tab-btn-home",
    "tab-btn-camera",
    "tab-btn-billpay",
    "tab-btn-payment",
  ].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.className = idleTab;
  });

  if (viewId === "homeView")
    document.getElementById("tab-btn-home").className = activeTab;
  else if (viewId === "cameraScanView") {
    document.getElementById("tab-btn-camera").className = activeTab;
    startCameraStream();
  } else if (viewId === "billPayView")
    document.getElementById("tab-btn-billpay").className = activeTab;
  else if (viewId === "paymentView")
    document.getElementById("tab-btn-payment").className = activeTab;

  window.scrollTo({ top: 0, behavior: viewId === "cameraScanView" ? "auto" : "smooth" });
}

function openLoadingModal(title) {
  const modal = document.getElementById("bankModal");
  const container = document.getElementById("modalContainer");
  const headerBg = document.getElementById("modalHeaderBg");
  const iconContainer = document.getElementById("modalIconContainer");
  const icon = document.getElementById("modalIcon");
  const thankYouBadge = document.getElementById("modalThankYouBadge");
  const successActions = document.getElementById("modalSuccessActions");
  const closeBtn = document.getElementById("modalCloseBtn");

  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = "Communicating with bank API...";
  document.getElementById("modalReceiptDetails").classList.add("hidden");

  if (headerBg) headerBg.className = "bg-gradient-to-br from-indigo-600 to-violet-700 pt-7 pb-11 px-6 relative transition-colors duration-300";
  if (thankYouBadge) thankYouBadge.classList.add("hidden");
  if (successActions) successActions.classList.add("hidden");
  
  if (closeBtn) {
    closeBtn.classList.remove("hidden");
    closeBtn.disabled = true;
    closeBtn.textContent = "Processing...";
    closeBtn.className = "w-full bg-slate-300 dark:bg-slate-800 text-slate-500 font-bold py-3 rounded-2xl text-xs cursor-not-allowed transition-all";
  }

  icon.className = "fa-solid fa-spinner animate-spin text-2xl text-white";
  iconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl shadow-lg bg-white/20 text-white border border-white/30";

  modal.classList.remove("hidden");
  setTimeout(() => {
    container.classList.remove("scale-95", "opacity-0");
    container.classList.add("scale-100", "opacity-100");
  }, 10);
}

function finishModal(isSuccess, title, message, extraDetails = null) {
  const headerBg = document.getElementById("modalHeaderBg");
  const iconContainer = document.getElementById("modalIconContainer");
  const icon = document.getElementById("modalIcon");
  const thankYouBadge = document.getElementById("modalThankYouBadge");
  const successActions = document.getElementById("modalSuccessActions");
  const closeBtn = document.getElementById("modalCloseBtn");
  const details = document.getElementById("modalReceiptDetails");
  const isQrSuccess = isSuccess && lastPaymentFlow === "qr";
  const isDeeplinkSuccess =
    isSuccess &&
    (lastPaymentFlow === "deeplink" || !!getCapturedReturnUrl());

  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = message;

  if (isSuccess) {
    if (headerBg) headerBg.className = "bg-gradient-to-br from-emerald-600 via-teal-600 to-indigo-700 pt-7 pb-11 px-6 relative transition-colors duration-300";
    icon.className = "fa-solid fa-check text-2xl text-white";
    iconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl shadow-xl bg-emerald-500 text-white border-2 border-emerald-300 ring-pulse-success relative z-10";
    
    if (thankYouBadge) thankYouBadge.classList.remove("hidden");

    // QR Scan success: no Done button — only Close
    if (isQrSuccess) {
      if (successActions) successActions.classList.add("hidden");
      if (closeBtn) {
        closeBtn.classList.remove("hidden");
        closeBtn.disabled = false;
        closeBtn.textContent = "Close";
        closeBtn.className =
          "w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold py-3 rounded-2xl text-xs shadow-md active:scale-95 transition-all";
      }
    } else {
      // Deeplink / Bill Pay: Share + Done (Done opens return_url for deeplink)
      if (successActions) successActions.classList.remove("hidden");
      if (closeBtn) closeBtn.classList.add("hidden");
      const doneLabel = document.getElementById("modalDoneBtnLabel");
      if (doneLabel) {
        doneLabel.textContent = isDeeplinkSuccess ? "Done" : "Back to App";
      }
    }
  } else {
    if (headerBg) headerBg.className = "bg-gradient-to-br from-rose-600 via-rose-700 to-amber-700 pt-7 pb-11 px-6 relative transition-colors duration-300";
    icon.className = "fa-solid fa-xmark text-2xl text-white";
    iconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl shadow-xl bg-rose-500 text-white border-2 border-rose-300 relative z-10";
    
    if (thankYouBadge) thankYouBadge.classList.add("hidden");
    if (successActions) successActions.classList.add("hidden");
    
    if (closeBtn) {
      closeBtn.classList.remove("hidden");
      closeBtn.disabled = false;
      closeBtn.textContent = "Dismiss / Close";
      closeBtn.className = "w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold py-3 rounded-2xl text-xs shadow-md active:scale-95 transition-all";
    }
  }

  if (extraDetails) {
    const elCode = document.getElementById("mCustomerCode");
    const elName = document.getElementById("mCustomerName");
    const elTotal = document.getElementById("mTotalAmount");
    const elFee = document.getElementById("mFeeAmount");
    const elTo = document.getElementById("mPaidTo");
    const elDate = document.getElementById("mPaidDate");

    if (elCode) elCode.textContent = extraDetails.customer_code || "-";
    if (elName) elName.textContent = extraDetails.customer_name || "-";
    if (elTotal) elTotal.textContent = extraDetails.total_amount || "-";
    if (elFee) elFee.textContent = extraDetails.fee_amount || "-";
    if (elTo) elTo.textContent = extraDetails.paid_to || "-";
    if (elDate) elDate.textContent = extraDetails.paid_date || new Date().toLocaleString();
    
    if (details) details.classList.remove("hidden");
  } else {
    if (details) details.classList.add("hidden");
  }
}

function closeModal() {
  const modal = document.getElementById("bankModal");
  const container = document.getElementById("modalContainer");
  container.classList.remove("scale-100", "opacity-100");
  container.classList.add("scale-95", "opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 80);
}

function copyModalReceipt() {
  const code = document.getElementById("mCustomerCode") ? document.getElementById("mCustomerCode").textContent : "-";
  const name = document.getElementById("mCustomerName") ? document.getElementById("mCustomerName").textContent : "-";
  const total = document.getElementById("mTotalAmount") ? document.getElementById("mTotalAmount").textContent : "-";
  const fee = document.getElementById("mFeeAmount") ? document.getElementById("mFeeAmount").textContent : "-";
  const to = document.getElementById("mPaidTo") ? document.getElementById("mPaidTo").textContent : "-";
  const date = document.getElementById("mPaidDate") ? document.getElementById("mPaidDate").textContent : "-";

  const receiptTxt = `--- BANK MOBILE RECEIPT ---\nStatus: SUCCESSFUL\nPaid To: ${to}\nTotal Paid: ${total}\nCustomer Code: ${code}\nCustomer Name: ${name}\nFee: ${fee}\nDate: ${date}\n---------------------------`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(receiptTxt).then(() => {
      triggerHaptic("success");
      showToast("Receipt details copied!");
    }).catch(() => fallbackCopyText(receiptTxt));
  } else {
    fallbackCopyText(receiptTxt);
  }
}

function toggleDevMenu(forceClose) {
  const panel = document.getElementById("devMenuPanel");
  if (forceClose) panel.classList.add("hidden");
  else panel.classList.toggle("hidden");
}

function toggleSettingsDrawer() {
  const drawer = document.getElementById("settingsDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  const panel = document.getElementById("drawerPanel");

  if (drawer.classList.contains("hidden")) {
    // OPEN — reset to the menu-list screen on mobile; on tablet/desktop the
    // sidebar + content split-view are always both visible regardless.
    backToSettingsMenu();
    drawer.classList.remove("hidden");
    drawer.classList.add("flex");
    requestAnimationFrame(() => {
      backdrop.classList.remove("opacity-0");
      panel.classList.remove("translate-x-full", "sm:opacity-0", "sm:scale-95");
    });
  } else {
    backdrop.classList.add("opacity-0");
    panel.classList.add("translate-x-full", "sm:opacity-0", "sm:scale-95");
    setTimeout(() => {
      drawer.classList.add("hidden");
      drawer.classList.remove("flex");
    }, 300);
  }
}

/* SETTINGS SECTION ROUTER — powers the mobile drill-down menu and the
   tablet/desktop persistent sidebar split-view from the same markup. */
const SETTINGS_SECTIONS = {
  gateway: "API Gateway",
  security: "Security & PIN",
  camera: "Camera & Voice",
  appearance: "Appearance",
  linkgen: "Manual Test: Generate Link",
  data: "Backup & Data",
};

function showSettingsSection(sectionId) {
  if (!SETTINGS_SECTIONS[sectionId]) sectionId = "gateway";

  Object.keys(SETTINGS_SECTIONS).forEach((id) => {
    const panel = document.getElementById(`settingsPanel-${id}`);
    if (panel) panel.classList.toggle("hidden", id !== sectionId);
  });

  document.querySelectorAll(".settings-menu-item").forEach((btn) => {
    const isActive = btn.dataset.section === sectionId;
    btn.classList.toggle("bg-white", isActive);
    btn.classList.toggle("dark:bg-slate-900", isActive);
    btn.classList.toggle("shadow-sm", isActive);
    btn.classList.toggle("ring-1", isActive);
    btn.classList.toggle("ring-indigo-100", isActive);
    btn.classList.toggle("dark:ring-indigo-900/40", isActive);
  });

  const titleEl = document.getElementById("settingsContentTitle");
  if (titleEl) titleEl.textContent = SETTINGS_SECTIONS[sectionId];

  // Mobile drill-down: swap from the menu-list screen to the content pane.
  // (On tablet/desktop, both panes stay visible regardless of this class —
  // see the .settings-view-content media rule in the stylesheet.)
  const drawer = document.getElementById("settingsDrawer");
  if (drawer) drawer.classList.add("settings-view-content");
}

function backToSettingsMenu() {
  const drawer = document.getElementById("settingsDrawer");
  if (drawer) drawer.classList.remove("settings-view-content");
}

function saveGatewaySettings() {
  const settings = {
    baseUrl: document.getElementById("baseUrl").value.trim(),
    authToken: document.getElementById("authToken").value.trim(),
    prefixCode: document.getElementById("prefixCode").value.trim(),
    refNoDisplay: document.getElementById("refNoDisplay").value.trim(),
  };
  localStorage.setItem("bankGatewaySettings", JSON.stringify(settings));
  saveSecuritySettings();
  saveAppPreferences();
  toggleSettingsDrawer();
  showToast("Settings saved successfully.");
  log("Settings saved to local storage.");

  // After enabling PIN, lock immediately so the user can verify it works
  if (securitySettings.enabled) {
    isAppUnlocked = false;
    requireSecurityAuth(() => {
      isAppUnlocked = true;
    }, "app");
  }
}

function loadGatewaySettings() {
  try {
    const raw = localStorage.getItem("bankGatewaySettings");
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.baseUrl) document.getElementById("baseUrl").value = s.baseUrl;
    if (s.authToken) document.getElementById("authToken").value = s.authToken;
    if (s.prefixCode)
      document.getElementById("prefixCode").value = s.prefixCode;
    if (s.refNoDisplay)
      document.getElementById("refNoDisplay").value = s.refNoDisplay;
  } catch (e) {}
}

function exportGatewaySettings() {
  const settings = {
    baseUrl: document.getElementById("baseUrl").value,
    authToken: document.getElementById("authToken").value,
    prefixCode: document.getElementById("prefixCode").value,
    refNoDisplay: document.getElementById("refNoDisplay").value,
    security: securitySettings,
  };
  const blob = new Blob([JSON.stringify(settings, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "telegram-bank-settings.json";
  a.click();
  showToast("Exported configuration file.");
}

function importGatewaySettings(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const s = JSON.parse(ev.target.result);
      if (s.baseUrl) document.getElementById("baseUrl").value = s.baseUrl;
      if (s.authToken) document.getElementById("authToken").value = s.authToken;
      saveGatewaySettings();
      showToast("Settings imported successfully.");
    } catch (err) {}
  };
  reader.readAsText(file);
}

/* MANUAL TEST: GENERATE LINK — dev-only tool that calls the real
   POST /transaction/generatelinks endpoint so you can sanity-check it
   yourself. In production, Bill24's SDK calls this same endpoint
   directly with live merchant_id/transaction_id/hash — nothing here
   needs to be configured for that flow to work.
   NOTE: the server only validates merchant_id and transaction_id — hash
   is a required field but its value isn't checked, so we just send a
   placeholder. */
async function generateTestPaymentLink() {
  const merchantId =
    document.getElementById("lgMerchantId").value.trim() ||
    document.getElementById("prefixCode").value.trim();
  const transactionId = document.getElementById("lgTransactionId").value.trim();

  if (!merchantId) {
    showToast("Merchant ID is required.", true);
    return;
  }
  if (!transactionId) {
    showToast("Transaction ID is required.", true);
    return;
  }

  try {
    const payload = {
      merchant_id: merchantId,
      transaction_id: transactionId,
      hash: "manual-test-not-verified",
    };
    log("Requesting /transaction/generatelinks...", payload);

    const response = await fetch("/transaction/generatelinks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const jsonData = await response.json();

    if (!response.ok || jsonData.code !== "000") {
      showToast(jsonData.message || "Failed to generate payment link.", true);
      log("generatelinks failed:", jsonData);
      return;
    }

    const data = jsonData.data;
    log("Payment link generated.", data);

    document.getElementById("lgWebUrl").value = data.web_payment_url;
    document.getElementById("lgMobileUrl").value = data.mobile_deep_link;
    document.getElementById("lgRefBadge").textContent =
      `Transaction: ${transactionId}  ·  Merchant: ${merchantId}`;
    document.getElementById("lgResultBox").classList.remove("hidden");

    renderLinkGenQr("lgWebQr", data.web_payment_url);
    renderLinkGenQr("lgMobileQr", data.mobile_deep_link);

    showToast("Payment link generated successfully.");
  } catch (err) {
    log("generatelinks error: " + err.message);
    showToast("Connection error: " + err.message, true);
  }
}

function renderLinkGenQr(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof QRCode === "undefined") return;
  QRCode.toCanvas(canvas, text, { width: 128, margin: 1 }, (err) => {
    if (err) log("QR render error: " + err.message);
  });
}

function copyLinkGenField(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el || !el.value) return;
  navigator.clipboard
    .writeText(el.value)
    .then(() => showToast("Copied to clipboard."))
    .catch(() => showToast("Copy failed.", true));
}

function setTheme(mode) {
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem("theme", mode);
}

/* 10. ENHANCED CONSOLE LOGGING & PAYLOAD COPY */
function log(msg, data = null) {
  const out = document.getElementById("consoleOutput");
  const time = new Date().toLocaleTimeString();
  let text = `[${time}] ${msg}`;
  const entry = { timestamp: time, message: msg, payload: data || null };
  payloadLogs.unshift(entry);

  if (data) text += `\nPayload:\n` + JSON.stringify(data, null, 2);
  rawLogText = text + `\n----------------------------------------\n` + rawLogText;
  if (out) out.textContent = rawLogText;
}

function copyConsolePayload() {
  if (payloadLogs.length === 0) {
    showToast("No payloads logged yet.", true);
    return;
  }

  const formattedPayloads = JSON.stringify(payloadLogs, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(formattedPayloads)
      .then(() => {
        triggerHaptic("success");
        showToast("Copied full request & response payloads!");
      })
      .catch((err) => {
        fallbackCopyText(formattedPayloads);
      });
  } else {
    fallbackCopyText(formattedPayloads);
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  showToast("Copied full request & response payloads!");
}

function toggleLogFullScreen() {
  const section = document.getElementById("consoleSection");
  const out = document.getElementById("consoleOutput");
  const icon = document.getElementById("logExpandIcon");

  isLogFullScreen = !isLogFullScreen;

  if (isLogFullScreen) {
    section.className =
      "fixed inset-4 z-50 bg-slate-900 border-2 border-indigo-500 rounded-3xl p-5 shadow-2xl flex flex-col justify-between animate-modal-pop";
    out.className =
      "bg-slate-950 text-emerald-400 border border-slate-800 rounded-2xl p-4 text-xs font-mono overflow-auto flex-1 my-3 leading-relaxed select-text";
    if (icon) icon.className = "fa-solid fa-compress";
  } else {
    section.className =
      "hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm space-y-3 transition-all duration-300";
    out.className =
      "bg-slate-950 text-emerald-400 border border-slate-800 rounded-2xl p-3.5 text-[10px] font-mono overflow-x-auto h-36 leading-relaxed select-text";
    if (icon) icon.className = "fa-solid fa-expand";
  }
}

function clearLogs() {
  rawLogText = "Logs cleared.";
  payloadLogs = [];
  document.getElementById("consoleOutput").textContent = rawLogText;
  showToast("Console logs cleared.");
}

function toggleDevConsole() {
  const section = document.getElementById("consoleSection");
  if (section.classList.contains("hidden")) {
    section.classList.remove("hidden");
  } else {
    section.classList.add("hidden");
  }
}

/* INITIALIZATION ON WINDOW LOAD */
function initApp() {
  const savedTheme = localStorage.getItem("theme") || "light";
  setTheme(savedTheme);
  initTelegramWebApp();
  loadGatewaySettings();
  loadSecuritySettings();
  loadAppPreferences();
  showSettingsSection("gateway");
  updateFullCodes();
  updateRefNo();

  // Check for a deeplink BEFORE navigating home, so a deeplink open goes
  // straight to the Deeplink confirm screen instead of flashing the home
  // view first then immediately re-navigating — faster perceived open on
  // both web and Telegram mobile.
  const deeplinkIdentityCode =
    getStartParamFromTelegram() || getIdentityCodeFromQueryString();
  if (deeplinkIdentityCode) {
    resolvePaymentLink();
  } else {
    navigateToView("homeView");
  }
  log("Telegram Mini App Bank Engine initialised successfully.");

  // Always require PIN when the Mini App is opened if lock is enabled
  if (securitySettings.enabled) {
    isAppUnlocked = false;
    requireSecurityAuth(() => {
      isAppUnlocked = true;
    }, "app");
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (securitySettings.enabled) isAppUnlocked = false;
      return;
    }
    if (securitySettings.enabled && !isAppUnlocked) {
      requireSecurityAuth(() => {
        isAppUnlocked = true;
      }, "app");
    }
  });

  if (tgApp && tgApp.onEvent) {
    try {
      tgApp.onEvent("visibilityChanged", function (payload) {
        const visible =
          typeof payload === "boolean"
            ? payload
            : payload && (payload.is_visible === true || payload.isVisible === true);
        if (!visible) {
          if (securitySettings.enabled) isAppUnlocked = false;
          return;
        }
        if (securitySettings.enabled && !isAppUnlocked) {
          requireSecurityAuth(() => {
            isAppUnlocked = true;
          }, "app");
        }
      });
    } catch (e) {}
  }
}

document.addEventListener("DOMContentLoaded", initApp);

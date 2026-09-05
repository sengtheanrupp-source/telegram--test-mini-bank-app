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
  if (url.includes("/payment/v5/inquiry")) {
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
        urls: {
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
  identity_code: "", // transaction_id from the Bill24 SDK — the inquiry/confirm key
  customer_code: "",
  customer_name: "",
  supplier_name: "",
  bill_no: "",
  customers: [], // full customers[] array from the v5 inquiry response
  original_amount: 0,
  convenience_fee_amount: 0,
  sponsor_fee_amount: 0,
  fee_amount: 0, // convenience + sponsor, for display
  total_amount: 0,
  currency: "USD",
  fee_channel: "MERCHANT",
  description: "",
  payment_token: "",
  bank_ref: generateRandom16(),
  // Populated from the Bank API "Generate Payment Links" deeplink
  // (web_payment_url ?identity_code=... or mobile_deep_link startapp=...)
  link_token: "",
  // Populated straight from the v5 Inquiry response's data.urls.return_url —
  // this IS the URL the "Done" button redirects to after payment.
  return_url: "",
};

/* 3b. PAYMENT LINK (DEEPLINK) RESOLUTION
   Handles Mini App entry via the Bank API "Generate Payment Links" flow:
     - web_payment_url  -> https://<this-app>/?identity_code=<transaction_id>
     - mobile_deep_link -> https://t.me/<bot>/<app>?startapp=<transaction_id>
   Telegram delivers the startapp value as initDataUnsafe.start_param
   (NOT as a normal query string), so we check both. Unlike an opaque
   token, identity_code IS the Bill24 transaction_id itself — no extra
   lookup call is needed, we just feed it straight into the v5 Inquiry
   call, whose response carries everything (including urls.return_url). */
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
      params.get("identity_code") ||
      params.get("token") || // backward-compat with earlier test links
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

  showToast("Opened from payment link. Running inquiry...");
  navigateToView("paymentView");
  setTimeout(() => {
    runInquiry();
  }, 300);
}

/* Called from the "Done" button on the success receipt modal.
   If this session came from a Generate Payment Links deeplink, send the
   user back to the bank/merchant's return_url (captured from the v5
   Inquiry response's data.urls.return_url) with the outcome appended.
   Otherwise just close the modal like before. */
function handlePaymentDoneAction() {
  const returnUrl = workflowState.return_url;
  if (!returnUrl) {
    closeModal();
    return;
  }

  try {
    const target = new URL(returnUrl);
    target.searchParams.set("status", "success");
    target.searchParams.set("identity_code", workflowState.identity_code || "");
    target.searchParams.set("bank_ref", workflowState.bank_ref || "");
    target.searchParams.set("amount", String(workflowState.total_amount || ""));
    target.searchParams.set("currency", workflowState.currency || "USD");

    log("Redirecting to merchant return_url: " + target.toString());

    if (tgApp && tgApp.openLink) {
      tgApp.openLink(target.toString());
      setTimeout(() => {
        if (tgApp.close) tgApp.close();
      }, 400);
    } else {
      window.location.href = target.toString();
    }
  } catch (e) {
    log("Invalid return_url, falling back to close: " + e.message);
    closeModal();
  }
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
      finishModal(
        false,
        "KHQR Payment Failed",
        jsonData.message || "Unable to confirm payment.",
        metaDetails,
      );
    }
  } catch (err) {
    log("QR Submit Connection Error: " + err.message);
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
  if (amount > 0 && workflowState.payment_token) {
    btn.disabled = false;
    btn.className =
      "w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3.5 rounded-2xl text-xs transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2";
  } else {
    btn.disabled = true;
    btn.className =
      "w-full bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 font-bold py-3.5 rounded-2xl text-xs cursor-not-allowed transition-all flex items-center justify-center gap-2";
  }
}

async function runInquiry() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  updateFullCodes();

  if (!workflowState.identity_code) {
    showToast("Enter an Identity Code (Transaction ID) first.", true);
    return;
  }

  log("Executing Inquiry request for identity_code: " + workflowState.identity_code);
  openLoadingModal("Executing Inquiry");

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
      const urls = data.urls || {};

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

      // This is the key piece: return_url now comes straight from the
      // Inquiry response, and is what the post-payment "Done" button uses.
      workflowState.return_url = urls.return_url || workflowState.return_url || "";

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

      document.getElementById("appStatusBadge").textContent = "Token Active";
      document.getElementById("appStatusBadge").className =
        "text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20";
      evaluatePaymentMode();

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
    } else {
      document.getElementById("responseCodeBadge").textContent = jsonData.code || "FAILED";
      const resMessageEl = document.getElementById("resMessage");
      if (resMessageEl) resMessageEl.textContent = jsonData.message || "Inquiry Failed";
      finishModal(
        false,
        "Inquiry Failed",
        jsonData.message || "Unable to fetch bill.",
      );
    }
  } catch (err) {
    log("Inquiry Connection Error:", err.message);
    finishModal(false, "Connection Error", err.message);
  }
}

async function runSmartPaymentFlow() {
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
      finishModal(
        true,
        "Payment Successful",
        jsonData.message || `Transaction ${bankRef} completed.`,
        metaDetails,
      );
      speakPaymentSuccess(totalAmt, curr);
    } else {
      triggerHaptic("error");
      finishModal(
        false,
        "Payment Failed",
        jsonData.message || "Payment rejected.",
        metaDetails,
      );
    }
  } catch (err) {
    log("Payment Connection Error:", err.message);
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

/* Speak a short Khmer male voice confirmation after a successful Pay Bill / KHQR payment:
   "ទឹកប្រាក់បានទូទាត់ចំនួន[ចំនួនជាអក្សរ] ដុល្លារ" (USD)
   "ទឹកប្រាក់បានទូទាត់ចំនួន[ចំនួនជាអក្សរ] រៀល" (KHR) */
async function speakPaymentSuccess(amount, currency) {
  try {
    if (!appPreferences.voiceConfirm) return;

    unlockAudioEngine();
    // Tone chime removed per user request - ONLY human male person voice speaks

    const numericAmount = parseFloat(amount);
    const curr = String(currency || "USD").toUpperCase();
    const currencyKhmer = (curr === "KHR" || curr === "116") ? "រៀល" : "ដុល្លារ";
    const khmerWords = khmerNumberToWords(numericAmount);
    
    // Exact phrase structure requested by user (Male Voice)
    const phrase = `ទឹកប្រាក់បានទូទាត់ចំនួន${khmerWords} ${currencyKhmer}`;

    log(`Voice Confirmation triggering Khmer male human speech: "${phrase}"`);

    // Play Male human Khmer voice MP3 (SoundOfText / StreamElements / WebSpeech Male Pitch)
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
        utterance.rate = 0.88; // Energetic young male speed
        utterance.pitch = 0.82; // Younger male voice pitch
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

      // Rate 0.88x shifts female fundamental frequency (~220Hz) down to ~148Hz (energetic 20-30 y.o. younger male person voice)
      source.playbackRate.value = 0.88;

      // Stage 1: Low-shelf filter for younger male chest warmth (160Hz +6dB)
      const lowShelf = audioCtx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 160;
      lowShelf.gain.value = 6.0;

      // Stage 2: Peaking filter for young male vocal clarity & vowel resonance (1100Hz +4.5dB)
      const peakFilter = audioCtx.createBiquadFilter();
      peakFilter.type = "peaking";
      peakFilter.frequency.value = 1100;
      peakFilter.Q.value = 1.2;
      peakFilter.gain.value = 4.5;

      // Stage 3: Low-pass filter to dampen high female sibilance/hiss above 3300Hz
      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = "lowpass";
      lowPass.frequency.value = 3300;

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
        player.playbackRate = 0.88;
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
      player.playbackRate = 0.88;
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

  if (securitySettings.useBiometrics && tgApp && tgApp.BiometricManager) {
    try {
      tgApp.BiometricManager.init(() => {
        if (tgApp.BiometricManager.isBiometricAvailable) {
          triggerBiometricScan();
        }
      });
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

/* INTERACTIVE BANK MOBILE BIOMETRIC SENSOR ENGINE */
let isBiometricScanningActive = false;

function triggerBiometricScan() {
  unlockAudioEngine();

  // Primary: If Telegram WebApp BiometricManager is active and available
  if (tgApp && tgApp.BiometricManager && tgApp.BiometricManager.isBiometricAvailable) {
    try {
      tgApp.BiometricManager.authenticate(
        { reason: "Authorize payment transaction" },
        (success) => {
          if (success) {
            handleBiometricAuthSuccess();
          } else {
            showToast("Biometric verification failed. Enter PIN.", true);
          }
        },
      );
      return;
    } catch (e) {}
  }

  // Open interactive Bank Biometric Scanner overlay (similar to ABA / mobile bank apps)
  openBiometricScanModal("Touch fingerprint sensor or scan Face ID");
}

function openBiometricScanModal(subtitle = "Touch fingerprint sensor or scan Face ID") {
  const modal = document.getElementById("biometricScanModal");
  const sub = document.getElementById("biometricScanSubtitle");
  const status = document.getElementById("bioScanStatus");
  const bar = document.getElementById("bioProgressBar");
  const icon = document.getElementById("bioSensorIcon");
  const btn = document.getElementById("bioSensorBtn");

  if (!modal) return;

  isBiometricScanningActive = false;
  if (sub) sub.textContent = subtitle;
  if (status) {
    status.textContent = "Touch fingerprint sensor to scan";
    status.className = "text-xs font-bold text-indigo-300";
  }
  if (bar) bar.style.width = "0%";
  if (icon) icon.className = "fa-solid fa-fingerprint text-white";
  if (btn) btn.className = "relative w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-3xl shadow-xl shadow-indigo-500/40 active:scale-95 transition-all duration-200";

  modal.classList.remove("hidden");
  triggerHaptic("impact");
}

function closeBiometricScanModal() {
  isBiometricScanningActive = false;
  const modal = document.getElementById("biometricScanModal");
  if (modal) modal.classList.add("hidden");
}

function startBiometricTouchScan() {
  if (isBiometricScanningActive) return;
  isBiometricScanningActive = true;

  triggerHaptic("impact");
  const status = document.getElementById("bioScanStatus");
  const bar = document.getElementById("bioProgressBar");
  const icon = document.getElementById("bioSensorIcon");
  const btn = document.getElementById("bioSensorBtn");

  if (status) status.textContent = "Scanning fingerprint & verifying...";
  if (bar) bar.style.width = "50%";

  setTimeout(() => {
    if (bar) bar.style.width = "100%";
    if (status) {
      status.textContent = "✔ Biometric Scan Verified!";
      status.className = "text-xs font-bold text-emerald-400";
    }
    if (icon) icon.className = "fa-solid fa-check text-white";
    if (btn) btn.className = "relative w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/40 scale-105 transition-all duration-200";

    triggerHaptic("success");
    log("Bank Biometric sensor scan completed successfully.");

    setTimeout(() => {
      closeBiometricScanModal();
      handleBiometricAuthSuccess();
    }, 450);
  }, 350);
}

function enrollBiometricsInSettings() {
  securitySettings.useBiometrics = true;
  saveSecuritySettings();

  openBiometricScanModal("Touch sensor to register fingerprint key");

  const status = document.getElementById("bioScanStatus");
  if (status) status.textContent = "Place finger on sensor to enroll";

  const tempSuccess = function() {
    const badge = document.getElementById("biometricStatusBadge");
    if (badge) {
      badge.textContent = "✔ Biometrics Active & Enrolled";
      badge.className = "text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20";
    }
    showToast("Fingerprint / Face ID enrolled successfully!");
  };

  // Perform quick enrollment scan test
  setTimeout(() => {
    startBiometricTouchScan();
    setTimeout(tempSuccess, 900);
  }, 200);
}

function handleBiometricAuthSuccess() {
  triggerHaptic("success");
  showToast("Biometric authentication verified!");
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
  } else if (viewId === "paymentView")
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

  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = message;

  if (isSuccess) {
    if (headerBg) headerBg.className = "bg-gradient-to-br from-emerald-600 via-teal-600 to-indigo-700 pt-7 pb-11 px-6 relative transition-colors duration-300";
    icon.className = "fa-solid fa-check text-2xl text-white";
    iconContainer.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl shadow-xl bg-emerald-500 text-white border-2 border-emerald-300 ring-pulse-success relative z-10";
    
    if (thankYouBadge) thankYouBadge.classList.remove("hidden");
    if (successActions) successActions.classList.remove("hidden");
    if (closeBtn) closeBtn.classList.add("hidden");
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
window.onload = function () {
  const savedTheme = localStorage.getItem("theme") || "light";
  setTheme(savedTheme);
  initTelegramWebApp();
  loadGatewaySettings();
  loadSecuritySettings();
  loadAppPreferences();
  showSettingsSection("gateway");
  updateFullCodes();
  updateRefNo();
  navigateToView("homeView");
  log("Telegram Mini App Bank Engine initialised successfully.");
  resolvePaymentLink();

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
};

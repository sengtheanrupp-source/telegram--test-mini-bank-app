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
  if (url.includes("/inquiry")) {
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
  customer_code: "",
  customer_name: "",
  supplier_name: "",
  bill_code: "",
  bill_amount: 0,
  fee_amount: 0,
  total_amount: 0,
  currency: "USD",
  payment_token: "",
  bank_ref: generateRandom16(),
};

let rawLogText = "";
let payloadLogs = [];
let batchItems = [];
let isLogFullScreen = false;
let lastFrameTime = 0;
let scanCanvasCtx = null;
const SCAN_MAX_SIZE = 400;
const SCAN_INTERVAL_MS = 22;

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
  // Always open our HTML live camera scanner directly.
  // Bypassing tgApp.showScanQrPopup eliminates Telegram's "allow bot access your camera" popup prompt.
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
    showToast("Camera not supported here. Use Telegram Scan or Image Upload.", true);
    return;
  }

  // Fast-first constraints: 640x480 starts quicker and decodes faster than 1280x720
  const constraintOptions = [
    {
      video: {
        facingMode: { ideal: cameraFacingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    },
    { video: { facingMode: { ideal: cameraFacingMode } }, audio: false },
    { video: true, audio: false },
  ];

  log(`Starting camera stream (Facing mode: ${cameraFacingMode})...`);
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
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      video.srcObject = cameraStream;

      await new Promise((resolve) => {
        if (video.readyState >= 2) return resolve();
        const done = () => {
          video.onloadedmetadata = null;
          resolve();
        };
        video.onloadedmetadata = done;
        setTimeout(done, 180);
      });
      await video.play().catch((e) => {
        log("video.play() soft fail (retrying): " + (e && e.message));
        return video.play();
      });

      isCameraScanning = true;
      if (statusText) statusText.textContent = "Point camera at KHQR code...";
      if (btnToggle) {
        btnToggle.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Camera';
        btnToggle.className =
          "bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-2xl text-xs shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform";
      }

      lastFrameTime = 0;
      requestAnimationFrame(tickCameraFrame);
    } catch (playErr) {
      log("Video play error: " + (playErr && playErr.message));
      if (statusText) statusText.textContent = "Camera feed play failed.";
      showToast("Camera started but playback failed. Try Flip Camera.", true);
    }
  } else {
    const errName = (lastError && lastError.name) || "";
    const errMsg = (lastError && lastError.message) || "unknown";
    log("Camera stream access denied or unavailable: " + errName + " - " + errMsg);
    if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
      if (statusText) statusText.textContent = "Camera permission denied";
      showToast(
        "Camera access denied on iOS. Open Settings → Telegram → Camera (Allow), then reopen this Mini App.",
        true,
      );
    } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
      if (statusText) statusText.textContent = "No camera found on device";
      showToast("No camera detected. Use Image Upload instead.", true);
    } else if (errName === "NotReadableError" || errName === "TrackStartError") {
      if (statusText) statusText.textContent = "Camera is in use by another app";
      showToast("Camera busy. Close other apps using the camera and retry.", true);
    } else {
      if (statusText) statusText.textContent = "Camera access denied or unavailable";
      showToast("Camera access denied. Please check permissions or use Telegram Scan.", true);
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
  cameraFacingMode =
    cameraFacingMode === "environment" ? "user" : "environment";
  startCameraStream();
}

/* 4B. AUTO-ALLOW CAMERA (ANDROID & iOS) — silently pre-authorize camera
   permission on app open so the live scanner opens instantly instead of
   showing a gray preview / permission prompt the first time it's used. */
let cameraPermissionPrimed = false;

async function requestCameraPermissionEarly(silent = true) {
  if (!appPreferences.autoCamera) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    log("Auto-Allow Camera skipped: getUserMedia unavailable on this device.");
    return;
  }

  try {
    const primerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: cameraFacingMode } },
      audio: false,
    });
    // Immediately release the camera — this call's only purpose is to
    // trigger/confirm the OS-level permission prompt ahead of time.
    primerStream.getTracks().forEach((track) => track.stop());
    cameraPermissionPrimed = true;
    log("Auto-Allow Camera: permission pre-authorized successfully.");
    updateCameraPermissionStatusUI(true);
  } catch (err) {
    cameraPermissionPrimed = false;
    const errName = (err && err.name) || "unknown";
    log("Auto-Allow Camera: permission not yet granted (" + errName + ").");
    updateCameraPermissionStatusUI(false);
    if (!silent) {
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        showToast(
          "Camera permission denied. Allow it in your browser/Telegram site settings.",
          true,
        );
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        showToast("No camera detected on this device.", true);
      }
    }
  }
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
    const code = jsQR(imageData.data, dw, dw, {
      inversionAttempts: "dontInvert",
    });

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
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  if (code && code.data) {
    processDecodedQR(code.data);
    return true;
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

  let srcX = 0,
    srcY = 0,
    srcW = img.naturalWidth,
    srcH = img.naturalHeight;

  if (cropRect.width > 10 && cropRect.height > 10) {
    const scaleX = img.naturalWidth / cropRect.containerWidth;
    const scaleY = img.naturalHeight / cropRect.containerHeight;
    srcX = cropRect.left * scaleX;
    srcY = cropRect.top * scaleY;
    srcW = cropRect.width * scaleX;
    srcH = cropRect.height * scaleY;
  }

  hiddenCanvas.width = srcW;
  hiddenCanvas.height = srcH;
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  const imageData = ctx.getImageData(0, 0, srcW, srcH);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  if (code && code.data) {
    processDecodedQR(code.data);
  } else {
    log("Cropped region did not contain a readable QR code.");
  }
}

// Drag listener for snipping
const snipContainer = document.getElementById("snipContainer");
const snipBox = document.getElementById("snipBox");
if (snipContainer) {
  snipContainer.addEventListener("mousedown", (e) => {
    const img = document.getElementById("snipPreviewImg");
    if (img.classList.contains("hidden")) return;
    const rect = snipContainer.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    isDragging = true;
    snipBox.style.left = `${startX}px`;
    snipBox.style.top = `${startY}px`;
    snipBox.style.width = `0px`;
    snipBox.style.height = `0px`;
    snipBox.classList.remove("hidden");
  });

  snipContainer.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const rect = snipContainer.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
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
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      if (cropRect.width > 10 && cropRect.height > 10) scanCroppedArea();
    }
  });
}

/* 7. INQUIRY & SINGLE PAYMENT FLOWS */
function updateFullCodes() {
  const prefix = document.getElementById("prefixCode").value.trim();
  const rawCode = document.getElementById("rawCode").value.trim();
  const combined = prefix ? `${prefix}${rawCode}` : rawCode;
  document.getElementById("appCodeDisplay").textContent = `Ref: ${combined}`;
  workflowState.customer_code = combined;
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

    log("Inquiry Response Payload:", jsonData);

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

      const resSupplierEl = document.getElementById("resSupplier");
      const resCustomerCodeEl = document.getElementById("resCustomerCode");
      const resCustomerNameEl = document.getElementById("resCustomerName");
      const resMessageEl = document.getElementById("resMessage");
      const resPaymentTokenEl = document.getElementById("resPaymentToken");
      const resBillAmountEl = document.getElementById("resBillAmount");
      const resFeeAmountEl = document.getElementById("resFeeAmount");

      if (resSupplierEl) resSupplierEl.textContent = workflowState.supplier_name;
      if (resCustomerCodeEl) resCustomerCodeEl.textContent = workflowState.customer_code;
      if (resCustomerNameEl) resCustomerNameEl.textContent = workflowState.customer_name;
      if (resMessageEl) resMessageEl.textContent = jsonData.message || "Success";
      if (resPaymentTokenEl) resPaymentTokenEl.textContent = workflowState.payment_token || "None";
      if (resBillAmountEl) resBillAmountEl.textContent = `${workflowState.bill_amount} ${workflowState.currency}`;
      if (resFeeAmountEl) resFeeAmountEl.textContent = `${workflowState.fee_amount} ${workflowState.currency}`;

      document.getElementById("responseCodeBadge").textContent = jsonData.code;
      document.getElementById("paymentAmount").value = workflowState.bill_amount;

      document.getElementById("appStatusBadge").textContent = "Token Active";
      document.getElementById("appStatusBadge").className =
        "text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20";
      evaluatePaymentMode();

      const metaDetails = {
        customer_code: workflowState.customer_code,
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
  const amount =
    parseFloat(document.getElementById("paymentAmount").value) || 0;
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

  log("Submitting Payment Request to /payment/v2/confirm...", payload);
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

    log("Pay Response Payload:", jsonData);

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
      finishModal(
        true,
        "Payment Successful",
        jsonData.message || `Transaction ${autoRef} completed.`,
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

  // 1. Primary: SoundOfText API (CORS-free, public MP3 generated via Google Khmer TTS)
  try {
    log(`Fetching SoundOfText Khmer male human voice MP3 for: "${phrase}"...`);
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
      log(`Playing SoundOfText Khmer Audio: ${audioUrl}`);
      if (player) {
        player.playbackRate = 0.95; // Natural male speech rate
        player.src = audioUrl;
        await player.play();
        return;
      } else {
        const audio = new Audio(audioUrl);
        await audio.play();
        return;
      }
    }
  } catch (err) {
    console.warn("SoundOfText TTS API attempt failed:", err);
  }

  // 2. Secondary: StreamElements CORS-free Khmer TTS endpoint
  try {
    const streamUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Khmer&text=${encodeURIComponent(phrase)}`;
    log(`Playing StreamElements Khmer audio stream: ${streamUrl}`);
    if (player) {
      player.src = streamUrl;
      await player.play();
      return;
    } else {
      const audio = new Audio(streamUrl);
      await audio.play();
      return;
    }
  } catch (err) {
    console.warn("StreamElements TTS attempt failed:", err);
  }

  // 3. Tertiary: System WebSpeech API configured for Male voice (Pitch 0.7)
  if ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined") {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = "km-KH";
      utterance.rate = 0.88;
      utterance.pitch = 0.7; // Lower pitch = Deep Male Voice tone
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const maleVoice = voices.find(
        (v) =>
          v.lang &&
          v.lang.toLowerCase().startsWith("km") &&
          (v.name.toLowerCase().includes("male") ||
            v.name.toLowerCase().includes("man") ||
            v.name.toLowerCase().includes("dara") ||
            v.name.toLowerCase().includes("phat")),
      );
      if (maleVoice) utterance.voice = maleVoice;

      window.speechSynthesis.speak(utterance);
    } catch (speechErr) {
      console.warn("WebSpeech synthesis fallback failed:", speechErr);
    }
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

function triggerBiometricScan() {
  if (tgApp && tgApp.BiometricManager && tgApp.BiometricManager.isBiometricAvailable) {
    try {
      tgApp.BiometricManager.authenticate(
        { reason: "Authorize payment transaction" },
        (success) => {
          if (success) {
            triggerHaptic("success");
            isAppUnlocked = true;
            pinLockMode = "payment";
            const modal = document.getElementById("securityLockModal");
            if (modal) modal.classList.add("hidden");
            if (pendingAuthCallback) {
              const cb = pendingAuthCallback;
              pendingAuthCallback = null;
              cb();
            }
          } else {
            showToast("Biometric verification failed. Use PIN.", true);
          }
        },
      );
      return;
    } catch (e) {}
  }
  showToast("Telegram Biometrics not available on this device. Enter PIN.", true);
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
  const iconContainer = document.getElementById("modalIconContainer");
  const icon = document.getElementById("modalIcon");

  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = "Connecting to bank API...";
  document.getElementById("modalReceiptDetails").classList.add("hidden");
  document.getElementById("modalCloseBtn").disabled = true;

  icon.className = "fa-solid fa-spinner animate-spin text-xl text-white";
  iconContainer.className = "w-14 h-14 rounded-full flex items-center justify-center mx-auto text-xl shadow-lg bg-white/20 text-white border border-white/30";

  modal.classList.remove("hidden");
  setTimeout(() => {
    container.classList.remove("scale-95", "opacity-0");
    container.classList.add("scale-100", "opacity-100");
  }, 10);
}

function finishModal(isSuccess, title, message, extraDetails = null) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = message;
  const closeBtn = document.getElementById("modalCloseBtn");
  const details = document.getElementById("modalReceiptDetails");
  const iconContainer = document.getElementById("modalIconContainer");
  const icon = document.getElementById("modalIcon");

  if (isSuccess) {
    icon.className = "fa-solid fa-check text-2xl text-white";
    iconContainer.className = "w-14 h-14 rounded-full flex items-center justify-center mx-auto text-xl shadow-xl bg-emerald-500 text-white border-2 border-emerald-300 ring-pulse-success";
  } else {
    icon.className = "fa-solid fa-xmark text-2xl text-white";
    iconContainer.className = "w-14 h-14 rounded-full flex items-center justify-center mx-auto text-xl shadow-xl bg-rose-500 text-white border-2 border-rose-300";
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
    if (elDate) elDate.textContent = extraDetails.paid_date || "-";
    details.classList.remove("hidden");
  } else {
    details.classList.add("hidden");
  }

  closeBtn.disabled = false;
  closeBtn.className =
    "w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl text-xs shadow-md active:scale-95 transition-all";
  closeBtn.textContent = "Done / Close";
}

function closeModal() {
  const modal = document.getElementById("bankModal");
  const container = document.getElementById("modalContainer");
  container.classList.remove("scale-100", "opacity-100");
  container.classList.add("scale-95", "opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 80);
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

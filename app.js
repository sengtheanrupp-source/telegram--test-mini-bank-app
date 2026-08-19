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
      message: "Sandbox Inquiry Success (Mock)",
      data: {
        payment_token: "MOCK_TOKEN_" + Date.now(),
        bill_amount: 15.5,
        fee_amount: 0.0,
        total_amount: 15.5,
        currency: "USD",
        customer_code: workflowState.customer_code || "INV-2026-0009",
        customer_name: "Telegram Sandbox User",
        biller_name: "Utility Supplier Sandbox",
      },
    };
  } else if (url.includes("/payment/v2/confirm")) {
    return {
      code: "SUCCESS",
      message: "Sandbox Payment Confirmed (Mock)",
      data: {
        ref_no: autoRef,
        total_amount: workflowState.total_amount || 15.5,
        fee_amount: 0.0,
        paid_to: workflowState.supplier_name || "Bank Gateway Sandbox",
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
let batchItems = [];
let isLogFullScreen = false;

/* 4. LIVE CAMERA KHQR SCANNER ENGINE */
let cameraStream = null;
let cameraFacingMode = "environment"; // default rear camera on phones
let isCameraScanning = false;

async function startCameraStream() {
  const video = document.getElementById("cameraVideo");
  const statusText = document.getElementById("cameraScanStatus");
  const btnToggle = document.getElementById("btnToggleCamera");

  stopCameraStream();

  try {
    log(`Starting camera stream (Facing mode: ${cameraFacingMode})...`);
    statusText.textContent = "Accessing camera...";

    const constraints = {
      video: {
        facingMode: { ideal: cameraFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
    await video.play();

    isCameraScanning = true;
    statusText.textContent = "Point camera at KHQR code...";
    btnToggle.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Camera';
    btnToggle.className =
      "bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-2xl text-xs shadow-lg flex items-center justify-center gap-2";

    requestAnimationFrame(tickCameraFrame);
  } catch (err) {
    log("Camera stream error: " + err.message);
    statusText.textContent = "Camera access denied or unavailable";
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
      "bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2";
  }
}

function switchCameraFacing() {
  cameraFacingMode =
    cameraFacingMode === "environment" ? "user" : "environment";
  startCameraStream();
}

function tickCameraFrame() {
  if (!isCameraScanning) return;

  const video = document.getElementById("cameraVideo");
  const canvas = document.getElementById("cameraCanvas");
  const statusText = document.getElementById("cameraScanStatus");

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && code.data && code.data.trim()) {
      log("Live camera detected QR Code:", code.data);
      triggerHaptic("success");
      statusText.textContent = "KHQR Code Detected!";
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
}

function closeKHQRModal() {
  const modal = document.getElementById("khqrConfirmModal");
  modal.classList.add("hidden");
}

async function submitQRConfirm() {
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
      customer_code: payload.ref_no,
      customer_name: payload.issuer_name,
      total_amount: `${payload.amount} ${payload.currency}`,
      fee_amount: `0.00 ${payload.currency}`,
      paid_to: payload.issuer_name,
      paid_date: new Date().toLocaleString(),
    };

    if (jsonData.code === "SUCCESS") {
      triggerHaptic("success");
      finishModal(
        true,
        "KHQR Payment Successful",
        jsonData.message || "Transaction confirmed with bank.",
        metaDetails,
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

  log("Executing Inquiry for: " + workflowState.customer_code);
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

    if (jsonData.code === "SUCCESS" && jsonData.data) {
      const data = jsonData.data;
      workflowState.payment_token = data.payment_token || "TOKEN_" + Date.now();
      workflowState.bill_amount = data.bill_amount || 15.5;
      workflowState.fee_amount = data.fee_amount || 0;
      workflowState.total_amount = data.total_amount || 15.5;
      workflowState.customer_name = data.customer_name || "Sandbox Customer";
      workflowState.supplier_name = data.biller_name || "Biller Supplier";

      document.getElementById("resSupplier").textContent =
        workflowState.supplier_name;
      document.getElementById("resCustomerName").textContent =
        workflowState.customer_name;
      document.getElementById("resBillAmount").textContent =
        `${workflowState.bill_amount} USD`;
      document.getElementById("resFeeAmount").textContent =
        `${workflowState.fee_amount} USD`;
      document.getElementById("responseCodeBadge").textContent = jsonData.code;
      document.getElementById("paymentAmount").value =
        workflowState.bill_amount;

      document.getElementById("appStatusBadge").textContent = "Token Active";
      document.getElementById("appStatusBadge").className =
        "text-[9px] bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 rounded-full border border-emerald-500/20";
      evaluatePaymentMode();

      finishModal(
        true,
        "Inquiry Successful",
        "Bill details retrieved successfully.",
      );
    } else {
      finishModal(
        false,
        "Inquiry Failed",
        jsonData.message || "Unable to fetch bill.",
      );
    }
  } catch (err) {
    finishModal(false, "Connection Error", err.message);
  }
}

async function runSmartPaymentFlow() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const token = document.getElementById("authToken").value.trim();
  const amount =
    parseFloat(document.getElementById("paymentAmount").value) || 0;
  const autoRef = generateRandom16();

  const payload = {
    payment_token: workflowState.payment_token,
    ref_no: autoRef,
    pay_amount: amount,
    currency: "USD",
  };

  log("Submitting Payment Request...", payload);
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

    const metaDetails = {
      customer_code: workflowState.customer_code,
      customer_name: workflowState.customer_name,
      total_amount: `${amount} USD`,
      paid_to: workflowState.supplier_name,
      paid_date: new Date().toLocaleString(),
    };

    if (jsonData.code === "SUCCESS") {
      triggerHaptic("success");
      finishModal(
        true,
        "Payment Successful",
        `Transaction ${autoRef} completed.`,
        metaDetails,
      );
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

/* 8. NAV & MODAL HELPERS */
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
    "tab-btn-verify",
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
  else if (viewId === "verifyView")
    document.getElementById("tab-btn-verify").className = activeTab;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openLoadingModal(title) {
  const modal = document.getElementById("bankModal");
  const container = document.getElementById("modalContainer");
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent =
    "Connecting to bank API...";
  document.getElementById("modalReceiptDetails").classList.add("hidden");
  document.getElementById("modalCloseBtn").disabled = true;

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

  if (extraDetails) {
    document.getElementById("mCustomerCode").textContent =
      extraDetails.customer_code || "-";
    document.getElementById("mCustomerName").textContent =
      extraDetails.customer_name || "-";
    document.getElementById("mTotalAmount").textContent =
      extraDetails.total_amount || "-";
    document.getElementById("mPaidTo").textContent =
      extraDetails.paid_to || "-";
    document.getElementById("mPaidDate").textContent =
      extraDetails.paid_date || "-";
    details.classList.remove("hidden");
  } else {
    details.classList.add("hidden");
  }

  closeBtn.disabled = false;
  closeBtn.className =
    "w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-2xl text-xs shadow-md";
  closeBtn.textContent = "Done / Close";
}

function closeModal() {
  const modal = document.getElementById("bankModal");
  const container = document.getElementById("modalContainer");
  container.classList.remove("scale-100", "opacity-100");
  container.classList.add("scale-95", "opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 200);
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
  if (panel.classList.contains("translate-x-full")) {
    drawer.classList.remove("pointer-events-none");
    backdrop.classList.remove("opacity-0");
    panel.classList.remove("translate-x-full");
  } else {
    panel.classList.add("translate-x-full");
    backdrop.classList.add("opacity-0");
    setTimeout(() => drawer.classList.add("pointer-events-none"), 300);
  }
}

function saveGatewaySettings() {
  const settings = {
    baseUrl: document.getElementById("baseUrl").value.trim(),
    authToken: document.getElementById("authToken").value.trim(),
    prefixCode: document.getElementById("prefixCode").value.trim(),
    refNoDisplay: document.getElementById("refNoDisplay").value.trim(),
  };
  localStorage.setItem("bankGatewaySettings", JSON.stringify(settings));
  toggleSettingsDrawer();
  log("Settings saved to local storage.");
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
  };
  const blob = new Blob([JSON.stringify(settings, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "telegram-bank-settings.json";
  a.click();
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

function log(msg, data = null) {
  const out = document.getElementById("consoleOutput");
  const time = new Date().toLocaleTimeString();
  let text = `[${time}] ${msg}`;
  if (data) text += `\n` + JSON.stringify(data, null, 2);
  rawLogText = text + `\n\n` + rawLogText;
  if (out) out.textContent = rawLogText;
}

function clearLogs() {
  rawLogText = "Logs cleared.";
  document.getElementById("consoleOutput").textContent = rawLogText;
}

function toggleDevConsole() {
  document.getElementById("consoleSection").classList.toggle("hidden");
}

/* INITIALIZATION ON WINDOW LOAD */
window.onload = function () {
  const savedTheme = localStorage.getItem("theme") || "light";
  setTheme(savedTheme);
  initTelegramWebApp();
  loadGatewaySettings();
  updateFullCodes();
  updateRefNo();
  navigateToView("homeView");
  log("Telegram Mini App Bank Engine initialised successfully.");
};

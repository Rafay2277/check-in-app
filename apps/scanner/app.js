(() => {
  const STAFF_TOKEN_KEY = "checkin_staff_token";

  const pinScreen = document.getElementById("pinScreen");
  const staffShell = document.getElementById("staffShell");
  const scanScreen = document.getElementById("scanScreen");
  const resultScreen = document.getElementById("resultScreen");
  const analyticsScreen = document.getElementById("analyticsScreen");
  const lookupScreen = document.getElementById("lookupScreen");
  const pinForm = document.getElementById("pinForm");
  const pinInput = document.getElementById("pinInput");
  const pinError = document.getElementById("pinError");
  const video = document.getElementById("video");
  const overlay = document.getElementById("overlay");
  const scanHint = document.getElementById("scanHint");
  const stopBtn = document.getElementById("stopBtn");
  const scanAgainBtn = document.getElementById("scanAgainBtn");
  const resultCard = document.getElementById("resultCard");
  const resultIcon = document.getElementById("resultIcon");
  const resultTitle = document.getElementById("resultTitle");
  const resultDetail = document.getElementById("resultDetail");
  const rangeForm = document.getElementById("rangeForm");
  const rangeFrom = document.getElementById("rangeFrom");
  const rangeTo = document.getElementById("rangeTo");
  const refreshAnalytics = document.getElementById("refreshAnalytics");
  const analyticsError = document.getElementById("analyticsError");
  const dailyBars = document.getElementById("dailyBars");
  const checkinReport = document.getElementById("checkinReport");
  const reportEmpty = document.getElementById("reportEmpty");
  const reportScope = document.getElementById("reportScope");
  const lookupInput = document.getElementById("lookupInput");
  const lookupResults = document.getElementById("lookupResults");
  const lookupHint = document.getElementById("lookupHint");
  const lookupError = document.getElementById("lookupError");
  const wedgeDock = document.getElementById("wedgeDock");
  const wedgeInput = document.getElementById("wedgeInput");

  let staffToken = sessionStorage.getItem(STAFF_TOKEN_KEY) || "";
  let stream = null;
  let rafId = 0;
  let scanning = false;
  let lastScanAt = 0;
  let validating = false;
  let activeTab = "scan";
  let analyticsDetail = "today";
  let lookupTimer = null;
  let lookupSeq = 0;
  let wedgeRefocusTimer = null;

  const apiBase = ""; // same Express host

  function authHeaders(json = false) {
    const headers = { Authorization: `Bearer ${staffToken}` };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  function showPin() {
    pinScreen.hidden = false;
    staffShell.hidden = true;
    stopCamera();
  }

  function showStaff(tab = "scan") {
    pinScreen.hidden = true;
    staffShell.hidden = false;
    setTab(tab);
  }

  function focusWedge(force = false) {
    if (!wedgeInput || staffShell.hidden || activeTab !== "scan") return;
    const active = document.activeElement;
    if (
      !force &&
      active &&
      active !== document.body &&
      active !== wedgeInput &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.isContentEditable)
    ) {
      return;
    }
    try {
      wedgeInput.focus({ preventScroll: true });
    } catch {
      wedgeInput.focus();
    }
  }

  function scheduleWedgeRefocus(delayMs = 80) {
    clearTimeout(wedgeRefocusTimer);
    wedgeRefocusTimer = setTimeout(() => focusWedge(true), delayMs);
  }

  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".rail-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    analyticsScreen.hidden = tab !== "analytics";
    lookupScreen.hidden = tab !== "lookup";
    if (wedgeDock) wedgeDock.hidden = tab !== "scan";

    if (tab === "scan") {
      if (resultScreen.hidden) {
        scanScreen.hidden = false;
        startCamera().catch((err) => {
          scanHint.textContent = err.message || "Camera permission required";
        });
      } else {
        scanScreen.hidden = true;
        resultScreen.hidden = false;
      }
      scheduleWedgeRefocus(50);
    } else {
      stopCamera();
      scanScreen.hidden = true;
      resultScreen.hidden = true;
    }

    if (tab === "analytics") {
      loadAnalytics();
    }
  }

  function showResult(approved, detail, titleOverride) {
    stopCamera();
    resultCard.classList.toggle("ok", approved);
    resultCard.classList.toggle("bad", !approved);
    resultIcon.textContent = "Scan result";
    resultTitle.textContent =
      titleOverride || (approved ? "Approved" : "Not valid");
    resultDetail.textContent = detail || "";
    scanScreen.hidden = true;
    resultScreen.hidden = false;
    activeTab = "scan";
    if (wedgeDock) wedgeDock.hidden = false;
    document.querySelectorAll(".rail-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === "scan");
    });
    if (wedgeInput) wedgeInput.value = "";
    // Keep hardware scanner ready for the next card without clicking "Scan next"
    scheduleWedgeRefocus(120);
  }

  async function unlock(pin) {
    const res = await fetch(`${apiBase}/api/staff/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not unlock");
    }
    staffToken = data.staffToken;
    sessionStorage.setItem(STAFF_TOKEN_KEY, staffToken);
  }

  function handleUnauthorized() {
    sessionStorage.removeItem(STAFF_TOKEN_KEY);
    staffToken = "";
    showPin();
    pinError.hidden = false;
    pinError.textContent = "Session expired — enter PIN again";
  }

  async function validateToken(token) {
    const res = await fetch(`${apiBase}/api/staff/validate`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.approved, status: res.status, data };
  }

  function cameraBlockedReason() {
    const host = location.hostname;
    const isLocalhost = host === "localhost" || host === "127.0.0.1";
    const secure =
      window.isSecureContext === true || location.protocol === "https:";

    if (!secure && !isLocalhost) {
      const httpsUrl = `https://${host}:3443/scanner/`;
      return (
        "Camera is blocked on plain HTTP. Open this page over HTTPS instead: " +
        httpsUrl +
        " (accept the certificate warning once)."
      );
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return "Camera API not available in this browser. Try Chrome/Safari, or open via HTTPS.";
    }

    return null;
  }

  async function startCamera() {
    const blocked = cameraBlockedReason();
    if (blocked) {
      scanHint.textContent = blocked;
      return;
    }

    const viewportWrap = document.querySelector(".viewport-wrap");
    const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (viewportWrap) viewportWrap.classList.toggle("laptop-cam", !mobile);
    const videoConstraints = mobile
      ? {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
    } catch (err) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      } catch (err2) {
        const msg =
          err2 && err2.name === "NotAllowedError"
            ? "Camera permission denied — allow camera access for this site and retry."
            : (err2 && err2.message) ||
              (err && err.message) ||
              "Could not open camera";
        scanHint.textContent = msg;
        throw err2;
      }
    }

    video.srcObject = stream;
    await video.play();
    scanning = true;
    scanHint.textContent = mobile
      ? "Point at the member’s QR code"
      : "Hold the iPhone 8–12 inches from the webcam (top of the laptop), slightly tilted to avoid glare";
    tick();
  }

  function stopCamera() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  function extractUuid(raw) {
    const text = String(raw || "").trim();
    const match = text.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    );
    return match ? match[0].toLowerCase() : null;
  }

  async function onDetected(raw) {
    const now = Date.now();
    if (validating) return;
    if (now - lastScanAt < 1200) return;
    lastScanAt = now;

    const token = extractUuid(raw);
    if (!token) {
      if (scanScreen.hidden === false) {
        scanHint.textContent = "QR found, but not a check-in code";
      } else {
        showResult(false, "Not a check-in code — expected a token UUID");
      }
      if (wedgeInput) wedgeInput.value = "";
      scheduleWedgeRefocus(80);
      return;
    }

    validating = true;
    scanning = false;
    if (!scanScreen.hidden) {
      scanHint.textContent = "Validating…";
    }

    try {
      const result = await validateToken(token);
      if (result.status === 401) {
        handleUnauthorized();
        return;
      }

      if (result.ok) {
        const name = result.data.member?.name || "Member";
        const pts = result.data.member?.pointsTotal;
        const kind =
          result.data.tokenKind === "permanent" ? "card" : "app QR";
        showResult(
          true,
          `${name} · ${pts} pts (${kind}) — apply Loyalty Comp on Square`
        );
      } else {
        const code = result.data.code;
        let title = "Not valid";
        if (code === "already_checked_in_today") title = "Already checked in";
        else if (code === "card_deactivated") title = "Card deactivated";
        showResult(false, result.data.error || "Token rejected", title);
      }
    } catch (err) {
      showResult(false, err.message || "Network error");
    } finally {
      validating = false;
      if (wedgeInput) wedgeInput.value = "";
      scheduleWedgeRefocus(150);
    }
  }

  function submitWedgeScan() {
    const raw = (wedgeInput?.value || "").trim();
    if (!raw) return;
    onDetected(raw);
  }

  function tick() {
    if (!scanning) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h && typeof jsQR === "function") {
      const maxW = 800;
      const scale = w > maxW ? maxW / w : 1;
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      overlay.width = dw;
      overlay.height = dh;
      const ctx = overlay.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, dw, dh);
      const imageData = ctx.getImageData(0, 0, dw, dh);
      const code = jsQR(imageData.data, dw, dh, {
        inversionAttempts: "attemptBoth",
      });
      if (code?.data) {
        onDetected(code.data);
        return;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function ensureDefaultRange() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (!rangeFrom.value) rangeFrom.value = ymd(monthStart);
    if (!rangeTo.value) rangeTo.value = ymd(now);
  }

  async function loadAnalytics() {
    ensureDefaultRange();
    analyticsError.hidden = true;
    const params = new URLSearchParams({
      from: rangeFrom.value,
      to: rangeTo.value,
      detail: analyticsDetail,
    });

    try {
      const res = await fetch(`${apiBase}/api/analytics/summary?${params}`, {
        headers: authHeaders(),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not load analytics");
      }

      document.getElementById("statToday").textContent = String(
        data.today?.approved ?? 0
      );
      document.getElementById("statTodayRejected").textContent = `${
        data.today?.rejected ?? 0
      } rejected`;
      document.getElementById("statWeek").textContent = String(
        data.week?.approved ?? 0
      );
      document.getElementById("statWeekRejected").textContent = `${
        data.week?.rejected ?? 0
      } rejected`;
      document.getElementById("statMonth").textContent = String(
        data.month?.approved ?? 0
      );
      document.getElementById("statMonthRejected").textContent = `${
        data.month?.rejected ?? 0
      } rejected`;
      document.getElementById("statRange").textContent = String(
        data.range?.approved ?? 0
      );
      document.getElementById("statRangeRejected").textContent = `${
        data.range?.rejected ?? 0
      } rejected`;

      const mega = document.getElementById("statToday");
      mega.style.animation = "none";
      void mega.offsetWidth;
      mega.style.animation = "";

      const scopeLabels = {
        today: "Showing today’s check-ins",
        week: "Showing this week’s check-ins",
        month: "Showing this month’s check-ins",
        range: `Showing ${rangeFrom.value} → ${rangeTo.value}`,
      };
      reportScope.textContent =
        scopeLabels[analyticsDetail] || scopeLabels.range;

      renderDailyBars(data.daily || []);
      renderCheckinReport(data.checkins || []);
    } catch (err) {
      analyticsError.hidden = false;
      analyticsError.textContent = err.message || "Analytics failed";
    }
  }

  function formatCheckinTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function renderCheckinReport(rows) {
    checkinReport.innerHTML = "";
    if (!rows.length) {
      reportEmpty.hidden = false;
      return;
    }
    reportEmpty.hidden = true;
    rows.forEach((row, index) => {
      const li = document.createElement("li");
      li.className = "report-item";
      li.style.animationDelay = `${Math.min(index, 12) * 30}ms`;
      li.innerHTML = `
        <p class="report-name"></p>
        <p class="report-meta"></p>
        <p class="report-points"></p>
      `;
      li.querySelector(".report-name").textContent = row.name || "Unknown member";
      li.querySelector(".report-meta").textContent = `${formatCheckinTime(
        row.checkedInAt
      )} · ${row.phoneNumber || "No phone"}`;
      li.querySelector(".report-points").textContent = `${
        row.pointsTotal ?? 0
      } check-in points`;
      checkinReport.appendChild(li);
    });
  }

  function renderDailyBars(daily) {
    dailyBars.innerHTML = "";
    if (!daily.length) {
      dailyBars.innerHTML =
        '<p class="meta-line">No approved check-ins in this range.</p>';
      return;
    }
    const max = Math.max(...daily.map((d) => d.count), 1);
    daily.forEach((row, index) => {
      const item = document.createElement("div");
      item.className = "bar-row";
      item.style.animationDelay = `${index * 40}ms`;
      const label = document.createElement("span");
      label.className = "bar-label";
      label.textContent = row.day.slice(5);
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      const pct = Math.max(8, (row.count / max) * 100);
      fill.style.width = `${pct}%`;
      const count = document.createElement("span");
      count.className = "bar-count";
      count.textContent = String(row.count);
      track.appendChild(fill);
      item.appendChild(label);
      item.appendChild(track);
      item.appendChild(count);
      dailyBars.appendChild(item);
    });
  }

  async function runLookup(q) {
    const seq = ++lookupSeq;
    lookupError.hidden = true;
    lookupHint.textContent = "Searching…";
    lookupResults.innerHTML = "";

    try {
      const res = await fetch(
        `${apiBase}/api/ghl/contacts/search?q=${encodeURIComponent(q)}`,
        { headers: authHeaders() }
      );
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (seq !== lookupSeq) return;

      if (!res.ok) {
        throw new Error(data.error || "Search failed");
      }

      const results = data.results || [];
      if (!results.length) {
        lookupHint.textContent = "No contacts found";
        return;
      }

      lookupHint.textContent = `${results.length} result${
        results.length === 1 ? "" : "s"
      }`;
      results.forEach((c) => {
        const li = document.createElement("li");
        li.className = "lookup-item";
        const points =
          c.pointsTotal == null
            ? "No local points yet"
            : `${c.pointsTotal} points`;
        li.innerHTML = `
          <p class="lookup-name"></p>
          <p class="lookup-meta"></p>
          <p class="lookup-points"></p>
        `;
        li.querySelector(".lookup-name").textContent = c.name || "Unknown";
        li.querySelector(".lookup-meta").textContent = c.phone || "No phone on file";
        li.querySelector(".lookup-points").textContent = points;
        lookupResults.appendChild(li);
      });
    } catch (err) {
      if (seq !== lookupSeq) return;
      lookupHint.textContent = "";
      lookupError.hidden = false;
      lookupError.textContent = err.message || "Search failed";
    }
  }

  document.querySelectorAll(".rail-tab").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  pinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    pinError.hidden = true;
    try {
      await unlock(pinInput.value.trim());
      pinInput.value = "";
      resultScreen.hidden = true;
      showStaff("scan");
      await startCamera();
      scheduleWedgeRefocus(80);
    } catch (err) {
      pinError.hidden = false;
      pinError.textContent = err.message || "Unlock failed";
    }
  });

  stopBtn.addEventListener("click", () => {
    stopCamera();
    sessionStorage.removeItem(STAFF_TOKEN_KEY);
    staffToken = "";
    showPin();
  });

  scanAgainBtn.addEventListener("click", async () => {
    resultScreen.hidden = true;
    scanScreen.hidden = false;
    try {
      await startCamera();
    } catch (err) {
      scanHint.textContent = err.message || "Camera permission required";
    }
    scheduleWedgeRefocus(80);
  });

  if (wedgeInput) {
    wedgeInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      submitWedgeScan();
    });

    // Some scanners fire a form-like submit; also catch input ending with newline
    wedgeInput.addEventListener("input", () => {
      const v = wedgeInput.value;
      if (v.includes("\n") || v.includes("\r")) {
        wedgeInput.value = v.replace(/[\r\n]+/g, "");
        submitWedgeScan();
      }
    });
  }

  // If focus drifts off the wedge while on the Scan tab, pull it back
  // (unless staff clicked another real field — we only reclaim from body/buttons).
  document.addEventListener("focusin", (e) => {
    if (staffShell.hidden || activeTab !== "scan") return;
    const t = e.target;
    if (t === wedgeInput) return;
    if (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable)
    ) {
      return;
    }
    scheduleWedgeRefocus(60);
  });

  rangeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    analyticsDetail = "range";
    loadAnalytics();
  });

  refreshAnalytics.addEventListener("click", () => loadAnalytics());

  function setDetail(detail) {
    analyticsDetail = detail;
    loadAnalytics();
  }

  document.querySelectorAll("[data-detail]").forEach((el) => {
    el.addEventListener("click", () => setDetail(el.dataset.detail));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setDetail(el.dataset.detail);
      }
    });
  });

  lookupInput.addEventListener("input", () => {
    const q = lookupInput.value.trim();
    clearTimeout(lookupTimer);
    lookupError.hidden = true;
    if (q.length < 2) {
      lookupHint.textContent = "Type at least 2 characters";
      lookupResults.innerHTML = "";
      return;
    }
    lookupHint.textContent = "Waiting…";
    lookupTimer = setTimeout(() => runLookup(q), 400);
  });

  if (staffToken) {
    resultScreen.hidden = true;
    showStaff("scan");
    startCamera().catch((err) => {
      scanHint.textContent = err.message || "Camera permission required";
    });
    scheduleWedgeRefocus(100);
  } else {
    showPin();
  }
})();

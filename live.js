(async function () {
  const salinityEl = document.getElementById("salinityValue");
  const tempEl = document.getElementById("temperatureValue");
  const depthEl = document.getElementById("depthValue");
  const depthConfidenceEl = document.getElementById("depthConfidenceValue");
  const timeEl = document.getElementById("timestampValue");
  const deviceTypeEl = document.getElementById("deviceTypeValue");
  const statusEl = document.getElementById("statusMessage");
  const depthChartCanvas = document.getElementById("depthChart");
  const depthChartStatusEl = document.getElementById("depthChartStatus");

  const DEPTH_PLOT_LAG_POINTS = 5;
  const NEW_LANDING_GAP_MS = 10000;
  const POLL_INTERVAL_MS = 1000;

  let pendingDepthPoints = [];
  let depthSeries = [];
  let previousDeviceType = "air";
  let lastSeenTimestamp = null;
  let lastWaterPointTimeMs = null;
  let liveCursorTimestamp = null;

  let liveMap = null;
  let liveMarker = null;
  let liveMapReady = false;
  let hasCenteredOnFirstFix = false;

  function getLocalDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeDeviceType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getTimestamp(row) {
    return row.timestamp || row.Timestamp || null;
  }

  function getTimestampMs(timestamp) {
    const t = new Date(timestamp).getTime();
    return Number.isFinite(t) ? t : Date.now();
  }

  function clearDashboard() {
    salinityEl.textContent = "--";
    tempEl.textContent = "--";
    depthEl.textContent = "--";
    depthConfidenceEl.textContent = "Confidence: --";
    timeEl.textContent = "--";
    deviceTypeEl.textContent = "--";
  }

  function clearDepthPlot(message = "Waiting for water data.") {
    depthSeries = [];
    pendingDepthPoints = [];
    lastSeenTimestamp = null;
    lastWaterPointTimeMs = null;
    depthChartStatusEl.textContent = message;
    drawDepthPlot();
  }

  function initLiveMap() {
    if (liveMap) return;

    liveMap = new atlas.Map("liveMap", {
      zoom: 14,
      center: [0, 0],
      language: "none",
      authOptions: (function () {
        const cfg = window.APP_CONFIG || {};

        if (cfg.AZURE_MAPS_SUBSCRIPTION_KEY) {
          return {
            authType: "subscriptionKey",
            subscriptionKey: cfg.AZURE_MAPS_SUBSCRIPTION_KEY
          };
        }

        if (cfg.AZURE_MAPS_CLIENT_ID && cfg.MAP_TOKEN_URL) {
          return {
            authType: "anonymous",
            clientId: cfg.AZURE_MAPS_CLIENT_ID,
            getToken: function (resolve, reject) {
              fetch(cfg.MAP_TOKEN_URL)
                .then(r => r.text())
                .then(t => resolve(t))
                .catch(reject);
            }
          };
        }

        return {
          authType: "subscriptionKey",
          subscriptionKey: "MISSING_KEY"
        };
      })()
    });

    liveMap.events.add("ready", () => {
      liveMarker = new atlas.HtmlMarker({
        position: [0, 0],
        color: "red"
      });

      liveMap.markers.add(liveMarker);
      liveMapReady = true;
    });
  }

  function updateLiveMap(latest) {
    const lat = Number(latest.latitude);
    const lon = Number(latest.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) {
      return;
    }

    initLiveMap();

    if (!liveMapReady || !liveMarker) {
      return;
    }

    liveMarker.setOptions({
      position: [lon, lat]
    });

    if (!hasCenteredOnFirstFix) {
      liveMap.setCamera({
        center: [lon, lat],
        zoom: 14
      });
      hasCenteredOnFirstFix = true;
    }
  }

  function drawDepthPlot() {
    if (!depthChartCanvas) return;

    const canvas = depthChartCanvas;
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || canvas.width;
    const displayHeight = canvas.clientHeight || canvas.height;

    if (
      canvas.width !== Math.round(displayWidth * ratio) ||
      canvas.height !== Math.round(displayHeight * ratio)
    ) {
      canvas.width = Math.round(displayWidth * ratio);
      canvas.height = Math.round(displayHeight * ratio);
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const padLeft = 58;
    const padRight = 18;
    const padTop = 20;
    const padBottom = 42;
    const plotW = displayWidth - padLeft - padRight;
    const plotH = displayHeight - padTop - padBottom;

    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e5e7eb";
    ctx.fillStyle = "#6b7280";

    ctx.strokeRect(padLeft, padTop, plotW, plotH);

    for (let i = 0; i <= 4; i++) {
      const y = padTop + (plotH * i / 4);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();
    }

    ctx.fillText("Depth (m)", padLeft, 12);

    if (depthSeries.length === 0) {
      ctx.fillStyle = "#9ca3af";
      ctx.fillText("No confirmed water-landing depth data yet.", padLeft + 12, padTop + 32);
      return;
    }

    const depths = depthSeries.map(p => p.depth);
    let minDepth = Math.min(...depths);
    let maxDepth = Math.max(...depths);

    if (minDepth === maxDepth) {
      minDepth = Math.max(0, minDepth - 0.1);
      maxDepth = maxDepth + 0.1;
    } else {
      const margin = (maxDepth - minDepth) * 0.1;
      minDepth = Math.max(0, minDepth - margin);
      maxDepth = maxDepth + margin;
    }

    const startMs = depthSeries[0].timeMs;
    const endMs = depthSeries[depthSeries.length - 1].timeMs;
    const durationMs = Math.max(1000, endMs - startMs);

    function xFor(point) {
      return padLeft + ((point.timeMs - startMs) / durationMs) * plotW;
    }

    function yFor(depth) {
      return padTop + plotH - ((depth - minDepth) / (maxDepth - minDepth)) * plotH;
    }

    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= 4; i++) {
      const value = maxDepth - ((maxDepth - minDepth) * i / 4);
      const y = padTop + (plotH * i / 4);
      ctx.fillText(value.toFixed(2), padLeft - 8, y);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("0 s", padLeft, padTop + plotH + 12);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(durationMs / 1000)} s`, padLeft + plotW, padTop + plotH + 12);

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();

    depthSeries.forEach((point, index) => {
      const x = xFor(point);
      const y = yFor(point.depth);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    const last = depthSeries[depthSeries.length - 1];

    ctx.fillStyle = "#2563eb";
    ctx.beginPath();
    ctx.arc(xFor(last), yFor(last.depth), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateDepthPlot(latest) {
    const deviceType = normalizeDeviceType(latest.deviceType || latest.waterState);
    const timestamp = getTimestamp(latest) || String(Date.now());
    const depth = Number(latest.depth);
    const nowMs = getTimestampMs(timestamp);

    if (timestamp === lastSeenTimestamp) {
      drawDepthPlot();
      return;
    }

    lastSeenTimestamp = timestamp;

    const returningToWaterAfterAir = previousDeviceType !== "water" && deviceType === "water";
    const returningToWaterAfterGap =
      deviceType === "water" &&
      lastWaterPointTimeMs !== null &&
      nowMs - lastWaterPointTimeMs > NEW_LANDING_GAP_MS;

    if (returningToWaterAfterAir || returningToWaterAfterGap) {
      clearDepthPlot("New water landing detected. Plot restarted.");
    }

    if (deviceType !== "water") {
      pendingDepthPoints = [];
      previousDeviceType = deviceType || "air";

      if (depthSeries.length > 0) {
        depthChartStatusEl.textContent = `Holding completed water-landing plot (${depthSeries.length} points).`;
      } else {
        depthChartStatusEl.textContent = "Waiting for water data.";
      }

      drawDepthPlot();
      return;
    }

    previousDeviceType = "water";

    if (!Number.isFinite(depth) || depth <= 0) {
      depthChartStatusEl.textContent = "Water detected, but latest depth is invalid.";
      drawDepthPlot();
      return;
    }

    pendingDepthPoints.push({
      timeMs: nowMs,
      label: timestamp,
      depth
    });

    while (pendingDepthPoints.length > DEPTH_PLOT_LAG_POINTS) {
      depthSeries.push(pendingDepthPoints.shift());
    }

    lastWaterPointTimeMs = nowMs;

    if (depthSeries.length === 0) {
      depthChartStatusEl.textContent =
        `Confirming water data... (${pendingDepthPoints.length}/${DEPTH_PLOT_LAG_POINTS + 1})`;
    } else {
      depthChartStatusEl.textContent =
        `Plotting current water landing (${depthSeries.length} confirmed points, ${pendingDepthPoints.length} held back).`;
    }

    drawDepthPlot();
  }

  function renderLatest(latest) {
    if (!latest) {
      clearDashboard();
      statusEl.textContent = "No data available.";
      drawDepthPlot();
      return;
    }

    const today = getLocalDateKey();
    const latestTimestamp = getTimestamp(latest);

    const latestDate =
      latest.dateKey ||
      latest.DateOnly ||
      latest.Date ||
      (latestTimestamp ? latestTimestamp.slice(0, 10) : null);

    const isToday = latestDate === today;

    if (!isToday) {
      clearDashboard();
      statusEl.textContent = latestDate
        ? `No data has been collected since ${latestDate}`
        : "No valid timestamp found in latest data.";
      drawDepthPlot();
      return;
    }

    salinityEl.textContent =
      Number.isFinite(Number(latest.salinity)) ? Number(latest.salinity).toFixed(2) : "--";

    tempEl.textContent =
      Number.isFinite(Number(latest.temperature)) ? Number(latest.temperature).toFixed(2) : "--";

    depthEl.textContent =
      Number.isFinite(Number(latest.depth)) && Number(latest.depth) > 0
        ? Number(latest.depth).toFixed(2)
        : "--";

    depthConfidenceEl.textContent =
      `Confidence: ${
        Number.isFinite(Number(latest.depthConfidence)) && Number(latest.depthConfidence) > 0
          ? Number(latest.depthConfidence).toFixed(2)
          : "--"
      }`;

    timeEl.textContent = latestTimestamp || "--";
    deviceTypeEl.textContent = latest.deviceType || latest.waterState || "N/A";
    statusEl.textContent = "";

    updateLiveMap(latest);
    updateDepthPlot(latest);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }

    return await res.json();
  }

  async function loadLatest() {
    const baseUrl = window.APP_CONFIG.DATA_API_URL;
    const sinceUrl = baseUrl.replace("GetDroneData", "GetDroneDataSince");

    let rows = [];

    if (liveCursorTimestamp) {
      rows = await fetchJson(`${sinceUrl}?since=${encodeURIComponent(liveCursorTimestamp)}`);
    } else {
      rows = await fetchJson(baseUrl);
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      if (!liveCursorTimestamp) {
        renderLatest(null);
      }
      return;
    }

    rows.sort((a, b) => {
      const ta = new Date(getTimestamp(a) || 0).getTime();
      const tb = new Date(getTimestamp(b) || 0).getTime();
      return ta - tb;
    });

    for (const row of rows) {
      renderLatest(row);

      const ts = getTimestamp(row);
      if (ts) {
        liveCursorTimestamp = ts;
      }
    }
  }

  try {
    initLiveMap();
    drawDepthPlot();
    window.addEventListener("resize", drawDepthPlot);

    await loadLatest();
    setInterval(loadLatest, POLL_INTERVAL_MS);
  } catch (err) {
    console.error("Live dashboard error:", err);
    statusEl.textContent = `Error loading data: ${err.message}`;
  }
})();
(async function () {
  const salinityEl = document.getElementById("salinityValue");
  const tempEl = document.getElementById("temperatureValue");
  const depthEl = document.getElementById("depthValue");
  const depthConfidenceEl = document.getElementById("depthConfidenceValue");
  const timeEl = document.getElementById("timestampValue");
  const deviceTypeEl = document.getElementById("deviceTypeValue");
  const statusEl = document.getElementById("statusMessage");

  try {
    const res = await fetch(window.APP_CONFIG.DATA_API_URL);
    const rows = await res.json();

    if (!rows || rows.length === 0) {
      statusEl.textContent = "No data available.";
      return;
    }

    rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const latest = rows[0];

    const today = new Date().toISOString().slice(0, 10);
    const latestDate = latest.dateKey;
    const isToday = latestDate === today;

    if (isToday) {
      salinityEl.textContent =
        Number.isFinite(Number(latest.salinity)) ? Number(latest.salinity).toFixed(2) : "--";

      tempEl.textContent =
        Number.isFinite(Number(latest.temperature)) ? Number(latest.temperature).toFixed(2) : "--";

      depthEl.textContent =
        Number.isFinite(Number(latest.depth)) && Number(latest.depth) > 0 ? Number(latest.depth).toFixed(2) : "--";

      depthConfidenceEl.textContent =
        `Confidence: ${Number.isFinite(Number(latest.depthConfidence)) && Number(latest.depthConfidence) > 0 ? Number(latest.depthConfidence).toFixed(2) : "--"}`;

      timeEl.textContent = latest.timestamp || "--";
      deviceTypeEl.textContent = latest.deviceType || "N/A";

      statusEl.textContent = "";
    } else {
      salinityEl.textContent = "--";
      tempEl.textContent = "--";
      depthEl.textContent = "--";
      depthConfidenceEl.textContent = "Confidence: --";
      timeEl.textContent = "--";
      deviceTypeEl.textContent = "--";

      statusEl.textContent = `No data has been collected since ${latestDate}`;
    }

  } catch (err) {
    console.error("Live dashboard error:", err);
    statusEl.textContent = `Error loading data: ${err.message}`;
  }
})();
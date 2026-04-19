(async function () {
  const salinityEl = document.getElementById("salinityValue");
  const tempEl = document.getElementById("temperatureValue");
  const timeEl = document.getElementById("timestampValue");
  const statusEl = document.getElementById("statusMessage");

  try {
    // --- Fetch data ---

    const res = await fetch(window.APP_CONFIG.DATA_API_URL);
    const rows = await res.json();


    if (!rows || rows.length === 0) {
      statusEl.textContent = "No data available.";
      return;
    }

    // --- Sort by timestamp (newest first) ---
    rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const latest = rows[0];

    // --- Check if latest is from today ---
    const today = new Date().toISOString().slice(0, 10);
    const latestDate = latest.dateKey;

    const isToday = latestDate === today;

    if (isToday) {
      // Show values
      salinityEl.textContent = latest.salinity?.toFixed(2) ?? "--";
      tempEl.textContent = latest.temperature?.toFixed(2) ?? "--";
      timeEl.textContent = latest.timestamp;

      statusEl.textContent = ""; // no warning
    } else {
      // Hide values
      salinityEl.textContent = "--";
      tempEl.textContent = "--";
      timeEl.textContent = "--";

      statusEl.textContent =
        `No data has been collected since ${latestDate}`;
    }

  } catch (err) {
    console.error("Live dashboard error:", err);
    statusEl.textContent = `Error loading data: ${err.message}`;
  }
})();
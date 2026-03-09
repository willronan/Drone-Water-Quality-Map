/* ============================================================
   DATA: fetch + normalize rows for the map
   - Source: Azure Function (recommended) that reads Azure Table Storage
   - Parameters: hard-coded to salinity + temperature
   Exposes: window.DataModule
============================================================ */

(function () {
  // Only plot these parameters (table schema can evolve safely).
  const PARAMETERS = ['salinity', 'temperature'];

  function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  // Fetch JSON rows from an API.
  // Expected response: Array of objects with at least:
  //   latitude, longitude, timestamp (ISO string), salinity, temperature
  // You may also return 'date' or 'DateOnly'. If not provided, we'll derive date from timestamp.
  async function loadRowsFromApi(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`API fetch failed: ${r.status}`);
    return await r.json();
  }

  function toIsoDateOnly(ts) {
    // ts can be ISO string, epoch ms, or Date
    const d = (ts instanceof Date) ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    // YYYY-MM-DD
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Convert raw API rows to the shape expected by app.js
  function normalizeRows(rawRows) {
    const rows = (rawRows || [])
      .map(r => {
        const lat = Number(r.latitude ?? r.lat);
        const lon = Number(r.longitude ?? r.lon);
        const ts = r.timestamp ?? r.Timestamp ?? r.time ?? r.Time ?? null;

        // Date for grouping (prefer explicit date field; otherwise derive from timestamp)
        const date = (r.date ?? r.DateOnly ?? r.Date ?? null) || toIsoDateOnly(ts);

        const out = {
          latitude: lat,
          longitude: lon,
          date,
          timestamp: ts
        };

        for (const p of PARAMETERS) {
          const n = Number(r[p]);
          out[p] = Number.isFinite(n) ? n : NaN;
        }

        return out;
      })
      .filter(r =>
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude) &&
        r.date
      );

    return rows;
  }

  // Build { dateIndex, dates, parameters } like the old CSV pipeline.
  function rowsToDateIndex(rawRows) {
    const rows = normalizeRows(rawRows);

    const dateIndex = {};
    for (const row of rows) {
      if (!dateIndex[row.date]) dateIndex[row.date] = [];
      dateIndex[row.date].push(row);
    }

    const dates = Object.keys(dateIndex).sort();

    return { dateIndex, dates, parameters: PARAMETERS.slice() };
  }

  window.DataModule = {
    PARAMETERS,
    loadRowsFromApi,
    rowsToDateIndex
  };
})();

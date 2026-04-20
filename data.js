/* ============================================================
   DATA: fetch + normalize rows for the map
============================================================ */

(function () {
  const PARAMETERS = ['salinity', 'temperature'];

  function toIsoDateOnly(ts) {
    const d = (ts instanceof Date) ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return null;

    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function isIsoDateString(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  async function loadRowsFromApi(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`API fetch failed: ${r.status}`);
    return await r.json();
  }

  function normalizeRows(rawRows) {
    const rows = (rawRows || [])
      .map(r => {
        const lat = Number(r.latitude ?? r.lat);
        const lon = Number(r.longitude ?? r.lon);

        const timestamp = r.timestamp ?? r.Timestamp ?? r.time ?? r.Time ?? null;

        const dateKey =
          r.dateKey ??
          r.DateKey ??
          r.date ??
          r.DateOnly ??
          r.Date ??
          toIsoDateOnly(timestamp);

        const dateLabel =
          r.dateLabel ??
          r.DateLabel ??
          dateKey;

        const out = {
          latitude: lat,
          longitude: lon,
          timestamp,
          dateKey,
          dateLabel,
          deviceType: r.deviceType ?? 'N/A',
          deviceId: r.deviceId ?? 'N/A'
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
        r.dateKey
      );

    return rows;
  }

  function rowsToDateIndex(rawRows) {
    const rows = normalizeRows(rawRows);

    const dateIndex = {};
    const dateMeta = {};

    for (const row of rows) {
      if (!dateIndex[row.dateKey]) {
        dateIndex[row.dateKey] = [];
        dateMeta[row.dateKey] = {
          label: row.dateLabel,
          year: isIsoDateString(row.dateKey) ? row.dateKey.slice(0, 4) : '2025'
        };
      }
      dateIndex[row.dateKey].push(row);
    }

    const dates = Object.keys(dateIndex).sort();

    const years = [...new Set(
      dates
        .map(d => dateMeta[d]?.year)
        .filter(Boolean)
    )].sort();

    return {
      dateIndex,
      dates,
      parameters: PARAMETERS.slice(),
      dateMeta,
      years
    };
  }

  window.DataModule = {
    PARAMETERS,
    loadRowsFromApi,
    rowsToDateIndex
  };
})();
/* ============================================================
   APP: map init, layers, UI wiring, ingestion
============================================================ */

(function () {
  // --- App state ---
  const state = {
    map: null,
    dateIndex: {},
    dates: [],
    parameters: [],
    selectedParam: 'salinity',
    selectedDate: null,

    livePoints: [],
    liveRows: [],
    cursor: 0,

    displayPointSource: null,
    pointLayer: null,
    pointPopup: null,

    mergeRadius: 1e-7 // keep your current value
  };

  const displaySampling = {
    cellSizeMeters: 3,
    occupied: new Set(),
    anchorMeters3857: null
  };

  // --- Helpers ---
  function project3857Meters(lon, lat) {
    const R = 6378137;
    const x = R * lon * Math.PI / 180;

    const clampedLat = Math.max(Math.min(lat, 89.9999), -89.9999);
    const y = R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI / 180) / 2));

    return [x, y];
  }

  function shouldDisplayPoint(deltaMetersX, deltaMetersY) {
    const cs = displaySampling.cellSizeMeters;
    const gx = Math.floor(deltaMetersX / cs);
    const gy = Math.floor(deltaMetersY / cs);
    const key = `${gx},${gy}`;

    if (displaySampling.occupied.has(key)) return false;
    displaySampling.occupied.add(key);
    return true;
  }

  function populateDateSelector(dates) {
    const select = document.getElementById('dateSelect');
    select.innerHTML = '';

    for (const d of dates) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    }

    select.addEventListener('change', e => {
      state.selectedDate = e.target.value;
      refreshVisualization();
    });
  }

  function populateParamSelector(parameters) {
    const select = document.getElementById('paramSelect');
    select.innerHTML = '';

    for (const p of parameters) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      select.appendChild(opt);
    }

    // default
    if (parameters.includes('salinity')) {
      state.selectedParam = 'salinity';
      select.value = 'salinity';
    } else if (parameters.length) {
      state.selectedParam = parameters[0];
      select.value = parameters[0];
    }

    select.addEventListener('change', e => {
      state.selectedParam = e.target.value;
      refreshVisualization();
    });
  }

  function setLegend(title, min, max) {
    document.getElementById('legend-title').textContent = title;
    document.getElementById('legend-min').textContent = Number.isFinite(min) ? min.toFixed(2) : '';
    document.getElementById('legend-max').textContent = Number.isFinite(max) ? max.toFixed(2) : '';
  }

  function computeRange(rows, paramName) {
    let min = Infinity, max = -Infinity;
    for (const r of rows) {
      const v = Number(r[paramName]);
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    // avoid zero range
    if (min === max) return { min: min - 1, max: max + 1 };
    return { min, max };
  }

  function recreatePointLayer(min, max) {
    if (!state.map) return;

    // Remove old layer and its event handlers (if any)
    if (state.pointLayer) {
      state.map.layers.remove(state.pointLayer);
      state.pointLayer = null;
    }
    if (state.pointPopup) state.pointPopup.close();

    // Create a new layer referencing a normalized property name: "value"
    state.pointLayer = new atlas.layer.BubbleLayer(state.displayPointSource, 'points', {
      radius: 4,
      strokeColor: 'white',
      strokeWidth: 1,
      color: [
        'interpolate', ['linear'], ['get', 'value'],
        min, 'blue',
        max, 'red'
      ]
    });
    state.map.layers.add(state.pointLayer);

    // Popup showing the currently-selected parameter
    state.pointPopup = new atlas.Popup({ closeButton: false, pixelOffset: [0, -10] });

    state.map.events.add('mousemove', state.pointLayer, e => {
      if (!e.shapes || !e.shapes.length) return;
      const props = e.shapes[0].getProperties();
      const v = Number(props.value);

      state.pointPopup.setOptions({
        position: e.position,
        content: `<div style="padding:6px">
          <b>${state.selectedParam}</b><br/>
          ${Number.isFinite(v) ? v.toFixed(2) : 'n/a'}
        </div>`
      });

      state.pointPopup.open(state.map);
    });

    state.map.events.add('mouseleave', state.pointLayer, () => state.pointPopup.close());
  }

  // --- Map setup ---
  function initMap() {
    state.map = new atlas.Map('map', {
      zoom: 16,
      center: [-123.143, 49.321],
      language: 'none',
      antialias: true,
      authOptions: (function(){
        const cfg = window.APP_CONFIG || {};
        // Option A (NOT recommended for public GitHub Pages): shared key in config.js
        if (cfg.AZURE_MAPS_SUBSCRIPTION_KEY) {
          return { authType: 'subscriptionKey', subscriptionKey: cfg.AZURE_MAPS_SUBSCRIPTION_KEY };
        }
        // Option B (recommended): Microsoft Entra token from your backend.
        // Requires: cfg.AZURE_MAPS_CLIENT_ID and cfg.MAP_TOKEN_URL
        if (cfg.AZURE_MAPS_CLIENT_ID && cfg.MAP_TOKEN_URL) {
          return {
            authType: 'anonymous',
            clientId: cfg.AZURE_MAPS_CLIENT_ID,
            getToken: function (resolve, reject, map) {
              fetch(cfg.MAP_TOKEN_URL).then(r => r.text()).then(t => resolve(t)).catch(reject);
            }
          };
        }
        console.warn('No Azure Maps auth configured. Set AZURE_MAPS_SUBSCRIPTION_KEY or (AZURE_MAPS_CLIENT_ID + MAP_TOKEN_URL) in config.js');
        return { authType: 'subscriptionKey', subscriptionKey: 'MISSING_KEY' };
      })()
    });

    state.map.events.add('ready', onMapReady);
  }

  function onMapReady() {
    // WebGL layer
    const layer = new atlas.layer.WebGLLayer('triangles', {
      renderer: window.WebGLLayerModule.renderer
    });
    state.map.layers.add(layer, 'labels');

    // Point source (display sampling)
    state.displayPointSource = new atlas.source.DataSource();
    state.map.sources.add(state.displayPointSource);

    // Load data AFTER map ready
    bootstrapData();
  }

  // --- Data bootstrap ---
  async function bootstrapData() {
    // Configure these in config.js (recommended), or edit defaults below.
    const cfg = window.APP_CONFIG || {};
    const dataApiUrl = cfg.DATA_API_URL || 'https://YOUR-FUNCTION-APP.azurewebsites.net/api/GetDroneData';

    try {
      const rawRows = await window.DataModule.loadRowsFromApi(dataApiUrl);
      const { dateIndex, dates, parameters } = window.DataModule.rowsToDateIndex(rawRows);

      state.dateIndex = dateIndex;
      state.dates = dates;
      state.parameters = parameters;

      populateDateSelector(dates);
      populateParamSelector(parameters);

      // Select first date if available
      if (dates.length) {
        state.selectedDate = dates[0];
        document.getElementById('dateSelect').value = dates[0];
      }

      refreshVisualization();
    } catch (err) {
      console.error(err);
      alert('Failed to load data. Check DATA_API_URL in config.js and your Azure Function CORS settings.');
    }
  }


  function refreshVisualization() {
    if (!state.selectedDate || !state.selectedParam) return;
    loadDate(state.selectedDate, state.selectedParam);
  }

  // --- Date/param load + ingestion ---
  function loadDate(date, paramName) {
    console.log('Loading:', { date, paramName });

    // Clear display points
    displaySampling.occupied.clear();
    state.displayPointSource.clear();

    // Reset triangulation + WebGL mesh
    state.livePoints = [];
    state.cursor = 0;
    window.WebGLLayerModule.clearMesh();

    const rows = state.dateIndex[date];
    if (!rows || rows.length < 3) return;

    // Compute range for selected parameter
    const { min, max } = computeRange(rows, paramName);
    window.WebGLLayerModule.setValueRange(min, max);
    setLegend(paramName, min, max);

    // Recreate the point layer with the new range for the color ramp
    recreatePointLayer(min, max);

    const anchorLonLat = [rows[0].longitude, rows[0].latitude];

    // WebGL anchor in Azure MercatorPoint coords
    const anchorMercator = atlas.data.MercatorPoint.fromPosition(anchorLonLat);
    window.WebGLLayerModule.meshState.anchorMercator = new Float32Array([
      anchorMercator[0],
      anchorMercator[1]
    ]);

    // Sampling anchor in 3857 meters
    displaySampling.anchorMeters3857 = project3857Meters(anchorLonLat[0], anchorLonLat[1]);

    // Title
    document.getElementById('map-title').textContent = `${paramName} Gradient – ${date}`;

    // Ingest all rows immediately
    state.liveRows = rows;
    while (state.cursor < state.liveRows.length) {
      ingestNextPoint(state.liveRows[state.cursor], paramName);
      state.cursor++;
    }
    console.log("Ingestion complete");
  }

  function ingestNextPoint(row, paramName) {
    const lat = row.latitude;
    const lon = row.longitude;
    const v = Number(row[paramName]);

    if (lat === 0 && lon === 0) return;
    if (!Number.isFinite(v)) return; // skip rows missing this parameter

    const pointMercator = atlas.data.MercatorPoint.fromPosition([lon, lat]);

    const localMercatorX = pointMercator[0] - window.WebGLLayerModule.meshState.anchorMercator[0];
    const localMercatorY = pointMercator[1] - window.WebGLLayerModule.meshState.anchorMercator[1];

    // Always keep for triangulation
    state.livePoints.push({
      lon,
      lat,
      localMercatorX,
      localMercatorY,
      value: v
    });

    // Display-sampled points
    const [pointMetersX, pointMetersY] = project3857Meters(lon, lat);
    const deltaMetersX = pointMetersX - displaySampling.anchorMeters3857[0];
    const deltaMetersY = pointMetersY - displaySampling.anchorMeters3857[1];

    if (shouldDisplayPoint(deltaMetersX, deltaMetersY)) {
      state.displayPointSource.add(new atlas.data.Feature(
        new atlas.data.Point([lon, lat]),
        { value: v }
      ));
    }

    if (state.livePoints.length < 3) return;

    const vertices = window.Triangulation.retriangulate(state.livePoints, state.mergeRadius);
    if (!vertices) return;

    window.WebGLLayerModule.meshState.vertices = vertices;
    window.WebGLLayerModule.uploadMesh();
  }

  // Start app
  initMap();
})();

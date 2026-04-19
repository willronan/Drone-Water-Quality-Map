/* ============================================================
   APP: map init, layers, UI wiring, ingestion
============================================================ */

(function () {
  // --- App state ---
  const state = {
    map: null,
    dateIndex: {},
    dates: [],
    dateMeta: {},
    years: [],
    parameters: [],
    selectedYear: null,
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

  function getDatesForSelectedYear() {
    if (!state.selectedYear) return state.dates.slice();

    return state.dates.filter(d => {
      const meta = state.dateMeta[d];
      return meta && meta.year === state.selectedYear;
    });
  }

  function populateYearSelector(years) {
    const select = document.getElementById('yearSelect');
    select.innerHTML = '';

    for (const y of years) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      select.appendChild(opt);
    }

    select.onchange = e => {
      state.selectedYear = e.target.value;

      const filteredDates = getDatesForSelectedYear();
      populateDateSelector(filteredDates);

      if (filteredDates.length) {
        state.selectedDate = filteredDates[filteredDates.length - 1];
        document.getElementById('dateSelect').value = state.selectedDate;
        refreshVisualization();
      }
    };
  }

  function populateDateSelector(dates) {
    const select = document.getElementById('dateSelect');
    select.innerHTML = '';

    for (const d of dates) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = state.dateMeta[d]?.label || d;
      select.appendChild(opt);
    }

    select.onchange = e => {
      state.selectedDate = e.target.value;
      refreshVisualization();
    };
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

    if (parameters.includes('salinity')) {
      state.selectedParam = 'salinity';
      select.value = 'salinity';
    } else if (parameters.length) {
      state.selectedParam = parameters[0];
      select.value = parameters[0];
    }

    select.onchange = e => {
      state.selectedParam = e.target.value;
      refreshVisualization();
    };
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
    if (min === max) return { min: min - 1, max: max + 1 };
    return { min, max };
  }

  function recreatePointLayer(min, max) {
    if (!state.map) return;

    if (state.pointLayer) {
      state.map.layers.remove(state.pointLayer);
      state.pointLayer = null;
    }
    if (state.pointPopup) state.pointPopup.close();

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
        if (cfg.AZURE_MAPS_SUBSCRIPTION_KEY) {
          return { authType: 'subscriptionKey', subscriptionKey: cfg.AZURE_MAPS_SUBSCRIPTION_KEY };
        }
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
    const layer = new atlas.layer.WebGLLayer('triangles', {
      renderer: window.WebGLLayerModule.renderer
    });
    state.map.layers.add(layer, 'labels');

    state.displayPointSource = new atlas.source.DataSource();
    state.map.sources.add(state.displayPointSource);

    bootstrapData();
  }

  // --- Data bootstrap ---
  async function bootstrapData() {
    const cfg = window.APP_CONFIG || {};
    const dataApiUrl = cfg.DATA_API_URL || 'https://YOUR-FUNCTION-APP.azurewebsites.net/api/GetDroneData';

    try {
      const rawRows = await window.DataModule.loadRowsFromApi(dataApiUrl);
      const { dateIndex, dates, parameters, dateMeta, years } = window.DataModule.rowsToDateIndex(rawRows);

      state.dateIndex = dateIndex;
      state.dates = dates;
      state.parameters = parameters;
      state.dateMeta = dateMeta;
      state.years = years;

      populateYearSelector(years);
      populateParamSelector(parameters);

      if (years.length) {
        state.selectedYear = years[years.length - 1];
        document.getElementById('yearSelect').value = state.selectedYear;
      }

      const filteredDates = getDatesForSelectedYear();
      populateDateSelector(filteredDates);

      if (filteredDates.length) {
        state.selectedDate = filteredDates[filteredDates.length - 1];
        document.getElementById('dateSelect').value = state.selectedDate;
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

    displaySampling.occupied.clear();
    state.displayPointSource.clear();

    state.livePoints = [];
    state.cursor = 0;
    window.WebGLLayerModule.clearMesh();

    const rows = state.dateIndex[date];
    if (!rows || rows.length < 3) return;

    const { min, max } = computeRange(rows, paramName);
    window.WebGLLayerModule.setValueRange(min, max);
    setLegend(paramName, min, max);

    recreatePointLayer(min, max);

    const anchorLonLat = [rows[0].longitude, rows[0].latitude];

    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const r of rows) {
      const lon = r.longitude;
      const lat = r.latitude;

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    state.map.setCamera({
      bounds: [minLon, minLat, maxLon, maxLat],
      padding: 200
    });

    const cam = state.map.getCamera();
    if (cam.zoom > 14) {
      state.map.setCamera({
        center: cam.center,
        zoom: 14
      });
    }

    const anchorMercator = atlas.data.MercatorPoint.fromPosition(anchorLonLat);
    window.WebGLLayerModule.meshState.anchorMercator = new Float32Array([
      anchorMercator[0],
      anchorMercator[1]
    ]);

    displaySampling.anchorMeters3857 = project3857Meters(anchorLonLat[0], anchorLonLat[1]);

    const label = state.dateMeta[date]?.label || date;
    document.getElementById('map-title').textContent = `${paramName} Gradient – ${label}`;

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
    if (!Number.isFinite(v)) return;

    const pointMercator = atlas.data.MercatorPoint.fromPosition([lon, lat]);

    const localMercatorX = pointMercator[0] - window.WebGLLayerModule.meshState.anchorMercator[0];
    const localMercatorY = pointMercator[1] - window.WebGLLayerModule.meshState.anchorMercator[1];

    state.livePoints.push({
      lon,
      lat,
      localMercatorX,
      localMercatorY,
      value: v
    });

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

  initMap();
})();
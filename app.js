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

  console.log('Selected date:', date);
  console.log('First point for date:', rows[0].longitude, rows[0].latitude);

  // Move map to first point of this date
  state.map.setCamera({
    center: anchorLonLat,
    zoom: 14
  });

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

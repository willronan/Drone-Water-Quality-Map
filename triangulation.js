/* ============================================================
   TRIANGULATION: mergePoints + retriangulate
   Exposes: window.Triangulation
============================================================ */

(function () {
  function mergePoints(points, radiusMeters) {
    const merged = [];

    for (const p of points) {
      let found = false;

      for (const m of merged) {
        const dx = p.localMercatorX - m.localMercatorX;
        const dy = p.localMercatorY - m.localMercatorY;
        const dist = Math.hypot(dx, dy);

        if (dist < radiusMeters) {
          m.localMercatorX = (m.localMercatorX + p.localMercatorX) / 2;
          m.localMercatorY = (m.localMercatorY + p.localMercatorY) / 2;
          m.lon = (m.lon + p.lon) / 2;
          m.lat = (m.lat + p.lat) / 2;
          m.value = (m.value + p.value) / 2;
          found = true;
          break;
        }
      }

      if (!found) merged.push({ ...p });
    }

    return merged;
  }

  function retriangulate(points, mergeRadiusMeters) {
    const mergedPoints = mergePoints(points, mergeRadiusMeters);
    if (mergedPoints.length < 3) return null;

    const delaunay = Delaunator.from(
      mergedPoints.map(p => [p.localMercatorX, p.localMercatorY])
    );

    const vertices = [];

    for (let i = 0; i < delaunay.triangles.length; i += 3) {
      const a = mergedPoints[delaunay.triangles[i]];
      const b = mergedPoints[delaunay.triangles[i + 1]];
      const c = mergedPoints[delaunay.triangles[i + 2]];

      const avg = (a.value + b.value + c.value) / 3;

      // interleaved: x, y, value
      vertices.push(
        a.localMercatorX, a.localMercatorY, avg,
        b.localMercatorX, b.localMercatorY, avg,
        c.localMercatorX, c.localMercatorY, avg
      );
    }

    return vertices;
  }

  window.Triangulation = {
    mergePoints,
    retriangulate
  };
})();

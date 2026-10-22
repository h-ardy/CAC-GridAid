const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} returned ${r.status}`);
  return r.json();
}

function miles(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function insideRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function insideCounty(lat, lon, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) =>
    insideRing(lat, lon, rings[0]) && !rings.slice(1).some((hole) => insideRing(lat, lon, hole))
  );
}

function cleanBuildings(buildings, countyOutline) {
  const geometry = countyOutline.features[0].geometry;
  const kept = [];
  for (const b of buildings) {
    if (!b.name) continue;
    if (!insideCounty(b.lat, b.lon, geometry)) continue;
    if (b.access === "private" || b.access === "no") continue;
    const duplicate = kept.some((k) => k.name === b.name && miles(k.lat, k.lon, b.lat, b.lon) < 0.093);
    if (duplicate) continue;
    kept.push(b);
  }
  return kept;
}

function pickSites(zips, sites, k, R) {
       const reaches = sites.map((s) =>
        zips.map((z, zi) => zi).filter((zi) => miles(s.lat, s.lon, zips[zi].lat, zips[zi].lon) <= R)
    );

    const covered = zips.map(() => false);
    const chosen = [];

    for (let round = 0; round < k; round++) {
        let best = -1;
        let bestGain = 0;

        for (let s = 0; s < sites.length; s++) {
            if (chosen.includes(s)) continue;
            let gain = 0;
            for(const zi of reaches[s]) {
                if (!covered[zi]) gain += zips[zi].people;
            }
            if (gain > bestGain) {
                best = s;
                bestGain = gain;
            }
        }
        if (best === -1) break;
        chosen.push(best);
        for(const zi of reaches[best]) covered[zi] = true;
    }

  return chosen;
}

async function loadCountyData(fips) {
  const [zips, outlines, outline, buildings] = await Promise.all([
    getJSON(`data/zips_${fips}.json`),
    getJSON(`data/zip_outlines_${fips}.json`),
    getJSON(`data/county_outline_${fips}.geojson`),
    getJSON(`data/buildings_${fips}.json`),
  ]);
  return {
    fips,
    name: zips.name,
    zips: zips.zips,
    shapes: outlines.zips,
    sites: cleanBuildings(buildings.buildings, outline),
  };
}

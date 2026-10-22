const RAMP = ["#f3ead8", "#e2c79a", "#c98f4e", "#8a4b1f"];
const GAP = "#c2511a";
const INK = "#13202e";
const METERS_PER_MILE = 1609.34;

const els = {
  county: document.getElementById("county"),
  k: document.getElementById("k"),
  reach: document.getElementById("reach"),
  coverage: document.getElementById("coverage"),
  coverageNote: document.getElementById("coverageNote"),
  siteList: document.getElementById("siteList"),
  gapList: document.getElementById("gapList"),
};

const map = L.map("map", { scrollWheelZoom: false });
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  maxZoom: 18,
}).addTo(map);
const zipLayer = L.layerGroup().addTo(map);
const siteLayer = L.layerGroup().addTo(map);

let county = null;

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} returned ${r.status}`);
  return r.json();
}

async function loadCounty(fips) {
  const [zips, outlines, outline, buildings] = await Promise.all([
    getJSON(`data/zips_${fips}.json`),
    getJSON(`data/zip_outlines_${fips}.json`),
    getJSON(`data/county_outline_${fips}.geojson`),
    getJSON(`data/buildings_${fips}.json`),
  ]);
  county = {
    fips,
    name: zips.name,
    zips: zips.zips,
    shapes: outlines.zips,
    sites: cleanBuildings(buildings.buildings, outline),
  };
  els.reach.value = fips === "39009" ? 10 : 3;
  draw(true);
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
        zips.map((z, zi) => zi).filter((zi) =>  zips.map((z, zi) => zi).filter((zi) => miles(s.lat, s.lon, zips[zi].lat, zips[zi].lon) <= R))
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

function evaluate(zips, sites, chosen, R) {
  const nearest = zips.map((z) => {
    let d = Infinity, who = -1;
    chosen.forEach((s, i) => {
      const dist = miles(z.lat, z.lon, sites[s].lat, sites[s].lon);
      if (dist < d) { d = dist; who = i; }
    });
    return { d, who };
  });
  const total = zips.reduce((sum, z) => sum + z.people, 0);
  const reached = zips.reduce((sum, z, i) => sum + (nearest[i].d <= R ? z.people : 0), 0);
  return { nearest, total, reached };
}

function shadeClass(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const breaks = [1, 2, 3].map((i) => sorted[Math.floor((i * sorted.length) / 4)]);
  return (v) => breaks.filter((b) => v >= b && b > sorted[0]).length;
}

function draw(fit = false) {
  if (!county) return;
  const k = Math.max(1, Number(els.k.value) || 1);
  const R = Math.max(0.5, Number(els.reach.value) || 10);
  const chosen = pickSites(county.zips, county.sites, k, R);
  const { nearest, total, reached } = evaluate(county.zips, county.sites, chosen, R);
  const classOf = shadeClass(county.zips.map((z) => z.people));

  zipLayer.clearLayers();
  siteLayer.clearLayers();
  const bounds = L.latLngBounds([]);

  county.zips.forEach((z, i) => {
    const out = nearest[i].d > R && z.people > 0;
    const style = { color: out ? GAP : "#ffffff", weight: out ? 2 : 0.8, fillColor: RAMP[classOf(z.people)], fillOpacity: 0.8 };
    const shape = county.shapes[z.zip];
    const layer = shape ? L.polygon(shape.p, style) : L.circleMarker([z.lat, z.lon], { ...style, radius: 6 });
    const people = z.masked ? "1 to 10" : z.people.toLocaleString();
    const where = chosen.length ? ` · ${nearest[i].d.toFixed(1)} mi to site ${nearest[i].who + 1}` : "";
    layer.bindTooltip(`<b>ZIP ${z.zip}</b><br>${people} people<br>${out ? "Out of reach" : "Covered"}${where}`, { sticky: true });
    layer.addTo(zipLayer);
    bounds.extend(shape ? layer.getBounds() : [z.lat, z.lon]);
  });

  chosen.forEach((s, i) => {
    const site = county.sites[s];
    L.circle([site.lat, site.lon], { radius: R * METERS_PER_MILE, color: INK, weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(siteLayer);
    L.marker([site.lat, site.lon], { icon: L.divIcon({ className: "pin", html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(esc(site.name))
      .addTo(siteLayer);
  });

  if (fit) map.fitBounds(bounds, { padding: [20, 20] });

  const pct = total ? (100 * reached) / total : 0;
  els.coverage.textContent = `${pct.toFixed(1)}%`;
  els.coverageNote.textContent = `${reached.toLocaleString()} of ${total.toLocaleString()} people who rely on powered medical equipment are within ${R} miles of a site.`;

  els.siteList.innerHTML = chosen.length
    ? chosen.map((s) => `<li>${esc(county.sites[s].name)}<span>${county.sites[s].type.replace("_", " ")}</span></li>`).join("")
    : `<li class="muted">No sites picked yet.</li>`;

  const gaps = county.zips
    .map((z, i) => ({ z, d: nearest[i].d }))
    .filter((g) => g.d > R && g.z.people > 0)
    .sort((a, b) => b.z.people - a.z.people)
    .slice(0, 8);
  els.gapList.innerHTML = gaps.length
    ? gaps.map((g) => `<li>ZIP ${g.z.zip}<b>${g.z.people.toLocaleString()}</b></li>`).join("")
    : `<li class="muted">Everyone is within reach.</li>`;
}

els.county.addEventListener("change", () => loadCounty(els.county.value));
els.k.addEventListener("input", () => draw());
els.reach.addEventListener("input", () => draw());

loadCounty(els.county.value).catch((e) => {
  els.coverage.textContent = "Couldn't load data";
  els.coverageNote.textContent = e.message;
});
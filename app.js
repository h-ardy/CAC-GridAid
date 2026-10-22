const RAMP = ["#f3ead8", "#e2c79a", "#c98f4e", "#8a4b1f"];
const GAP = "#c2511a";
const INK = "#13202e";
const METERS_PER_MILE = 1609.34;

const els = {
  county: document.getElementById("county"),
  coverage: document.getElementById("coverage"),
  coverageNote: document.getElementById("coverageNote"),
  siteList: document.getElementById("siteList"),
  gapList: document.getElementById("gapList"),
};

const map = L.map("map", { scrollWheelZoom: false });
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",  maxZoom: 16,
}).addTo(map);
const zipLayer = L.layerGroup().addTo(map);
const siteLayer = L.layerGroup().addTo(map);

let county = null;
let costs = null;


async function loadCounty(fips) {
  county = await loadCountyData(fips);
  draw(true);
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
    const plan = costs.counties[county.fips];
  const k = plan ? plan.sites.recommended : 3;
  const R = plan ? plan.reach : 10;  const chosen = pickSites(county.zips, county.sites, k, R);
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
  els.coverageNote.textContent = `With ${chosen.length} sites, ${reached.toLocaleString()} of ${total.toLocaleString()} people who rely on powered medical equipment are within ${R} miles of one.`;
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

async function start() {
    costs = await getJSON("data/costs.json");
    await loadCounty(els.county.value);
}

start().catch((e) => {
    els.coverage.textContent = "Couldn't load data";
    els.coverageNote.textContent = e.message;
    if (plan) els.coverageNote.textContent += ` That is what the county's estimated budget of ${plan.budget.recommended.diesel >= 1e6 ? `$${(plan.budget.recommended.diesel / 1e6).toFixed(2)}M` : `$${Math.round(plan.budget.recommended.diesel).toLocaleString()}`} buys in diesel generators.`;
});
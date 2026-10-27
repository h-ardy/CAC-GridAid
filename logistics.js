const READY = { hookup: "Weeks", diesel: "Months; grants can take years", gas: "Months; needs a gas line", solar: "Months to a year" };
const RAMP = ["#f3ead8", "#e2c79a", "#c98f4e", "#8a4b1f"];
const GAP = "#c2511a";
const INK = "#13202e";
const METERS_PER_MILE = 1609.34;

const els = {
  county: document.getElementById("county"),
  gen: document.getElementById("gen"),
  k: document.getElementById("k"),
  reach: document.getElementById("reach"),
  kVal: document.getElementById("kVal"),
    kRec: document.getElementById("kRec"),
    reachVal: document.getElementById("reachVal"),
    reachRec: document.getElementById("reachRec"),
    budget: document.getElementById("budget"),
  summary: document.getElementById("summary"),
  compare: document.getElementById("compare"),
  sites: document.getElementById("sites"),
  fine: document.getElementById("fine"),
    outageSource: document.getElementById("outageSource"),
};

const map = L.map("map", { scrollWheelZoom: false });
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
  maxZoom: 16,
}).addTo(map);
map.on("click", () => map.scrollWheelZoom.enable());
map.on("mouseout", () => map.scrollWheelZoom.disable());
const zipLayer = L.layerGroup().addTo(map);
const siteLayer = L.layerGroup().addTo(map);

let costs = null;
let county = null;
let pins = [];
let fitNext = true;

const OWNED_KEY = "gridaid-has-generator";
let owned = new Set();
try { owned = new Set(JSON.parse(localStorage.getItem(OWNED_KEY)) || []); } catch (e) {}
const ownedId = (site) => '${county.fips}:${site.name}:${site.lat.toFixed(4)}';
const hasGen = (site) => owned.has(ownedId(site));
function setOwned(site, on) {
  if (on) owned.add(ownedID(site));
  else owned.delete(ownedId(site));
  try { localStorage.setItem(OWNED_KEY, JSON.stringify([...owned])); } catch (e) {}
}

const money = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`);
const kw = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${Math.round(v)} kW`);

function runningCost(g, n, days) {
  return n * (g.fuelPerDay * days + (g.rentPerWeek ? g.rentPerWeek * Math.ceil(days / 7) : 0));
}

function flagsFor(site, people, visitors, genKey) {
  const out = [];
  if (people === 0) out.push("Backup only: everyone near it is closer to another site");  if (visitors >= 50) out.push(`Check room for about ${Math.round(visitors)} people at once`);
  if (site.type === "school") out.push("Confirm access on weekends and breaks");
  if (site.type === "fire_station") out.push("Crews may be out during the disaster");
  if (genKey === "gas") out.push("Confirm a gas line reaches the building");
  if (genKey === "solar") out.push("Enough for oxygen, medicine and phones only");
  return out;
}

function pickExactly(zips, sites, k, R) {
  const chosen = pickSites(zips, sites, k, R);
  const reach = sites.map((s) => zips.map((z, i) => (miles(z.lat, z.lon, s.lat, s.lon) <= R ? i : -1)).filter((i) => i >= 0));
  const count = zips.map(() => 0);
  chosen.forEach((s) => reach[s].forEach((i) => count[i]++));
  const taken = new Set(chosen);
  while (chosen.length < Math.min(k, sites.length)) {
    let best = -1;
    let bestGain = -1;
    reach.forEach((list, s) => {
      if (taken.has(s)) return;
      const gain = list.reduce((sum, i) => sum + zips[i].people / (1 + count[i]), 0);
      if (gain > bestGain) { bestGain = gain; best = s; }
    });
    chosen.push(best);
    taken.add(best);
    reach[best].forEach((i) => count[i]++);
  }
  return chosen;
}

function shadeClass(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const breaks = [1, 2, 3].map((i) => sorted[Math.floor((i * sorted.length) / 4)]);
  return (v) => breaks.filter((b) => v >= b && b > sorted[0]).length;
}

function focusSite(i, fromMap) {
  const row = document.getElementById(`site-${i}`);
  document.querySelectorAll("#sites tr.focus").forEach((r) => r.classList.remove("focus"));
  pins.forEach((p, j) => p.getElement()?.classList.toggle("lit", j === i));
  if (row) row.classList.add("focus");
  if (fromMap) {
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    map.getContainer().scrollIntoView({ behavior: "smooth", block: "center" });
    map.flyTo(pins[i].getLatLng(), Math.max(map.getZoom(), 13), { duration: 0.6 });
    pins[i].openTooltip();
  }
}

async function start() {
  costs = await getJSON("data/costs.json");
  els.gen.innerHTML = Object.entries(costs.generators)
    .map(([key, g]) => `<option value="${key}">${esc(g.name)}</option>`)
    .join("");
  els.gen.value = "diesel";
  await loadCounty(els.county.value);
}

async function loadCounty(fips) {
  county = await loadCountyData(fips);
  const plan = costs.counties[fips];
  const recR = plan ? plan.reach : 10;
    els.outageSource.innerHTML = plan && plan.outage
    ? `Past outage in ${esc(plan.name)}, ${esc(plan.outage.date)}: ${esc(plan.outage.what)}. <a href="${esc(plan.outage.src)}" target="_blank" rel="noopener">Source</a>`
    : "";
  const recK = pickSites(county.zips, county.sites, plan ? plan.sites.recommended : 3, recR).length;
  els.k.max = county.sites.length;  els.k.value = recK;
  els.reach.value = recR;
  els.kRec.textContent = `recommended ${recK}`;
  els.reachRec.textContent = `recommended ${recR} mi`;  fitNext = true;
  draw();
}

function drawMap(chosen, nearest, R) {
  zipLayer.clearLayers();
  siteLayer.clearLayers();
  pins = [];
  const bounds = L.latLngBounds([]);
  const classOf = shadeClass(county.zips.map((z) => z.people));

  county.zips.forEach((z, i) => {
    const out = nearest[i].d > R && z.people > 0;
    const style = { color: out ? GAP : "#ffffff", weight: out ? 2 : 0.8, fillColor: RAMP[classOf(z.people)], fillOpacity: 0.8 };
    const shape = county.shapes[z.zip];
    const layer = shape ? L.polygon(shape.p, style) : L.circleMarker([z.lat, z.lon], { ...style, radius: 6 });
    const people = z.masked ? "1 to 10" : z.people.toLocaleString();
    const where = nearest[i].who >= 0 ? ` · ${nearest[i].d.toFixed(1)} mi to site ${nearest[i].who + 1}` : "";
    layer.bindTooltip(`<b>ZIP ${z.zip}</b><br>${people} people<br>${out ? "Out of reach" : "Covered"}${where}`, { sticky: true });
    layer.addTo(zipLayer);
    bounds.extend(shape ? layer.getBounds() : [z.lat, z.lon]);
  });

  chosen.forEach((s, i) => {
    const site = county.sites[s];
    L.circle([site.lat, site.lon], { radius: R * METERS_PER_MILE, color: INK, weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(siteLayer);
    const pin = L.marker([site.lat, site.lon], { icon: L.divIcon({ className: hasGen(site) ? "pin-owned" : "pin", html: `<span>${i + 1}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(`${i + 1}. ${esc(site.name)}`)
      .on("click", () => focusSite(i, true))
      .addTo(siteLayer);
    pins.push(pin);
  });

  if (fitNext) {
    map.fitBounds(bounds, { padding: [20, 20] });
    fitNext = false;
  }
}

function draw() {
  if (!county || !costs) return;
  const k = Math.max(1, Number(els.k.value) || 1);
  const R = Math.max(0.5, Number(els.reach.value) || 10);
  els.kVal.textContent = k;
  els.reachVal.textContent = `${R} mi`;
  const genKey = els.gen.value;
  const g = costs.generators[genKey];
  const inp = costs.inputs;

  const chosen = pickExactly(county.zips, county.sites, k, R);
  const served = chosen.map(() => 0);
  let reached = 0;
  let total = 0;
  const nearest = county.zips.map((z) => {
    total += z.people;
    let d = Infinity;
    let who = -1;
    chosen.forEach((s, i) => {
      const dist = miles(z.lat, z.lon, county.sites[s].lat, county.sites[s].lon);
      if (dist < d) { d = dist; who = i; }
    });
    if (d <= R) { served[who] += z.people; reached += z.people; }
    return { d, who };
  });

  drawMap(chosen, nearest, R);

  const n = chosen.length;
  const have = chosen.filter((s) => hasGen(county.sites[s])).length;
  const buy = n-have;
  const setup=buy* g.cost;
  const visitors = reached * inp.turnout;
  const pct = total ? ((100 * reached) / total).toFixed(1) : "0";

  const plan = costs.counties[county.fips];
  const budget = plan ? plan.budget.recommended.diesel : setup;
  const top = Math.max(budget, setup) || 1;
  const left = budget - setup;
  els.budget.innerHTML = `
    <dl class="budget-top">
      <div>
        <dt>Estimated county budget</dt>
        <dd>${money(budget)}</dd>
        <p>${plan ? `Planned for ${plan.sites.recommended} diesel generators in the county plans workbook` : ""}</p>
      </div>
      <div class="plan">
        <dt>This plan: ${n} ${n === 1 ? "site" : "sites"}, ${esc(g.name.toLowerCase())}</dt>
        <dd>${money(setup)}</dd>
        <p>${have ? '${have} already ${have ===1 ? "has" : "have"} a generator, so the county buys ${buy}. ' : ""} FEMA could pay ${money(setup * inp.fema)}. The county pays ${money(setup * (1-inp.fema))}.</p>
      </div>
    </dl>
    <div class="budget-bar${left < 0 ? " over" : ""}" role="img" aria-label="Plan cost compared with budget">
      <i style="width: ${(100 * setup) / top}%"></i>
      <b style="left: ${(100 * budget) / top}%"></b>
    </div>
    <p class="budget-status${left < 0 ? " over" : ""}">${left < 0 ? `${money(-left)} over budget` : `${money(left)} under budget`}</p>
    <div class="gens">
      ${Object.entries(costs.generators).map(([key, t]) => {
        const c = buy * t.cost;
        return `
        <button type="button" class="${key === genKey ? "on" : ""}" data-gen="${key}">
          <span class="name">${esc(t.name)}</span>
          <span class="price">${money(c)}</span>
          <span class="sub">County pays ${money(c * (1 - inp.fema))}</span>
          <span class="sub ${c > budget ? "over" : ""}">${c > budget ? `${money(c - budget)} over budget` : "Fits the budget"}</span>
        </button>`;
      }).join("")}
    </div>`;

  els.summary.innerHTML = `
    <div><dt>Sites</dt><dd>${n}</dd></div>
    <div><dt>People within ${R} miles</dt><dd>${reached.toLocaleString()} of ${total.toLocaleString()} (${pct}%)</dd></div>      
        <div><dt>Running cost, ${inp.days}-day outage</dt><dd>${money(runningCost(g, n, inp.days))}</dd></div>
    <div><dt>Power needed across sites</dt><dd>${kw((visitors * inp.wattsLow) / 1000)} to ${kw((visitors * inp.wattsHigh) / 1000)}</dd></div>`;

  els.compare.innerHTML = Object.entries(costs.generators)
    .map(([key, t]) => `
      <tr class="${key === genKey ? "on" : ""}">
        <td>${esc(t.name)}</td>
        <td>${money(buy * t.cost)}</td>
        <td>${money(buy * t.cost * (1 - inp.fema))}</td>
        <td>${money(runningCost(t, n, inp.days))}</td>
        <td>${READY[key] ?? ""}</td>
      </tr>`)
    .join("");

  els.sites.innerHTML = chosen
    .map((s, i) => {
      const b = county.sites[s];
      const people = served[i];
      const v = people * inp.turnout;
      const contact = [
        b.phone ? esc(b.phone) : null,
        b.website ? `<a href="${esc(b.website)}" target="_blank" rel="noopener">Website</a>` : null,
      ].filter(Boolean).join("<br>");
      const flags = flagsFor(b, people, v, genKey);
      if(hasGen(b)) flags.unshift("Already has a generator: check its size and fuel supply")
      return `
        <tr class="pick" id="site-${i}" data-i="${i}">
          <td>${i + 1}</td>
          <td><b>${esc(b.name)}</b><span>${b.type.replace("_", " ")}${b.address ? ` · ${esc(b.address)}` : ""}</span></td>
          <td>${people.toLocaleString()}</td>
          <td>${Math.round(v).toLocaleString()}</td>
          <td>${kw((v * inp.wattsLow) / 1000)} to ${kw((v * inp.wattsHigh) / 1000)}</td>
          <td>${contact || "None listed"}</td>
          <td>${flags.length ? `<ul>${flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</td>
          <td><input type="checkbox" class="has-gen" data-s="${s}"${hasGen(b) ? " checked" : ""} aria-label="${esc(b.name)} already has a generator></td>
        </tr>`;
    })
    .join("");
}

els.sites.addEventListener("click", (e) => {
  if (e.target.closest("a, input")) return;
  const row = e.target.closest("tr.pick");
  if (row) focusSite(Number(row.dataset.i), false);
});
els.sites.addEventListener("change", (e) => {
  const box = e.target.closest(".has-gen");
  if (!box) return;
  setOwned(county.sites[Number(box.dataset.s)], box.checked);
  draw();
});
els.budget.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-gen]");
  if (!btn) return;
  els.gen.value = btn.dataset.gen;
  draw();
});
els.county.addEventListener("change", () => loadCounty(els.county.value));
[els.gen, els.k, els.reach].forEach((el) => el.addEventListener("input", draw));

start().catch((e) => {
  els.summary.innerHTML = `<div><dt>Couldn't load data</dt><dd>${esc(e.message)}</dd></div>`;
});
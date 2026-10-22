const READY = { hookup: "Weeks", diesel: "Months; grants can take years", gas: "Months; needs a gas line", solar: "Months to a year" };

const els = {
  county: document.getElementById("county"),
  gen: document.getElementById("gen"),
  k: document.getElementById("k"),
  reach: document.getElementById("reach"),
  summary: document.getElementById("summary"),
  compare: document.getElementById("compare"),
  sites: document.getElementById("sites"),
  fine: document.getElementById("fine"),
};

let costs = null;
let county = null;

const money = (v) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v).toLocaleString()}`);
const kw = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${Math.round(v)} kW`);

function runningCost(g, n, days) {
  return n * (g.fuelPerDay * days + (g.rentPerWeek ? g.rentPerWeek * Math.ceil(days / 7) : 0));
}

function flagsFor(site, people, visitors, genKey) {
  const out = [];
  if (people === 0) out.push("Reaches no one new");
  if (visitors >= 50) out.push(`Check room for about ${Math.round(visitors)} people at once`);
  if (site.type === "school") out.push("Confirm access on weekends and breaks");
  if (site.type === "fire_station") out.push("Crews may be out during the disaster");
  if (genKey === "gas") out.push("Confirm a gas line reaches the building");
  if (genKey === "solar") out.push("Enough for oxygen, medicine and phones only");
  return out;
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
  els.k.value = plan ? plan.sites.recommended : 3;
  els.reach.value = plan ? plan.reach : 10;
  draw();
}

function draw() {
  if (!county || !costs) return;
  const k = Math.max(1, Number(els.k.value) || 1);
  const R = Math.max(0.5, Number(els.reach.value) || 10);
  const genKey = els.gen.value;
  const g = costs.generators[genKey];
  const inp = costs.inputs;

  const chosen = pickSites(county.zips, county.sites, k, R);
  const served = chosen.map(() => 0);
  let reached = 0;
  let total = 0;
  county.zips.forEach((z) => {
    total += z.people;
    let best = Infinity;
    let who = -1;
    chosen.forEach((s, i) => {
      const d = miles(z.lat, z.lon, county.sites[s].lat, county.sites[s].lon);
      if (d < best) { best = d; who = i; }
    });
    if (best <= R) { served[who] += z.people; reached += z.people; }
  });

  const n = chosen.length;
  const setup = n * g.cost;
  const visitors = reached * inp.turnout;
  const pct = total ? ((100 * reached) / total).toFixed(1) : "0";

  els.summary.innerHTML = `
    <div><dt>Sites</dt><dd>${n}</dd></div>
    <div><dt>People within ${R} miles</dt><dd>${reached.toLocaleString()} of ${total.toLocaleString()} (${pct}%)</dd></div>
    <div><dt>Setup cost</dt><dd>${money(setup)}</dd></div>
    <div><dt>FEMA could pay (${Math.round(inp.fema * 100)}%)</dt><dd>${money(setup * inp.fema)}</dd></div>
    <div><dt>County share</dt><dd>${money(setup * (1 - inp.fema))}</dd></div>
    <div><dt>Running cost, ${inp.days}-day outage</dt><dd>${money(runningCost(g, n, inp.days))}</dd></div>
    <div><dt>Power needed across sites</dt><dd>${kw((visitors * inp.wattsLow) / 1000)} to ${kw((visitors * inp.wattsHigh) / 1000)}</dd></div>`;

  els.compare.innerHTML = Object.entries(costs.generators)
    .map(([key, t]) => `
      <tr class="${key === genKey ? "on" : ""}">
        <td>${esc(t.name)}</td>
        <td>${money(n * t.cost)}</td>
        <td>${money(n * t.cost * (1 - inp.fema))}</td>
        <td>${money(runningCost(t, n, inp.days))}</td>
        <td>${READY[key] ?? ""}</td>
      </tr>`)
    .join("");

  els.sites.innerHTML = chosen
    .map((s, i) => {
      const b = county.sites[s];
      const people = served[i];
      const v = people * inp.turnout;
      const contact = [b.phone, b.website ? `<a href="${esc(b.website)}" target="_blank" rel="noopener">Website</a>` : null]
        .filter(Boolean)
        .join("<br>");
      const flags = flagsFor(b, people, v, genKey);
      return `
        <tr>
          <td>${i + 1}</td>
          <td><b>${esc(b.name)}</b><span>${b.type.replace("_", " ")}${b.address ? ` · ${esc(b.address)}` : ""}</span></td>
          <td>${people.toLocaleString()}</td>
          <td>${Math.round(v).toLocaleString()}</td>
          <td>${kw((v * inp.wattsLow) / 1000)} to ${kw((v * inp.wattsHigh) / 1000)}</td>
          <td>${contact ? (b.phone ? esc(contact).replace(/&lt;br&gt;/g, "<br>").replace(/&lt;a[^]*$/, "") + (b.website ? `<br><a href="${esc(b.website)}" target="_blank" rel="noopener">Website</a>` : "") : contact) : "None listed"}</td>
          <td>${flags.length ? `<ul>${flags.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}</td>
        </tr>`;
    })
    .join("");

  els.fine.textContent = `People served = people whose nearest site is this one. Expected visitors assume ${Math.round(inp.turnout * 100)}% of people come to a site (a placeholder the county should set) and ${inp.wattsLow} to ${inp.wattsHigh} watts per person. Costs are planning estimates, not quotes.`;
}

els.county.addEventListener("change", () => loadCounty(els.county.value));
[els.gen, els.k, els.reach].forEach((el) => el.addEventListener("input", draw));

start().catch((e) => {
  els.summary.innerHTML = `<div><dt>Couldn't load data</dt><dd>${esc(e.message)}</dd></div>`;
});
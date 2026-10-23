(() => {
const ASTRO = `<svg viewBox="0 0 40 52" aria-hidden="true"><circle cx="20" cy="14" r="12" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/><rect x="12" y="9" width="16" height="10" rx="5" fill="#1b3a5c"/><rect x="9" y="24" width="22" height="20" rx="6" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/><rect x="16" y="29" width="8" height="6" rx="1" fill="#be5602"/><rect x="11" y="42" width="7" height="9" rx="2" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/><rect x="22" y="42" width="7" height="9" rx="2" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/></svg>`;

const STORMS = {
  "48201": { name: "Hurricane", note: "Like Hurricane Beryl in July 2024, which left more than 2 million homes and businesses around Houston without power." },
  "06037": { name: "Wildfire power shutoff", note: "Like January 2025, when power was cut to more than 40,000 customers in Los Angeles County to keep lines from sparking fires." },
  "39009": { name: "Windstorm", note: "Like the June 2012 windstorm that knocked out power to most of Athens County for days." },
};
const STORM_MS = 2400;

const shellEl = document.querySelector(".map-shell");
const dock = document.createElement("div");
dock.className = "astro-dock";
dock.innerHTML = `<button type="button" class="astro" aria-label="Place the astronaut on the map">${ASTRO}</button><span>Drag me onto the map. Can I reach backup power when the grid goes down?</span>`;
shellEl.appendChild(dock);

const result = document.createElement("div");
result.className = "astro-result";
result.hidden = true;
shellEl.appendChild(result);

const gameLayer = L.layerGroup().addTo(map);
let ghost = null;
let dragFrom = null;
let playing = false;
let darkened = [];

function moveGhost(e) {
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
}

dock.querySelector(".astro").addEventListener("pointerdown", (e) => {
  if (playing || !county || !plan) return;
  e.preventDefault();
  dragFrom = { x: e.clientX, y: e.clientY };
  ghost = document.createElement("div");
  ghost.className = "astro-ghost";
  ghost.innerHTML = ASTRO;
  document.body.appendChild(ghost);
  moveGhost(e);
  window.addEventListener("pointermove", moveGhost);
  window.addEventListener("pointerup", drop, { once: true });
});

function drop(e) {
  window.removeEventListener("pointermove", moveGhost);
  ghost.remove();
  ghost = null;
  if (Math.hypot(e.clientX - dragFrom.x, e.clientY - dragFrom.y) < 6) {
    play(map.getCenter());
    return;
  }
  const box = map.getContainer().getBoundingClientRect();
  if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) return;
  play(map.mouseEventToLatLng(e));
}

function zipAt(at) {
  let near = -1;
  let nearD = 2;
  county.zips.forEach((z, i) => {
    const shape = county.shapes[z.zip];
    if (shape) {
      const hit = shape.p.some((rings) => {
        const flip = (ring) => ring.map(([lat, lon]) => [lon, lat]);
        return insideRing(at.lat, at.lng, flip(rings[0])) && !rings.slice(1).some((h) => insideRing(at.lat, at.lng, flip(h)));
      });
      if (hit) { near = i; nearD = -1; }
    } else if (nearD >= 0) {
      const d = miles(at.lat, at.lng, z.lat, z.lon);
      if (d < nearD) { near = i; nearD = d; }
    }
  });
  return near;
}

function play(at) {
  playing = true;
  dock.classList.add("busy");
  result.hidden = true;
  gameLayer.clearLayers();
  L.marker(at, { icon: L.divIcon({ className: "astro-pin", html: ASTRO, iconSize: [34, 44], iconAnchor: [17, 44] }), interactive: false }).addTo(gameLayer);

  const el = map.getContainer();
  const band = document.createElement("div");
  band.className = "storm";
  el.appendChild(band);

  darkened = [];
  const width = el.clientWidth;
  zipLayer.eachLayer((layer) => {
    const center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
    const x = map.latLngToContainerPoint(center).x;
    const delay = Math.min(1, Math.max(0, x / width)) * STORM_MS;
    darkened.push([layer, layer.options.fillColor]);
    setTimeout(() => layer.setStyle({ fillColor: "#2b2f33" }), delay);
  });

  setTimeout(() => {
    band.remove();
    finish(at);
  }, STORM_MS + 300);
}

function finish(at) {
  const storm = STORMS[county.fips] ?? { name: "Storm", note: "" };
  let best = Infinity;
  let who = -1;
  plan.chosen.forEach((s, i) => {
    const d = miles(at.lat, at.lng, county.sites[s].lat, county.sites[s].lon);
    if (d < best) { best = d; who = i; }
  });
  const ok = who >= 0 && best <= plan.R;
  const site = who >= 0 ? county.sites[plan.chosen[who]] : null;
  if (site) {
    L.polyline([at, [site.lat, site.lon]], { color: ok ? "#1b3a5c" : "#c2511a", weight: 3, dashArray: "6 6", interactive: false }).addTo(gameLayer);
  }
  siteLayer.eachLayer((l) => l.getElement?.()?.classList.add("lit"));

  const zi = zipAt(at);
  const z = zi >= 0 ? county.zips[zi] : null;
  const people = z ? (z.masked ? "1 to 10" : z.people.toLocaleString()) : null;
  const text = ok
    ? `<b>You made it.</b> Site ${who + 1}, ${esc(site.name)}, is ${best.toFixed(1)} miles away and still has power.`
    : `<b>Out of reach.</b> The nearest site with power${site ? `, ${esc(site.name)}, is ${best.toFixed(1)} miles away` : " is too far"}, more than the ${plan.R} miles people can be expected to travel.`;
  const local = z ? `<p>In ZIP ${z.zip}, ${people} people rely on powered medical equipment.</p>` : "";

  result.innerHTML = `<p class="storm-name">${storm.name}: the power is out</p><p>${text}</p>${local}<p class="fine">${storm.note}</p><button type="button">Try again</button>`;
  result.classList.toggle("ok", ok);
  result.hidden = false;
  result.querySelector("button").addEventListener("click", reset);
}

function reset() {
  darkened.forEach(([layer, fill]) => layer.setStyle({ fillColor: fill }));
  darkened = [];
  gameLayer.clearLayers();
  siteLayer.eachLayer((l) => l.getElement?.()?.classList.remove("lit"));
  result.hidden = true;
  dock.classList.remove("busy");
  playing = false;
}

document.getElementById("county").addEventListener("change", reset);
})();
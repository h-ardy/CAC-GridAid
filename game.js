(() => {
const ASTRO = `<svg viewBox="0 0 40 52" aria-hidden="true"><circle cx="20" cy="14" r="12" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/><rect x="12" y="9" width="16" height="10" rx="5" fill="#1b3a5c"/><rect x="9" y="24" width="22" height="20" rx="6" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/><rect x="16" y="29" width="8" height="6" rx="1" fill="#be5602"/><rect x="11" y="42" width="7" height="9" rx="2" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/><rect x="22" y="42" width="7" height="9" rx="2" fill="#f4f1ea" stroke="#13202e" stroke-width="2"/></svg>`;

const STORMS = {
  "48201": { name: "Hurricane", note: "Like Hurricane Beryl in July 2024, which left more than 2 million homes and businesses around Houston without power." },
  "06037": { name: "Wildfire power shutoff", note: "Like January 2025, when power was cut to more than 40,000 customers in Los Angeles County to keep lines from sparking fires." },
  "39009": { name: "Windstorm", note: "Like the June 2012 windstorm that knocked out power to most of Athens County for days." },
};
const STORM_MS = 2400;
const OUTAGE_SHARE = 0.8;
const DARK = "#2b2f33";

const shellEl = document.querySelector(".map-shell");
const dock = document.createElement("div");
dock.className = "astro-dock";
dock.innerHTML = `<button type="button" class="astro" aria-label="Place the astronaut on the map">${ASTRO}</button><span>Drag me onto the map. Can I reach backup power when the grid goes down?</span>`;
shellEl.appendChild(dock);

const result = document.createElement("div");
result.className = "astro-result";
result.hidden = true;
shellEl.appendChild(result);


const reopen = document.createElement("button");
reopen.type = "button";
reopen.className = "astro-reopen";
reopen.textContent = "Show storm results";
reopen.hidden = true;
shellEl.appendChild(reopen);
reopen.addEventListener("click", () => {
  reopen.hidden = true;
  result.hidden = false;
});

const gameLayer = L.layerGroup().addTo(map);
let ghost = null;
let dragFrom = null;
let playing = false;
let game = null;

function moveGhost(e) {
  ghost.style.left = `${e.clientX}px`;
  ghost.style.top = `${e.clientY}px`;
}

dock.querySelector(".astro").addEventListener("pointerdown", (e) => {
  if (playing || !county || !plan) return;
  e.preventDefault();
  dragFrom = { x: e.clientX, y: e.clientY };
  dock.classList.add("busy");
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
  if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) {
    dock.classList.remove("busy");
    return;
  }
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
  result.hidden = true;
  gameLayer.clearLayers();
  L.marker(at, { icon: L.divIcon({ className: "astro-pin", html: ASTRO, iconSize: [34, 44], iconAnchor: [17, 44] }), interactive: false }).addTo(gameLayer);

  const el = map.getContainer();
  const band = document.createElement("div");
  band.className = "storm";
  el.appendChild(band);

  const zips = county.zips;
  const sites = plan.chosen.map((s) => county.sites[s]);
  game = {
    at,
    zi: zipAt(at),
    fills: zipShapes.map((layer) => layer.options.fillColor),
    hit: zips.map(() => Math.random() < OUTAGE_SHARE),
    zipToSite: zips.map((z) => sites.map((s) => miles(z.lat, z.lon, s.lat, s.lon))),
    astroToSite: sites.map((s) => miles(at.lat, at.lng, s.lat, s.lon)),
    line: null,
  };

  const width = el.clientWidth;
  zipShapes.forEach((layer, i) => {
    if (!game.hit[i]) return;
    const center = layer.getBounds ? layer.getBounds().getCenter() : layer.getLatLng();
    const x = map.latLngToContainerPoint(center).x;
    const delay = Math.min(1, Math.max(0, x / width)) * STORM_MS;
    setTimeout(() => game && layer.setStyle({ fillColor: DARK }), delay);
  });

  setTimeout(() => {
    band.remove();
    if (game) showResult();
  }, STORM_MS + 300);
}

function showResult() {
  const storm = STORMS[county.fips] ?? { name: "Storm", note: "" };
  const lost = county.zips.reduce((sum, z, i) => sum + (game.hit[i] ? z.people : 0), 0);
  const zipsOut = game.hit.filter(Boolean).length;
  const n = plan.chosen.length;

  result.innerHTML = `
    <button type="button" class="astro-close" aria-label="Close">&times;</button>
    <p class="storm-name">${storm.name}: power is out in ${zipsOut} of ${county.zips.length} ZIP codes</p>
    <p>${lost.toLocaleString()} people who rely on powered medical equipment just lost power.</p>
    <div class="power-back">
      <label for="powerBack">Backup generators running: <span class="count" id="powerCount">0 of ${n}</span></label>
      <input id="powerBack" type="range" min="0" max="${n}" step="1" value="0">
    </div>
    <p id="powerPeople"></p>
    <p id="astroStatus"></p>
    <p class="fine">${storm.note}</p>
    <button type="button" class="try-again">Try again</button>`;
  result.hidden = false;
  game.lost = lost;
  result.querySelector("#powerBack").addEventListener("input", (e) => setRunning(Number(e.target.value)));
  result.querySelector(".try-again").addEventListener("click", reset);
  result.querySelector(".astro-close").addEventListener("click", () => {
    result.hidden = true;
    reopen.hidden = false;
  });  setRunning(0);
}

function setRunning(v) {
  const R = plan.R;
  const n = plan.chosen.length;
  let back = 0;

  zipShapes.forEach((layer, i) => {
    if (!game.hit[i]) return;
    const reachable = game.zipToSite[i].some((d, j) => j < v && d <= R);
    layer.setStyle({ fillColor: reachable ? game.fills[i] : DARK });
    if (reachable) back += county.zips[i].people;
  });
  sitePins.forEach((pin, j) => pin.getElement()?.classList.toggle("lit", j < v));

  result.querySelector("#powerCount").textContent = `${v} of ${n}`;
  result.querySelector("#powerPeople").innerHTML = v === 0
    ? "Slide to turn the backup generators on, busiest site first."
    : `<b>${back.toLocaleString()} of ${game.lost.toLocaleString()}</b> people who lost power can now reach a running generator within ${R} miles.`;

  if (game.line) { gameLayer.removeLayer(game.line); game.line = null; }
  let best = Infinity;
  let who = -1;
  game.astroToSite.forEach((d, j) => { if (j < v && d < best) { best = d; who = j; } });
  const z = game.zi >= 0 ? county.zips[game.zi] : null;
  const ownHit = game.zi >= 0 ? game.hit[game.zi] : true;
  const status = result.querySelector("#astroStatus");
  result.classList.toggle("ok", !ownHit || best <= R);

  if (who >= 0) {
    const site = county.sites[plan.chosen[who]];
    game.line = L.polyline([game.at, [site.lat, site.lon]], { color: best <= R ? "#1b3a5c" : GAP, weight: 3, dashArray: "6 6", interactive: false }).addTo(gameLayer);
  }

  if (!ownHit) {
    status.innerHTML = `<b>Lucky this time.</b> Your ZIP${z ? `, ${z.zip},` : ""} kept power.`;
  } else if (who < 0) {
    status.innerHTML = `<b>Your power is out.</b> No backup generators are running yet.`;
  } else if (best <= R) {
    const site = county.sites[plan.chosen[who]];
    status.innerHTML = `<b>You made it.</b> Site ${who + 1}, ${esc(site.name)}, is ${best.toFixed(1)} miles away and has power.`;
  } else {
    status.innerHTML = `<b>Out of reach.</b> The nearest running site is ${best.toFixed(1)} miles away, more than the ${R} miles people can be expected to travel.${
      z ? ` In ZIP ${z.zip}, ${z.masked ? "1 to 10" : z.people.toLocaleString()} people rely on powered medical equipment.` : ""}`;
  }
}

function reset() {
  if (game) zipShapes.forEach((layer, i) => layer.setStyle({ fillColor: game.fills[i] }));
  game = null;
  gameLayer.clearLayers();
  sitePins.forEach((pin) => pin.getElement()?.classList.remove("lit"));
  result.hidden = true;
  reopen.hidden = true;
  dock.classList.remove("busy");
  playing = false;
}

document.addEventListener("countychange", reset);
})();
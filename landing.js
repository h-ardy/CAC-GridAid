const stage = document.querySelector(".stage");
const pin = stage.querySelector(".stage-pin");
const sky = stage.querySelector(".sky");
const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
const hero = stage.querySelector(".hero");
const shell = stage.querySelector(".map-shell");
const launch = stage.querySelector(".launch");
const ship = stage.querySelector(".ship");
const docks = [...stage.querySelectorAll("[data-dock]")];
const animated = window.matchMedia("(min-width: 861px)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SQ = 46;
const REACH = 3;
const glow = new Map();
let width = 0;
let height = 0;
let mouse = null;
let geo = null;

const clamp = (v) => Math.min(1, Math.max(0, v));
const span = (p, a, b) => clamp((p - a) / (b - a));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function measure() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!animated) return;

  shell.style.transform = "none";
  const P = pin.getBoundingClientRect();
  const M = shell.getBoundingClientRect();
  const w = Math.min(Math.max(P.width * 0.4, 420), 700);
  const s = w / M.width;
  const h = M.height * s;
  const cx = P.width / 2;
  const cy = P.height * 0.64;
  geo = { s, dx: cx - w / 2 - (M.left - P.left), dy: cy - h / 2 - (M.top - P.top) };
  launch.style.left = `${cx + w / 2 + 56}px`;
  launch.style.top = `${cy + h / 2 - launch.offsetHeight}px`;
  update();
}

function progress() {
  const stickTop = parseFloat(getComputedStyle(pin).top);
  const travel = stage.offsetHeight - pin.offsetHeight;
  return clamp((stickTop - stage.getBoundingClientRect().top) / travel);
}

function update() {
  if (!animated || !geo) return;
  const p = progress();

  const open = ease(span(p, 0.1, 0.62));
  shell.style.transform = `translate(${geo.dx * (1 - open)}px, ${geo.dy * (1 - open)}px) scale(${geo.s + (1 - geo.s) * open})`;
  shell.style.pointerEvents = open > 0.98 ? "auto" : "none";
  shell.style.setProperty("--glow", 1 - open);

  const fade = 1 - span(p, 0.3, 0.62);
  sky.style.opacity = fade;
  canvas.style.opacity = fade;

  hero.style.opacity = 1 - span(p, 0.02, 0.24);
  hero.style.transform = `translateY(${-90 * span(p, 0.02, 0.3)}px)`;

  ship.style.transform = `translateY(${-span(p, 0.03, 0.36) * (pin.offsetHeight + 400)}px)`;
  stage.classList.toggle("launched", p > 0.03);
  launch.style.opacity = 1 - span(p, 0.32, 0.46);

  docks.forEach((el, i) => {
    const t = ease(span(p, 0.52 + i * 0.06, 0.74 + i * 0.06));
    el.style.opacity = t;
    el.style.transform = el.dataset.dock === "top" ? `translateY(${-30 * (1 - t)}px)` : `translateX(${44 * (1 - t)}px)`;
    el.style.pointerEvents = t > 0.9 ? "auto" : "none";
  });
}

pin.addEventListener("pointermove", (e) => {
  const box = canvas.getBoundingClientRect();
  mouse = { x: e.clientX - box.left, y: e.clientY - box.top };
});
pin.addEventListener("pointerleave", () => { mouse = null; });

function frame() {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0.5; x < width; x += SQ) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = 0.5; y < height; y += SQ) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();

  if (mouse) {
    const col = Math.floor(mouse.x / SQ);
    const row = Math.floor(mouse.y / SQ);
    for (let dx = -REACH; dx <= REACH; dx++) {
      for (let dy = -REACH; dy <= REACH; dy++) {
        const d = Math.hypot(dx, dy);
        if (d > REACH) continue;
        const key = `${col + dx},${row + dy}`;
        glow.set(key, Math.max(glow.get(key) ?? 0, 1 - d / (REACH + 1)));
      }
    }
  }
  for (const [key, v] of glow) {
    const [c, r] = key.split(",").map(Number);
    ctx.fillStyle = `rgba(190, 86, 2, ${v * 0.45})`;
    ctx.fillRect(c * SQ + 1, r * SQ + 1, SQ - 1, SQ - 1);
    const next = v - 0.02;
    if (next <= 0) glow.delete(key);
    else glow.set(key, next);
  }
  requestAnimationFrame(frame);
}

if (!animated) stage.classList.add("static");
window.addEventListener("resize", measure);
window.addEventListener("scroll", update, { passive: true });
measure();
frame();
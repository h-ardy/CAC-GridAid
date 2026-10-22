const landing = document.querySelector(".landing");
const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
const ship = document.querySelector(".ship");
const SQ = 46;
const REACH = 3;
const glow = new Map();
let width = 0;
let height = 0;
let mouse = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

landing.addEventListener("pointermove", (e) => {
  const box = canvas.getBoundingClientRect();
  mouse = { x: e.clientX - box.left, y: e.clientY - box.top };
});
landing.addEventListener("pointerleave", () => { mouse = null; });

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

function onScroll() {
  const travel = landing.offsetHeight * 0.8;
  const p = Math.min(1, Math.max(0, window.scrollY / travel));
  ship.style.transform = `translateY(${-p * (landing.offsetHeight + 300)}px)`;
  landing.classList.toggle("launched", p > 0.02);
}

window.addEventListener("resize", resize);
window.addEventListener("scroll", onScroll, { passive: true });
resize();
onScroll();
frame();

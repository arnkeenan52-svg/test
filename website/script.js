// Forge landing — interactions (dependency-free).

document.getElementById("year").textContent = new Date().getFullYear();

const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

const navToggle = document.getElementById("navToggle");
navToggle?.addEventListener("click", () => nav.classList.toggle("open"));
document.querySelectorAll("#navLinks a").forEach((a) =>
  a.addEventListener("click", () => nav.classList.remove("open"))
);

const io = new IntersectionObserver(
  (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
  { threshold: 0.14 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---- Composer: cycle example prompts; chips drop a prompt in ----
const typed = document.getElementById("typed");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const IDEAS = [
  "A tycoon where you run a pizza empire and hire staff",
  "An obby where the floor turns to lava as you climb",
  "A racing game with drifting and boost pads",
  "A pet simulator where pets grow as you collect them",
];

let timer = null, paused = false;

function typeLoop() {
  let p = 0, ch = 0, deleting = false;
  const tick = () => {
    if (paused) { timer = setTimeout(tick, 400); return; }
    const t = IDEAS[p];
    typed.textContent = t.slice(0, ch);
    if (!deleting && ch < t.length) { ch++; timer = setTimeout(tick, 34 + Math.random() * 36); }
    else if (!deleting && ch === t.length) { deleting = true; timer = setTimeout(tick, 2200); }
    else if (deleting && ch > 0) { ch--; timer = setTimeout(tick, 14); }
    else { deleting = false; p = (p + 1) % IDEAS.length; timer = setTimeout(tick, 280); }
  };
  tick();
}

if (typed) {
  if (reduce) { typed.textContent = IDEAS[0]; }
  else { setTimeout(typeLoop, 500); }

  // Chips: clicking fills the composer and pauses the cycle.
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      paused = true;
      clearTimeout(timer);
      typed.textContent = chip.textContent;
      // resume cycling after a few seconds of showing the picked idea
      clearTimeout(typed._resume);
      typed._resume = setTimeout(() => { paused = false; if (!reduce) { clearTimeout(timer); typeLoop(); } }, 4000);
    });
  });
}

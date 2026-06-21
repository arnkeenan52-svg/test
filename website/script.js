// Imaginable landing — interactions (dependency-free).

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
  { threshold: 0.12 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// floating-card parallax (subtle, follows cursor)
const hero = document.querySelector(".hero");
const stage = document.getElementById("stage");
if (hero && stage && !reduce) {
  hero.addEventListener("mousemove", (e) => {
    const r = hero.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    stage.style.setProperty("--mx", (dx * 28).toFixed(1) + "px");
    stage.style.setProperty("--my", (dy * 22).toFixed(1) + "px");
  });
  hero.addEventListener("mouseleave", () => { stage.style.setProperty("--mx", "0px"); stage.style.setProperty("--my", "0px"); });
}

// composer typing — completes "Imagine a game where ___"
const typed = document.getElementById("typed");
const IDEAS = [
  "you run a pizza empire",
  "the floor turns to lava",
  "you race on a rainbow road",
  "you raise and trade pets",
  "you build and defend a base",
];
if (typed) {
  if (reduce) { typed.textContent = IDEAS[0]; }
  else {
    let p = 0, ch = 0, deleting = false;
    const tick = () => {
      const t = IDEAS[p];
      typed.textContent = t.slice(0, ch);
      if (!deleting && ch < t.length) { ch++; setTimeout(tick, 40 + Math.random() * 40); }
      else if (!deleting && ch === t.length) { deleting = true; setTimeout(tick, 2000); }
      else if (deleting && ch > 0) { ch--; setTimeout(tick, 16); }
      else { deleting = false; p = (p + 1) % IDEAS.length; setTimeout(tick, 280); }
    };
    setTimeout(tick, 500);
  }
}

// Forge landing — interactions (dependency-free).

document.getElementById("year").textContent = new Date().getFullYear();

// Sticky nav state — solid after scrolling past a bit of the hero.
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Mobile menu
const navToggle = document.getElementById("navToggle");
navToggle?.addEventListener("click", () => nav.classList.toggle("open"));
document.querySelectorAll("#navLinks a").forEach((a) =>
  a.addEventListener("click", () => nav.classList.remove("open"))
);

// Reveal on scroll
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
  { threshold: 0.14 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---- Floating-card parallax (subtle, follows cursor) ----
const hero = document.querySelector(".hero");
const stage = document.getElementById("stage");
if (hero && stage && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  hero.addEventListener("mousemove", (e) => {
    const r = hero.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
    const dy = (e.clientY - r.top) / r.height - 0.5;
    stage.style.setProperty("--mx", (dx * 26).toFixed(1) + "px");
    stage.style.setProperty("--my", (dy * 22).toFixed(1) + "px");
  });
  hero.addEventListener("mouseleave", () => {
    stage.style.setProperty("--mx", "0px");
    stage.style.setProperty("--my", "0px");
  });
}

// ---- Typed prompt cycling, synced to the matching floating card ----
const typed = document.getElementById("typed");
const cards = Array.from(document.querySelectorAll(".fcard"));
if (typed) {
  const ideas = [
    { text: "the floor turns to lava as you climb", i: 0 },
    { text: "you race go-karts on a rainbow road", i: 1 },
    { text: "you run a pizza empire and hire staff", i: 2 },
    { text: "you fight to be the last one standing", i: 3 },
    { text: "your pets grow as you collect them", i: 4 },
  ];
  const LEAD = "Make a game where ";
  let p = 0, ch = 0, deleting = false, first = true;

  const setActive = (i) => cards.forEach((c) => c.classList.toggle("active", Number(c.dataset.i) === i));

  const tick = () => {
    const idea = ideas[p];
    if (!deleting && ch === 0) setActive(idea.i);
    typed.textContent = LEAD + idea.text.slice(0, ch);

    if (!deleting && ch < idea.text.length) {
      ch++; setTimeout(tick, 38 + Math.random() * 38);
    } else if (!deleting && ch === idea.text.length) {
      deleting = true; setTimeout(tick, 1900);
    } else if (deleting && ch > 0) {
      ch--; setTimeout(tick, 18);
    } else {
      deleting = false; p = (p + 1) % ideas.length; setTimeout(tick, 320);
    }
    first = false;
  };
  setTimeout(tick, 500);
}

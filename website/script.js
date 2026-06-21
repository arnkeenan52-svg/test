// Forge landing — small, dependency-free interactions.

// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Sticky nav state
const nav = document.getElementById("nav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Mobile menu
const navToggle = document.getElementById("navToggle");
navToggle?.addEventListener("click", () => nav.classList.toggle("open"));
document.querySelectorAll("#navLinks a").forEach((a) =>
  a.addEventListener("click", () => nav.classList.remove("open"))
);

// Reveal-on-scroll
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.14 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// Typewriter in the product mockup — cycles example prompts
const typed = document.getElementById("typed");
if (typed) {
  const prompts = [
    "create a server-authoritative coin pickup system",
    "rolling green hills with a lake",
    "a shop UI with a buy button",
    "optimize my game's frame time",
  ];
  let p = 0,
    i = 0,
    deleting = false;

  const tick = () => {
    const word = prompts[p];
    typed.textContent = word.slice(0, i);

    if (!deleting && i < word.length) {
      i++;
      setTimeout(tick, 45 + Math.random() * 40);
    } else if (!deleting && i === word.length) {
      deleting = true;
      setTimeout(tick, 1700);
    } else if (deleting && i > 0) {
      i--;
      setTimeout(tick, 22);
    } else {
      deleting = false;
      p = (p + 1) % prompts.length;
      setTimeout(tick, 350);
    }
  };
  setTimeout(tick, 600);
}

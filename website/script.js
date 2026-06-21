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

// ============================================================
// Signature: the live baseplate — pixel game-icons build stud-by-stud
// ============================================================
const COLS = 14, ROWS = 10;
const grid = document.getElementById("studgrid");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// pixel icons as [row, col] on the 14x10 baseplate
const ICONS = {
  car:    [[3,5],[3,6],[3,7],[3,8],[4,3],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[4,10],[5,3],[5,4],[5,5],[5,6],[5,7],[5,8],[5,9],[5,10],[6,4],[6,9]],
  shield: [[2,5],[2,6],[2,7],[2,8],[3,4],[3,5],[3,6],[3,7],[3,8],[3,9],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[5,5],[5,6],[5,7],[5,8],[6,6],[6,7]],
  tree:   [[2,6],[2,7],[3,5],[3,6],[3,7],[3,8],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[5,5],[5,6],[5,7],[5,8],[6,6],[6,7],[7,6],[7,7]],
  heart:  [[2,4],[2,5],[2,8],[2,9],[3,3],[3,4],[3,5],[3,6],[3,7],[3,8],[3,9],[3,10],[4,4],[4,5],[4,6],[4,7],[4,8],[4,9],[5,5],[5,6],[5,7],[5,8],[6,6],[6,7]],
};

const IDEAS = [
  { text: "players race to the finish", icon: "car", label: "racing", name: "a racing game" },
  { text: "teams battle for the flag", icon: "shield", label: "battle", name: "a battle game" },
  { text: "you explore a huge world", icon: "tree", label: "world", name: "an open world" },
  { text: "you adopt and raise pets", icon: "heart", label: "pets", name: "a pet game" },
];

const studs = [];
if (grid) {
  for (let i = 0; i < COLS * ROWS; i++) {
    const s = document.createElement("div");
    s.className = "stud";
    grid.appendChild(s);
    studs.push(s);
  }
}
const idx = (r, c) => r * COLS + c;
// reveal order: by row then col so the icon "builds" bottom-up-ish / scanning
const iconCells = (name) => ICONS[name].slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

function paintIcon(name, fraction) {
  const cells = iconCells(name);
  const n = Math.round(cells.length * fraction);
  const on = new Set(cells.slice(0, n).map(([r, c]) => idx(r, c)));
  studs.forEach((s, i) => s.classList.toggle("on", on.has(i)));
}

// cursor ripple over the baseplate
if (grid && !reduce) {
  let centers = [];
  const cache = () => {
    const gr = grid.getBoundingClientRect();
    centers = studs.map((s) => {
      const r = s.getBoundingClientRect();
      return { x: r.left - gr.left + r.width / 2, y: r.top - gr.top + r.height / 2 };
    });
  };
  let raf = 0, mx = -999, my = -999;
  const apply = () => {
    raf = 0;
    const gr = grid.getBoundingClientRect();
    studs.forEach((s, i) => {
      const c = centers[i]; if (!c) return;
      const dx = mx - gr.left - c.x, dy = my - gr.top - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 70) s.style.transform = `scale(${(1 + (1 - d / 70) * 0.5).toFixed(2)})`;
      else s.style.transform = "";
    });
  };
  grid.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(apply); });
  grid.addEventListener("mouseleave", () => { studs.forEach((s) => (s.style.transform = "")); });
  setTimeout(cache, 200); window.addEventListener("resize", cache);
}

// ============================================================
// Typed prompt, synced to the baseplate build
// ============================================================
const typed = document.getElementById("typed");
const buildLabel = document.getElementById("buildlabel");
const buildName = document.getElementById("buildname");
const LEAD = "Make a game where ";

if (reduce) {
  if (typed) typed.textContent = LEAD + IDEAS[0].text;
  paintIcon(IDEAS[0].icon, 1);
  if (buildLabel) buildLabel.textContent = IDEAS[0].label;
  if (buildName) buildName.textContent = IDEAS[0].name;
} else if (typed) {
  let p = 0, ch = 0, deleting = false;
  const tick = () => {
    const idea = IDEAS[p];
    if (ch === 0 && !deleting) { if (buildLabel) buildLabel.textContent = idea.label; if (buildName) buildName.textContent = idea.name; }
    typed.textContent = LEAD + idea.text.slice(0, ch);
    paintIcon(idea.icon, idea.text.length ? ch / idea.text.length : 0);

    if (!deleting && ch < idea.text.length) { ch++; setTimeout(tick, 40 + Math.random() * 40); }
    else if (!deleting && ch === idea.text.length) { deleting = true; setTimeout(tick, 2100); }
    else if (deleting && ch > 0) { ch--; setTimeout(tick, 16); }
    else { deleting = false; p = (p + 1) % IDEAS.length; setTimeout(tick, 280); }
  };
  setTimeout(tick, 500);
}

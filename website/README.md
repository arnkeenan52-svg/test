# Forge — landing site (local preview)

A premium, zero-dependency marketing/landing page for the product. Pure
HTML/CSS/JS — no build step, no `npm install`.

## Run it

You only need Node.js (the same one the bridge server uses):

```bash
cd website
node serve.mjs
```

Then open **http://localhost:5173** in your browser.

(That's it — `serve.mjs` is a tiny static file server using only Node built-ins.)

## Files
- `index.html` — the page (hero, features, how-it-works, pricing, FAQ, footer)
- `styles.css` — the design system (dark premium theme, glass, gradients, animations)
- `script.js` — nav, scroll reveals, the typewriter in the product mockup
- `serve.mjs` — zero-dependency local server

## Rename the brand
The placeholder brand is **Forge**. To rename, find-and-replace `Forge` across
`index.html` (and tweak the logo `<svg>` if you want a different mark).

> Note: this is a *static marketing preview* — the buttons are placeholders.
> Wiring up real sign-up / Stripe / accounts is the separate SaaS-backend work.

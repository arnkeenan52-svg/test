# Roblox AI Dev Tool — Slice 1 (Bridge + Feedback Spike)

A minimal, **fully local** vertical slice of an AI tool that generates
server-authoritative Roblox systems from natural language, and captures runtime
signal from a playtest so the model can later optimize them.

This is **Slice 1 only**: a bridge server + a Studio plugin that make *one*
example work end to end ("create a server-authoritative coin pickup system").
No cloud, no auth, no database, no automatic optimization loop. See the scope
guards at the bottom.

```
┌─────────────────────────┐         POST /generate          ┌──────────────────────────┐
│  Roblox Studio plugin    │  ─────────────────────────────► │  Local bridge (Node/TS)   │
│  (Luau, dock widget)     │   { request, scripts, feedback }│                           │
│                          │                                 │  • holds ANTHROPIC_API_KEY │
│  • text input + Generate │  ◄───────────────────────────── │  • Roblox system prompt    │
│  • creates Instances at  │   { instances:[{path,type,...}]}│  • calls @anthropic-ai/sdk │
│    correct DataModel paths│                                │    model claude-opus-4-8   │
│  • captures LogService    │         POST /feedback          │  • prompt caching on        │
│    output + Stats probe   │  ─────────────────────────────► │    the system prompt        │
└─────────────────────────┘   { logs, telemetry }            └──────────────────────────┘
```

**Why a bridge server at all?** The API key must never live in the plugin (it
ships to anyone who installs it). The server owns the key and the
structured-JSON contract, so the plugin stays dumb and deterministic: it only
sends text and applies the JSON it gets back.

---

## Prerequisites

- **Node.js 18+** (for the bridge server).
- **Roblox Studio**.
- An **Anthropic API key** — <https://console.anthropic.com/>.

---

## 1. Run the bridge server

```bash
cd server
cp .env.example .env          # then edit .env and paste your real key
npm install
npm run dev                   # starts http://localhost:8765
```

You should see `AI bridge listening on http://127.0.0.1:8765`.
Quick check: `curl http://localhost:8765/health` → `{"ok":true}`.

The server binds to **127.0.0.1 only** (never exposed to your network) and reads
`ANTHROPIC_API_KEY` from `.env`. The key is never logged, never sent to the
plugin, and `.env` is gitignored.

### Test it for free — Mock Mode (no API key)

If you start the server with **no `ANTHROPIC_API_KEY` set**, it runs in **Mock
Mode**: every `Generate` returns a real, working server-authoritative
coin-pickup system *without* calling Claude. This lets you test the entire
pipeline (install → generate → instances created → playtest → feedback) for
**$0**. The startup log will say `FREE MOCK MODE`. Add your key later to switch
on real AI generation — no code change needed.

---

## 2. Install the Studio plugin

The plugin is a single file: [`plugin/RobloxAIDevTool.server.luau`](plugin/RobloxAIDevTool.server.luau).

**Easiest install:**
1. In Studio, open any place.
2. Create a `Script` anywhere, paste the file's contents into it.
3. Right-click the script in Explorer → **Save as Local Plugin…** (or copy the
   `.luau` file into your local Plugins folder — *Plugins* tab → *Plugins Folder*).
4. The **AI Dev Tool** button appears in the *Plugins* toolbar. Click it to open
   the dock widget.

**Enable HTTP requests (required once per place):**
Studio → **Home → Game Settings → Security → Allow HTTP Requests = ON**.
(Or run `game:GetService("HttpService").HttpEnabled = true` in the Command Bar.)
Localhost is allowed in Studio — this is the same mechanism Rojo uses.

> If Studio prompts for plugin permissions on first run, allow them.

---

## 3. Use it (the end-to-end example)

1. Make sure the server is running and `Allow HTTP Requests` is on.
2. Open the **AI Dev Tool** widget.
3. Type: `create a server-authoritative coin pickup system`.
4. Click **Generate**. The plugin sends your text (plus a snapshot of relevant
   existing scripts) to the server, gets back a list of Instances, and creates
   them at the right services (e.g. a `Script` in `ServerScriptService`, a
   `ModuleScript` in `ReplicatedStorage`, etc.), setting their source via the
   supported `ScriptEditorService` API.
5. **Playtest (F5).** Coins should be claimable exactly once, validated on the
   server. Any errors/output appear in the widget log.
6. Click **Add Runtime Probe** before playtesting to also sample FPS / memory /
   instance counts (see `RUNTIME_FEEDBACK.md`).
7. **Stop the playtest.** The plugin flushes the captured logs + telemetry to the
   server (`POST /feedback`) so the model could see them on the next request.

> **Why flush *after* the playtest instead of streaming live?** Roblox blocks
> localhost HTTP requests from a plugin's *client context during a playtest*
> (rate limit drops to 0). So we buffer in-memory during the test and send once
> it stops, back in edit mode. Details in `RUNTIME_FEEDBACK.md`.

---

## Project layout

```
.
├── README.md
├── RUNTIME_FEEDBACK.md        # THE de-risk deliverable: what runtime signal is reachable
├── server/                    # TypeScript + Node bridge (holds the API key)
│   ├── .env.example
│   └── src/
│       ├── index.ts           # localhost HTTP server: /generate, /feedback, /health
│       ├── anthropic.ts       # @anthropic-ai/sdk call + prompt caching
│       ├── systemPrompt.md    # the Roblox best-practices system prompt (edit me!)
│       └── schema.ts          # safe parsing/validation of the model's JSON
└── plugin/
    └── RobloxAIDevTool.server.luau   # the Studio plugin (UI, HTTP, apply, telemetry)
```

---

## Scope guards (intentionally NOT built yet)

- No cloud hosting, auth, database, or multi-user — everything runs locally.
- No 3D / asset / world generation.
- No automatic optimization loop — we only **capture** runtime signal, never act on it.
- One example (coin pickup) made to work end to end, not every game type.

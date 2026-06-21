# Runtime Feedback — what a Studio plugin can actually extract

> **Why this document exists.** The long-term project depends on extracting
> enough *runtime* signal from Studio to later optimize generated games. Before
> betting on that, this spike investigates what is *actually reachable from a
> plugin*, what is *blocked*, and *how reliable* each signal is. Findings are
> verified against current Roblox Creator docs and DevForum reports (June 2026),
> not assumed. Sources are listed at the bottom.

**TL;DR (the de-risk verdict): The loop is viable.** Errors, output, and a broad
set of `Stats` performance counters are reachable and reliable enough to drive
optimization. Two things are genuinely blocked — **MicroProfiler scope/timing
data** and **per-category memory breakdowns** — and there are two
**architecture-shaping gotchas** (a cross-data-model boundary and a
localhost-HTTP block during playtest). Both gotchas have clean workarounds, and
this slice implements them.

---

## The two gotchas that shape the architecture

### Gotcha 1 — A plugin and a playtest can live in *different data models*

Studio testing modes behave differently:

| Mode | Data model | Plugin sees `Stats`/`RunService` of the sim directly? |
|------|-----------|-------------------------------------------------------|
| **Run** (F8) | Server sim runs **in the edit data model** | ✅ Yes — plugin reads it directly |
| **Play / Test** (F5) | **Separate** client + server sims ("Accurate Play Solo") | ⚠️ No — plugin's own `Stats` reflect the *edit* model, not the sim |

So you **cannot** just read `Stats.HeartbeatTimeMs` from the plugin during an F5
playtest and expect the playtest's numbers. The plugin keeps running during a
playtest (confirmed, intended behavior), but in its own (edit) data model.

**Workaround used here — the telemetry probe.** The plugin injects a tiny
`Script` into the game that runs *inside the playtest's data model*, samples
`Stats` once per second, and `print`s a structured JSON line prefixed with a
marker. The plugin's `LogService` capture (see below) reads those lines back and
parses them. Output is unified across data models in Studio, so this works for
both Run and Play modes — and it sidesteps Gotcha 2 entirely.

### Gotcha 2 — localhost HTTP is *blocked from a plugin during a playtest*

The `HttpService` localhost request limit depends on run mode:

| Context | localhost requests/min |
|---------|------------------------|
| Edit mode (plugin idle) | ~2,000 |
| Run mode, server context | 500 |
| **Playtest, client context** | **0 — blocked entirely** |

This means you **cannot reliably stream telemetry to the local server live
during a playtest.** (Roblox's suggested high-frequency alternative is the newer
`WebStreamClient`, which is out of scope for this spike.)

**Workaround used here — buffer then flush.** The plugin buffers captured output
+ telemetry in-memory during the playtest, and `POST`s it to the server *after
the playtest stops*, when it's back in edit mode (~2,000/min budget). The plugin
detects the run→edit transition by polling `RunService:IsRunning()`.

---

## What IS extractable

### 1. Script errors & output — ✅ reliable

- **API:** `LogService.MessageOut(message, messageType)` (live) and
  `LogService:GetLogHistory()` (backfill). `messageType` is one of
  `Enum.MessageType.Message{Output,Info,Warning,Error}`.
- **Plugin access:** Yes — requires the `Logging` capability, which plugins have.
  Studio's Output window is unified, so a plugin observes messages produced by a
  playtest in both Run and Play modes.
- **Reliability:** **High** for `print` / `warn` / `error` and for runtime Lua
  errors (with stack traces). **Medium** for some engine-generated lines: a 2024
  regression briefly stopped non-print/warn/error messages (e.g. some compile
  errors) from firing `MessageOut`; Roblox reverted it. Treat compile/syntax
  error capture as "usually works," and use `GetLogHistory()` as a backfill.
- **Caveat:** the docs themselves warn `GetLogHistory` "may have changing,
  unexpected or unreliable behavior" and "should not be relied upon for any
  important game logic." Fine for telemetry; don't build control flow on it.

### 2. Performance counters via `Stats` — ✅ reliable (read inside the sim)

Every `Stats` property below is `ReadOnly` + `ReadSafe`, i.e. plugin-readable.
The catch is Gotcha 1: read them **inside the playtest** (via the probe), not
from the plugin in Play mode.

| Signal | Member | Notes |
|--------|--------|-------|
| Frame/heartbeat time | `Stats.HeartbeatTime` (s), `HeartbeatTimeMs` (deprecated) | server-side scheduler time per step |
| Physics step time | `Stats.PhysicsStepTime`, `PhysicsStepTimeMs` (deprecated) | |
| Instance count | `Stats.InstanceCount` | total `Instance`s in memory |
| Physical parts | `Stats.PrimitivesCount`, `MovingPrimitivesCount`, `ContactsCount` | |
| Network | `Stats.DataReceiveKbps`, `DataSendKbps`, `PhysicsReceiveKbps`, `PhysicsSendKbps` | meaningful in networked sims |
| Render (client) | `RenderCPUFrameTime`, `RenderGPUFrameTime`, `FrameTime`, `SceneDrawcallCount`, `SceneTriangleCount`, UI draw/triangle counts | client context only |
| Render FPS | `workspace:GetRealPhysicsFPS()` | physics FPS, decent proxy |

- **Reliability:** **High** for the counts and times. Network counters are only
  meaningful when there's actual replication (Play/Test, not solo Run).

### 3. Total & per-tag memory — ✅ partial

- `Stats:GetTotalMemoryUsageMb()` → total session memory. **Works, no special
  capability.** Reliability: High (coarse).
- `Stats:GetMemoryUsageMbForTag(tag)` → memory for one `Enum.DeveloperMemoryTag`
  category (e.g. `Instances`, `Script`, `PhysicsParts`). **Works.** You must
  query tags one at a time. Reliability: Medium-High.

### 4. Instance counts / structural facts — ✅ reliable

- `Stats.InstanceCount`, plus you can walk the DataModel inside the probe
  (`#workspace:GetDescendants()`, counts per class) for structure-aware signal.
  Reliability: High.

---

## What is NOT extractable (honest blockers)

### A. MicroProfiler scope / timing data — ❌ blocked

There is **no API to read MicroProfiler scopes or per-frame timing breakdowns**
from a script or plugin. `debug.profilebegin` / `debug.profileend` only let you
*add* labeled scopes; you cannot *read* them back. There is an open Engine
Feature request ("Allow scripts to access microprofiler & memory tag data for
performance analytics") confirming this is wanted but unavailable. You can
trigger a MicroProfiler dump to a file, but a plugin cannot parse that
programmatically. **Reliability of obtaining this signal: None — treat as
blocked.** Mitigation: the probe's `Stats` timings + your own
`os.clock()`/`debug.profilebegin` instrumentation inside generated code give a
coarse substitute.

### B. Per-category memory breakdown in one call — ❌ blocked for normal plugins

`Stats:GetMemoryUsageMbAllCategories()` requires the `InternalTest` capability,
which normal plugins don't have. Mitigation: enumerate
`Enum.DeveloperMemoryTag` and call `GetMemoryUsageMbForTag` per tag (works, just
more calls).

### C. Live streaming to a local server during a playtest — ❌ blocked

See Gotcha 2. Mitigation: buffer-then-flush (implemented).

---

## Reliability summary

| Signal | Reachable from plugin? | Reliability | How |
|--------|------------------------|-------------|-----|
| Script errors + stack traces | ✅ | **High** | `LogService.MessageOut` |
| `print`/`warn` output | ✅ | **High** | `LogService.MessageOut` |
| Compile/syntax errors | ✅ | Medium | `MessageOut` + `GetLogHistory` backfill |
| Heartbeat / physics step time | ✅ (via probe) | **High** | `Stats.*Time` inside sim |
| Instance / primitive counts | ✅ (via probe) | **High** | `Stats.InstanceCount`, etc. |
| Network Kbps | ✅ (via probe) | Medium | `Stats.*Kbps` (needs replication) |
| Total memory (MB) | ✅ (via probe) | **High** | `Stats:GetTotalMemoryUsageMb()` |
| Per-tag memory | ✅ (via probe) | Medium-High | `GetMemoryUsageMbForTag` per tag |
| Render FPS / drawcalls | ✅ (client probe) | Medium-High | `Stats` render counters |
| All-category memory in one call | ❌ | — | needs `InternalTest` capability |
| MicroProfiler scopes/timings | ❌ | — | no read API exists |
| Live HTTP during playtest | ❌ | — | localhost limit = 0 in client context |

## What this means for the long-term project

The optimization loop is **feasible**: errors + a rich `Stats` time/memory/count
picture, sampled inside the playtest and flushed back to the server, is enough
to (later) drive "this system is slow / leaking instances / erroring" decisions.
The honest ceiling is **fine-grained per-function profiling** — MicroProfiler
data is locked away, so attributing cost to a specific function must come from
*self-instrumentation we generate into the code*, not from the engine profiler.
Plan around that constraint rather than expecting MicroProfiler access to open up.

---

## Sources

- HttpService — enabling, localhost, ports:
  <https://create.roblox.com/docs/reference/engine/classes/HttpService> ·
  <https://create.roblox.com/docs/cloud-services/http-service>
- Plugin localhost limit affected by run mode (0 in client context):
  <https://devforum.roblox.com/t/plugin-localhost-httpservice-limit-affected-by-run-mode/3046079>
- ScriptEditorService source-setting changes:
  <https://devforum.roblox.com/t/important-script-source-update-and-new-scripteditorservice-apis/2628171> ·
  <https://create.roblox.com/docs/reference/engine/classes/ScriptEditorService/UpdateSourceAsync>
- LogService (MessageOut / GetLogHistory, capability, regression+revert):
  <https://create.roblox.com/docs/reference/engine/classes/LogService> ·
  <https://devforum.roblox.com/t/logservice-messageout-no-longer-fires-in-studio-plugins/2971648>
- Stats members (ReadSafe, memory methods/capabilities):
  <https://create.roblox.com/docs/reference/engine/classes/Stats>
- MicroProfiler not script-accessible (feature request):
  <https://devforum.roblox.com/t/allow-scripts-to-access-microprofiler-memory-tag-data-for-performance-analytics/2917790>
- Testing modes / data models / plugins run during playtest:
  <https://create.roblox.com/docs/studio/testing-modes> ·
  <https://devforum.roblox.com/t/plugin-runs-during-a-playtest/2478780>

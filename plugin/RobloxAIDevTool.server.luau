--!nonstrict
--[[
	Roblox AI Dev Tool — Studio plugin (Slice 1)
	================================================
	Single-file local plugin. Install: paste into a Script in Studio, right-click
	it in Explorer -> "Save as Local Plugin..." (or drop this .luau into your
	Plugins folder). The "AI Dev Tool" button appears in the Plugins toolbar.

	Requires the local bridge server running (see README) and HTTP enabled:
	  Game Settings -> Security -> Allow HTTP Requests = ON
	  (or run  game:GetService("HttpService").HttpEnabled = true  in the Command Bar)

	What it does:
	  • Dock widget with a text input, "Generate", "Add Runtime Probe", and a log.
	  • Sends your request (+ a snapshot of existing scripts + last playtest
	    feedback) to the bridge, which calls Claude and returns structured JSON.
	  • Deterministically creates the returned Script/LocalScript/ModuleScript
	    instances at the right DataModel paths, setting source via the supported
	    ScriptEditorService:UpdateSourceAsync API.
	  • Captures script errors/output during a playtest (LogService) and a Stats
	    telemetry probe, then flushes them back to the server AFTER the playtest
	    stops (localhost HTTP is blocked from a plugin DURING a playtest).

	See RUNTIME_FEEDBACK.md for why capture is most reliable in "Run" (F8) mode.
]]

----------------------------------------------------------------------
-- Config & services
----------------------------------------------------------------------
local SERVER_URL = "http://localhost:8765"
local TELE_PREFIX = "[AIDEVTOOL_TELEMETRY] "
local PROBE_NAME = "AIDevToolRuntimeProbe"

local SNAPSHOT_SERVICES = { "ServerScriptService", "ReplicatedStorage", "ServerStorage", "StarterPlayer", "StarterGui" }
local MAX_SNAPSHOT_SCRIPTS = 16
local MAX_SNAPSHOT_SOURCE = 6000

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local LogService = game:GetService("LogService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

----------------------------------------------------------------------
-- UI
----------------------------------------------------------------------
local ACCENT = Color3.fromRGB(120, 170, 255)
local OK_C = Color3.fromRGB(120, 220, 140)
local ERR_C = Color3.fromRGB(240, 120, 120)
local WARN_C = Color3.fromRGB(240, 200, 120)
local DIM_C = Color3.fromRGB(150, 150, 165)
local TELE_C = Color3.fromRGB(185, 165, 245)

local toolbar = plugin:CreateToolbar("AI Dev Tool")
local toggleButton = toolbar:CreateButton("AI Dev Tool", "Toggle the AI Dev Tool panel", "")
toggleButton.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(
	Enum.InitialDockState.Right,
	false, -- initially enabled
	false, -- override restore
	340, 460, -- floating size
	280, 320 -- min size
)
local widget = plugin:CreateDockWidgetPluginGui("AIDevTool_Main", widgetInfo)
widget.Title = "AI Dev Tool"

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(34, 34, 40)
root.BorderSizePixel = 0
root.Parent = widget

local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 8)
pad.PaddingBottom = UDim.new(0, 8)
pad.PaddingLeft = UDim.new(0, 8)
pad.PaddingRight = UDim.new(0, 8)
pad.Parent = root

local layout = Instance.new("UIListLayout")
layout.FillDirection = Enum.FillDirection.Vertical
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Padding = UDim.new(0, 6)
layout.Parent = root

-- Input box
local inputBox = Instance.new("TextBox")
inputBox.LayoutOrder = 1
inputBox.Size = UDim2.new(1, 0, 0, 64)
inputBox.BackgroundColor3 = Color3.fromRGB(24, 24, 28)
inputBox.BorderSizePixel = 0
inputBox.TextColor3 = Color3.fromRGB(235, 235, 240)
inputBox.PlaceholderText = "create a server-authoritative coin pickup system"
inputBox.Text = ""
inputBox.Font = Enum.Font.Gotham
inputBox.TextSize = 14
inputBox.TextWrapped = true
inputBox.TextXAlignment = Enum.TextXAlignment.Left
inputBox.TextYAlignment = Enum.TextYAlignment.Top
inputBox.ClearTextOnFocus = false
inputBox.MultiLine = true
inputBox.Parent = root
local ic = Instance.new("UICorner"); ic.CornerRadius = UDim.new(0, 6); ic.Parent = inputBox
local ip = Instance.new("UIPadding"); ip.PaddingLeft = UDim.new(0, 6); ip.PaddingTop = UDim.new(0, 4); ip.Parent = inputBox

-- Button row
local row = Instance.new("Frame")
row.LayoutOrder = 2
row.Size = UDim2.new(1, 0, 0, 30)
row.BackgroundTransparency = 1
row.Parent = root
local rowLayout = Instance.new("UIListLayout")
rowLayout.FillDirection = Enum.FillDirection.Horizontal
rowLayout.Padding = UDim.new(0, 6)
rowLayout.Parent = row

local function makeButton(text, width, color)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(0, width, 1, 0)
	b.BackgroundColor3 = color
	b.BorderSizePixel = 0
	b.Text = text
	b.TextColor3 = Color3.fromRGB(20, 20, 24)
	b.Font = Enum.Font.GothamMedium
	b.TextSize = 13
	b.AutoButtonColor = true
	b.Parent = row
	local c = Instance.new("UICorner"); c.CornerRadius = UDim.new(0, 6); c.Parent = b
	return b
end

local generateButton = makeButton("Generate", 110, ACCENT)
local probeButton = makeButton("Add Runtime Probe", 150, Color3.fromRGB(200, 200, 210))

-- Log (scrolling)
local logFrame = Instance.new("ScrollingFrame")
logFrame.LayoutOrder = 3
logFrame.Size = UDim2.new(1, 0, 1, -106)
logFrame.BackgroundColor3 = Color3.fromRGB(22, 22, 26)
logFrame.BorderSizePixel = 0
logFrame.ScrollBarThickness = 6
logFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
logFrame.CanvasSize = UDim2.new()
logFrame.Parent = root
local lc = Instance.new("UICorner"); lc.CornerRadius = UDim.new(0, 6); lc.Parent = logFrame
local logLayout = Instance.new("UIListLayout")
logLayout.SortOrder = Enum.SortOrder.LayoutOrder
logLayout.Padding = UDim.new(0, 2)
logLayout.Parent = logFrame
local lp = Instance.new("UIPadding")
lp.PaddingLeft = UDim.new(0, 6); lp.PaddingRight = UDim.new(0, 6)
lp.PaddingTop = UDim.new(0, 6); lp.PaddingBottom = UDim.new(0, 6)
lp.Parent = logFrame

local logOrder = 0
local function log(msg: string, color: Color3?)
	logOrder += 1
	local label = Instance.new("TextLabel")
	label.LayoutOrder = logOrder
	label.BackgroundTransparency = 1
	label.Size = UDim2.new(1, 0, 0, 0)
	label.AutomaticSize = Enum.AutomaticSize.Y
	label.Font = Enum.Font.Code
	label.TextSize = 13
	label.TextColor3 = color or Color3.fromRGB(220, 220, 225)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Top
	label.TextWrapped = true
	label.Text = msg
	label.Parent = logFrame
	task.defer(function()
		logFrame.CanvasPosition = Vector2.new(0, logFrame.AbsoluteCanvasSize.Y)
	end)
end

toggleButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

----------------------------------------------------------------------
-- Networking
----------------------------------------------------------------------
local function postJson(endpoint: string, payload)
	local body = HttpService:JSONEncode(payload)
	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = SERVER_URL .. endpoint,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = body,
		})
	end)
	if not ok then
		return nil, tostring(response)
	end
	if not response.Success then
		local msg = ("HTTP %d %s"):format(response.StatusCode, response.StatusMessage or "")
		local decoded
		pcall(function() decoded = HttpService:JSONDecode(response.Body) end)
		if decoded and decoded.error then msg = decoded.error end
		return nil, msg
	end
	local decoded
	local okd, derr = pcall(function() decoded = HttpService:JSONDecode(response.Body) end)
	if not okd then return nil, "Bad JSON from server: " .. tostring(derr) end
	return decoded, nil
end

----------------------------------------------------------------------
-- DataModel helpers
----------------------------------------------------------------------
local function safeService(name: string)
	local ok, svc = pcall(function() return game:GetService(name) end)
	if ok then return svc end
	return game:FindFirstChild(name)
end

-- Resolve a "ServerScriptService/Modules" style path to a parent Instance,
-- creating intermediate Folders that don't exist.
local function resolveParent(path: string)
	local segments = string.split(path, "/")
	-- Tolerate a leading "game" / "DataModel" segment if the model emits one.
	if segments[1] == "game" or segments[1] == "DataModel" then
		table.remove(segments, 1)
	end
	local root = safeService(segments[1])
	if not root then
		error("Unknown root service: " .. tostring(segments[1]))
	end
	local current = root
	for i = 2, #segments do
		local seg = segments[i]
		local child = current:FindFirstChild(seg)
		if not child then
			child = Instance.new("Folder")
			child.Name = seg
			child.Parent = current
		end
		current = child
	end
	return current
end

-- Set a script's source via the supported API. Normalize CRLF -> LF first to
-- avoid a known UpdateSourceAsync carriage-return bug; fall back to .Source for
-- freshly created scripts if the editor service rejects the update.
local function setSource(scriptInst, source: string)
	source = string.gsub(source, "\r\n", "\n")
	local ok, err = pcall(function()
		ScriptEditorService:UpdateSourceAsync(scriptInst, function()
			return source
		end)
	end)
	if not ok then
		local ok2 = pcall(function()
			scriptInst.Source = source
		end)
		if not ok2 then
			error("Could not set source: " .. tostring(err))
		end
	end
end

local function fullPath(inst): string
	local segs = {}
	local cur = inst
	while cur and cur ~= game do
		table.insert(segs, 1, cur.Name)
		cur = cur.Parent
	end
	return table.concat(segs, "/")
end

-- Gather a bounded snapshot of existing scripts to give the model context.
local function gatherSnapshot()
	local out = {}
	for _, svcName in ipairs(SNAPSHOT_SERVICES) do
		local svc = safeService(svcName)
		if svc then
			for _, inst in ipairs(svc:GetDescendants()) do
				if #out >= MAX_SNAPSHOT_SCRIPTS then break end
				if inst:IsA("LuaSourceContainer") and inst.Name ~= PROBE_NAME then
					local src = ""
					pcall(function() src = inst.Source end)
					if #src > MAX_SNAPSHOT_SOURCE then
						src = string.sub(src, 1, MAX_SNAPSHOT_SOURCE) .. "\n-- (truncated)"
					end
					table.insert(out, { path = fullPath(inst), source = src })
				end
			end
		end
	end
	return out
end

----------------------------------------------------------------------
-- Telemetry / playtest capture
----------------------------------------------------------------------
local feedbackBuffer = {} -- string log lines captured during the last playtest
local telemetryBuffer = {} -- parsed telemetry tables

LogService.MessageOut:Connect(function(message, messageType)
	-- Telemetry probe line?
	if string.sub(message, 1, #TELE_PREFIX) == TELE_PREFIX then
		local json = string.sub(message, #TELE_PREFIX + 1)
		local okd, data = pcall(function() return HttpService:JSONDecode(json) end)
		if okd and data then
			table.insert(telemetryBuffer, data)
			log(("telemetry: fps=%d heartbeat=%.2fms mem=%dMB instances=%d"):format(
				math.floor(data.physFps or 0), data.heartbeatMs or 0,
				math.floor(data.totalMemoryMb or 0), data.instanceCount or 0), TELE_C)
		end
		return
	end
	-- Normal output, only while a playtest is running.
	if RunService:IsRunning() then
		local color, tag = DIM_C, "  "
		if messageType == Enum.MessageType.MessageError then
			color, tag = ERR_C, "ERR  "
		elseif messageType == Enum.MessageType.MessageWarning then
			color, tag = WARN_C, "WARN "
		end
		log(tag .. message, color)
		table.insert(feedbackBuffer, tag .. message)
	end
end)

-- Send the captured playtest signal back to the server. Called AFTER the
-- playtest stops (back in edit mode) because localhost HTTP is blocked from a
-- plugin during a playtest.
local function flushFeedback()
	if #feedbackBuffer == 0 and #telemetryBuffer == 0 then
		return
	end
	local result, err = postJson("/feedback", { logs = feedbackBuffer, telemetry = telemetryBuffer })
	if result then
		log(("Sent %d log line(s) + %d telemetry sample(s) to the server."):format(#feedbackBuffer, #telemetryBuffer), OK_C)
	else
		log("Couldn't send feedback: " .. tostring(err), WARN_C)
	end
end

-- Poll run state to detect playtest start/stop edges. (There is no direct
-- "playtest started" event in the edit data model, so we poll.)
task.spawn(function()
	local was = false
	while true do
		local now = RunService:IsRunning()
		if now and not was then
			feedbackBuffer = {}
			telemetryBuffer = {}
			log("Playtest started — capturing output & telemetry…", ACCENT)
			log("Tip: 'Run' (F8) shares the edit data model and is the most reliable capture mode.", DIM_C)
		elseif (not now) and was then
			log(("Playtest stopped. Captured %d line(s), %d telemetry sample(s)."):format(#feedbackBuffer, #telemetryBuffer), ACCENT)
			flushFeedback()
		end
		was = now
		task.wait(0.5)
	end
end)

local function feedbackForPrompt()
	local fb = {}
	for _, l in ipairs(feedbackBuffer) do
		table.insert(fb, l)
	end
	if #telemetryBuffer > 0 then
		local last = telemetryBuffer[#telemetryBuffer]
		table.insert(fb, ("telemetry(last): fps=%d heartbeatMs=%.2f memMB=%d instances=%d"):format(
			math.floor(last.physFps or 0), last.heartbeatMs or 0,
			math.floor(last.totalMemoryMb or 0), last.instanceCount or 0))
	end
	return fb
end

----------------------------------------------------------------------
-- Apply instances
----------------------------------------------------------------------
local function applyInstances(instances)
	local recording = ChangeHistoryService:TryBeginRecording("AI Dev Tool: Generate")
	local created = 0
	for _, spec in ipairs(instances) do
		local ok, err = pcall(function()
			local parent = resolveParent(spec.dataModelPath)
			-- Reuse an existing same-name, same-class instance so repeated
			-- generations update rather than pile up duplicates.
			local existing = parent:FindFirstChild(spec.name)
			local inst
			if existing and existing.ClassName == spec.instanceType then
				inst = existing
			else
				inst = Instance.new(spec.instanceType)
				inst.Name = spec.name
				inst.Parent = parent
			end
			setSource(inst, spec.sourceCode)
			log(("+ %s (%s) -> %s"):format(spec.name, spec.instanceType, spec.dataModelPath), OK_C)
		end)
		if ok then
			created += 1
		else
			log(("! failed %s: %s"):format(tostring(spec.name), tostring(err)), ERR_C)
		end
	end
	if recording then
		ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end
	log(("Created/updated %d of %d instance(s). Playtest to run it."):format(created, #instances), ACCENT)
end

----------------------------------------------------------------------
-- Runtime probe
----------------------------------------------------------------------
local PROBE_SOURCE = [[
-- AIDevTool runtime probe (auto-generated; safe to delete).
-- Runs only during a playtest. Samples the Stats service once per second and
-- prints a structured line that the AI Dev Tool plugin parses from LogService.
local Stats = game:GetService("Stats")
local HttpService = game:GetService("HttpService")

local PREFIX = "]] .. TELE_PREFIX .. [["

task.spawn(function()
	while true do
		local data = {
			t = os.clock(),
			heartbeatMs = Stats.HeartbeatTime * 1000,
			physicsStepMs = Stats.PhysicsStepTime * 1000,
			instanceCount = Stats.InstanceCount,
			primitives = Stats.PrimitivesCount,
			movingPrimitives = Stats.MovingPrimitivesCount,
			totalMemoryMb = Stats:GetTotalMemoryUsageMb(),
			physFps = workspace:GetRealPhysicsFPS(),
		}
		print(PREFIX .. HttpService:JSONEncode(data))
		task.wait(1)
	end
end)
]]

local function addProbe()
	local sss = safeService("ServerScriptService")
	if not sss then
		log("ServerScriptService not found.", ERR_C)
		return
	end
	local recording = ChangeHistoryService:TryBeginRecording("AI Dev Tool: Add Probe")
	local probe = sss:FindFirstChild(PROBE_NAME)
	if not probe or not probe:IsA("Script") then
		probe = Instance.new("Script")
		probe.Name = PROBE_NAME
		probe.Parent = sss
	end
	setSource(probe, PROBE_SOURCE)
	if recording then
		ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
	end
	log("Runtime probe added to ServerScriptService. It samples Stats each second during a playtest.", OK_C)
end

----------------------------------------------------------------------
-- Generate flow
----------------------------------------------------------------------
local busy = false
local function setBusy(state: boolean)
	busy = state
	generateButton.Text = state and "Working…" or "Generate"
	generateButton.AutoButtonColor = not state
end

local function generate()
	if busy then return end
	local request = inputBox.Text
	if request:gsub("%s", "") == "" then
		log("Type a request first.", WARN_C)
		return
	end
	setBusy(true)
	log("> " .. request, ACCENT)

	local payload = {
		request = request,
		scripts = gatherSnapshot(),
	}
	local fb = feedbackForPrompt()
	if #fb > 0 then
		payload.runtimeFeedback = fb
	end

	local result, err = postJson("/generate", payload)
	if not result then
		log("Error: " .. tostring(err), ERR_C)
		if string.find(tostring(err), "Http") and string.find(tostring(err), "enable") then
			log("Enable HTTP: Game Settings > Security > Allow HTTP Requests.", WARN_C)
		elseif string.find(tostring(err), "nect") or string.find(tostring(err), "imeout") or string.find(tostring(err), "Trust") then
			log("Is the bridge server running at " .. SERVER_URL .. " ?", WARN_C)
		end
		setBusy(false)
		return
	end

	if result.usage then
		log(("tokens: in=%d cache_read=%d out=%d"):format(
			result.usage.input_tokens or 0,
			result.usage.cache_read_input_tokens or 0,
			result.usage.output_tokens or 0), DIM_C)
	end
	if result.notes then
		log("notes: " .. tostring(result.notes), DIM_C)
	end
	if type(result.instances) == "table" then
		applyInstances(result.instances)
	else
		log("Server returned no instances.", WARN_C)
	end
	setBusy(false)
end

generateButton.Activated:Connect(function()
	task.spawn(generate)
end)
probeButton.Activated:Connect(function()
	task.spawn(addProbe)
end)

log("AI Dev Tool ready. Enter a request and press Generate.", ACCENT)
log("Server: " .. SERVER_URL .. "  •  needs HTTP enabled in Game Settings.", DIM_C)

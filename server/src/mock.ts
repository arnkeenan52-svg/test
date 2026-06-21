// Mock Mode: a real, working server-authoritative coin-pickup system returned
// WITHOUT calling the Anthropic API. Used automatically when ANTHROPIC_API_KEY
// is not set, so the whole Studio pipeline (generate -> create instances ->
// playtest -> feedback) can be tested for free. Both scripts run error-free on
// a fresh Baseplate.

import type { GenerateResult } from "./schema.js";

const COIN_SERVICE = `--[[
	CoinService (server-authoritative). The SERVER owns the coins and detects
	pickups, so a client cannot fake collecting a coin. Spawns coins on the
	baseplate; touching one awards +1 to the player's leaderstats and notifies
	that client via a RemoteEvent.
]]
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local COIN_COUNT = 12
local SPAWN_AREA = 80 -- studs from origin

-- The server creates the RemoteEvent used to notify a client of a pickup.
local coinCollected = ReplicatedStorage:FindFirstChild("CoinCollected")
if not coinCollected then
	coinCollected = Instance.new("RemoteEvent")
	coinCollected.Name = "CoinCollected"
	coinCollected.Parent = ReplicatedStorage
end

local function setupLeaderstats(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = 0
	coins.Parent = stats
	stats.Parent = player
end

Players.PlayerAdded:Connect(setupLeaderstats)
for _, p in ipairs(Players:GetPlayers()) do
	setupLeaderstats(p)
end

local function awardCoin(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if coins then
		coins.Value += 1
	end
	coinCollected:FireClient(player)
end

local function makeCoin()
	local coin = Instance.new("Part")
	coin.Name = "Coin"
	coin.Shape = Enum.PartType.Cylinder
	coin.Size = Vector3.new(0.4, 3, 3)
	coin.Color = Color3.fromRGB(255, 215, 0)
	coin.Material = Enum.Material.Neon
	coin.Anchored = true
	coin.CanCollide = false
	coin.Orientation = Vector3.new(0, 0, 90)
	coin.Position = Vector3.new(math.random(-SPAWN_AREA, SPAWN_AREA), 3, math.random(-SPAWN_AREA, SPAWN_AREA))
	coin.Parent = workspace

	local claimed = false
	coin.Touched:Connect(function(hit)
		if claimed then return end
		-- Server validates the toucher is a live player character.
		local character = hit.Parent
		local player = character and Players:GetPlayerFromCharacter(character)
		if not player then return end
		local humanoid = character:FindFirstChildOfClass("Humanoid")
		if not humanoid or humanoid.Health <= 0 then return end
		claimed = true
		awardCoin(player)
		coin:Destroy()
	end)
end

for _ = 1, COIN_COUNT do
	makeCoin()
end

print("[CoinService] Spawned " .. COIN_COUNT .. " coins. Walk over them to collect.")
`;

const COIN_CLIENT = `-- CoinClient: reacts to the server's pickup notification (UI / sound hook).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local coinCollected = ReplicatedStorage:WaitForChild("CoinCollected")
local player = Players.LocalPlayer

coinCollected.OnClientEvent:Connect(function()
	local stats = player:FindFirstChild("leaderstats")
	local coins = stats and stats:FindFirstChild("Coins")
	local total = coins and coins.Value or 0
	print("[CoinClient] Coin collected! Total: " .. tostring(total))
end)
`;

export const MOCK_COIN_SYSTEM: GenerateResult = {
  instances: [
    {
      dataModelPath: "ServerScriptService",
      instanceType: "Script",
      name: "CoinService",
      sourceCode: COIN_SERVICE,
    },
    {
      dataModelPath: "StarterPlayer/StarterPlayerScripts",
      instanceType: "LocalScript",
      name: "CoinClient",
      sourceCode: COIN_CLIENT,
    },
  ],
  notes: "MOCK MODE (no API key set): built-in coin-pickup example. Add ANTHROPIC_API_KEY for real AI generation.",
};

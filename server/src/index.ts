// Local bridge HTTP server.
//
// Binds to 127.0.0.1 ONLY (never exposed to the network) and speaks plain JSON
// to the Studio plugin. No CORS needed — Roblox HttpService is not a browser.
//
// Routes:
//   GET  /health    -> { ok: true }
//   POST /generate  -> { request, scripts?, runtimeFeedback? } => { instances, notes?, usage }
//   POST /feedback  -> { logs?, telemetry? } => { ok, received }   (sink for playtest signal)

import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generate } from "./anthropic.js";
import { parseModelOutput } from "./schema.js";
import { MOCK_COIN_SYSTEM } from "./mock.js";

const PORT = Number(process.env.PORT) || 8765;
const HOST = "127.0.0.1";

// Holds the most recent playtest feedback so a later /generate could include it.
// In-memory only — this is a local spike, not a database.
let lastFeedback: { logs: string[]; telemetry: unknown[]; at: string } | null = null;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  const MAX = 5 * 1024 * 1024; // 5 MB guard
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX) throw new Error("Request body too large.");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") return {};
  return JSON.parse(raw);
}

async function handleGenerate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as Record<string, unknown>;

  const request = body.request;
  if (typeof request !== "string" || request.trim() === "") {
    sendJson(res, 400, { error: "Body must include a non-empty 'request' string." });
    return;
  }

  const scripts = Array.isArray(body.scripts)
    ? (body.scripts as { path: string; source: string }[])
    : undefined;

  // Use feedback supplied in the request, else fall back to the last flush.
  const runtimeFeedback = Array.isArray(body.runtimeFeedback)
    ? (body.runtimeFeedback as string[])
    : lastFeedback?.logs;

  console.log(`[generate] "${request.slice(0, 80)}"`);

  // FREE MOCK MODE: with no API key, return the built-in coin-pickup example
  // so the whole Studio pipeline can be tested without spending anything.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("[mock] no ANTHROPIC_API_KEY — returning the built-in coin-pickup example");
    sendJson(res, 200, {
      instances: MOCK_COIN_SYSTEM.instances,
      notes: MOCK_COIN_SYSTEM.notes,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    });
    return;
  }

  const { text, usage } = await generate({ request, scripts, runtimeFeedback });
  const result = parseModelOutput(text);

  console.log(
    `[generate] ${result.instances.length} instance(s) | ` +
      `input=${usage.input_tokens} cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0} output=${usage.output_tokens}`,
  );

  sendJson(res, 200, {
    instances: result.instances,
    notes: result.notes,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    },
  });
}

async function handleFeedback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await readJsonBody(req)) as Record<string, unknown>;
  const logs = Array.isArray(body.logs) ? (body.logs as string[]) : [];
  const telemetry = Array.isArray(body.telemetry) ? (body.telemetry as unknown[]) : [];

  lastFeedback = { logs, telemetry, at: new Date().toISOString() };

  console.log(`[feedback] received ${logs.length} log line(s), ${telemetry.length} telemetry sample(s)`);
  // The model could consume this on the next /generate call; for now we just
  // record it so the round-trip is observable.
  sendJson(res, 200, { ok: true, received: { logs: logs.length, telemetry: telemetry.length } });
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  const route = async (): Promise<void> => {
    if (method === "GET" && url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (method === "POST" && url === "/generate") {
      await handleGenerate(req, res);
      return;
    }
    if (method === "POST" && url === "/feedback") {
      await handleFeedback(req, res);
      return;
    }
    sendJson(res, 404, { error: `No route for ${method} ${url}` });
  };

  route().catch((err: Error) => {
    console.error(`[error] ${err.message}`);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
  });
});

server.listen(PORT, HOST, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "[mode] FREE MOCK MODE — no API key set. /generate returns the built-in\n" +
        "       coin-pickup example so you can test the full pipeline for $0.\n" +
        "       Set ANTHROPIC_API_KEY to switch on real AI generation.",
    );
  } else {
    console.log("[mode] LIVE — using Claude for generation.");
  }
  console.log(`AI bridge listening on http://${HOST}:${PORT}`);
});

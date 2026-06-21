// Wraps the Anthropic call: builds the request, applies prompt caching, and
// returns the raw model text plus token usage. Parsing/validation lives in
// schema.ts; this file is only about talking to the model.

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// In ESM there is no __dirname — derive the module directory from import.meta.url
// so we can read the system prompt next to this file regardless of cwd.
const HERE = dirname(fileURLToPath(import.meta.url));

// Load the Roblox system prompt once at startup. Edit systemPrompt.md to tune
// the model's behavior — no code change needed; restart the server to reload.
const SYSTEM_PROMPT = readFileSync(join(HERE, "systemPrompt.md"), "utf8");

const MODEL = "claude-opus-4-8";

export interface ScriptSnapshot {
  path: string;
  source: string;
}

export interface GenerateInput {
  request: string;
  scripts?: ScriptSnapshot[];
  /** Buffered errors/output/telemetry flushed back from a previous playtest. */
  runtimeFeedback?: string[];
}

export interface RawGeneration {
  text: string;
  usage: Anthropic.Usage;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add your key.",
    );
  }
  // new Anthropic() reads ANTHROPIC_API_KEY from the environment.
  if (!client) client = new Anthropic();
  return client;
}

/** Assemble the per-request user message (the part that varies each call). */
function buildUserMessage(input: GenerateInput): string {
  const parts: string[] = [];
  parts.push(`## Request\n${input.request.trim()}`);

  if (input.scripts && input.scripts.length > 0) {
    const snap = input.scripts
      .map((s) => `### ${s.path}\n\`\`\`lua\n${s.source}\n\`\`\``)
      .join("\n\n");
    parts.push(`## Existing scripts (snapshot)\n${snap}`);
  } else {
    parts.push("## Existing scripts (snapshot)\n(none)");
  }

  if (input.runtimeFeedback && input.runtimeFeedback.length > 0) {
    parts.push(
      `## Runtime feedback from the last playtest\n${input.runtimeFeedback.join("\n")}`,
    );
  }

  parts.push("Return ONLY the JSON object described in the system prompt.");
  return parts.join("\n\n");
}

export async function generate(input: GenerateInput): Promise<RawGeneration> {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // Adaptive thinking improves correctness on a non-trivial code-gen task.
    thinking: { type: "adaptive" },
    // PROMPT CACHING: the system prompt is large and identical on every call,
    // so we mark it as an ephemeral cache breakpoint. The first request writes
    // it to the cache (~1.25x input cost for those tokens); every request
    // within the ~5-minute TTL then reads it at ~0.1x instead of full price.
    // Because caching is a prefix match, the system block stays byte-identical
    // and all the per-request content (request text, script snapshot, feedback)
    // goes in the user message AFTER this breakpoint — so it never invalidates
    // the cache. Verify hits via response.usage.cache_read_input_tokens.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  // Concatenate the text blocks (thinking blocks, if any, are skipped).
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (text.trim() === "") {
    throw new Error(
      `Model returned no text (stop_reason: ${response.stop_reason}).`,
    );
  }

  return { text, usage: response.usage };
}

// Safe parsing + validation of the structured JSON the model returns.
//
// We do NOT trust the model to return clean JSON. It may wrap the object in
// ```json fences or add a stray sentence. extractJsonObject() recovers the
// outermost {...} block; validateGenerateResult() then checks the shape so the
// plugin only ever receives instances it can actually create.

export type InstanceType = "Script" | "LocalScript" | "ModuleScript";

export interface InstanceSpec {
  dataModelPath: string;
  instanceType: InstanceType;
  name: string;
  sourceCode: string;
}

export interface GenerateResult {
  instances: InstanceSpec[];
  notes?: string;
}

const VALID_TYPES: ReadonlySet<string> = new Set([
  "Script",
  "LocalScript",
  "ModuleScript",
]);

/**
 * Pull the first balanced top-level JSON object out of arbitrary model text.
 * Handles ```json fences, leading/trailing prose, and braces inside strings.
 */
export function extractJsonObject(raw: string): string {
  const text = raw.trim();

  // Fast path: it's already pure JSON.
  if (text.startsWith("{") && text.endsWith("}")) return text;

  // Walk the string tracking string-literal state so braces inside source
  // code (e.g. Lua tables `{}`) don't throw off the depth count.
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("No JSON object found in model response.");
}

/** Validate the parsed object into a typed GenerateResult, or throw. */
export function validateGenerateResult(parsed: unknown): GenerateResult {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Model response is not a JSON object.");
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.instances)) {
    throw new Error("Model response is missing an 'instances' array.");
  }
  if (obj.instances.length === 0) {
    throw new Error("Model returned zero instances.");
  }

  const instances: InstanceSpec[] = obj.instances.map((item, idx) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`instances[${idx}] is not an object.`);
    }
    const it = item as Record<string, unknown>;

    const dataModelPath = it.dataModelPath;
    const instanceType = it.instanceType;
    const name = it.name;
    const sourceCode = it.sourceCode;

    if (typeof dataModelPath !== "string" || dataModelPath.trim() === "") {
      throw new Error(`instances[${idx}].dataModelPath must be a non-empty string.`);
    }
    if (typeof instanceType !== "string" || !VALID_TYPES.has(instanceType)) {
      throw new Error(
        `instances[${idx}].instanceType must be one of Script | LocalScript | ModuleScript (got ${String(instanceType)}).`,
      );
    }
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`instances[${idx}].name must be a non-empty string.`);
    }
    if (typeof sourceCode !== "string") {
      throw new Error(`instances[${idx}].sourceCode must be a string.`);
    }

    return {
      dataModelPath: dataModelPath.trim(),
      instanceType: instanceType as InstanceType,
      name: name.trim(),
      sourceCode,
    };
  });

  const result: GenerateResult = { instances };
  if (typeof obj.notes === "string" && obj.notes.trim() !== "") {
    result.notes = obj.notes.trim();
  }
  return result;
}

/** Convenience: raw model text -> validated GenerateResult. */
export function parseModelOutput(raw: string): GenerateResult {
  const jsonText = extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Failed to JSON.parse the model output: ${(err as Error).message}`,
    );
  }
  return validateGenerateResult(parsed);
}

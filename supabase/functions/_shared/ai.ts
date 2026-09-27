// Shared by the three agents (BLUEPRINT §4). Model choice lives here so swapping one is
// a one-line change, and every call is logged to agent_runs whatever its outcome.

import Anthropic from "npm:@anthropic-ai/sdk@^0.128.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const MODELS = {
  classifier: "claude-haiku-4-5",
  monthly_report: "claude-sonnet-5",
  advisor: "claude-sonnet-5",
} as const;

export type Agent = keyof typeof MODELS;

// No key configured → every agent takes its non-AI path. Nothing breaks, nothing is sent.
export function aiClient(): Anthropic | null {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  return key ? new Anthropic({ apiKey: key }) : null;
}

export async function logRun(
  db: SupabaseClient,
  row: {
    household_id: string | null;
    agent: Agent;
    status: "ok" | "timeout" | "error" | "invalid_output" | "fallback";
    started: number;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: string;
  },
): Promise<string | null> {
  const { data } = await db
    .from("agent_runs")
    .insert({
      household_id: row.household_id,
      agent: row.agent,
      model: MODELS[row.agent],
      status: row.status,
      input_tokens: row.usage?.input_tokens ?? null,
      output_tokens: row.usage?.output_tokens ?? null,
      latency_ms: Math.round(performance.now() - row.started),
      error: row.error?.slice(0, 500) ?? null,
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

export function addUsage(total: { input_tokens: number; output_tokens: number }, u?: { input_tokens?: number; output_tokens?: number }) {
  total.input_tokens += u?.input_tokens ?? 0;
  total.output_tokens += u?.output_tokens ?? 0;
}

// ───────── the iron rule: numbers come from data, never from the model ─────────

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// {categories:[{key:'c1',spent:5}]} → {'categories.c1.spent': 5}. Arrays of keyed objects
// are addressed by key so the model never has to count positions.
export function flatten(obj: Json, prefix = "", out: Record<string, Json> = {}): Record<string, Json> {
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      const k = v && typeof v === "object" && !Array.isArray(v) && typeof (v as any).key === "string" ? (v as any).key : String(i);
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    });
  } else if (obj && typeof obj === "object") {
    // {money: 123} is one value (evidence format), not a nested object
    if (Object.keys(obj).length === 1 && "money" in obj) {
      out[prefix] = obj;
      return out;
    }
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = obj;
  }
  return out;
}

const PLACEHOLDER = /\{\{\s*([\w.\-]+)\s*\}\}/g;

// Returns an error message the model can act on, or null when the text is clean.
// Names from the data may contain digits ("7-Eleven"), so they are allowed verbatim.
export function validateText(text: string, values: Record<string, Json>, allowedNames: string[]): string | null {
  for (const m of text.matchAll(PLACEHOLDER)) {
    if (!(m[1] in values)) return `Unknown placeholder {{${m[1]}}}. Use only paths that exist in the data.`;
  }
  let rest = text.replace(PLACEHOLDER, "");
  for (const name of allowedNames) if (name) rest = rest.split(name).join("");
  const digit = rest.match(/\d[\d.,]*/);
  if (digit) return `The text contains the number "${digit[0]}" outside a placeholder. Write every number as {{path}}.`;
  return null;
}

export function namesIn(values: Record<string, Json>): string[] {
  return Object.entries(values)
    .filter(([k, v]) => typeof v === "string" && /(^|\.)(name|title|to|from)$/.test(k))
    .map(([, v]) => v as string);
}

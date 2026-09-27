// Session 0.1 spike: records exactly what the Wallet "Transaction" automation sends,
// so the real /capture contract is built on observed data, not on assumptions.
// Delete this function once docs/BLUEPRINT.md §3.11 and shortcuts/SPEC.md are updated.

// Only the hash lives in code; the plaintext token is pasted into the Shortcut.
// verify_jwt is off because a Shortcut cannot hold a Supabase session.
const TOKEN_SHA256 = "bf08af3546261134bd381e209abebe7eaaa4997e84a02d5d17570f2e41448aa9";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Wallet strings may carry invisible bidi marks (RLM/LRM) or a ₪ sign in unexpected
// places; listing every non-ASCII code point makes them visible in the log.
function describe(value: unknown) {
  const info: Record<string, unknown> = { type: Array.isArray(value) ? "array" : typeof value, value };
  if (typeof value === "string") {
    info.length = value.length;
    info.non_ascii = [...value]
      .filter((ch) => ch.codePointAt(0)! > 0x7e)
      .map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} ${JSON.stringify(ch)}`);
  }
  return info;
}

Deno.serve(async (req: Request) => {
  const started = performance.now();
  const receivedAt = new Date().toISOString();

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || (await sha256Hex(token)) !== TOKEN_SHA256) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch (e) {
    parseError = String(e);
  }

  const fields =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, describe(v)]))
      : null;

  const record = {
    received_at: receivedAt,
    method: req.method,
    content_type: req.headers.get("content-type"),
    user_agent: req.headers.get("user-agent"),
    raw_body: raw,
    parse_error: parseError,
    fields,
  };

  // Single greppable line per request; read back with query_logs.
  console.log("SPIKE_ECHO " + JSON.stringify(record));

  return Response.json({
    ok: true,
    server_ms: Math.round(performance.now() - started),
    ...record,
  });
});

// Retired (NEXT_SESSION D6). This was the Phase 0 spike that logged what the Wallet
// trigger sends; the real Shortcut was built straight against /capture instead
// (shortcuts/SPEC.md). Kept as a stub only because the tooling can't delete a deployed
// function: it answers 410 and reads nothing. Delete it from the Supabase dashboard
// (Edge Functions → echo → Delete) whenever convenient, then remove this folder.

Deno.serve(() => Response.json({ error: "gone" }, { status: 410 }));

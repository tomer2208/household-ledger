// Deletes the signed-in person's account (NEXT_SESSION G10; required for a public app and
// by privacy law). A household they share keeps its data for the partner; a household
// they are alone in is deleted with them. Irreversible, so the app asks twice first.
//
// verify_jwt is on: the gateway rejects anonymous calls, and the user id comes only from
// the verified token, never from the request body.

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: cors });

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !auth.user) return Response.json({ error: "unauthorized" }, { status: 401, headers: cors });
  const userId = auth.user.id;

  const { data: outcome, error: prepErr } = await admin.rpc("prepare_account_deletion", { p_user: userId });
  if (prepErr) {
    console.error("DELETE_PREPARE_ERROR", prepErr);
    return Response.json({ error: "prepare_failed" }, { status: 500, headers: cors });
  }

  // Cascades memberships, Shortcut tokens and push subscriptions; created_by on shared
  // expenses becomes null.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    console.error("DELETE_USER_ERROR", delErr);
    return Response.json({ error: "delete_failed" }, { status: 500, headers: cors });
  }

  console.log("ACCOUNT_DELETED", outcome);
  return Response.json({ deleted: true, household: outcome }, { headers: cors });
});

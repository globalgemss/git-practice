import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function envKey(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return parsed.default as string;
    } catch {}
  }
  return Deno.env.get(legacyName) ?? "";
}

function agentAuthPassword(token: string, pin: string) {
  return `RMS!${token.trim().toUpperCase()}!${pin.trim()}#`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, message: "POST required" }), {
        status: 405,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishableKey || !secretKey) throw new Error("Supabase function environment is incomplete");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Unauthorized");

    const caller = createClient(url, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await caller.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    const { data: me, error: profileError } = await caller
      .from("profiles")
      .select("id,role,active")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!me?.active || !["Admin", "Manager"].includes(String(me.role))) {
      throw new Error("Admin/Manager permission required");
    }

    const body = await req.json();
    const displayName = String(body.display_name ?? "").trim();
    const role = String(body.role ?? "Agent");
    const profileType = String(body.profile_type ?? role);
    const loginToken = String(body.login_token ?? crypto.randomUUID().slice(0, 8)).trim().toUpperCase();
    const pin = String(body.pin ?? "").replace(/\D/g, "");

    if (!displayName) throw new Error("Display name required");
    if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits");
    if (!["Admin", "Manager", "Staff", "Agent"].includes(role)) throw new Error("Invalid role");

    const email = loginToken.toLowerCase() + "@rikshams.local";
    const password = agentAuthPassword(loginToken, pin);
    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let authUserId: string | null = null;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { rikshams_role: role, login_token: loginToken },
      user_metadata: { display_name: displayName },
    });

    if (created.error) {
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listed.error) throw listed.error;
      const existing = listed.data.users.find((u) => u.email === email);
      if (!existing) throw created.error;
      authUserId = existing.id;
      const upd = await admin.auth.admin.updateUserById(existing.id, {
        password,
        app_metadata: { rikshams_role: role, login_token: loginToken },
        user_metadata: { display_name: displayName },
      });
      if (upd.error) throw upd.error;
    } else {
      authUserId = created.data.user.id;
    }

    const { data: profile, error } = await admin
      .from("profiles")
      .upsert({
        auth_user_id: authUserId,
        profile_type: profileType,
        profile_id: body.profile_id || loginToken,
        display_name: displayName,
        mobile: body.mobile || null,
        role,
        login_token: loginToken,
        active: true,
        permissions: role === "Admin" ? ["*"] : body.permissions || [],
      }, { onConflict: "auth_user_id" })
      .select()
      .single();

    if (error) throw error;

    if (role === "Agent") {
      const { error: formError } = await admin.from("public_forms").upsert({
        token: loginToken,
        owner_type: "Agent",
        owner_profile_id: profile.id,
        title: "Transport Enquiry",
        active: true,
      }, { onConflict: "token" });
      if (formError) throw formError;
    }

    return new Response(JSON.stringify({ success: true, profile }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      message: e instanceof Error ? e.message : String(e),
    }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
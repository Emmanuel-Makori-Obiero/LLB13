import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("NOTIFICATION_FROM_EMAIL");
    if (!resendKey || !from) return response({ error: "Email delivery is not configured. Add RESEND_API_KEY and NOTIFICATION_FROM_EMAIL to Supabase secrets." }, 503);
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return response({ error: "Sign in required." }, 401);
    const { data: allowed } = await auth.rpc("is_admin");
    if (!allowed) return response({ error: "Only an administrator can send email notifications." }, 403);
    const body = await request.json();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (subject.length < 3 || subject.length > 160 || message.length < 10 || message.length > 8000) return response({ error: "Subject or message length is invalid." }, 400);
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: subscriptions, error: subscriptionsError } = await admin.from("notification_subscriptions").select("user_id,email").eq("subscribed", true).limit(5000);
    if (subscriptionsError) return response({ error: subscriptionsError.message }, 500);
    const recipients = (subscriptions ?? []).map((item) => String(item.email).trim()).filter((email) => email.includes("@"));
    if (!recipients.length) return response({ error: "No users are subscribed to email notifications." }, 400);
    const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: recipients, subject, text: message, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</div><p style="color:#667;font-size:12px">You received this because you subscribed to Group 13 platform notifications.</p>` }) });
    if (!result.ok) return response({ error: `Email provider rejected the message (${result.status}).` }, 502);
    return response({ sent: recipients.length });
  } catch (error) { return response({ error: error instanceof Error ? error.message : "Could not send email notification." }, 500); }
});
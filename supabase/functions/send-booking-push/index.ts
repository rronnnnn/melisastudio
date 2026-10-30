// Push notification to the admin's devices for every new booking.
// Called by the bookings_push_on_insert trigger (pg_net), not by browsers:
// deploy with --no-verify-jwt; the x-webhook-secret header is the auth.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:melisabekteshiselimi@gmail.com";

const SERVICE_SQ: Record<string, string> = {
  manicure: "manikyr", pedicure: "pedikyr", eyebrows: "Vetullat", lipblush: "Lip Blush",
};
const NAIL_TYPES = ["Gel", "Natural"];

type Booking = {
  id?: string; service?: string; nail_type?: string | null;
  date?: string; time?: string; channel?: string;
};

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// "Gel manikyr · 12.11 · 14:30 · WhatsApp"
export function notificationBody(b: Booking): string {
  const svc = SERVICE_SQ[b.service ?? ""] ?? (b.service ?? "Shërbim");
  let label = cap(svc);
  if ((b.service === "manicure" || b.service === "pedicure") && b.nail_type && NAIL_TYPES.includes(b.nail_type)) {
    label = b.nail_type === "Gel" ? `Gel ${svc}` : `${cap(svc)} natyral`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.date ?? "");
  const date = m ? `${m[3]}.${m[2]}` : (b.date ?? "");
  const channel = b.channel === "whatsapp" ? "WhatsApp" : "Email";
  return [label, date, b.time, channel].filter(Boolean).join(" · ");
}

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!safeEqual(req.headers.get("x-webhook-secret") ?? "", WEBHOOK_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response("VAPID keys not configured", { status: 500 });
  }

  let booking: Booking;
  try {
    booking = (await req.json()).record ?? {};
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: subs, error } = await db.from("push_subscriptions").select("id, endpoint, keys");
  if (error) return new Response("DB error: " + error.message, { status: 500 });

  const payload = JSON.stringify({
    title: "Rezervim i ri 💅",
    body: notificationBody(booking),
    url: "/?admin",
    tag: booking.id ? "booking-" + booking.id : undefined,
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 60 * 60 * 24, timeout: 5000 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.id);
      else console.error("push failed", code, (e as Error).message);
    }
  }));
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);

  return new Response(JSON.stringify({ sent, removed: gone.length, total: subs?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
